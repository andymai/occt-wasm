/**
 * Exercises the TypeScript OcctKernel wrapper's bulk marshalling paths
 * (ts/src/index.ts) against a real WASM module.
 *
 * Unlike ts-wrapper.test.ts (which validates raw return shapes), this
 * instantiates the wrapper class directly so the private bulk read helpers
 * (#readVector / #drainVector / #vecToHandles) — and the dataPtr() Embind
 * binding they rely on — run
 * for real. The 64-element threshold means each return-path method is tested
 * both below it (per-element get() loop) and above it (single heap copy via
 * dataPtr), and the two branches must agree.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { OcctKernel as WrapperOcctKernel } from "../ts/src/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let kernel: any;

beforeAll(async () => {
    const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
    const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");
    const createModule = (await import(jsPath)).default;
    const Module = await createModule({
        locateFile: (path: string) => (path.endsWith(".wasm") ? wasmPath : path),
    });
    // The constructor is TS-private (erased at runtime); construct directly with
    // the pre-loaded module instead of init() (which imports occt-wasm.js by path).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kernel = new (WrapperOcctKernel as any)(Module);
}, 30_000);

afterEach(() => {
    kernel.releaseAll();
});

afterAll(() => {
    kernel[Symbol.dispose]();
});

// A compound of `n` unit boxes laid out along x — a deterministic way to push
// subshape/query counts above the bulk threshold.
function boxCompound(n: number) {
    const boxes = Array.from({ length: n }, (_, i) => kernel.translate(kernel.makeBox(1, 1, 1), i * 2, 0, 0));
    return kernel.makeCompound(boxes);
}

describe("wrapper bulk return path: queryBatch (Float64 read)", () => {
    it("below threshold: small batch returns correct values (get() path)", () => {
        const boxes = Array.from({ length: 3 }, () => kernel.makeBox(10, 20, 30));
        const results = kernel.queryBatch(boxes);
        expect(results).toHaveLength(3);
        for (const r of results) {
            expect(r.volume).toBeCloseTo(6000, 0);
            expect(r.area).toBeCloseTo(2200, 0);
            expect(r.isValid).toBe(true);
        }
    });

    it("above threshold: large batch of identical boxes reads back identically (dataPtr path)", () => {
        // 70 shapes * 14-wide stride = 980 floats, well above the 64 threshold.
        const boxes = Array.from({ length: 70 }, () => kernel.makeBox(10, 20, 30));
        const results = kernel.queryBatch(boxes);
        expect(results).toHaveLength(70);
        // Identical inputs => every bulk-read entry must be identical. A mis-indexed
        // heap copy would scramble these.
        for (const r of results) {
            expect(r.volume).toBeCloseTo(6000, 0);
            expect(r.area).toBeCloseTo(2200, 0);
            expect(r.isValid).toBe(true);
            expect(r.shapeType).toBe("solid");
        }
    });
});

describe("wrapper bulk return path: getSubShapes (Uint32 handle read)", () => {
    it("below threshold: few subshapes (get() path)", () => {
        const solids = kernel.getSubShapes(boxCompound(3), "solid");
        expect(solids).toHaveLength(3);
        for (const s of solids) {
            const bbox = kernel.getBoundingBox(s, false);
            expect(Number.isFinite(bbox.xmin)).toBe(true);
        }
    });

    it("above threshold: many subshape handles read back valid (dataPtr path)", () => {
        const compound = boxCompound(70);
        const solids = kernel.getSubShapes(compound, "solid");
        expect(solids).toHaveLength(70);
        // 70 boxes * 12 edges each = 840 edge handles, far above the threshold.
        const edges = kernel.getSubShapes(compound, "edge");
        expect(edges.length).toBeGreaterThan(64);
        // Every returned handle must be a live, distinct shape.
        expect(new Set(edges).size).toBe(edges.length);
        for (const e of edges.slice(0, 5)) {
            const bbox = kernel.getBoundingBox(e, false);
            expect(Number.isFinite(bbox.xmin)).toBe(true);
        }
    });
});

describe("wrapper bulk return path: edgeToFaceMap (Int32 read)", () => {
    it("above threshold: flat int adjacency array reads back via dataPtr", () => {
        // A box's edge→face map is a flat pairs array of 96 ints — above the
        // 64 threshold, so this exercises the Int32 dataPtr path.
        const box = kernel.makeBox(10, 10, 10);
        const map = kernel.edgeToFaceMap(box, 1000);
        expect(map.length).toBeGreaterThan(64);
        for (const v of map) {
            expect(Number.isInteger(v)).toBe(true);
        }
        // Same input must read back identically on a repeat call.
        expect(kernel.edgeToFaceMap(box, 1000)).toEqual(map);
    });
});

describe("wrapper bulk input path: liftCurve2dToPlane (Float64 write)", () => {
    const ORIGIN = { x: 0, y: 0, z: 0 };
    const Z = { x: 0, y: 0, z: 1 };
    const X = { x: 1, y: 0, z: 0 };

    it("below threshold: few 2D points (push_back path)", () => {
        const pts = Array.from({ length: 5 }, (_, i) => ({ x: i, y: 0 }));
        const edge = kernel.liftCurve2dToPlane(pts, ORIGIN, Z, X);
        const bbox = kernel.getBoundingBox(edge, false);
        expect(bbox.xmax).toBeCloseTo(4, 6);
    });

    it("above threshold: many 2D points marshal via heap copy (#bulkF64 path)", () => {
        // 40 points * 2 = 80 doubles, above the 64 threshold → bulk inbound copy.
        const pts = Array.from({ length: 40 }, (_, i) => ({ x: i, y: Math.sin(i) }));
        const edge = kernel.liftCurve2dToPlane(pts, ORIGIN, Z, X);
        // (u,v) lifts to (u, v, 0) on the XY plane: x spans 0..39, z is flat.
        const bbox = kernel.getBoundingBox(edge, false);
        expect(bbox.xmin).toBeCloseTo(0, 6);
        expect(bbox.xmax).toBeCloseTo(39, 6);
        expect(bbox.zmin).toBeCloseTo(0, 6);
        expect(bbox.zmax).toBeCloseTo(0, 6);
    });
});

describe("wrapper bulk return path: getNurbsCurveData poles (Float64 read)", () => {
    it("above threshold: many poles read back finite, endpoints match input (dataPtr path)", () => {
        const pts = Array.from({ length: 30 }, (_, i) => ({ x: i, y: Math.sin(i), z: 0 }));
        const edge = kernel.interpolatePoints(pts, false);
        const data = kernel.getNurbsCurveData(edge);
        // 30 poles * 3 = 90 floats, above the threshold.
        expect(data.poles.length).toBeGreaterThan(64);
        expect(data.poles.length % 3).toBe(0);
        for (const v of data.poles) {
            expect(Number.isFinite(v)).toBe(true);
        }
        // An interpolating curve passes through its first/last sample point.
        expect(data.poles[0]).toBeCloseTo(pts[0]!.x, 6);
        expect(data.poles[1]).toBeCloseTo(pts[0]!.y, 6);
        const n = data.poles.length;
        expect(data.poles[n - 3]).toBeCloseTo(pts[pts.length - 1]!.x, 6);
        expect(data.poles[n - 2]).toBeCloseTo(pts[pts.length - 1]!.y, 6);
    });
});

describe("getBoundingBox options", () => {
    it("default, { precise: true }, and the boolean overload agree on a box", () => {
        const box = kernel.makeBox(10, 20, 30);
        const byDefault = kernel.getBoundingBox(box);
        const precise = kernel.getBoundingBox(box, { precise: true });
        const legacy = kernel.getBoundingBox(box, false);
        expect(precise).toEqual(byDefault);
        expect(legacy).toEqual(byDefault);
        expect(byDefault.xmax).toBeCloseTo(10, 3);
        expect(byDefault.zmax).toBeCloseTo(30, 3);
    });

    it("{ precise: false } contains the precise box on BSpline geometry", () => {
        const box = kernel.makeBox(20, 20, 20);
        const filleted = kernel.fillet(box, kernel.getSubShapes(box, "edge"), 2);
        const precise = kernel.getBoundingBox(filleted);
        const loose = kernel.getBoundingBox(filleted, { precise: false });
        for (const k of ["xmin", "ymin", "zmin"] as const) expect(loose[k]).toBeLessThanOrEqual(precise[k]);
        for (const k of ["xmax", "ymax", "zmax"] as const) expect(loose[k]).toBeGreaterThanOrEqual(precise[k]);
        expect(precise.xmax).toBeCloseTo(20, 3);
        expect(loose.xmax).toBeLessThan(21);
    });

    it("{ useTriangulation: true } bounds the mesh in either mode", () => {
        const cyl = kernel.makeCylinder(5, 10);
        kernel.tessellate(cyl, { linearDeflection: 0.01, angularDeflection: 0.1 });
        const precise = kernel.getBoundingBox(cyl, { useTriangulation: true });
        const loose = kernel.getBoundingBox(cyl, { precise: false, useTriangulation: true });
        expect(precise.xmax).toBeCloseTo(5, 1);
        expect(loose.xmax).toBeCloseTo(5, 1);
        expect(loose.xmax).toBeGreaterThanOrEqual(precise.xmax);
    });
});

describe("wireframe source", () => {
    // Keys every XYZ triple of a Float32Array by its exact bit pattern, so
    // membership means "the same vertex", not "close to one".
    const vertexSet = (positions: Float32Array): Set<string> => {
        const set = new Set<string>();
        for (let i = 0; i < positions.length; i += 3) {
            set.add(`${positions[i]},${positions[i + 1]},${positions[i + 2]}`);
        }
        return set;
    };
    const countShared = (points: Float32Array, vertices: Set<string>): number => {
        let shared = 0;
        for (let i = 0; i < points.length; i += 3) {
            if (vertices.has(`${points[i]},${points[i + 1]},${points[i + 2]}`)) shared++;
        }
        return shared;
    };

    it("triangulation mode shares every point with the mesh, curve mode does not", () => {
        const cyl = kernel.makeCylinder(5, 10);
        const mesh = kernel.meshShape(cyl, { linearDeflection: 0.5, angularDeflection: 0.5 });
        const vertices = vertexSet(mesh.positions);

        const aligned = kernel.wireframe(cyl, { source: "triangulation" });
        expect(aligned.edgeCount).toBe(3);
        expect(countShared(aligned.points, vertices)).toBe(aligned.points.length / 3);

        // The rim circles sampled at the same chord error land between mesh
        // vertices, which is exactly the separation the aligned mode removes.
        const sampled = kernel.wireframe(cyl, 0.5);
        expect(countShared(sampled.points, vertices)).toBeLessThan(sampled.points.length / 3);
    });

    it("triangulation mode falls back to curve sampling on an unmeshed shape", () => {
        const cyl = kernel.makeCylinder(5, 10);
        const sampled = kernel.wireframe(cyl, 0.05);
        const aligned = kernel.wireframe(cyl, { source: "triangulation", deflection: 0.05 });
        expect(Array.from(aligned.edgeGroups)).toEqual(Array.from(sampled.edgeGroups));
        expect(Array.from(aligned.points)).toEqual(Array.from(sampled.points));
    });

    it("falls back per edge when only part of a compound was meshed", () => {
        const cyl = kernel.makeCylinder(5, 10);
        const box = kernel.translate(kernel.makeBox(4, 4, 4), 20, 0, 0);
        const mesh = kernel.meshShape(cyl, { linearDeflection: 0.5, angularDeflection: 0.5 });
        const vertices = vertexSet(mesh.positions);
        const compound = kernel.makeCompound([cyl, box]);

        const aligned = kernel.wireframe(compound, { source: "triangulation", deflection: 0.5 });
        const cylAlone = kernel.wireframe(cyl, { source: "triangulation" });
        const boxAlone = kernel.wireframe(box, 0.5);
        expect(aligned.edgeCount).toBe(cylAlone.edgeCount + boxAlone.edgeCount);
        expect(aligned.points.length).toBe(cylAlone.points.length + boxAlone.points.length);
        // The cylinder's rims come from its mesh; the box edges are straight, so
        // both sources put their two endpoints on the same corners.
        const boxVertices = vertexSet(boxAlone.points);
        for (let i = 0; i < aligned.points.length; i += 3) {
            const key = `${aligned.points[i]},${aligned.points[i + 1]},${aligned.points[i + 2]}`;
            expect(vertices.has(key) || boxVertices.has(key)).toBe(true);
        }
    });

    it("skips degenerate edges in both modes", () => {
        // A sphere carries one seam edge plus two zero-length pole edges.
        const sphere = kernel.makeSphere(5);
        const sampled = kernel.wireframe(sphere, 0.1);
        expect(sampled.edgeCount).toBe(1);
        kernel.meshShape(sphere, { linearDeflection: 0.1, angularDeflection: 0.5 });
        const aligned = kernel.wireframe(sphere, { source: "triangulation" });
        expect(aligned.edgeCount).toBe(1);
        for (const data of [sampled, aligned]) {
            for (let g = 0; g < data.edgeGroups.length; g += 3) {
                expect(data.edgeGroups[g + 1]).toBeGreaterThanOrEqual(6);
            }
        }
    });
});
