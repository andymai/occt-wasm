#!/usr/bin/env node
/**
 * occt-wasm Node.js CLI example
 *
 * Demonstrates: shape creation, boolean ops, measurements, STEP export.
 *
 * Usage:
 *   node examples/node-cli/example.mjs
 *   node examples/node-cli/example.mjs --step output.step
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load WASM module directly (not using TS wrapper for simplicity)
const jsPath = resolve(__dirname, "../../dist/occt-wasm.js");
const wasmPath = resolve(__dirname, "../../dist/occt-wasm.wasm");
const createModule = (await import(jsPath)).default;

const Module = await createModule({
    locateFile: (path) => (path.endsWith(".wasm") ? wasmPath : path),
});

const kernel = new Module.OcctKernel();

try {
    console.log("occt-wasm Node.js CLI Example\n");

    // --- Create shapes ---
    const box = kernel.makeBox(30, 20, 15);
    const cyl = kernel.makeCylinder(6, 25);
    const sphere = kernel.makeSphere(4);
    const movedSphere = kernel.translate(sphere, 15, 10, 15);

    console.log("Created: box 30x20x15, cylinder r=6 h=25, sphere r=4");

    // --- Boolean operations ---
    const withHole = kernel.cut(box, cyl);
    const withBump = kernel.fuse(withHole, movedSphere);

    // --- Fillet edges of the original box (before booleans, more reliable) ---
    const boxEdges = kernel.getSubShapes(box, "edge");
    const edgeVec = new Module.VectorUint32();
    for (let i = 0; i < Math.min(4, boxEdges.size()); i++) {
        edgeVec.push_back(boxEdges.get(i));
    }
    const filletedBox = kernel.fillet(box, edgeVec, 2.0);
    edgeVec.delete();
    boxEdges.delete();

    // Now boolean the filleted box
    const final = kernel.fuse(kernel.cut(filletedBox, cyl), movedSphere);

    // --- Measurements ---
    const vol = kernel.getVolume(final);
    const area = kernel.getSurfaceArea(final);
    const bbox = kernel.getBoundingBox(final);

    console.log(`\nResult:`);
    console.log(`  Volume:       ${vol.toFixed(2)} mm^3`);
    console.log(`  Surface area: ${area.toFixed(2)} mm^2`);
    console.log(
        `  Bounding box: [${bbox.xmin.toFixed(1)}, ${bbox.ymin.toFixed(1)}, ${bbox.zmin.toFixed(1)}] to [${bbox.xmax.toFixed(1)}, ${bbox.ymax.toFixed(1)}, ${bbox.zmax.toFixed(1)}]`,
    );

    // --- Topology ---
    const faces = kernel.getSubShapes(final, "face");
    const finalEdges = kernel.getSubShapes(final, "edge");
    const verts = kernel.getSubShapes(final, "vertex");
    console.log(
        `  Topology:     ${faces.size()} faces, ${finalEdges.size()} edges, ${verts.size()} vertices`,
    );
    faces.delete();
    finalEdges.delete();
    verts.delete();

    // --- STEP export ---
    const stepFlag = process.argv.indexOf("--step");
    if (stepFlag !== -1 && process.argv[stepFlag + 1]) {
        const outPath = resolve(process.argv[stepFlag + 1]);
        const stepData = kernel.exportStep(final);
        writeFileSync(outPath, stepData);
        console.log(`\nSTEP exported to: ${outPath}`);
    } else {
        console.log(`\nTip: pass --step output.step to export the result`);
    }

    // --- STEP import round-trip ---
    const stepData = kernel.exportStep(final);
    const reimported = kernel.importStep(stepData);
    const reimportedVol = kernel.getVolume(reimported);
    console.log(
        `  Round-trip:   export -> import, volume delta = ${Math.abs(vol - reimportedVol).toFixed(6)}`,
    );
} finally {
    kernel.releaseAll();
    kernel.delete();
}

console.log("\nDone.");
