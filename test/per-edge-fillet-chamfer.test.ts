/**
 * Per-edge fillet radii and chamfer distances, applied to every edge in one
 * BRepFilletAPI operation: filletRadii, chamferDistances, chamferDistAngles and
 * their history variants, through the raw surface and the TS wrapper.
 *
 * The four vertical edges of a 10 mm cube make every volume analytic: a fillet
 * of radius r removes (1 - pi/4) r^2 per unit length, a d1 x d2 chamfer removes
 * d1 d2 / 2.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Module: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let raw: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let kernel: any;

beforeAll(async () => {
    const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
    const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");
    const createModule = (await import(jsPath)).default;
    Module = await createModule({
        locateFile: (path: string) => (path.endsWith(".wasm") ? wasmPath : path),
    });
    const mod = await import(resolve(__dirname, "../ts/src/index.ts"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kernel = new (mod.OcctKernel as any)(Module);
    raw = kernel.getRawKernel();
}, 30_000);

afterEach(() => kernel.releaseAll());
afterAll(() => kernel[Symbol.dispose]());

const filletLoss = (r: number) => (1 - Math.PI / 4) * r * r * 10;
const HASH_BOUND = 2147483647;

function cube(): number {
    return kernel.makeBox(10, 10, 10);
}

/** The four edges parallel to Z, ordered by (x, y). */
function verticalEdges(box: number): number[] {
    const edges: number[] = kernel.getSubShapes(box, "edge");
    return edges
        .filter((e) => {
            const { first, last } = kernel.curveParameters(e);
            const a = kernel.curvePointAtParam(e, first);
            const b = kernel.curvePointAtParam(e, last);
            return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
        })
        .sort((p, q) => {
            const a = kernel.curvePointAtParam(p, kernel.curveParameters(p).first);
            const b = kernel.curvePointAtParam(q, kernel.curveParameters(q).first);
            return a.x - b.x || a.y - b.y;
        });
}

function vecU32(ids: number[]) {
    const v = new Module.VectorUint32();
    for (const id of ids) v.push_back(id);
    return v;
}

function vecF64(values: number[]) {
    const v = new Module.VectorDouble();
    for (const x of values) v.push_back(x);
    return v;
}

function faceHashes(shape: number): number[] {
    return kernel.getSubShapes(shape, "face").map((f: number) => kernel.hashCode(f, HASH_BOUND));
}

/** The [input face hash, result face count] runs of a flat evolution map. */
function sources(map: readonly number[]): number[][] {
    const runs: number[][] = [];
    for (let i = 0; i < map.length; ) {
        const count = map[i + 1] ?? 0;
        runs.push([map[i] ?? 0, count]);
        i += 2 + count;
    }
    return runs;
}

describe("fillet with per-edge radii", () => {
    it("gives each edge its own radius in one operation", () => {
        const box = cube();
        const edges = verticalEdges(box);
        expect(edges).toHaveLength(4);

        const result = kernel.fillet(box, edges, [1, 1, 3, 3]);
        expect(kernel.getVolume(result)).toBeCloseTo(1000 - 2 * filletLoss(1) - 2 * filletLoss(3), 6);
        // The uniform radius-1 fillet the first value alone would give.
        expect(kernel.getVolume(kernel.fillet(box, edges, 1))).toBeCloseTo(1000 - 4 * filletLoss(1), 6);
    });

    it("tapers each edge from its start radius to its end radius", () => {
        const box = cube();
        const [edge] = verticalEdges(box);
        const tapered = kernel.fillet(box, [edge], { start: 1, end: 3 });
        const single = kernel.filletVariable(box, edge, 1, 3);
        expect(kernel.getVolume(tapered)).toBeCloseTo(kernel.getVolume(single), 9);
        // Between the constant-1 and constant-3 fillets.
        expect(kernel.getVolume(tapered)).toBeLessThan(1000 - filletLoss(1));
        expect(kernel.getVolume(tapered)).toBeGreaterThan(1000 - filletLoss(3));
    });

    it("mixes constant and tapered edges, and applies one taper to every edge", () => {
        const box = cube();
        const edges = verticalEdges(box);
        const mixed = kernel.fillet(box, edges.slice(0, 2), [{ start: 1, end: 3 }, 2]);
        const taper = kernel.getVolume(kernel.filletVariable(box, edges[0], 1, 3));
        expect(kernel.getVolume(mixed)).toBeCloseTo(taper - filletLoss(2), 6);

        const all = kernel.fillet(box, edges, { start: 1, end: 3 });
        expect(kernel.getVolume(all)).toBeCloseTo(1000 - 4 * (1000 - taper), 6);
    });

    it("rejects a non-positive radius and mismatched arrays on the raw surface", () => {
        const box = cube();
        const edges = verticalEdges(box);
        const edgeVec = vecU32(edges);
        const ones = vecF64([1, 1, 1, 1]);
        const short = vecF64([1, 1]);
        const withZero = vecF64([1, 0, 1, 1]);
        try {
            expect(() => raw.filletRadii(box, edgeVec, ones, short)).toThrow(/one entry per edge/);
            expect(() => raw.filletRadii(box, edgeVec, ones, withZero)).toThrow(/positive/);
            expect(raw.filletRadii(box, edgeVec, ones, ones)).toBeGreaterThan(0);
        } finally {
            [edgeVec, ones, short, withZero].forEach((v) => v.delete());
        }
    });

    it("names the edge whose contour fails", () => {
        const box = cube();
        const edges = verticalEdges(box);
        // A 6 mm radius cannot fit on a 10 mm cube edge whose neighbour takes 6 too.
        expect(() => kernel.fillet(box, edges, [6, 6, 6, 6])).toThrow();
    });

    it("tracks face history", () => {
        const box = cube();
        const edges = verticalEdges(box);
        const evo = kernel.filletWithHistory(box, edges, [1, 1, 3, 3], faceHashes(box), HASH_BOUND);
        expect(kernel.getVolume(evo.result)).toBeCloseTo(1000 - 2 * filletLoss(1) - 2 * filletLoss(3), 6);
        expect(evo.modified.length + evo.generated.length).toBeGreaterThan(0);
    });
});

describe("chamfer with per-edge distances", () => {
    it("gives each edge its own symmetric distance", () => {
        const box = cube();
        const result = kernel.chamfer(box, verticalEdges(box), [1, 1, 2, 2]);
        expect(kernel.getVolume(result)).toBeCloseTo(1000 - 2 * 0.5 * 10 - 2 * 2 * 10, 6);
    });

    it("applies an asymmetric chamfer to every edge", () => {
        const box = cube();
        const result = kernel.chamfer(box, verticalEdges(box), { distance1: 1, distance2: 3 });
        expect(kernel.getVolume(result)).toBeCloseTo(1000 - 4 * 1.5 * 10, 6);
    });

    it("measures distance1 on the given reference face, as chamferAsymmetric does", () => {
        const box = cube();
        const [edge] = verticalEdges(box);
        const faces: number[] = kernel.getSubShapes(box, "face");
        // The edge at x = y = 0 lies on the x = 0 and y = 0 faces.
        const adjacent = faces.filter((f) => {
            const c = kernel.getSurfaceCenterOfMass(f);
            return (Math.abs(c.x) < 1e-9 || Math.abs(c.y) < 1e-9) && Math.abs(c.z - 5) < 1e-9;
        });
        expect(adjacent).toHaveLength(2);
        const [faceA, faceB] = adjacent;

        const viaA = kernel.chamfer(box, [edge], [{ distance1: 1, distance2: 3, referenceFace: faceA }]);
        const viaB = kernel.chamfer(box, [edge], [{ distance1: 1, distance2: 3, referenceFace: faceB }]);
        const single = kernel.chamferAsymmetric(box, edge, 1, 3, faceA);
        const probes = [
            { x: 0.2, y: 2.0, z: 5 },
            { x: 2.0, y: 0.2, z: 5 },
        ];
        const inside = (s: number) => probes.map((p) => kernel.containsPoint(s, p, 1e-7));
        expect(inside(viaA)).toEqual(inside(single));
        // Swapping the reference face moves the long setback to the other side.
        expect(inside(viaB)).toEqual([...inside(viaA)].reverse());
        expect(kernel.getVolume(viaA)).toBeCloseTo(1000 - 15, 6);
    });

    it("rejects a reference face that is not adjacent to its edge", () => {
        const box = cube();
        const [edge] = verticalEdges(box);
        const top = kernel.getSubShapes(box, "face").find((f: number) => kernel.getSurfaceCenterOfMass(f).z > 9.9);
        expect(() =>
            kernel.chamfer(box, [edge], [{ distance1: 1, distance2: 2, referenceFace: top }]),
        ).toThrow(/not adjacent/);
    });

    it("chamfers by per-edge distance and angle", () => {
        const box = cube();
        const result = kernel.chamferDistAngle(box, verticalEdges(box), 1, [30, 30, 60, 60]);
        const loss = (deg: number) => 0.5 * Math.tan((deg * Math.PI) / 180) * 10;
        expect(kernel.getVolume(result)).toBeCloseTo(1000 - 2 * loss(30) - 2 * loss(60), 6);
        // The uniform form still goes through chamferDistAngle.
        expect(kernel.getVolume(kernel.chamferDistAngle(box, verticalEdges(box), 1, 45))).toBeCloseTo(
            1000 - 4 * loss(45),
            6,
        );
    });

    it("rejects an angle outside (0, 90) degrees", () => {
        const box = cube();
        expect(() => kernel.chamferDistAngle(box, verticalEdges(box), 1, [30, 30, 90, 30])).toThrow(/angle/);
    });

    it("tracks face history", () => {
        const box = cube();
        const edges = verticalEdges(box);
        const evo = kernel.chamferWithHistory(box, edges, [1, 1, 2, 2], faceHashes(box), HASH_BOUND);
        expect(kernel.getVolume(evo.result)).toBeCloseTo(950, 6);
        expect(evo.modified.length + evo.generated.length).toBeGreaterThan(0);
    });

    it("tracks face history through distance-angle chamfers", () => {
        const box = cube();
        const edges = verticalEdges(box);
        const evo = kernel.chamferDistAngleWithHistory(box, edges, 1, [30, 30, 60, 60], faceHashes(box), HASH_BOUND);
        const loss = (deg: number) => 0.5 * Math.tan((deg * Math.PI) / 180) * 10;
        expect(kernel.getVolume(evo.result)).toBeCloseTo(1000 - 2 * loss(30) - 2 * loss(60), 6);
        expect(evo.modified.length).toBeGreaterThan(0);

        // 45 degrees at 1 mm is the symmetric 1 mm chamfer: the same faces evolve
        // into as many faces as through chamferDistancesWithHistory.
        const angled = kernel.chamferDistAngleWithHistory(box, edges, 1, 45, faceHashes(box), HASH_BOUND);
        const symmetric = kernel.chamferWithHistory(box, edges, [1, 1, 1, 1], faceHashes(box), HASH_BOUND);
        expect(sources(angled.modified)).toEqual(sources(symmetric.modified));
        expect(sources(angled.generated)).toEqual(sources(symmetric.generated));
        expect(angled.deleted).toEqual(symmetric.deleted);
    });

    it("measures distance-angle chamfers with history from the given reference face", () => {
        const box = cube();
        const [edge] = verticalEdges(box);
        const [faceA, faceB] = facesOf(box, edge);
        // 1 mm on the reference face and tan 30 on the other: a point 0.8 mm along
        // the reference face is cut away, one 0.8 mm along the other is kept.
        const probes = [
            { x: 0.05, y: 0.8, z: 5 },
            { x: 0.8, y: 0.05, z: 5 },
        ];
        const inside = (s: number) => probes.map((p) => kernel.containsPoint(s, p, 1e-7));
        const viaA = kernel.chamferDistAngleWithHistory(box, [edge], 1, 30, faceHashes(box), HASH_BOUND, [faceA]);
        const viaB = kernel.chamferDistAngleWithHistory(box, [edge], 1, 30, faceHashes(box), HASH_BOUND, [faceB]);
        expect(inside(viaA.result)).toEqual(inside(kernel.chamferDistAngle(box, [edge], 1, 30, [faceA])));
        expect(inside(viaA.result)[0]).not.toBe(inside(viaA.result)[1]);
        expect(inside(viaB.result)).toEqual([...inside(viaA.result)].reverse());
    });
});

/**
 * A 5 mm plate whose top edge runs line1 -> arc -> line2, each tangent to the
 * next, so OCCT fillets the three as one contour. line1 is built from (10, 0)
 * to (0, 0), against the chain, so its own direction is reversed in the
 * contour whichever edge seeds it. The profile is extruded along (0, dy, 5):
 * a nonzero dy leans line1's wall away from square to the top, while line2's
 * wall, parallel to the lean, stays square.
 */
function tangentChainPlate(dy = 0) {
    const z0 = (x: number, y: number) => ({ x, y, z: 0 });
    const profile = kernel.makeFace(
        kernel.makeWire([
            kernel.makeLineEdge(z0(10, 0), z0(0, 0)),
            kernel.makeArcEdge(z0(10, 0), z0(10 + 5 * Math.SQRT1_2, 5 - 5 * Math.SQRT1_2), z0(15, 5)),
            kernel.makeLineEdge(z0(15, 5), z0(15, 10)),
            kernel.makeLineEdge(z0(15, 10), z0(0, 10)),
            kernel.makeLineEdge(z0(0, 10), z0(0, 0)),
        ]),
    );
    const solid = kernel.extrude(profile, 0, dy, 5);
    const top = (kernel.getSubShapes(solid, "edge") as number[]).filter((e) => {
        const bb = kernel.getBoundingBox(e);
        return Math.abs(bb.zmin - 5) < 1e-9 && Math.abs(bb.zmax - 5) < 1e-9;
    });
    const find = (pred: (bb: Record<string, number>) => boolean) => {
        const edge = top.find((e) => pred(kernel.getBoundingBox(e)));
        expect(edge).toBeDefined();
        return edge as number;
    };
    return {
        solid,
        line1: find((bb) => Math.abs(bb.ymax - dy) < 1e-9),
        arc: find((bb) => bb.xmin > 9.9 && bb.xmax > 14.9 && bb.ymax > 4.9 + dy && bb.ymin < 0.1 + dy),
        line2: find((bb) => Math.abs(bb.xmin - 15) < 1e-9),
    };
}

/**
 * Fillet radius where a straight top edge passes `at`, read off the 45-degree
 * gap the fillet cuts: (at + t inward, z = 5 - t) is outside the solid while
 * t < r (1 - 1/sqrt 2).
 */
function radiusAt(shape: number, at: { x: number; y: number }, inward: { x: number; y: number }): number {
    let lo = 0;
    let hi = 3;
    for (let i = 0; i < 40; i++) {
        const t = (lo + hi) / 2;
        const p = { x: at.x + inward.x * t, y: at.y + inward.y * t, z: 5 - t };
        if (kernel.containsPoint(shape, p, 1e-9)) hi = t;
        else lo = t;
    }
    return lo / (1 - Math.SQRT1_2);
}

describe("tangent-continuous edges", () => {
    const LINE1_NEAR_ORIGIN = [{ x: 1, y: 0 }, { x: 0, y: 1 }] as const;
    const LINE1_NEAR_ARC = [{ x: 9, y: 0 }, { x: 0, y: 1 }] as const;
    const LINE2_NEAR_ARC = [{ x: 15, y: 6 }, { x: -1, y: 0 }] as const;
    const LINE2_FAR_END = [{ x: 15, y: 9 }, { x: -1, y: 0 }] as const;

    it("rejects radii that jump where two tangent edges meet", () => {
        const { solid, line1, arc } = tangentChainPlate();
        expect(() => kernel.fillet(solid, [line1, arc], [1, 2])).toThrow(/tangent-continuous/);
        expect(() =>
            kernel.filletWithHistory(solid, [line1, arc], [1, 2], faceHashes(solid), HASH_BOUND),
        ).toThrow(/tangent-continuous/);
    });

    it("tapers each edge from its own first vertex, in any order", () => {
        const { solid, line1, arc, line2 } = tangentChainPlate();
        // line1 runs from (10, 0), where it meets the arc at radius 2.
        const radii = [{ start: 2, end: 1 }, 2, { start: 2, end: 3 }];
        for (const order of [[0, 1, 2], [2, 1, 0]]) {
            const edges = order.map((i) => [line1, arc, line2][i]);
            const result = kernel.fillet(solid, edges, order.map((i) => radii[i]));
            expect(radiusAt(result, ...LINE1_NEAR_ORIGIN)).toBeLessThan(1.3);
            expect(radiusAt(result, ...LINE1_NEAR_ARC)).toBeGreaterThan(1.7);
            expect(radiusAt(result, ...LINE2_NEAR_ARC)).toBeLessThan(2.3);
            expect(radiusAt(result, ...LINE2_FAR_END)).toBeGreaterThan(2.5);
        }
    });

    it("blends between radii given on edges that do not meet", () => {
        const { solid, line1, line2 } = tangentChainPlate();
        const result = kernel.fillet(solid, [line1, line2], [1, 2]);
        expect(radiusAt(result, ...LINE1_NEAR_ORIGIN)).toBeCloseTo(1, 2);
        expect(radiusAt(result, ...LINE1_NEAR_ARC)).toBeCloseTo(1, 2);
        expect(radiusAt(result, ...LINE2_NEAR_ARC)).toBeCloseTo(2, 2);
        expect(radiusAt(result, ...LINE2_FAR_END)).toBeCloseTo(2, 2);
    });

    it("chamfers a tangent chain with one setback and rejects differing ones", () => {
        const { solid, line1, arc } = tangentChainPlate();
        expect(() => kernel.chamfer(solid, [line1, arc], [1, 2])).toThrow(/tangent-continuous/);
        expect(() => kernel.chamferDistAngle(solid, [line1, arc], 1, [30, 45])).toThrow(/tangent-continuous/);
        const same = kernel.chamfer(solid, [line1, arc], [1, 1]);
        expect(kernel.getVolume(same)).toBeCloseTo(kernel.getVolume(kernel.chamfer(solid, [line1], 1)), 6);
    });
});

describe("asymmetric chamfers on a tangent chain", () => {
    /** The plate's top face and the cylindrical wall under the arc. */
    function chainFaces(solid: number) {
        const faces: number[] = kernel.getSubShapes(solid, "face");
        const top = faces.find(
            (f) => kernel.surfaceType(f) === "plane" && Math.abs(kernel.getSurfaceCenterOfMass(f).z - 5) < 1e-9,
        );
        const wall = faces.find((f) => kernel.surfaceType(f) === "cylinder");
        expect(top).toBeDefined();
        expect(wall).toBeDefined();
        return { top: top as number, wall: wall as number };
    }

    it("accepts the same chamfer measured from either face", () => {
        const { solid, line1, arc } = tangentChainPlate();
        const { top, wall } = chainFaces(solid);
        // 1 mm on the top and 3 mm down the side, stated once from each face.
        const result = kernel.chamfer(solid, [line1, arc], [
            { distance1: 1, distance2: 3, referenceFace: top },
            { distance1: 3, distance2: 1, referenceFace: wall },
        ]);
        const single = kernel.chamfer(solid, [line1], [{ distance1: 1, distance2: 3, referenceFace: top }]);
        expect(kernel.getVolume(result)).toBeCloseTo(kernel.getVolume(single), 6);
    });

    it("rejects setbacks that differ once matched face to face", () => {
        const { solid, line1, arc } = tangentChainPlate();
        const { top, wall } = chainFaces(solid);
        expect(() =>
            kernel.chamfer(solid, [line1, arc], [
                { distance1: 1, distance2: 3, referenceFace: top },
                { distance1: 1, distance2: 3, referenceFace: wall },
            ]),
        ).toThrow(/tangent-continuous/);
    });

    it("lets edges without a reference face follow the chain's first edge", () => {
        const { solid, line1, arc } = tangentChainPlate();
        const result = kernel.chamfer(solid, [line1, arc], { distance1: 1, distance2: 3 });
        const single = kernel.chamfer(solid, [line1], { distance1: 1, distance2: 3 });
        expect(kernel.getVolume(result)).toBeCloseTo(kernel.getVolume(single), 6);
    });

    it("matches distance-angle chamfers measured from the same side as given", () => {
        const { solid, line1, arc } = tangentChainPlate();
        const { top } = chainFaces(solid);
        const sameSide = kernel.chamferDistAngle(solid, [line1, arc], 1, 30, [top, top]);
        const single = kernel.chamferDistAngle(solid, [line1], 1, 30, [top]);
        expect(kernel.getVolume(sameSide)).toBeCloseTo(kernel.getVolume(single), 6);
        expect(() => kernel.chamferDistAngle(solid, [line1, arc], 1, [30, 45], [top, top])).toThrow(
            /same setback on each side/,
        );
    });
});

/** The faces of `solid` on either side of `edge`. */
function facesOf(solid: number, edge: number): number[] {
    const faces = (kernel.getSubShapes(solid, "face") as number[]).filter((f) =>
        (kernel.getSubShapes(f, "edge") as number[]).some((e) => kernel.isSame(e, edge)),
    );
    expect(faces).toHaveLength(2);
    return faces;
}

/** The top edges at z = 5 that `pred` picks, ordered by their x extent. */
function topEdges(solid: number, pred: (bb: Record<string, number>) => boolean): number[] {
    return (kernel.getSubShapes(solid, "edge") as number[])
        .filter((e) => {
            const bb = kernel.getBoundingBox(e);
            return Math.abs(bb.zmin - 5) < 1e-9 && Math.abs(bb.zmax - 5) < 1e-9 && pred(bb);
        })
        .sort((p, q) => kernel.getBoundingBox(p).xmin - kernel.getBoundingBox(q).xmin);
}

/** An edge's top face (the plane at z = 5) and the wall below it. */
function topAndWall(solid: number, edge: number) {
    const [a, b] = facesOf(solid, edge);
    const isTop = (f: number) =>
        kernel.surfaceType(f) === "plane" && Math.abs(kernel.getSurfaceCenterOfMass(f).z - 5) < 1e-9;
    expect(isTop(a) !== isTop(b)).toBe(true);
    return isTop(a) ? { top: a, wall: b } : { top: b, wall: a };
}

/**
 * A distance-angle chamfer restated from the other face of an edge whose faces
 * meet at `dihedralDeg`: the chamfer cuts a triangle with that angle at the
 * edge and `angleDeg` at `distance`, so the law of sines gives the setback
 * across.
 */
function fromOtherFace(distance: number, angleDeg: number, dihedralDeg: number) {
    const rad = Math.PI / 180;
    return {
        distance: (distance * Math.sin(angleDeg * rad)) / Math.sin((dihedralDeg + angleDeg) * rad),
        angleDeg: 180 - dihedralDeg - angleDeg,
    };
}

/** Where a wall leaning along (0, -2, 5) meets a horizontal top, in degrees. */
const LEANING_DIHEDRAL = (Math.acos(2 / Math.sqrt(29)) * 180) / Math.PI;

describe("distance-angle chamfers measured from opposite faces", () => {
    it("accepts 45 degrees and 1 mm from either face of a square chain", () => {
        const { solid, line1, arc } = tangentChainPlate();
        const { top } = topAndWall(solid, line1);
        const { wall } = topAndWall(solid, arc);
        const oneSide = kernel.getVolume(kernel.chamferDistAngle(solid, [line1, arc], 1, 45, [top, top]));
        const across = kernel.chamferDistAngle(solid, [line1, arc], 1, 45, [top, wall]);
        expect(kernel.getVolume(across)).toBeCloseTo(oneSide, 6);
        const wallFirst = kernel.chamferDistAngle(solid, [arc, line1], 1, 45, [wall, top]);
        expect(kernel.getVolume(wallFirst)).toBeCloseTo(oneSide, 6);
    });

    it("accepts an asymmetric chamfer restated from the other face", () => {
        const { solid, line1, arc } = tangentChainPlate();
        const { top } = topAndWall(solid, line1);
        const { wall } = topAndWall(solid, arc);
        // 1 mm at 30 degrees from the top sets back tan 30 on the wall, at 60 degrees from it.
        const other = fromOtherFace(1, 30, 90);
        expect(other.distance).toBeCloseTo(Math.tan(Math.PI / 6), 12);
        const across = kernel.chamferDistAngle(
            solid,
            [line1, arc],
            [1, other.distance],
            [30, other.angleDeg],
            [top, wall],
        );
        const oneSide = kernel.chamferDistAngle(solid, [line1], 1, 30, [top]);
        expect(kernel.getVolume(across)).toBeCloseTo(kernel.getVolume(oneSide), 6);
    });

    it("rejects a pair that is a different chamfer once restated", () => {
        const { solid, line1, arc } = tangentChainPlate();
        const { top } = topAndWall(solid, line1);
        const { wall } = topAndWall(solid, arc);
        expect(() => kernel.chamferDistAngle(solid, [line1, arc], 1, 30, [top, wall])).toThrow(
            /differ where the faces meet at 90 degrees/,
        );
    });

    it("restates through a dihedral angle other than 90 degrees", () => {
        // A 10 mm square leaning along (0, -2, 5), its front split at x = 5 into
        // two collinear edges of one chain.
        const z0 = (x: number, y: number) => ({ x, y, z: 0 });
        const corners = [z0(0, 0), z0(5, 0), z0(10, 0), z0(10, 10), z0(0, 10)];
        const profile = kernel.makeFace(
            kernel.makeWire(corners.map((p, i) => kernel.makeLineEdge(p, corners[(i + 1) % corners.length]))),
        );
        const solid = kernel.extrude(profile, 0, -2, 5);
        const front = topEdges(solid, (bb) => Math.abs(bb.ymax + 2) < 1e-9);
        expect(front).toHaveLength(2);
        const [left, right] = front;
        const { top } = topAndWall(solid, left);
        const { wall } = topAndWall(solid, right);

        const other = fromOtherFace(1, 40, LEANING_DIHEDRAL);
        const across = kernel.chamferDistAngle(solid, front, [1, other.distance], [40, other.angleDeg], [top, wall]);
        const oneSide = kernel.chamferDistAngle(solid, [left], 1, 40, [top]);
        expect(kernel.getVolume(across)).toBeCloseTo(kernel.getVolume(oneSide), 6);

        // Restated as if the faces met square, it is a different chamfer.
        const square = fromOtherFace(1, 40, 90);
        expect(() =>
            kernel.chamferDistAngle(solid, front, [1, square.distance], [40, square.angleDeg], [top, wall]),
        ).toThrow(/differ where the faces meet at 68\.19/);
    });

    it("rejects a pair that matches where the dihedral angle is one value but not another", () => {
        const { solid, line1, line2 } = tangentChainPlate(-2);
        const { top } = topAndWall(solid, line1);
        const { wall } = topAndWall(solid, line2);
        const atLine1 = fromOtherFace(1, 40, LEANING_DIHEDRAL);
        expect(() =>
            kernel.chamferDistAngle(solid, [line1, line2], [1, atLine1.distance], [40, atLine1.angleDeg], [top, wall]),
        ).toThrow(/differ where the faces meet at 90 degrees/);
        const atLine2 = fromOtherFace(1, 40, 90);
        expect(() =>
            kernel.chamferDistAngle(solid, [line1, line2], [1, atLine2.distance], [40, atLine2.angleDeg], [top, wall]),
        ).toThrow(/differ where the faces meet at 68\.19/);
        // Measured from the top on both, they are one chamfer.
        const sameSide = kernel.chamferDistAngle(solid, [line1, line2], 1, 40, [top, top]);
        const oneSide = kernel.chamferDistAngle(solid, [line1], 1, 40, [top]);
        expect(kernel.getVolume(sameSide)).toBeCloseTo(kernel.getVolume(oneSide), 6);
    });

    it("checks them the same way with face history", () => {
        const { solid, line1, arc } = tangentChainPlate();
        const { top } = topAndWall(solid, line1);
        const { wall } = topAndWall(solid, arc);
        const hashes = faceHashes(solid);
        const across = kernel.chamferDistAngleWithHistory(solid, [line1, arc], 1, 45, hashes, HASH_BOUND, [top, wall]);
        const oneSide = kernel.chamferDistAngle(solid, [line1], 1, 45, [top]);
        expect(kernel.getVolume(across.result)).toBeCloseTo(kernel.getVolume(oneSide), 6);
        expect(() =>
            kernel.chamferDistAngleWithHistory(solid, [line1, arc], 1, 30, hashes, HASH_BOUND, [top, wall]),
        ).toThrow(/chamferDistAnglesWithHistory: edges .* differ where the faces meet at 90 degrees/);
    });

    it("matches a long chain with every later chamfer measured from the other face", () => {
        // A plate whose front top edge is 64 collinear 1 mm edges, one contour.
        const count = 64;
        const z0 = (x: number, y: number) => ({ x, y, z: 0 });
        const corners = [...Array.from({ length: count + 1 }, (_, i) => z0(i, 0)), z0(count, 10), z0(0, 10)];
        const profile = kernel.makeFace(
            kernel.makeWire(corners.map((p, i) => kernel.makeLineEdge(p, corners[(i + 1) % corners.length]))),
        );
        const solid = kernel.extrude(profile, 0, 0, 5);
        const front = topEdges(solid, (bb) => Math.abs(bb.ymax) < 1e-9);
        expect(front).toHaveLength(count);
        const faces = front.map((e, i) => (i === 0 ? topAndWall(solid, e).top : topAndWall(solid, e).wall));

        const across = kernel.chamferDistAngle(solid, front, 1, 45, faces);
        const oneSide = kernel.chamferDistAngle(solid, [front[0]], 1, 45, [faces[0]]);
        expect(kernel.getVolume(across)).toBeCloseTo(kernel.getVolume(oneSide), 6);

        const lastDiffers = front.map((_, i) => (i === count - 1 ? 30 : 45));
        expect(() => kernel.chamferDistAngle(solid, front, 1, lastDiffers, faces)).toThrow(
            new RegExp(`edges ${front[0]} and ${front[count - 1]} are tangent-continuous.*differ`),
        );
    });

    it("rejects them where a face curves away from the edge", () => {
        // A loaf with a cylindrical roof along x, fused from two halves so its
        // eave at y = 0 is two collinear edges.
        const half = (x: number) => {
            const p = (y: number, z: number) => ({ x, y, z });
            const profile = kernel.makeFace(
                kernel.makeWire([
                    kernel.makeLineEdge(p(0, 0), p(10, 0)),
                    kernel.makeLineEdge(p(10, 0), p(10, 5)),
                    kernel.makeArcEdge(p(10, 5), p(5, 7), p(0, 5)),
                    kernel.makeLineEdge(p(0, 5), p(0, 0)),
                ]),
            );
            return kernel.extrude(profile, 5, 0, 0);
        };
        const solid = kernel.fuse(half(0), half(5));
        const eaves = topEdges(solid, (bb) => Math.abs(bb.ymax) < 1e-9);
        expect(eaves).toHaveLength(2);
        const wallOf = (edge: number) => facesOf(solid, edge).find((f) => kernel.surfaceType(f) === "plane") as number;
        const roofOf = (edge: number) => facesOf(solid, edge).find((f) => kernel.surfaceType(f) === "cylinder") as number;
        const [first, second] = eaves;

        const sameSide = kernel.chamferDistAngle(solid, eaves, 1, 30, [wallOf(first), wallOf(second)]);
        const oneSide = kernel.chamferDistAngle(solid, [first], 1, 30, [wallOf(first)]);
        expect(kernel.getVolume(sameSide)).toBeCloseTo(kernel.getVolume(oneSide), 6);
        expect(() => kernel.chamferDistAngle(solid, eaves, 1, 30, [wallOf(first), roofOf(second)])).toThrow(
            /curves away from the edge/,
        );
    });
});
