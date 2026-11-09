/**
 * The `*Indexed` history lists name sub-shapes by position. Read back through
 * getSubShapes they must say what the hash lists say, and they must not depend
 * on the hash bound: with a bound of 1 every hash is 0, and the positions are
 * the same.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BooleanOp, type EvolutionData, type OcctKernel, type ShapeHandle, type Vec3 } from "../ts/src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let kernel: OcctKernel;
const BOUND = 2_147_483_647;
/** The kernel's kind numbers; getSubShapes lists no compounds, which no history here names. */
const KINDS = [undefined, undefined, "solid", "shell", "face", "wire", "edge", "vertex"] as const;
type Kind = NonNullable<(typeof KINDS)[number]>;

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
}, 30_000);

afterEach(() => kernel.releaseAll());
afterAll(() => kernel[Symbol.dispose]());

const p = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const hash = (shape: ShapeHandle): number => kernel.hashCode(shape, BOUND);
const sub = (shape: ShapeHandle, kind: Kind): ShapeHandle[] => kernel.getSubShapes(shape, kind);
const faceHashes = (...shapes: ShapeHandle[]): number[] => shapes.flatMap((s) => sub(s, "face").map(hash));

function polygon(points: Vec3[]): ShapeHandle {
    return kernel.makeWire(points.map((a, i) => kernel.makeLineEdge(a, points[(i + 1) % points.length]!)));
}

function polyline(points: Vec3[]): ShapeHandle {
    return kernel.makeWire(points.slice(1).map((b, i) => kernel.makeLineEdge(points[i]!, b)));
}

const moved = (shape: ShapeHandle, x: number, y: number, z: number): ShapeHandle => kernel.translate(shape, x, y, z);

/** The sub-shape at a position, failing the test when there is none. */
function at(shape: ShapeHandle, kind: Kind | undefined, position: number): ShapeHandle {
    expect(kind, "a kind getSubShapes lists").toBeDefined();
    const found = sub(shape, kind!)[position];
    expect(found, `${kind} ${position}`).toBeDefined();
    return found!;
}

/** `[inputHash, count, resultHash...]` as sorted entries, keeping only results the result holds. */
function hashRuns(runs: number[], held: Set<number>): string[] {
    const entries: string[] = [];
    for (let i = 0; i < runs.length; ) {
        const count = runs[i + 1]!;
        const images = runs.slice(i + 2, i + 2 + count).filter((h) => held.has(h));
        if (images.length > 0) entries.push(JSON.stringify([runs[i], images.sort((a, b) => a - b)]));
        i += 2 + count;
    }
    return entries.sort();
}

/** `[input, position, count, kind, position...]` read back as hash entries. */
function indexedRuns(runs: number[], inputs: ShapeHandle[], kind: "face" | "edge", result: ShapeHandle): string[] {
    const entries: string[] = [];
    for (let i = 0; i < runs.length; ) {
        const input = inputs[runs[i]!]!;
        const count = runs[i + 2]!;
        const images: number[] = [];
        for (let j = 0; j < count; j++) {
            const k = runs[i + 3 + 2 * j]!;
            images.push(hash(at(result, KINDS[k], runs[i + 4 + 2 * j]!)));
        }
        entries.push(JSON.stringify([hash(at(input, kind, runs[i + 1]!)), images.sort((a, b) => a - b)]));
        i += 3 + 2 * count;
    }
    return entries.sort();
}

function indexedPairs(pairs: number[], inputs: ShapeHandle[], kind: "face" | "edge"): number[] {
    const hashes: number[] = [];
    for (let i = 0; i < pairs.length; i += 2) hashes.push(hash(at(inputs[pairs[i]!]!, kind, pairs[i + 1]!)));
    return hashes.sort((a, b) => a - b);
}

/** A result sub-shape told by where it is, so two runs of one operation compare. */
function place(result: ShapeHandle, kind: number, position: number): string {
    const b = kernel.getBoundingBox(at(result, KINDS[kind], position));
    return `${kind}:${[b.xmin, b.ymin, b.zmin, b.xmax, b.ymax, b.zmax].map((v) => v.toFixed(6)).join(",")}`;
}

/** Runs of `[input, position, count, kind, position...]` with the result sub-shapes told by place. */
function placedRuns(runs: number[], result: ShapeHandle): string[] {
    const out: string[] = [];
    for (let i = 0; i < runs.length; ) {
        const count = runs[i + 2]!;
        const images = Array.from({ length: count }, (_, j) => place(result, runs[i + 3 + 2 * j]!, runs[i + 4 + 2 * j]!));
        out.push(JSON.stringify([runs[i], runs[i + 1], images.sort()]));
        i += 3 + 2 * count;
    }
    return out.sort();
}

/**
 * The indexed lists, input positions as they are and result positions told by
 * place: a boolean can order its result's sub-shapes differently from one run to
 * the next.
 */
function indexedLists(evo: EvolutionData) {
    const faces = (list: number[]) => list.map((f) => place(evo.result, 4, f)).sort();
    const spine: string[] = [];
    for (let i = 0; i < evo.spineGeneratedIndexed.length; ) {
        const count = evo.spineGeneratedIndexed[i + 2]!;
        const list = evo.spineGeneratedIndexed;
        spine.push(JSON.stringify([list[i], list[i + 1], faces(list.slice(i + 3, i + 3 + count))]));
        i += 3 + count;
    }
    return {
        inputShapes: evo.inputShapes.filter((_, i) => i % 3 !== 0),
        resultCounts: evo.resultCounts,
        modified: placedRuns(evo.modifiedIndexed, evo.result),
        generated: placedRuns(evo.generatedIndexed, evo.result),
        deleted: evo.deletedIndexed,
        edgeModified: placedRuns(evo.edgeModifiedIndexed, evo.result),
        edgeGenerated: placedRuns(evo.edgeGeneratedIndexed, evo.result),
        edgeDeleted: evo.edgeDeletedIndexed,
        first: faces(evo.firstShapeIndexed),
        last: faces(evo.lastShapeIndexed),
        spine: spine.sort(),
    };
}

/**
 * The indexed lists of `evo` say what its hash lists say, and `again`, the same
 * operation run with a hash bound of 1, has the same indexed lists.
 */
function expectIndexed(evo: EvolutionData, inputs: ShapeHandle[], again?: EvolutionData): void {
    const result = evo.result;
    const held = new Set(KINDS.flatMap((kind) => (kind ? sub(result, kind).map(hash) : [])));

    expect(evo.inputShapes).toEqual(
        inputs.flatMap((input) => [hash(input), sub(input, "face").length, sub(input, "edge").length]),
    );
    expect(evo.resultCounts).toEqual([sub(result, "face").length, sub(result, "edge").length]);

    expect(indexedRuns(evo.modifiedIndexed, inputs, "face", result)).toEqual(hashRuns(evo.modified, held));
    expect(indexedRuns(evo.generatedIndexed, inputs, "face", result)).toEqual(hashRuns(evo.generated, held));
    expect(indexedRuns(evo.edgeModifiedIndexed, inputs, "edge", result)).toEqual(hashRuns(evo.edgeModified, held));
    expect(indexedRuns(evo.edgeGeneratedIndexed, inputs, "edge", result)).toEqual(hashRuns(evo.edgeGenerated, held));
    expect(indexedPairs(evo.deletedIndexed, inputs, "face")).toEqual([...evo.deleted].sort((a, b) => a - b));
    expect(indexedPairs(evo.edgeDeletedIndexed, inputs, "edge")).toEqual([...evo.edgeDeleted].sort((a, b) => a - b));

    const faces = sub(result, "face");
    expect(evo.firstShapeIndexed.map((i) => hash(faces[i]!))).toEqual(evo.firstShape);
    expect(evo.lastShapeIndexed.map((i) => hash(faces[i]!))).toEqual(evo.lastShape);

    if (again) {
        expect(again.inputShapes.every((h, i) => i % 3 !== 0 || h === 0)).toBe(true);
        expect(indexedLists(again)).toEqual(indexedLists(evo));
    }
}

/** Two boxes that overlap at a corner. */
const boxes = (): [ShapeHandle, ShapeHandle] => [kernel.makeBox(10, 10, 10), moved(kernel.makeBox(10, 10, 10), 5, 5, 5)];

describe("indexed history", () => {
    it("names both inputs of a fuse, cut and intersect", () => {
        const [a, b] = boxes();
        const hashes = faceHashes(a, b);
        expectIndexed(kernel.fuseWithHistory(a, b, hashes, BOUND), [a, b], kernel.fuseWithHistory(a, b, [0], 1));
        expectIndexed(kernel.cutWithHistory(a, b, hashes, BOUND), [a, b], kernel.cutWithHistory(a, b, [0], 1));
        expectIndexed(
            kernel.intersectWithHistory(a, b, hashes, BOUND),
            [a, b],
            kernel.intersectWithHistory(a, b, [0], 1),
        );
    });

    it("numbers a boolean's arguments before its tools, also after a refine", () => {
        const target = kernel.makeBox(20, 20, 10);
        const tools = [moved(kernel.makeBox(5, 5, 20), 2, 2, 0), moved(kernel.makeCylinder(3, 20), 14, 14, 0)];
        const run = (bound: number, refine: boolean) =>
            kernel.booleanOp(BooleanOp.Fuse, [target], tools, {
                inputFaceHashes: bound === 1 ? [0] : faceHashes(target, ...tools),
                hashUpperBound: bound,
                ...(refine ? { simplifyAngularTolerance: 1e-3 } : {}),
            });
        expectIndexed(run(BOUND, false), [target, ...tools], run(1, false));
        const refined = run(BOUND, true);
        expect(refined.inputShapes).toHaveLength(9);
        expectIndexed(refined, [target, ...tools], run(1, true));
    });

    it("names the faces a fillet makes from the edges it rounds", () => {
        const box = kernel.makeBox(10, 10, 10);
        const edges = sub(box, "edge").slice(0, 3);
        const evo = kernel.filletWithHistory(box, edges, 1, faceHashes(box), BOUND);
        expect(evo.edgeGeneratedIndexed.length).toBeGreaterThan(0);
        expectIndexed(evo, [box], kernel.filletWithHistory(box, edges, 1, [0], 1));
    });

    it("names an extrude's walls and caps", () => {
        const face = kernel.makeFace(polygon([p(0, 0, 0), p(4, 0, 0), p(4, 3, 0), p(0, 3, 0)]));
        const evo = kernel.extrudeWithHistory(face, 0, 0, 5, faceHashes(face), BOUND);
        expect(evo.firstShapeIndexed).toHaveLength(1);
        expect(evo.lastShapeIndexed).toHaveLength(1);
        expectIndexed(evo, [face], kernel.extrudeWithHistory(face, 0, 0, 5, [0], 1));
    });

    it("names a sweep's faces by spine edge and profile edge", () => {
        const wire = polygon([p(-1, -1, 0), p(1, -1, 0), p(1, 1, 0), p(-1, 1, 0)]);
        const path = polyline([p(0, 0, 0), p(0, 0, 10), p(0, 10, 10)]);
        const evo = kernel.sweepWithHistory(wire, path, [], BOUND);
        expectIndexed(evo, [wire], kernel.sweepWithHistory(wire, path, [], 1));

        const pairs: number[][] = [];
        for (let i = 0; i < evo.spineGeneratedIndexed.length; ) {
            const count = evo.spineGeneratedIndexed[i + 2]!;
            pairs.push([
                hash(at(path, "edge", evo.spineGeneratedIndexed[i]!)),
                hash(at(wire, "edge", evo.spineGeneratedIndexed[i + 1]!)),
                count,
                ...evo.spineGeneratedIndexed.slice(i + 3, i + 3 + count).map((f) => hash(at(evo.result, "face", f))),
            ]);
            i += 3 + count;
        }
        expect(pairs.flat()).toEqual(evo.spineGenerated);
        expect(pairs).toHaveLength(sub(path, "edge").length * sub(wire, "edge").length);
    });

    it("numbers a loft's wires in order", () => {
        const wires = [0, 5, 10].map((z) =>
            polygon([p(0, 0, z), p(4 + z / 5, 0, z), p(4 + z / 5, 4, z), p(0, 4, z)]),
        );
        const evo = kernel.loftWithHistory(wires, true, false, [], BOUND);
        expectIndexed(evo, wires, kernel.loftWithHistory(wires, true, false, [], 1));
        expect(evo.edgeGeneratedIndexed.length).toBeGreaterThan(0);
    });
});
