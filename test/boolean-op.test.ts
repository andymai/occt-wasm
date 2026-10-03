/**
 * booleanOp: the general boolean entry point. Checks that it agrees with the
 * dedicated two-shape and n-way methods, and that each option does what it
 * says: history across every operand, simplification, glue, fuzzy, and OBB
 * staying off for unbounded operands.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let kernel: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mod: any;
const BOUND = 1_000_000;

beforeAll(async () => {
    const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
    const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");
    const createModule = (await import(jsPath)).default;
    const Module = await createModule({
        locateFile: (p: string) => (p.endsWith(".wasm") ? wasmPath : p),
    });
    mod = await import(resolve(__dirname, "../ts/src/index.ts"));
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
    return [kernel.makeBox(10, 10, 10), kernel.translate(kernel.makeBox(10, 10, 10), 5, 5, 5)];
}

describe("booleanOp", () => {
    it("matches fuse, cut and common on two shapes", () => {
        const [a, b] = overlappingCubes();
        const { Fuse, Cut, Common } = mod.BooleanOp;
        expect(kernel.getVolume(kernel.booleanOp(Fuse, [a], [b]).result)).toBeCloseTo(1875, 6);
        expect(kernel.getVolume(kernel.booleanOp(Cut, [a], [b]).result)).toBeCloseTo(875, 6);
        expect(kernel.getVolume(kernel.booleanOp(Common, [a], [b]).result)).toBeCloseTo(125, 6);
    });

    it("matches cutAll and fuseAll on several tools", () => {
        const base = kernel.makeBox(30, 10, 10);
        const t1 = kernel.translate(kernel.makeBox(4, 20, 20), 4, -5, -5);
        const t2 = kernel.translate(kernel.makeBox(4, 20, 20), 20, -5, -5);
        const cut = kernel.booleanOp(mod.BooleanOp.Cut, [base], [t1, t2]).result;
        expect(kernel.getVolume(cut)).toBeCloseTo(kernel.getVolume(kernel.cutAll(base, [t1, t2])), 6);
        expect(kernel.getVolume(cut)).toBeCloseTo(3000 - 2 * 400, 6);

        const fused = kernel.booleanOp(mod.BooleanOp.Fuse, [base], [t1, t2]).result;
        expect(kernel.getVolume(fused)).toBeCloseTo(
            kernel.getVolume(kernel.fuseAll([base, t1, t2])),
            6,
        );
        expect(kernel.getSubShapes(fused, "solid").length).toBe(1);
    });

    it("tracks history across the argument and every tool", () => {
        const base = kernel.makeBox(30, 10, 10);
        const t1 = kernel.translate(kernel.makeBox(4, 20, 20), 4, -5, -5);
        const t2 = kernel.translate(kernel.makeBox(4, 20, 20), 20, -5, -5);
        const fromBase = faceHashes(base);
        const fromT1 = faceHashes(t1);
        const fromT2 = faceHashes(t2);
        const evo = kernel.booleanOp(mod.BooleanOp.Cut, [base], [t1, t2], {
            inputFaceHashes: [...fromBase, ...fromT1, ...fromT2],
            hashUpperBound: BOUND,
        });
        const modified: number[] = Array.from(evo.modified);
        // The base's long faces are split by both slots, and each slot's
        // walls leave faces inside the base.
        expect(modified.some((h) => fromBase.includes(h))).toBe(true);
        expect(modified.some((h) => fromT1.includes(h))).toBe(true);
        expect(modified.some((h) => fromT2.includes(h))).toBe(true);
    });

    it("collects no history without face hashes", () => {
        const [a, b] = overlappingCubes();
        const evo = kernel.booleanOp(mod.BooleanOp.Fuse, [a], [b]);
        expect(evo.modified.length + evo.generated.length + evo.deleted.length).toBe(0);
    });

    it("simplifies the result within the angular tolerance", () => {
        const a = kernel.makeBox(10, 10, 10);
        const b = kernel.translate(kernel.makeBox(10, 10, 10), 10, 0, 0);
        const plain = kernel.booleanOp(mod.BooleanOp.Fuse, [a], [b]).result;
        const simple = kernel.booleanOp(mod.BooleanOp.Fuse, [a], [b], {
            simplifyAngularTolerance: 1e-3,
        }).result;
        expect(kernel.getSubShapes(plain, "face").length).toBe(10);
        expect(kernel.getSubShapes(simple, "face").length).toBe(6);
        expect(kernel.getVolume(simple)).toBeCloseTo(2000, 6);
    });

    it("reports history that points at the simplified result's faces", () => {
        const a = kernel.makeBox(10, 10, 10);
        const b = kernel.translate(kernel.makeBox(10, 10, 10), 10, 0, 0);
        const evo = kernel.booleanOp(mod.BooleanOp.Fuse, [a], [b], {
            simplifyAngularTolerance: 1e-3,
            inputFaceHashes: [...faceHashes(a), ...faceHashes(b)],
            hashUpperBound: BOUND,
        });
        const resultFaces = new Set(faceHashes(evo.result));
        expect(resultFaces.size).toBe(6);
        // `modified` is [input, count, ...outputs] runs; every output is a
        // face of the simplified solid.
        const raw: number[] = Array.from(evo.modified);
        const outputs: number[] = [];
        for (let i = 0; i + 1 < raw.length; ) {
            const count = raw[i + 1] ?? 0;
            outputs.push(...raw.slice(i + 2, i + 2 + count));
            i += 2 + count;
        }
        expect(outputs.length).toBeGreaterThan(0);
        expect(outputs.every((h) => resultFaces.has(h))).toBe(true);
    });

    it("rejects face hashes without a positive bound", () => {
        const [a, b] = overlappingCubes();
        expect(() =>
            kernel.booleanOp(mod.BooleanOp.Fuse, [a], [b], { inputFaceHashes: faceHashes(a) }),
        ).toThrow(/hashUpperBound/);
    });

    it("glues operands that share a face", () => {
        const a = kernel.makeBox(10, 10, 10);
        const b = kernel.translate(kernel.makeBox(10, 10, 10), 10, 0, 0);
        const glued = kernel.booleanOp(mod.BooleanOp.Fuse, [a], [b], {
            glue: mod.BooleanGlue.Shift,
        }).result;
        expect(kernel.getVolume(glued)).toBeCloseTo(2000, 6);
        expect(kernel.getSubShapes(glued, "solid").length).toBe(1);
    });

    it("closes a gap smaller than the fuzzy value", () => {
        const a = kernel.makeBox(10, 10, 10);
        const b = kernel.translate(kernel.makeBox(10, 10, 10), 10 + 1e-6, 0, 0);
        const apart = kernel.booleanOp(mod.BooleanOp.Fuse, [a], [b]).result;
        const merged = kernel.booleanOp(mod.BooleanOp.Fuse, [a], [b], { fuzzyValue: 1e-5 }).result;
        expect(kernel.getSubShapes(apart, "solid").length).toBe(2);
        expect(kernel.getSubShapes(merged, "solid").length).toBe(1);
    });

    it("cuts by a half-space", () => {
        const box = kernel.makeBox(10, 10, 10);
        const hs = kernel.halfSpace({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 1 });
        const lower = kernel.booleanOp(mod.BooleanOp.Cut, [box], [hs]).result;
        expect(kernel.getVolume(lower)).toBeCloseTo(500, 3);
    });

    it("rejects an unknown op, an unknown glue and an empty tool list", () => {
        const [a, b] = overlappingCubes();
        expect(() => kernel.booleanOp(7, [a], [b])).toThrow(/opCode/);
        expect(() => kernel.booleanOp(mod.BooleanOp.Fuse, [a], [b], { glue: 9 })).toThrow(/glue/);
        expect(() => kernel.booleanOp(mod.BooleanOp.Fuse, [a], [])).toThrow(/at least one/);
    });
});
