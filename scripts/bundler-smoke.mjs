#!/usr/bin/env node
// Bundles the built package with webpack and with Vite. The unit tests and the
// browser smoke page both import dist/occt-wasm.js directly, so nothing else
// exercises OcctKernel.init()'s dynamic import — which is how #271 (bundlers
// emitting neither the glue nor the .wasm, leaving init() to 404) shipped.

import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import webpack from "webpack";
import { build as viteBuild } from "vite";

const root = resolve(import.meta.dirname, "..");
const entryPoint = join(root, "ts/dist/index.js");

async function walk(dir) {
    const found = [];
    for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
        if (entry.isFile()) found.push(join(entry.parentPath, entry.name));
    }
    return found;
}

async function writeEntry(dir) {
    const entry = join(dir, "entry.js");
    await writeFile(
        entry,
        `import { OcctKernel } from ${JSON.stringify(entryPoint)};\n` +
            "globalThis.__OcctKernel = OcctKernel;\n",
    );
    return entry;
}

async function checkWebpack(dir) {
    const outDir = join(dir, "webpack-out");
    const entry = await writeEntry(dir);

    const stats = await new Promise((res, rej) => {
        webpack(
            {
                mode: "production",
                target: "web",
                entry,
                output: {
                    path: outDir,
                    filename: "main.mjs",
                    chunkFilename: "[id].mjs",
                    module: true,
                    chunkFormat: "module",
                },
                experiments: { outputModule: true },
                optimization: { minimize: false },
                performance: false,
            },
            (err, result) => (err ? rej(err) : res(result)),
        );
    });

    if (stats.hasErrors()) {
        console.error(stats.toString({ all: false, errors: true, errorDetails: true }));
        throw new Error("webpack failed to bundle the package");
    }

    // No .wasm asset means the bundler never followed the glue import, so the
    // binary would 404 at runtime even though the build reported success.
    const assets = await readdir(outDir);
    if (!assets.some((name) => name.endsWith(".wasm"))) {
        throw new Error(`webpack emitted no .wasm asset (got: ${assets.join(", ") || "nothing"})`);
    }

    // webpack leaves the glue's marked `node:module` import intact, so the
    // browser bundle still runs under Node and can be exercised directly.
    await import(pathToFileURL(join(outDir, "main.mjs")).href);
    const kernel = await globalThis.__OcctKernel.init();
    const volume = kernel.getVolume(kernel.makeBox(10, 20, 30));
    if (Math.abs(volume - 6000) > 1e-6) {
        throw new Error(`bundled kernel returned volume ${volume}, expected 6000`);
    }
    kernel[Symbol.dispose]();

    console.log("webpack: glue bundled, .wasm emitted, init() returns a working kernel");
}

async function checkVite(dir) {
    const outDir = join(dir, "vite-out");
    await writeEntry(dir);
    // An app build, not `build.lib`: lib mode leaves the glue's asset URL for
    // the consuming app to resolve and emits no .wasm at all, so it would not
    // exercise what a Vite consumer actually relies on here.
    await writeFile(
        join(dir, "index.html"),
        '<!doctype html><html><body><script type="module" src="./entry.js"></script></body></html>\n',
    );

    await viteBuild({
        root: dir,
        logLevel: "error",
        build: { outDir, emptyOutDir: true, target: "esnext", minify: false },
    });

    const emitted = await walk(outDir);
    const wasm = emitted.find((file) => file.endsWith(".wasm"));
    if (!wasm) {
        throw new Error("vite emitted no .wasm asset");
    }

    // Vite rewrites the glue's `new URL("occt-wasm.wasm", import.meta.url)` to
    // the hashed asset. Running the output would prove more, but a browser
    // build stubs out `node:module`, so under Node the glue takes its Node
    // branch and dies on the stub — hence the static check.
    const wasmName = wasm.slice(wasm.lastIndexOf("/") + 1);
    const chunks = emitted.filter((file) => file.endsWith(".js") || file.endsWith(".mjs"));
    const contents = await Promise.all(chunks.map((file) => readFile(file, "utf8")));
    if (!contents.some((text) => text.includes(wasmName))) {
        throw new Error(`no vite chunk references the emitted asset ${wasmName}`);
    }

    console.log("vite: glue bundled, .wasm emitted, asset URL rewritten");
}

const dir = await mkdtemp(join(tmpdir(), "occt-bundler-"));
try {
    await checkWebpack(dir);
    await checkVite(dir);
} finally {
    await rm(dir, { recursive: true, force: true });
}
