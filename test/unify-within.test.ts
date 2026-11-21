/**
 * unifySameDomainWithin merges faces whose surfaces agree within the given
 * tolerances: the facets of a mesh whose coordinates were rounded, as an STL's
 * 32-bit floats are, lie in one plane only to that precision.
 */
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

/**
 * A binary STL of a 10 mm cube, as the kernel writes it, with its corner at
 * (10, 10, 10) raised by `lift`: the faces meeting there are no longer flat.
 */
function cubeStl(lift: number): Uint8Array {
    const bytes = kernel.exportStl(kernel.makeBox(10, 10, 10), 0.5);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const triangles = view.getUint32(80, true);
    for (let i = 0; i < triangles; i++) {
        for (let j = 0; j < 3; j++) {
            const at = 84 + 50 * i + 12 + 12 * j;
            const [x, y, z] = [0, 4, 8].map((o) => view.getFloat32(at + o, true));
            if (x === 10 && y === 10 && z === 10) view.setFloat32(at + 8, 10 + lift, true);
        }
    }
    return bytes;
}

function solidOf(stl: Uint8Array): ShapeHandle {
    const sewn = kernel.sew([kernel.importStl(stl)], 1e-6);
    const [shell] = kernel.getSubShapes(sewn, "shell");
    return kernel.makeSolid(shell as ShapeHandle);
}

const faces = (s: ShapeHandle) => kernel.getSubShapes(s, "face").length;

describe("unifySameDomainWithin", () => {
    it("merges facets that agree only to float precision", () => {
        const solid = solidOf(cubeStl(2e-5));
        expect(faces(kernel.unifySameDomain(solid))).toBeGreaterThan(6);
        const merged = kernel.unifySameDomainWithin(solid, 1e-4, 1e-4);
        expect(faces(merged)).toBe(6);
        expect(kernel.isValid(merged)).toBe(true);
        expect(kernel.getVolume(merged)).toBeCloseTo(kernel.getVolume(solid), 3);
        // The input is the caller's: it keeps its faces and stays valid.
        expect(faces(solid)).toBe(12);
        expect(kernel.isValid(solid)).toBe(true);
    });

    it("keeps faces apart that differ by more than the tolerances", () => {
        const solid = solidOf(cubeStl(0.5));
        expect(faces(kernel.unifySameDomainWithin(solid, 1e-4, 1e-4))).toBe(faces(kernel.unifySameDomain(solid)));
    });

    it("refuses a negative or non-finite tolerance", () => {
        const solid = solidOf(cubeStl(0));
        expect(() => kernel.unifySameDomainWithin(solid, -1, 0)).toThrow();
        expect(() => kernel.unifySameDomainWithin(solid, 0, Number.NaN)).toThrow();
    });
});
