import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { OcctKernel, type OcctModuleFactory, type ShapeHandle } from "../ts/src/index.ts";

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

/** A square wire of `size` on the plane at height `z`, corners at the origin. */
function squareWire(z: number, size: number): ShapeHandle {
    const corner = (x: number, y: number) => ({ x, y, z });
    const v = [corner(0, 0), corner(size, 0), corner(size, size), corner(0, size)];
    const edges = [0, 1, 2, 3].map((i) => kernel.makeLineEdge(v[i]!, v[(i + 1) % 4]!));
    return kernel.makeWire(edges);
}

describe("loftWithContinuity", () => {
    it("lofts two sections with an explicit continuity", () => {
        const size = 5;
        const height = 10;
        const a = squareWire(0, size);
        const b = squareWire(height, size);

        const result = kernel.loftWithContinuity([a, b], true, false, 2);

        expect(kernel.isValid(result)).toBe(true);
        // Two identical square sections loft into a prism of size^2 * height.
        const vol = kernel.getVolume(result);
        expect(vol).toBeGreaterThan(size * size * height * 0.99);
        expect(vol).toBeLessThan(size * size * height * 1.01);
        expect(kernel.getSubShapes(result, "face").length).toBeGreaterThanOrEqual(6);
    });

    it("rejects an out-of-range continuity ordinal", () => {
        const a = squareWire(0, 5);
        const b = squareWire(10, 5);
        expect(() => kernel.loftWithContinuity([a, b], true, false, 9)).toThrow();
        expect(() => kernel.loftWithContinuity([a, b], true, false, -1)).toThrow();
    });

    it("accepts the full GeomAbs_Shape range 0..4", () => {
        const a = squareWire(0, 5);
        const b = squareWire(10, 5);
        for (const continuity of [0, 1, 2, 3, 4]) {
            const result = kernel.loftWithContinuity([a, b], true, false, continuity);
            expect(kernel.isValid(result)).toBe(true);
        }
    });
});
