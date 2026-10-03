/**
 * Kernel-backed results for the two-operand booleans: exact volumes, section
 * edges, and history that agrees with the plain operation. The codegen test
 * pins how these are built; this pins what they produce.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let kernel: any;
const BOUND = 1_000_000;

beforeAll(async () => {
    const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
    const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");
    const createModule = (await import(jsPath)).default;
    const Module = await createModule({
        locateFile: (p: string) => (p.endsWith(".wasm") ? wasmPath : p),
    });
    const mod = await import(resolve(__dirname, "../ts/src/index.ts"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kernel = new (mod.OcctKernel as any)(Module);
}, 30_000);

afterEach(() => kernel.releaseAll());
afterAll(() => kernel[Symbol.dispose]());

function faceHashes(shape: number): number[] {
    return kernel.getSubShapes(shape, "face").map((f: number) => kernel.hashCode(f, BOUND));
}

/** Two 10 mm cubes overlapping in a 5 mm cube (volume 125). */
function overlappingCubes(): [number, number] {
    const a = kernel.makeBox(10, 10, 10);
    const b = kernel.translate(kernel.makeBox(10, 10, 10), 5, 5, 5);
    return [a, b];
}

describe("two-operand boolean results", () => {
    it("fuse, cut and common give exact volumes", () => {
        const [a, b] = overlappingCubes();
        expect(kernel.getVolume(kernel.fuse(a, b))).toBeCloseTo(1875, 6);
        expect(kernel.getVolume(kernel.cut(a, b))).toBeCloseTo(875, 6);
        expect(kernel.getVolume(kernel.common(a, b))).toBeCloseTo(125, 6);
        expect(kernel.getVolume(kernel.intersect(a, b))).toBeCloseTo(125, 6);
    });

    it("section of a cube by a mid-height face is its square outline", () => {
        const box = kernel.makeBox(10, 10, 10);
        const face = kernel.translate(kernel.makeRectangle(20, 20), -5, -5, 5);
        const sec = kernel.section(box, face);
        expect(kernel.getSubShapes(sec, "edge").length).toBe(4);
        expect(kernel.getLength(sec)).toBeCloseTo(40, 6);
    });

    it.each([
        ["fuseWithHistory", "fuse", 1875],
        ["cutWithHistory", "cut", 875],
        ["intersectWithHistory", "common", 125],
    ])("%s matches %s and reports the split input faces", (withHistory, plain, volume) => {
        const [a, b] = overlappingCubes();
        const inputs = [...faceHashes(a), ...faceHashes(b)];
        const evo = kernel[withHistory](a, b, inputs, BOUND);

        expect(kernel.getVolume(evo.result)).toBeCloseTo(volume, 6);
        expect(kernel.getVolume(kernel[plain](a, b))).toBeCloseTo(volume, 6);
        // The three faces of each cube that cross the overlap are split.
        expect(evo.modified.some((h: number) => inputs.includes(h))).toBe(true);
    });

    it("booleanPipeline chains fuse then cut", () => {
        const [a, b] = overlappingCubes();
        const hole = kernel.translate(kernel.makeBox(2, 2, 30), 1, 1, -5);
        // Fuse = 0, Cut = 1.
        const result = kernel.booleanPipeline(a, [0, 1], [b, hole]);
        expect(kernel.getVolume(result)).toBeCloseTo(1875 - 2 * 2 * 10, 6);
    });
});
