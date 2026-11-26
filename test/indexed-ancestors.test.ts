/**
 * ancestorsIndexed: which of a shape's sub-shapes of one kind hold each of its
 * sub-shapes of a lower kind, all by position (index in getSubShapes order), as
 * flat offsets and values. Each holder is named once and in ascending order, and
 * a sub-shape nothing holds has an empty run.
 *
 * Every oracle is independent of the call under test: isSame over the handles
 * getSubShapes returns, or the calls by hash on a shape whose hashes are first
 * checked distinct.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { IndexedAncestors, OcctKernel, OcctRawKernel, ShapeHandle } from "../ts/src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let kernel: OcctKernel;
let raw: OcctRawKernel;

beforeAll(async () => {
    const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
    const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");
    const createModule = (await import(jsPath)).default;
    const Module = await createModule({
        locateFile: (path: string) => (path.endsWith(".wasm") ? wasmPath : path),
    });
    const mod = await import(resolve(__dirname, "../ts/src/index.ts"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kernel = new (mod.OcctKernel as any)(Module);
    raw = kernel.getRawKernel();
}, 30_000);

afterEach(() => kernel.releaseAll());
afterAll(() => kernel[Symbol.dispose]());

const BOUND = 2_147_483_647;

type Sub = "vertex" | "edge" | "wire" | "face" | "shell";
type Holder = "edge" | "wire" | "face" | "shell" | "solid";

const HOLES = 3;

/** A 100 × 60 × 10 plate with three through holes: each hole's wall has a seam edge. */
function plate(): ShapeHandle {
    let shape = kernel.makeBox(100, 60, 10);
    for (const [x, y, r] of [
        [20, 20, 4],
        [50, 35, 6],
        [80, 22, 3],
    ] as const) {
        shape = kernel.cut(shape, kernel.translate(kernel.makeCylinder(r, 30), x, y, -10));
    }
    return shape;
}

/** `sub`'s index in `list` by isSame alone, or -1. */
function bySame(sub: ShapeHandle, list: readonly ShapeHandle[]): number {
    const found = list.flatMap((s, i) => (kernel.isSame(s, sub) ? [i] : []));
    expect(found.length).toBeLessThanOrEqual(1);
    return found[0] ?? -1;
}

/** The runs of an answer, one list per sub-shape. */
function runs(answer: IndexedAncestors): number[][] {
    const out: number[][] = [];
    for (let i = 0; i + 1 < answer.offsets.length; i++) {
        out.push(Array.from(answer.values.subarray(answer.offsets[i]!, answer.offsets[i + 1]!)));
    }
    return out;
}

/** What ancestorsIndexed(shape, sub, holder) should answer, by isSame: holders ascending, each once. */
function expected(shape: ShapeHandle, sub: Sub, holder: Holder): number[][] {
    const subs = kernel.getSubShapes(shape, sub);
    const out: number[][] = subs.map(() => []);
    kernel.getSubShapes(shape, holder).forEach((h, at) => {
        for (const s of kernel.getSubShapes(h, sub)) {
            const i = bySame(s, subs);
            expect(i).toBeGreaterThanOrEqual(0);
            if (!out[i]!.includes(at)) out[i]!.push(at);
        }
    });
    return out;
}

describe("ancestorsIndexed", () => {
    it("names each sub-shape's holders as isSame finds them, for every pair the app reads", () => {
        const shape = plate();
        const pairs: [Sub, Holder][] = [
            ["edge", "face"],
            ["vertex", "face"],
            ["vertex", "edge"],
            ["edge", "wire"],
            ["face", "solid"],
        ];
        for (const [sub, holder] of pairs) {
            const answer = kernel.ancestorsIndexed(shape, sub, holder);
            expect(answer.offsets).toBeInstanceOf(Int32Array);
            expect(answer.values).toBeInstanceOf(Int32Array);
            expect(answer.offsets.length, `${sub} in ${holder}`).toBe(kernel.subShapeCount(shape, sub) + 1);
            expect(runs(answer), `${sub} in ${holder}`).toEqual(expected(shape, sub, holder));
        }
    });

    it("names a seam edge's face once, though the face's wire runs along it twice", () => {
        const shape = plate();
        const faces = runs(kernel.ancestorsIndexed(shape, "edge", "face"));
        // Every edge of a closed solid bounds two faces, but for a hole's seam, which bounds its wall alone.
        expect(faces.filter((f) => f.length === 1)).toHaveLength(HOLES);
        expect(faces.every((f) => f.length === 1 || f.length === 2)).toBe(true);
        for (const f of faces) expect(f).toEqual([...f].sort((a, b) => a - b));
    });

    it("agrees with edgeToFaceMap's edges and faces, on a shape whose hashes are distinct", () => {
        const shape = plate();
        const faceHashes = kernel.subShapeHashes(shape, "face", BOUND);
        const edgeHashes = kernel.subShapeHashes(shape, "edge", BOUND);
        expect(new Set(faceHashes).size).toBe(faceHashes.length);
        expect(new Set(edgeHashes).size).toBe(edgeHashes.length);
        const map = kernel.edgeToFaceMap(shape, BOUND);
        const byHash = new Map<number, number[]>();
        for (let i = 0; i < map.length; ) {
            const n = map[i + 1]!;
            byHash.set(
                edgeHashes.indexOf(map[i]!),
                map.slice(i + 2, i + 2 + n).map((h) => faceHashes.indexOf(h)),
            );
            i += 2 + n;
        }
        runs(kernel.ancestorsIndexed(shape, "edge", "face")).forEach((faces, e) => {
            expect([...new Set(byHash.get(e) ?? [])].sort((a, b) => a - b), `edge ${e}`).toEqual(faces);
        });
    });

    it("gives a sub-shape that nothing holds an empty run", () => {
        const box = kernel.makeBox(10, 10, 10);
        const lone = kernel.makeLineEdge({ x: 50, y: 0, z: 0 }, { x: 60, y: 0, z: 0 });
        const both = kernel.makeCompound([box, lone]);
        const edges = kernel.getSubShapes(both, "edge");
        const at = bySame(lone, edges);
        expect(at).toBeGreaterThanOrEqual(0);
        const faces = runs(kernel.ancestorsIndexed(both, "edge", "face"));
        expect(faces[at]).toEqual([]);
        expect(faces.filter((f) => f.length === 0)).toHaveLength(1);
        expect(runs(kernel.ancestorsIndexed(both, "vertex", "edge"))).toEqual(expected(both, "vertex", "edge"));
    });

    it("refuses a holder kind that does not hold the sub-shape kind", () => {
        const box = kernel.makeBox(1, 1, 1);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(() => kernel.ancestorsIndexed(box, "face" as any, "edge")).toThrow(/must hold/);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(() => kernel.ancestorsIndexed(box, "edge", "edge" as any)).toThrow(/must hold/);
    });

    it("keeps the shape's index and the answer with it, freed with the shape", () => {
        const shape = plate();
        const before = raw.topologyIndexCount();
        const first = runs(kernel.ancestorsIndexed(shape, "edge", "face"));
        expect(raw.topologyIndexCount()).toBe(before + 1);
        expect(runs(kernel.ancestorsIndexed(shape, "edge", "face"))).toEqual(first);
        kernel.ancestorsIndexed(shape, "vertex", "face");
        kernel.subShapesIndexed(shape, shape, "edge");
        expect(raw.topologyIndexCount()).toBe(before + 1);
        kernel.release(shape);
        expect(raw.topologyIndexCount()).toBe(before);
    });
});
