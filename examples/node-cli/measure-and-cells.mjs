#!/usr/bin/env node
/**
 * occt-wasm measurement + cells example
 *
 * Demonstrates the inertia tensor, point-in-solid testing, intersection cells
 * (the overlap region of two solids), and a binary-BREP round-trip.
 *
 * Requires the TS package to be built first:
 *   cd ts && npm run build
 *
 * Usage:
 *   node examples/node-cli/measure-and-cells.mjs
 */

import { OcctKernel } from "../../ts/dist/index.js";

const kernel = await OcctKernel.init();

try {
    const box = kernel.makeBox(10, 20, 30);

    // Mass properties.
    const inertia = kernel.getInertia(box);
    console.log("Inertia tensor (row-major, about origin):");
    for (let r = 0; r < 3; r++) {
        console.log("  " + inertia.slice(r * 3, r * 3 + 3).map((n) => n.toFixed(1)).join("  "));
    }

    // Containment.
    console.log("contains (5,10,15):", kernel.containsPoint(box, { x: 5, y: 10, z: 15 }));
    console.log("contains (50,0,0): ", kernel.containsPoint(box, { x: 50, y: 0, z: 0 }));

    // Intersection cells: overlap region of two offset boxes.
    const a = kernel.makeBox(10, 10, 10);
    const b = kernel.translate(kernel.makeBox(10, 10, 10), 6, 6, 6);
    const overlap = kernel.intersectionCells([a, b]);
    console.log(`overlap volume: ${kernel.getVolume(overlap).toFixed(1)} mm^3 (expected 64)`);

    // Binary BREP round-trip.
    const bytes = kernel.toBREPBinary(box);
    const restored = kernel.fromBREPBinary(bytes);
    console.log(
        `binary BREP: ${bytes.length} bytes, volume preserved = ` +
            `${Math.abs(kernel.getVolume(box) - kernel.getVolume(restored)) < 1e-6}`,
    );
} finally {
    kernel[Symbol.dispose]();
}
