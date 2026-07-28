/**
 * Drives the browser examples the way a reader would.
 *
 * Both demos previously called `fillet` on a boolean result — a compound, which
 * OCCT's solid-only operations reject — and a `try`/`catch` fallback swallowed
 * it, so they rendered an unfilleted shape and looked fine. These assert the
 * demo reaches its success state with no page error, so a silently degraded
 * demo fails instead of passing quietly.
 */
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";

// Cold WASM compile dominates; the smoke test uses the same headroom.
const LOAD_TIMEOUT = 50_000;

/**
 * Both demos construct a THREE.WebGLRenderer before touching OCCT, so without a
 * WebGL context the module script dies before the kernel is ever exercised.
 *
 * Skipping locally keeps the suite runnable without a display, but skipping in
 * CI would mean losing this coverage the moment the xvfb setup broke, and going
 * green while doing it. So CI treats a missing context as the failure it is.
 */
async function requireWebGL(page: Page, browserName: string): Promise<void> {
    await page.goto("about:blank");
    const available = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
    });
    if (available) return;

    const hint =
        `${browserName} exposes no WebGL context. Firefox needs a real display: ` +
        `run under xvfb-run, which sets DISPLAY and flips the project to headed ` +
        `(see playwright.config.ts).`;
    if (process.env["CI"]) throw new Error(hint);
    test.skip(true, hint);
}

// `three` does not export ./package.json, so resolve the root by layout.
const THREE_ROOT = normalize(join(import.meta.dirname, "../../node_modules/three"));
const CDN_PREFIX = /^https:\/\/cdn\.jsdelivr\.net\/npm\/three@[\d.]+\//;

const MIME: Record<string, string> = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".wasm": "application/wasm",
};

/**
 * Serve the demos' Three.js imports from the vendored copy, and fail on any
 * other outbound request. The demos import Three from a CDN so a reader can
 * open them straight from disk, but CI must not depend on a third party being
 * up — and blocking the rest turns "we vendored it" into something the suite
 * actually proves rather than something we assert in a comment.
 */
async function serveThreeLocally(page: Page, offences: string[]): Promise<void> {
    await page.route(/^https?:\/\//, async (route) => {
        const url = route.request().url();
        if (url.startsWith("http://localhost:3000/")) return route.continue();

        const match = url.match(CDN_PREFIX);
        if (!match) {
            offences.push(url);
            return route.abort();
        }

        const rest = url.slice(match[0].length).split(/[?#]/)[0] ?? "";
        const file = normalize(join(THREE_ROOT, rest));
        // Keep a crafted path from reaching outside the package.
        if (!file.startsWith(THREE_ROOT)) {
            offences.push(`escapes package root: ${url}`);
            return route.abort();
        }
        try {
            const ext = file.slice(file.lastIndexOf("."));
            return await route.fulfill({
                body: await readFile(file),
                contentType: MIME[ext] ?? "application/octet-stream",
            });
        } catch {
            offences.push(`not vendored: ${url}`);
            return route.abort();
        }
    });
}

function collectErrors(page: Page): string[] {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
        if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });
    return errors;
}

test("the vendored three matches the version the demos import", async () => {
    const { version } = JSON.parse(await readFile(join(THREE_ROOT, "package.json"), "utf8"));
    for (const demo of ["three-js", "step-viewer"]) {
        const html = await readFile(join(import.meta.dirname, `../../examples/${demo}/index.html`), "utf8");
        const pinned = html.match(/cdn\.jsdelivr\.net\/npm\/three@([\d.]+)\//)?.[1];
        expect(pinned, `${demo} should pin a three version`).toBeTruthy();
        // Bumping the demo's CDN pin without bumping the devDependency would
        // leave CI testing a different Three than readers actually load.
        expect(pinned, `${demo} pins three@${pinned}, vendored is ${version}`).toBe(version);
    }
});

test("three-js example builds, tessellates, and loads glTF", async ({ page, browserName }) => {
    await requireWebGL(page, browserName);
    const errors = collectErrors(page);
    const offences: string[] = [];
    await serveThreeLocally(page, offences);

    await page.goto("http://localhost:3000/examples/three-js/index.html");

    const status = page.locator("#status");
    // The glTF line is appended last, so it implies every earlier stage ran.
    await expect(status).toContainText("glTF loaded", { timeout: LOAD_TIMEOUT });

    const text = (await status.textContent()) ?? "";
    expect(text).toContain("tessellate");

    // A degraded run still tessellates, just fewer triangles — pin a floor so
    // the fillet silently disappearing is caught.
    const triangles = Number(text.match(/triangles\s+(\d+)/)?.[1] ?? 0);
    expect(triangles).toBeGreaterThan(500);

    expect(errors).toEqual([]);
    expect(offences, "demo reached the network").toEqual([]);
});

test("step-viewer example loads its demo shape", async ({ page, browserName }) => {
    await requireWebGL(page, browserName);
    const errors = collectErrors(page);
    const offences: string[] = [];
    await serveThreeLocally(page, offences);

    await page.goto("http://localhost:3000/examples/step-viewer/index.html");

    const info = page.locator("#info");
    await expect(info).toContainText("WASM ready", { timeout: LOAD_TIMEOUT });

    // The demo shape is built on click — this is the path that used to fall
    // back to an unfilleted shape rather than failing.
    await page.getByRole("button", { name: "Load Demo" }).click();

    await expect(info).toContainText("triangles", { timeout: LOAD_TIMEOUT });
    const text = (await info.textContent()) ?? "";
    expect(text).toContain("Demo");

    // Volume is useless as a signal here — rounding four edges moves it by
    // 0.02%. Face count is the discriminator: the fillet adds two net faces,
    // so 10 when it applies and 8 when it silently falls back.
    expect(Number(text.match(/(\d+) faces/)?.[1] ?? 0)).toBe(10);
    expect(Number(text.match(/([\d,]+) triangles/)?.[1]?.replace(/,/g, "") ?? 0)).toBeGreaterThan(100);

    expect(errors).toEqual([]);
    expect(offences, "demo reached the network").toEqual([]);
});
