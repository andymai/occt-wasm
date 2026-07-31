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
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
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

function send(res, status, body) {
    res.writeHead(status, { "content-type": "text/plain" });
    res.end(body);
}

async function resolveFile(decodedPath) {
    const candidate = resolve(join(ROOT, decodedPath));
    // Keep a crafted path from reaching outside the repo. Compare via relative()
    // rather than a "/"-joined prefix, which on Windows would test a separator
    // resolve() never emits and reject every path.
    const rel = relative(ROOT, candidate);
    if (rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)) return null;

    const info = await stat(candidate).catch(() => null);
    if (!info) return null;
    if (!info.isDirectory()) return candidate;

    const index = join(candidate, "index.html");
    return (await stat(index).catch(() => null)) ? index : null;
}

const server = createServer((req, res) => {
    void (async () => {
        const { pathname } = new URL(req.url ?? "/", "http://localhost");

        let decoded;
        try {
            decoded = decodeURIComponent(pathname);
        } catch {
            return send(res, 400, "Bad request\n");
        }

        const file = await resolveFile(decoded);
        if (!file) return send(res, 404, "Not found\n");

        res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
        if (req.method === "HEAD") return res.end();

        createReadStream(file)
            .on("error", () => res.destroy())
            .pipe(res);
        // An unhandled rejection here would take the process down, not just the
        // request — a single malformed URL was enough to kill the server.
    })().catch(() => {
        if (!res.headersSent) return send(res, 500, "Internal error\n");
        res.destroy();
    });
});

// Report the bound port rather than the requested one, so port 0 (pick a free
// one) is usable — the tests rely on it to avoid colliding with a real server.
server.listen(PORT, () =>
    console.log(`Serving ${ROOT} on http://localhost:${server.address().port}/`),
);
