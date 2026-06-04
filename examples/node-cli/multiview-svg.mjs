#!/usr/bin/env node
/**
 * occt-wasm multiview SVG example
 *
 * Demonstrates the higher-level TypeScript API: an oriented sweep (constant
 * up-axis), a half-space used as a cutting tool, and a multiview SVG render
 * (Front/Top/Right/Iso) suitable for handing to an automated agent.
 *
 * Requires the TS package to be built first so the wrapper can load the WASM:
 *   cd ts && npm run build
 *
 * Usage:
 *   node examples/node-cli/multiview-svg.mjs [out.svg]
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { OcctKernel, SweepMode } from "../../ts/dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const kernel = await OcctKernel.init();

try {
    // --- Oriented sweep: a circular profile swept along a curved spine, with
    //     the cross-section's up-axis pinned to +Y (FixedUp / constant binormal).
    const profile = kernel.makeWire([
        kernel.makeCircleEdge({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 3),
    ]);
    const spine = kernel.makeWire([
        kernel.makeArcEdge({ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 12 }, { x: 40, y: 0, z: 0 }),
    ]);
    const tube = kernel.sweepOriented(profile, spine, SweepMode.FixedUp, { x: 0, y: 1, z: 0 });

    // --- Half-space as an infinite cutting tool: remove everything above z = 8.
    const lid = kernel.halfSpace({ x: 0, y: 0, z: 8 }, { x: 0, y: 0, z: 1 });
    const part = kernel.cut(tube, lid);

    console.log(`Swept + trimmed tube: volume ${kernel.getVolume(part).toFixed(1)} mm^3`);

    // --- Multiview SVG: Front / Top / Right / Iso, hidden edges dashed.
    const svg = kernel.toMultiviewSVG(part);
    const out = resolve(process.argv[2] ?? resolve(__dirname, "multiview.svg"));
    writeFileSync(out, svg);
    console.log(`Wrote multiview SVG to: ${out}`);
} finally {
    kernel[Symbol.dispose]();
}
