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

// Both demos construct a THREE.WebGLRenderer before touching OCCT, and headless
// Firefox ships no software WebGL backend — `getContext("webgl")` returns null
// even with webgl.force-enabled, so the module script dies before the kernel is
// ever exercised. Chromium's SwiftShader covers the geometry, which is the point
// here; smoke.spec.ts still runs the WASM itself under both browsers.
test.skip(({ browserName }) => browserName === "firefox", "headless Firefox has no WebGL");

// Cold WASM compile dominates; the smoke test uses the same headroom.
const LOAD_TIMEOUT = 50_000;

function collectErrors(page: Page): string[] {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
        if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });
    return errors;
}

test("three-js example builds, tessellates, and loads glTF", async ({ page }) => {
    const errors = collectErrors(page);

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
});

test("step-viewer example loads its demo shape", async ({ page }) => {
    const errors = collectErrors(page);

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
});
