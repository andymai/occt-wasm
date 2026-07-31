/**
 * Guards scripts/static-server.mjs, which backs the Playwright suite and the
 * README's demo instructions.
 *
 * The malformed-escape case is here because it shipped broken: decodeURIComponent
 * threw inside an async handler with no rejection handler, so `GET /%ZZ` took the
 * whole process down rather than returning a status. A dev server that any single
 * request can kill fails the suite silently — Playwright just reports a lost
 * connection somewhere unrelated.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");

let server: ChildProcessWithoutNullStreams;
let base: string;

beforeAll(async () => {
    // Port 0 lets the OS pick a free one; the server prints what it bound.
    server = spawn("node", ["scripts/static-server.mjs", "0"], { cwd: ROOT });
    base = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("server never reported a port")), 10_000);
        server.stdout.on("data", (chunk: Buffer) => {
            const match = /http:\/\/localhost:(\d+)\//.exec(chunk.toString());
            if (!match) return;
            clearTimeout(timer);
            resolve(`http://localhost:${match[1]}`);
        });
    });
});

afterAll(() => server?.kill());

describe("static-server", () => {
    it("serves .wasm as application/wasm", async () => {
        const res = await fetch(`${base}/dist/occt-wasm.wasm`, { method: "HEAD" });
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("application/wasm");
    });

    it("resolves a directory to its index.html", async () => {
        const res = await fetch(`${base}/examples/three-js/`);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("text/html");
    });

    it("404s a missing file", async () => {
        expect((await fetch(`${base}/nope.html`)).status).toBe(404);
    });

    it.each(["/../../etc/passwd", "/%2e%2e/%2e%2e/etc/passwd"])(
        "refuses to escape the repo root via %s",
        async (path) => {
            expect((await fetch(`${base}${path}`)).status).toBe(404);
        },
    );

    it("survives a malformed percent-escape", async () => {
        expect((await fetch(`${base}/%ZZ`)).status).toBe(400);
        // The point of the test: still answering afterwards.
        expect((await fetch(`${base}/README.md`)).status).toBe(200);
    });
});
