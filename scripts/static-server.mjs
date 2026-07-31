#!/usr/bin/env node
/**
 * Static file server for the browser examples and the Playwright suite.
 *
 * This replaces `npx serve`, whose dependency chain reaches minimatch@3 and so
 * pins brace-expansion to the 1.x line — the only line with no patch for
 * GHSA-mh99-v99m-4gvg. Nothing here needs a general-purpose server: the demos
 * are plain files over GET, so owning thirty lines beats carrying a transitive
 * advisory that can only be cleared by downgrading `serve` eight majors.
 *
 * `.wasm` must arrive as application/wasm or WebAssembly.instantiateStreaming
 * rejects and the Emscripten glue falls back to a slower ArrayBuffer path,
 * which quietly costs the demos seconds against the specs' compile timeout.
 *
 * Usage:
 *   node scripts/static-server.mjs [port]   # defaults to 3000
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2] ?? 3000);

const MIME = {
    ".css": "text/css",
    ".html": "text/html",
    ".js": "text/javascript",
    ".json": "application/json",
    ".mjs": "text/javascript",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".wasm": "application/wasm",
};

async function resolveFile(urlPath) {
    const candidate = resolve(join(ROOT, decodeURIComponent(urlPath)));
    // Keep a crafted path from reaching outside the repo.
    if (candidate !== ROOT && !candidate.startsWith(ROOT + "/")) return null;

    const info = await stat(candidate).catch(() => null);
    if (!info) return null;
    if (!info.isDirectory()) return candidate;

    const index = join(candidate, "index.html");
    return (await stat(index).catch(() => null)) ? index : null;
}

const server = createServer((req, res) => {
    void (async () => {
        const { pathname } = new URL(req.url ?? "/", "http://localhost");
        const file = await resolveFile(pathname);
        if (!file) {
            res.writeHead(404, { "content-type": "text/plain" });
            return res.end("Not found\n");
        }

        res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
        if (req.method === "HEAD") return res.end();

        createReadStream(file)
            .on("error", () => res.destroy())
            .pipe(res);
    })();
});

server.listen(PORT, () => console.log(`Serving ${ROOT} on http://localhost:${PORT}/`));
