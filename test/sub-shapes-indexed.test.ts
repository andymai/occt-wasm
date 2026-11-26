/**
 * Sub-shapes named by position across two shapes. `subShapesIndexed(shape, part,
 * type)` says where each of a part's sub-shapes of one type sits in a shape: its
 * index in `getSubShapes(shape, type)`, which no two sub-shapes of a shape share.
 *
 * Every position comes from one topology index per shape. The arena keeps an index
 * only for a shape that a position query asked of, and frees it with the shape;
 * every other call that lists a shape builds one for that call alone, or reads the
 * one the arena keeps.
 *
 * Every oracle is independent of the call under test: isSame over the handles
 * getSubShapes returns.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { OcctKernel, OcctRawKernel, ShapeHandle } from "../ts/src/index.js";

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

type Kind = "vertex" | "edge" | "wire" | "face" | "shell" | "solid";
const KINDS: readonly Kind[] = ["vertex", "edge", "wire", "face", "shell", "solid"];

/** A 100 × 60 × 10 plate with three through holes. */
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

/** The plate cut in two by a slab: one result holding two solids. */
function cutInTwo(): { result: ShapeHandle; pieces: ShapeHandle[] } {
    const slab = kernel.translate(kernel.makeBox(4, 80, 30), 60, -10, -10);
    const result = kernel.cut(plate(), slab);
    const pieces = kernel.getSubShapes(result, "solid");
    expect(pieces).toHaveLength(2);
    return { result, pieces };
}

/** `sub`'s index in `list` by isSame alone, or -1. */
function bySame(sub: ShapeHandle, list: readonly ShapeHandle[]): number {
    const found = list.flatMap((s, i) => (kernel.isSame(s, sub) ? [i] : []));
    expect(found.length).toBeLessThanOrEqual(1);
    return found[0] ?? -1;
}

/** What subShapesIndexed(shape, part, kind) should answer, by isSame. */
function expected(shape: ShapeHandle, part: ShapeHandle, kind: Kind): number[] {
    const all = kernel.getSubShapes(shape, kind);
    return kernel.getSubShapes(part, kind).map((s) => bySame(s, all));
}

describe("subShapesIndexed", () => {
    it("maps every sub-shape of a cut piece into the result, as isSame finds it", () => {
        const { result, pieces } = cutInTwo();
        for (const piece of pieces) {
            for (const kind of KINDS) {
                const mapped = kernel.subShapesIndexed(result, piece, kind);
                expect(mapped, kind).toEqual(expected(result, piece, kind));
                expect(mapped, kind).not.toContain(-1);
                expect(mapped.length, kind).toBe(kernel.subShapeCount(piece, kind));
            }
        }
    });

    it("names nothing of a moved or relocated copy, and maps a shape into itself position for position", () => {
        const shape = plate();
        const moved = kernel.translate(shape, 0, 0, 50);
        const placed = kernel.located(shape, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 50]);
        for (const kind of KINDS) {
            for (const other of [moved, placed]) {
                expect(kernel.subShapesIndexed(shape, other, kind).every((p) => p === -1), kind).toBe(true);
            }
            const self = kernel.subShapesIndexed(shape, shape, kind);
            expect(self, kind).toEqual(self.map((_, i) => i));
        }
    });

    it("finds one sub-shape by passing it as the part, a solid among solids included", () => {
        const shape = plate();
        kernel.getSubShapes(shape, "face").forEach((face, i) => {
            expect(kernel.subShapesIndexed(shape, face, "face")).toEqual([i]);
        });
        const [solid] = kernel.getSubShapes(shape, "solid");
        const [movedSolid] = kernel.getSubShapes(kernel.translate(shape, 0, 0, 50), "solid");
        const both = kernel.makeCompound([movedSolid!, solid!]);
        expect(kernel.subShapesIndexed(both, solid!, "solid")).toEqual([1]);
        expect(kernel.subShapesIndexed(both, movedSolid!, "solid")).toEqual([0]);
        expect(kernel.subShapesIndexed(both, both, "solid")).toEqual([0, 1]);
    });

    it("says where each input face a boolean left untouched sits in its result", () => {
        const base = plate();
        const tool = kernel.translate(kernel.makeBox(30, 30, 30), 85, 45, -5);
        const hashes = [...kernel.subShapeHashes(base, "face", BOUND), ...kernel.subShapeHashes(tool, "face", BOUND)];
        const evo = kernel.cutWithHistory(base, tool, hashes, BOUND);
        [base, tool].forEach((input, i) => {
            const kept = kernel.subShapesIndexed(evo.result, input, "face");
            expect(kept).toEqual(expected(evo.result, input, "face"));
            const untouched = kept.flatMap((at, face) => (at >= 0 ? [face] : []));
            if (i === 0) expect(untouched.length).toBeGreaterThan(0);
            // #492's history reports none of them as modified or deleted.
            const deleted = new Set<number>();
            for (let d = 0; d < evo.deletedIndexed.length; d += 2) {
                if (evo.deletedIndexed[d] === i) deleted.add(evo.deletedIndexed[d + 1]!);
            }
            const modified = new Set<number>();
            for (let m = 0; m < evo.modifiedIndexed.length; ) {
                const count = evo.modifiedIndexed[m + 2]!;
                if (evo.modifiedIndexed[m] === i) modified.add(evo.modifiedIndexed[m + 1]!);
                m += 3 + 2 * count;
            }
            for (const face of untouched) {
                expect(deleted.has(face), `input ${i} face ${face}`).toBe(false);
                expect(modified.has(face), `input ${i} face ${face}`).toBe(false);
            }
        });
    });

    it("says where the faces and edges a fillet left untouched sit in its result", () => {
        const box = kernel.makeBox(10, 20, 30);
        const result = kernel.fillet(box, [kernel.getSubShapes(box, "edge")[0]!], 2);
        for (const kind of ["face", "edge", "vertex"] as const) {
            const kept = kernel.subShapesIndexed(result, box, kind);
            expect(kept, kind).toEqual(expected(result, box, kind));
            expect(kept.some((at) => at >= 0), kind).toBe(true);
            expect(kept, kind).toContain(-1);
        }
    });

    it("refuses an unknown type", () => {
        const box = kernel.makeBox(1, 1, 1);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(() => kernel.subShapesIndexed(box, box, "cube" as any)).toThrow(/Unknown shape type/);
    });
});

describe("one topology index per shape asked of by position", () => {
    it("is kept by no call that lists, meshes, draws or reports history", () => {
        const shape = plate();
        const tool = kernel.translate(kernel.makeBox(30, 30, 30), 85, 45, -5);
        const before = raw.topologyIndexCount();
        for (const kind of KINDS) {
            kernel.getSubShapes(shape, kind);
            kernel.subShapeCount(shape, kind);
            kernel.subShapeHashes(shape, kind, BOUND);
        }
        kernel.meshShape(shape);
        kernel.tessellate(shape);
        kernel.wireframe(shape, { deflection: 0.1, source: "triangulation" });
        const hashes = kernel.subShapeHashes(shape, "face", BOUND);
        kernel.cutWithHistory(shape, tool, hashes, BOUND);
        kernel.fuseWithHistory(shape, tool, hashes, BOUND);
        const face = kernel.getSubShapes(shape, "face")[0]!;
        kernel.extrudeWithHistory(face, 0, 0, 5, kernel.subShapeHashes(face, "face", BOUND), BOUND);
        expect(raw.topologyIndexCount()).toBe(before);
    });

    it("is kept for the shape a lookup asks of, not for the part, and read again after", () => {
        const { result, pieces } = cutInTwo();
        // Listed before any index is kept: each from an index built for its call.
        const fresh = new Map(KINDS.map((kind) => [kind, kernel.getSubShapes(result, kind)]));
        const before = raw.topologyIndexCount();
        kernel.subShapesIndexed(result, pieces[0]!, "face");
        expect(raw.topologyIndexCount()).toBe(before + 1);
        // Another part and another type, then the listing calls: all read the one kept index,
        // and it lists what the indexes built for one call listed.
        kernel.subShapesIndexed(result, pieces[1]!, "edge");
        for (const kind of KINDS) {
            const listed = kernel.getSubShapes(result, kind);
            expect(listed.map((s, i) => kernel.isSame(s, fresh.get(kind)![i]!)), kind).toEqual(listed.map(() => true));
            expect(listed, kind).toHaveLength(fresh.get(kind)!.length);
            kernel.subShapeCount(result, kind);
            kernel.subShapeHashes(result, kind, BOUND);
        }
        expect(raw.topologyIndexCount()).toBe(before + 1);
    });

    it("survives the arena growing around it", () => {
        const shape = plate();
        const faces = kernel.getSubShapes(shape, "face");
        expect(kernel.subShapesIndexed(shape, faces[3]!, "face")).toEqual([3]);
        for (let i = 0; i < 2000; i++) kernel.makeBox(1, 1, 1);
        faces.forEach((face, i) => expect(kernel.subShapesIndexed(shape, face, "face")).toEqual([i]));
        expect(kernel.getSubShapes(shape, "face").map((f) => bySame(f, faces))).toEqual(faces.map((_, i) => i));
    });

    it("is freed by release, releaseSince and releaseAll", () => {
        const kept = kernel.makeBox(1, 2, 3);
        kernel.subShapesIndexed(kept, kept, "face");
        const base = raw.topologyIndexCount();

        const one = kernel.makeBox(4, 5, 6);
        kernel.subShapesIndexed(one, one, "edge");
        expect(raw.topologyIndexCount()).toBe(base + 1);
        kernel.release(one);
        expect(raw.topologyIndexCount()).toBe(base);

        const mark = kernel.checkpoint();
        for (let i = 0; i < 3; i++) {
            const box = kernel.makeBox(1 + i, 1, 1);
            kernel.subShapesIndexed(box, box, "vertex");
        }
        expect(raw.topologyIndexCount()).toBe(base + 3);
        kernel.releaseSince(mark);
        expect(raw.topologyIndexCount()).toBe(base);

        kernel.releaseAll();
        expect(raw.topologyIndexCount()).toBe(0);
        expect(kernel.shapeCount).toBe(0);
    });
});
