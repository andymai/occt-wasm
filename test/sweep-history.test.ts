/**
 * History from the operations that make a solid from a profile, and from
 * unifySameDomain and transform. Each hash must name a face of the result, and
 * each swept face must touch the profile edge reported for it.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EvolutionData, OcctKernel, ShapeHandle, Vec3 } from "../ts/src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let kernel: OcctKernel;
const BOUND = 1_000_000_000;

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
const edgesOf = (shape: ShapeHandle): ShapeHandle[] => kernel.getSubShapes(shape, "edge");
const facesOf = (shape: ShapeHandle): ShapeHandle[] => kernel.getSubShapes(shape, "face");
const faceHashes = (shape: ShapeHandle): number[] => facesOf(shape).map(hash);

/** A closed polygon wire through the given points. */
function polygon(points: Vec3[]): ShapeHandle {
    return kernel.makeWire(points.map((a, i) => kernel.makeLineEdge(a, points[(i + 1) % points.length]!)));
}

/** A polyline wire through the given points. */
function polyline(points: Vec3[]): ShapeHandle {
    return kernel.makeWire(points.slice(1).map((b, i) => kernel.makeLineEdge(points[i]!, b)));
}

const circleWire = (center: Vec3, radius: number): ShapeHandle =>
    kernel.makeWire([kernel.makeCircleEdge(center, p(0, 0, 1), radius)]);

/** `[inputHash, count, resultHash...]` as a map from input hash to its results. */
function decodeRuns(runs: number[]): Map<number, number[]> {
    const decoded = new Map<number, number[]>();
    for (let i = 0; i < runs.length; ) {
        const count = runs[i + 1]!;
        decoded.set(runs[i]!, runs.slice(i + 2, i + 2 + count));
        i += 2 + count;
    }
    return decoded;
}

/** `[spineHash, profileHash, count, faceHash...]` as a list of pairs. */
function decodePairs(runs: number[]): { spine: number; profile: number; faces: number[] }[] {
    const pairs: { spine: number; profile: number; faces: number[] }[] = [];
    for (let i = 0; i < runs.length; ) {
        const count = runs[i + 2]!;
        pairs.push({ spine: runs[i]!, profile: runs[i + 1]!, faces: runs.slice(i + 3, i + 3 + count) });
        i += 3 + count;
    }
    return pairs;
}

const byHash = (faces: ShapeHandle[]): Map<number, ShapeHandle> => new Map(faces.map((f) => [hash(f), f]));

/**
 * Every profile edge reports faces that touch it, the faces the edges and caps
 * report are exactly the result's, and the two caps do not overlap the walls.
 */
function expectSweptFaces(evo: EvolutionData, profileEdges: ShapeHandle[]): void {
    const result = byHash(facesOf(evo.result));
    const swept = decodeRuns(evo.edgeGenerated);
    const reported = new Set<number>();
    for (const edge of profileEdges) {
        const faces = swept.get(hash(edge));
        expect(faces, "a profile edge reported no faces").toBeDefined();
        expect(faces!.length).toBeGreaterThan(0);
        for (const face of faces!) {
            expect(result.has(face), "a reported face is not in the result").toBe(true);
            reported.add(face);
        }
        const nearest = Math.min(...faces!.map((f) => kernel.distanceBetween(result.get(f)!, edge)));
        expect(nearest, "no reported face touches its profile edge").toBeLessThan(1e-6);
    }
    for (const cap of [...evo.firstShape, ...evo.lastShape]) {
        expect(result.has(cap), "a cap is not in the result").toBe(true);
        expect(reported.has(cap), "a cap is also reported as a wall").toBe(false);
        reported.add(cap);
    }
    expect([...reported].sort()).toEqual([...result.keys()].sort());
}

function centerZ(shape: ShapeHandle, faceHash: number): number {
    return kernel.getSurfaceCenterOfMass(byHash(facesOf(shape)).get(faceHash)!).z;
}

const zAxis = { point: p(0, 0, 0), direction: p(0, 0, 1) };
const TRANSITION_ROUND = 2;

describe("extrudeWithHistory", () => {
    it("reports a wall per profile edge and both caps", () => {
        const face = kernel.makeFace(polygon([p(0, 0, 0), p(4, 0, 0), p(4, 3, 0), p(0, 3, 0)]));
        const evo = kernel.extrudeWithHistory(face, 0, 0, 10, faceHashes(face), BOUND);
        expect(kernel.getVolume(evo.result)).toBeCloseTo(120, 6);
        expectSweptFaces(evo, edgesOf(face));
        expect(evo.firstShape).toHaveLength(1);
        expect(evo.lastShape).toHaveLength(1);
        expect(centerZ(evo.result, evo.firstShape[0]!)).toBeCloseTo(0, 6);
        expect(centerZ(evo.result, evo.lastShape[0]!)).toBeCloseTo(10, 6);
        expect(evo.spineGenerated).toEqual([]);
    });

    it("gives a hole's edges walls too", () => {
        const outer = polygon([p(-5, -5, 0), p(5, -5, 0), p(5, 5, 0), p(-5, 5, 0)]);
        const hole = kernel.reverseShape(circleWire(p(0, 0, 0), 2));
        const face = kernel.addHolesInFace(kernel.makeFace(outer), [hole]);
        const evo = kernel.extrudeWithHistory(face, 0, 0, 5, [], BOUND);
        expectSweptFaces(evo, edgesOf(face));
    });

    it("has no caps for a wire profile", () => {
        const wire = polyline([p(0, 0, 0), p(4, 0, 0), p(4, 3, 0)]);
        const evo = kernel.extrudeWithHistory(wire, 0, 0, 10, [], BOUND);
        expect(evo.firstShape).toEqual([]);
        expect(evo.lastShape).toEqual([]);
        expectSweptFaces(evo, edgesOf(wire));
    });

    it("keeps hashes valid when it turns an inside-out solid around", () => {
        const face = kernel.makeFace(polygon([p(0, 0, 0), p(0, 3, 0), p(4, 3, 0), p(4, 0, 0)]));
        const evo = kernel.extrudeWithHistory(face, 0, 0, 10, [], BOUND);
        expect(kernel.getVolume(evo.result)).toBeGreaterThan(0);
        expectSweptFaces(evo, edgesOf(face));
    });

    it("rejects a non-positive hash bound without leaving the result behind", () => {
        const box = kernel.makeRectangle(1, 1);
        const before = kernel.shapeCount;
        expect(() => kernel.extrudeWithHistory(box, 0, 0, 1, [], 0)).toThrow(/hashUpperBound/);
        expect(kernel.shapeCount).toBe(before);
    });
});

describe("revolveWithHistory", () => {
    const profile = (): ShapeHandle =>
        kernel.makeFace(polygon([p(5, 0, 0), p(8, 0, 0), p(8, 0, 4), p(5, 0, 4)]));

    it("reports a face per profile edge and both caps on a partial revolve", () => {
        const face = profile();
        const evo = kernel.revolveWithHistory(face, zAxis, Math.PI / 2, faceHashes(face), BOUND);
        expectSweptFaces(evo, edgesOf(face));
        expect(evo.firstShape).toHaveLength(1);
        expect(evo.lastShape).toHaveLength(1);
        const first = byHash(facesOf(evo.result)).get(evo.firstShape[0]!)!;
        const last = byHash(facesOf(evo.result)).get(evo.lastShape[0]!)!;
        expect(kernel.getSurfaceCenterOfMass(first).y).toBeCloseTo(0, 6);
        expect(kernel.getSurfaceCenterOfMass(last).x).toBeCloseTo(0, 6);
    });

    it("has no caps on a full revolve", () => {
        const face = profile();
        const evo = kernel.revolveWithHistory(face, zAxis, 2 * Math.PI, faceHashes(face), BOUND);
        expect(evo.firstShape).toEqual([]);
        expect(evo.lastShape).toEqual([]);
        expectSweptFaces(evo, edgesOf(face));
    });

    it("keeps the planar faces of a full revolve, which OCCT reports as deleted", () => {
        const wire = polyline([p(5, 0, 0), p(8, 0, 0), p(8, 0, 4)]);
        const evo = kernel.revolveWithHistory(wire, zAxis, 2 * Math.PI, [], BOUND);
        expect(evo.edgeDeleted).toEqual([]);
        expectSweptFaces(evo, edgesOf(wire));
    });

    it("tells an edge on the axis from the edges that swept faces", () => {
        const axisEdge = kernel.makeLineEdge(p(0, 0, 4), p(0, 0, 0));
        const base = kernel.makeLineEdge(p(0, 0, 0), p(5, 0, 0));
        const slant = kernel.makeLineEdge(p(5, 0, 0), p(0, 0, 4));
        const face = kernel.makeFace(kernel.makeWire([axisEdge, base, slant]));
        const evo = kernel.revolveWithHistory(face, zAxis, 2 * Math.PI, [], BOUND);
        const edges = edgesOf(face);
        const onAxis = edges.filter((e) => kernel.distanceBetween(e, kernel.makeLineEdge(p(0, 0, 1), p(0, 0, 2))) < 1e-9);
        expect(onAxis).toHaveLength(1);
        expect(kernel.getVolume(evo.result)).toBeGreaterThan(0);
        expect(evo.edgeDeleted).toEqual([hash(onAxis[0]!)]);
        expectSweptFaces(evo, edges.filter((e) => e !== onAxis[0]));
    });

    it("follows a face OCCT copies to separate a shared degenerate edge", () => {
        // Two cones reach the axis at the origin, so they share a degenerate edge and
        // OCCT replaces one of the two faces with a copy.
        const face = kernel.makeFace(polygon([p(0, 0, 0), p(5, 0, 5), p(5, 0, -5)]));
        const evo = kernel.revolveWithHistory(face, zAxis, 2 * Math.PI, faceHashes(face), BOUND);
        expect(kernel.isValid(evo.result)).toBe(true);
        expect(evo.edgeDeleted).toEqual([]);
        expectSweptFaces(evo, edgesOf(face));
    });

    it("reports the solid a full revolve makes from its profile face", () => {
        const face = profile();
        const evo = kernel.revolveWithHistory(face, zAxis, 2 * Math.PI, faceHashes(face), BOUND);
        const generated = decodeRuns(evo.generated);
        expect(generated.get(hash(face))).toEqual([hash(evo.result)]);
        expect(evo.deleted).toEqual([]);
    });
});

describe("pipeWithHistory", () => {
    const spine = (): ShapeHandle => polyline([p(0, 0, 0), p(0, 0, 10), p(0, 10, 10)]);

    it("reports faces, caps and the face for each spine and profile edge", () => {
        const profileFace = kernel.makeFace(polygon([p(-1, -1, 0), p(1, -1, 0), p(1, 1, 0), p(-1, 1, 0)]));
        const path = spine();
        const evo = kernel.pipeWithHistory(profileFace, path, faceHashes(profileFace), BOUND);
        expectSweptFaces(evo, edgesOf(profileFace));
        expect(evo.firstShape).toHaveLength(1);
        expect(evo.lastShape).toHaveLength(1);

        const pairs = decodePairs(evo.spineGenerated);
        expect(pairs).toHaveLength(edgesOf(path).length * edgesOf(profileFace).length);
        const swept = decodeRuns(evo.edgeGenerated);
        for (const pair of pairs) {
            expect(edgesOf(path).map(hash)).toContain(pair.spine);
            expect(pair.faces).toHaveLength(1);
            expect(swept.get(pair.profile)).toContain(pair.faces[0]);
        }
        const results = byHash(facesOf(evo.result));
        for (const edge of edgesOf(path)) {
            for (const pair of pairs.filter((q) => q.spine === hash(edge))) {
                expect(kernel.distanceBetween(results.get(pair.faces[0]!)!, edge)).toBeLessThan(2.5);
            }
        }
    });

    it("has no caps for a wire profile", () => {
        const wire = polyline([p(-1, 0, 0), p(1, 0, 0), p(1, 1, 0)]);
        const evo = kernel.pipeWithHistory(wire, spine(), [], BOUND);
        expect(evo.firstShape).toEqual([]);
        expect(evo.lastShape).toEqual([]);
        expectSweptFaces(evo, edgesOf(wire));
        expect(decodePairs(evo.spineGenerated)).toHaveLength(4);
    });

    it("reports a bare edge profile", () => {
        const edge = kernel.makeLineEdge(p(-1, 0, 0), p(1, 0, 0));
        const evo = kernel.pipeWithHistory(edge, spine(), [], BOUND);
        expectSweptFaces(evo, [edge]);
        expect(decodePairs(evo.spineGenerated)).toHaveLength(2);
    });

    it("gives a hole's edges their faces", () => {
        const outer = polygon([p(-3, -3, 0), p(3, -3, 0), p(3, 3, 0), p(-3, 3, 0)]);
        const hole = kernel.reverseShape(circleWire(p(0, 0, 0), 1));
        const face = kernel.addHolesInFace(kernel.makeFace(outer), [hole]);
        const path = polyline([p(0, 0, 0), p(0, 0, 10)]);
        const evo = kernel.pipeWithHistory(face, path, [], BOUND);
        expectSweptFaces(evo, edgesOf(face));
        expect(decodePairs(evo.spineGenerated)).toHaveLength(edgesOf(face).length);
    });

    it("has no caps on a closed spine", () => {
        const path = circleWire(p(0, 0, 0), 20);
        const profileFace = kernel.makeFace(
            kernel.makeWire([kernel.makeCircleEdge(p(20, 0, 0), p(0, 1, 0), 2)]),
        );
        const evo = kernel.pipeWithHistory(profileFace, path, [], BOUND);
        expect(evo.firstShape).toEqual([]);
        expect(evo.lastShape).toEqual([]);
        expectSweptFaces(evo, edgesOf(profileFace));
    });

    it("works from a located profile and spine", () => {
        const move = [1, 0, 0, 3, 0, 1, 0, 4, 0, 0, 1, 5];
        const profileFace = kernel.located(
            kernel.makeFace(polygon([p(-1, -1, 0), p(1, -1, 0), p(1, 1, 0), p(-1, 1, 0)])),
            move,
        );
        const path = kernel.located(spine(), move);
        const evo = kernel.pipeWithHistory(profileFace, path, [], BOUND);
        expectSweptFaces(evo, edgesOf(profileFace));
        expect(decodePairs(evo.spineGenerated)).toHaveLength(edgesOf(path).length * edgesOf(profileFace).length);
    });

    it("builds the same solid as pipe", () => {
        const profileFace = kernel.makeFace(polygon([p(-1, -1, 0), p(1, -1, 0), p(1, 1, 0), p(-1, 1, 0)]));
        const evo = kernel.pipeWithHistory(profileFace, spine(), [], BOUND);
        expect(kernel.getVolume(evo.result)).toBeCloseTo(kernel.getVolume(kernel.pipe(profileFace, spine())), 9);
    });
});

describe("sweepWithHistory", () => {
    const square = (): ShapeHandle => polygon([p(-1, -1, 0), p(1, -1, 0), p(1, 1, 0), p(-1, 1, 0)]);
    const spine = (): ShapeHandle => polyline([p(0, 0, 0), p(0, 0, 10), p(0, 10, 10)]);

    it("reports faces, caps and the faces for each spine and profile edge", () => {
        const wire = square();
        const path = spine();
        const evo = kernel.sweepWithHistory(wire, path, [], BOUND);
        expect(kernel.getVolume(evo.result)).toBeGreaterThan(0);
        expectSweptFaces(evo, edgesOf(wire));
        expect(evo.firstShape).toHaveLength(1);
        expect(evo.lastShape).toHaveLength(1);

        const pairs = decodePairs(evo.spineGenerated);
        expect(pairs).toHaveLength(edgesOf(path).length * edgesOf(wire).length);
        const swept = decodeRuns(evo.edgeGenerated);
        for (const pair of pairs) {
            for (const face of pair.faces) {
                expect(swept.get(pair.profile)).toContain(face);
            }
        }
    });

    it("keeps a round corner's faces under the profile edges, not a spine edge", () => {
        const wire = square();
        const path = spine();
        const evo = kernel.sweepWithHistory(wire, path, [], BOUND, { transitionMode: TRANSITION_ROUND });
        const plain = kernel.sweepWithHistory(wire, path, [], BOUND);
        expect(facesOf(evo.result).length).toBeGreaterThan(facesOf(plain.result).length);
        expectSweptFaces(evo, edgesOf(wire));
        const alongSpine = new Set(decodePairs(evo.spineGenerated).flatMap((pair) => pair.faces));
        const walls = [...decodeRuns(evo.edgeGenerated).values()].flat();
        expect(walls.length).toBeGreaterThan(alongSpine.size);
        expect(walls).toEqual(expect.arrayContaining([...alongSpine]));
    });

    it("has no caps on an open profile", () => {
        const wire = polyline([p(-1, 0, 0), p(1, 0, 0), p(1, 1, 0)]);
        const evo = kernel.sweepWithHistory(wire, spine(), [], BOUND);
        expect(evo.firstShape).toEqual([]);
        expect(evo.lastShape).toEqual([]);
        expectSweptFaces(evo, edgesOf(wire));
    });

    it("has no caps on a closed spine", () => {
        const path = circleWire(p(0, 0, 0), 20);
        const wire = kernel.makeWire([kernel.makeCircleEdge(p(20, 0, 0), p(0, 1, 0), 2)]);
        const evo = kernel.sweepWithHistory(wire, path, [], BOUND);
        expect(evo.firstShape).toEqual([]);
        expect(evo.lastShape).toEqual([]);
        expectSweptFaces(evo, edgesOf(wire));
    });

    it("carries a scaling law through", () => {
        const wire = square();
        const path = polyline([p(0, 0, 0), p(0, 0, 10)]);
        const evo = kernel.sweepWithHistory(wire, path, [], BOUND, { law: 1, lawLength: 1, lawEndFactor: 2 });
        expectSweptFaces(evo, edgesOf(wire));
        expect(kernel.getVolume(evo.result)).toBeCloseTo(
            kernel.getVolume(kernel.sweepFull(wire, path, { law: 1, lawLength: 1, lawEndFactor: 2 })),
            6,
        );
    });

    it("rejects options that are not whole numbers where they must be", () => {
        for (const maxDegree of [1.5, Number.NaN, Number.POSITIVE_INFINITY, 3e10]) {
            expect(() => kernel.sweepWithHistory(square(), spine(), [], BOUND, { maxDegree })).toThrow(/whole number/);
        }
    });

    it("needs a law length with a law", () => {
        expect(() => kernel.sweepWithHistory(square(), spine(), [], BOUND, { law: 1 })).toThrow(/lawLength/);
    });
});

describe("loftWithHistory", () => {
    const square = (z: number, half: number): ShapeHandle =>
        polygon([p(-half, -half, z), p(half, -half, z), p(half, half, z), p(-half, half, z)]);

    it("reports a face per edge of every section and both caps", () => {
        const sections = [square(0, 2), square(10, 3)];
        const evo = kernel.loftWithHistory(sections, true, true, [], BOUND);
        expect(evo.firstShape).toHaveLength(1);
        expect(evo.lastShape).toHaveLength(1);
        expect(centerZ(evo.result, evo.firstShape[0]!)).toBeCloseTo(0, 6);
        expect(centerZ(evo.result, evo.lastShape[0]!)).toBeCloseTo(10, 6);
        expectSweptFaces(evo, sections.flatMap(edgesOf));
    });

    it("reports a face per pair of sections on a ruled loft", () => {
        const sections = [square(0, 2), square(10, 3), square(20, 2)];
        const evo = kernel.loftWithHistory(sections, true, true, [], BOUND);
        expectSweptFaces(evo, sections.flatMap(edgesOf));
        for (const faces of decodeRuns(evo.edgeGenerated).values()) {
            expect(faces).toHaveLength(2);
        }
    });

    it("follows sections with different edge counts", () => {
        const sections = [square(0, 4), circleWire(p(0, 0, 10), 3)];
        const evo = kernel.loftWithHistory(sections, true, false, [], BOUND);
        expect(kernel.isValid(evo.result)).toBe(true);
        expectSweptFaces(evo, sections.flatMap(edgesOf));
    });

    it("reports a smooth loft through more than two sections", () => {
        const sections = [circleWire(p(0, 0, 0), 5), circleWire(p(0, 0, 10), 3), circleWire(p(0, 0, 20), 6)];
        const evo = kernel.loftWithHistory(sections, true, false, [], BOUND);
        expectSweptFaces(evo, sections.flatMap(edgesOf));
    });

    it("has no caps on a shell", () => {
        const evo = kernel.loftWithHistory([square(0, 2), square(10, 3)], false, true, [], BOUND);
        expect(evo.firstShape).toEqual([]);
        expect(evo.lastShape).toEqual([]);
    });

    it("loses the cap a start vertex replaces", () => {
        const section = square(10, 3);
        const apex = kernel.makeVertex(0, 0, 0);
        const evo = kernel.loftWithHistory([section], true, true, [], BOUND, { start: apex });
        expect(kernel.getVolume(evo.result)).toBeGreaterThan(0);
        expect(evo.lastShape.length + evo.firstShape.length).toBe(1);
        expectSweptFaces(evo, edgesOf(section));
    });
});

describe("unifySameDomainWithHistory", () => {
    it("reports the merged face and edge each input became", () => {
        const left = kernel.makeBox(10, 10, 10);
        const right = kernel.translate(kernel.makeBox(10, 10, 10), 10, 0, 0);
        const fused = kernel.fuse(left, right);
        expect(facesOf(fused).length).toBeGreaterThan(6);

        const evo = kernel.unifySameDomainWithHistory(fused, faceHashes(fused), BOUND);
        const result = byHash(facesOf(evo.result));
        expect(result.size).toBe(6);

        const merged = decodeRuns(evo.modified);
        expect(merged.size).toBeGreaterThan(0);
        for (const faces of merged.values()) {
            for (const face of faces) {
                expect(result.has(face)).toBe(true);
            }
        }
        expect(decodeRuns(evo.edgeModified).size).toBeGreaterThan(0);
        expect(kernel.getVolume(evo.result)).toBeCloseTo(2000, 6);
    });

    it("has no modified faces when nothing merges", () => {
        const box = kernel.makeBox(1, 2, 3);
        const evo = kernel.unifySameDomainWithHistory(box, faceHashes(box), BOUND);
        expect(evo.modified).toEqual([]);
        expect(faceHashes(evo.result).sort()).toEqual(faceHashes(box).sort());
    });
});

describe("transformWithHistory", () => {
    it("follows every face through a placement", () => {
        const box = kernel.makeBox(1, 2, 3);
        const matrix = [0, -1, 0, 5, 1, 0, 0, 6, 0, 0, 1, 7];
        const evo = kernel.transformWithHistory(box, matrix, faceHashes(box), BOUND);
        const moved = decodeRuns(evo.modified);
        expect(moved.size).toBe(6);
        const result = byHash(facesOf(evo.result));
        for (const faces of moved.values()) {
            expect(faces).toHaveLength(1);
            expect(result.has(faces[0]!)).toBe(true);
        }
        expect(kernel.getCenterOfMass(evo.result).x).toBeCloseTo(4, 6);
        expect(kernel.getCenterOfMass(evo.result).y).toBeCloseTo(6.5, 6);
        expect(kernel.getCenterOfMass(evo.result).z).toBeCloseTo(8.5, 6);
    });

    it("rejects a matrix of the wrong size", () => {
        const box = kernel.makeBox(1, 1, 1);
        expect(() => kernel.transformWithHistory(box, [1, 0, 0], [], BOUND)).toThrow(/12 elements/);
    });
});

describe("the operations that are not sweeps", () => {
    it("leave the sweep lists empty", () => {
        const box = kernel.makeBox(1, 2, 3);
        const evo = kernel.translateWithHistory(box, 1, 0, 0, faceHashes(box), BOUND);
        expect(evo.firstShape).toEqual([]);
        expect(evo.lastShape).toEqual([]);
        expect(evo.spineGenerated).toEqual([]);
    });
});
