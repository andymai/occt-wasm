/**
 * A fuse that merges same-domain faces joins the pieces of a face it split
 * back into one, whatever its surface. The merge works on a copy (#462), and
 * it tells two pieces of a surface that is neither a plane nor an elementary
 * surface apart by the surface object itself, so the copy has to keep the
 * pieces of one face on one copied surface.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { BooleanOp, OcctKernel, type OcctModuleFactory, type ShapeHandle } from "../ts/src/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");

let kernel: OcctKernel;

beforeAll(async () => {
    const createModule = ((await import(jsPath)) as { default: OcctModuleFactory }).default;
    kernel = await OcctKernel.init({ createModule, wasm: wasmPath });
}, 30_000);

afterAll(() => {
    kernel?.[Symbol.dispose]();
});

/** A closed spline in the XY plane, made into a face. */
function splineFace(): ShapeHandle {
    const points = [
        { x: 0, y: 0, z: 0 }, { x: 6, y: -1, z: 0 }, { x: 10, y: 4, z: 0 },
        { x: 8, y: 12, z: 0 }, { x: 3, y: 14, z: 0 }, { x: -2, y: 8, z: 0 },
    ];
    return kernel.makeFace(kernel.makeWire([kernel.interpolatePoints(points, true)]));
}

function count(shape: ShapeHandle, kind: string): number {
    return kernel.getSubShapes(shape, "face").filter((f) => kernel.surfaceType(f) === kind).length;
}

/** `solid` cut in two by `knife`, then fused back with same-domain faces merged. */
function splitAndRejoin(solid: ShapeHandle, knife: ShapeHandle): ShapeHandle {
    const outside = kernel.cut(solid, knife);
    const inside = kernel.common(solid, knife);
    return kernel.booleanOp(BooleanOp.Fuse, [outside], [inside], { simplifyAngularTolerance: 1e-6 }).result;
}

describe("a merging fuse rejoins a split face", () => {
    it("on a surface of linear extrusion", () => {
        const prism = kernel.extrude(splineFace(), 0, 0, 3);
        expect(count(prism, "extrusion")).toBe(1);
        const knife = kernel.translate(kernel.makeBox(20, 20, 10), -5, 6, -2);
        const rejoined = splitAndRejoin(prism, knife);
        expect(count(rejoined, "extrusion")).toBe(1);
        expect(count(rejoined, "plane")).toBe(2);
        expect(kernel.isValid(rejoined)).toBe(true);
        expect(kernel.getVolume(rejoined)).toBeCloseTo(kernel.getVolume(prism), 6);
    });

    it("on a surface of revolution", () => {
        const profile = kernel.translate(splineFace(), 20, 0, 0);
        const ring = kernel.revolve(profile, { point: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } }, Math.PI);
        const before = count(ring, "revolution");
        expect(before).toBeGreaterThan(0);
        // A half-space through the axis, turned so it cuts the ring part way round.
        const knife = kernel.rotate(
            kernel.translate(kernel.makeBox(60, 40, 60), -30, -10, 0),
            { point: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } },
            Math.PI / 3,
        );
        const rejoined = splitAndRejoin(ring, knife);
        expect(count(rejoined, "revolution")).toBe(before);
        expect(kernel.isValid(rejoined)).toBe(true);
        expect(kernel.getVolume(rejoined)).toBeCloseTo(kernel.getVolume(ring), 6);
    });
});
