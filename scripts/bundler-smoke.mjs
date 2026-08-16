#!/usr/bin/env node
// Bundles the built package with webpack and runs the result. The unit tests
// and the browser smoke page both import dist/occt-wasm.js directly, so nothing
// else exercises OcctKernel.init()'s dynamic import — which is how #271 (webpack
// emitting neither the glue nor the .wasm, leaving init() to 404) shipped.

import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import webpack from "webpack";

const root = resolve(import.meta.dirname, "..");
const entryPoint = join(root, "ts/dist/index.js");

const dir = await mkdtemp(join(tmpdir(), "occt-bundler-"));
const outDir = join(dir, "out");

try {
    const entry = join(dir, "entry.js");
    await writeFile(
        entry,
        `import { OcctKernel } from ${JSON.stringify(entryPoint)};\n` +
            "globalThis.__OcctKernel = OcctKernel;\n",
    );

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

    await import(pathToFileURL(join(outDir, "main.mjs")).href);
    const kernel = await globalThis.__OcctKernel.init();
    const volume = kernel.getVolume(kernel.makeBox(10, 20, 30));
    if (Math.abs(volume - 6000) > 1e-6) {
        throw new Error(`bundled kernel returned volume ${volume}, expected 6000`);
    }
    kernel[Symbol.dispose]();

    console.log("bundler smoke test passed: glue bundled, .wasm emitted, init() works");
} finally {
    await rm(dir, { recursive: true, force: true });
}
