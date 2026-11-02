/**
 * fillSurface (N-sided filling through boundary edges, support faces, guide
 * edges and points) and edgeOnSurface (a fitted curve laid exactly onto a
 * face's surface), through the TS wrapper and the raw surface.
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

type P = { x: number; y: number; z: number };
const p = (x: number, y: number, z: number): P => ({ x, y, z });

/** Line edges around a closed polygon. */
function loop(corners: P[]): number[] {
    return corners.map((a, i) => kernel.makeLineEdge(a, corners[(i + 1) % corners.length]));
}

/** Distance from a point to a shape. */
function distanceTo(shape: number, q: P): number {
    return kernel.distanceBetween(shape, kernel.makeVertex(q.x, q.y, q.z));
}

/** The face's unit normal at the surface point nearest `q`. */
function normalNear(face: number, q: P): P {
    const { u, v } = kernel.uvFromPoint(face, q);
    return kernel.surfaceNormal(face, u, v);
}

const SQUARE = [p(0, 0, 0), p(10, 0, 0), p(10, 10, 0), p(0, 10, 0)];

describe("fillSurface", () => {
    it("fills a square boundary through an interior point", () => {
        const face = kernel.fillSurface(loop(SQUARE), { points: [p(5, 5, 2)] });
        expect(kernel.getShapeType(face)).toBe("face");
        expect(kernel.isValid(face)).toBe(true);
        expect(distanceTo(face, p(5, 5, 2))).toBeLessThan(1e-3);
        for (const corner of SQUARE) expect(distanceTo(face, corner)).toBeLessThan(1e-4);
    });

    it("meets a support face tangentially along a supported edge", () => {
        // A flat apron at z = 0 beyond the square's left side, sharing that
        // edge. Bulged up to z = 2 in the middle, a bare filling rises off the
        // edge; tangent to the apron it leaves the edge flat.
        const apronCorners = [p(-10, 0, 0), p(0, 0, 0), p(0, 10, 0), p(-10, 10, 0)];
        const apron = kernel.makeFace(kernel.makeWire(loop(apronCorners)));
        const shared = kernel.getSubShapes(apron, "edge").find((e: number) => {
            const { first, last } = kernel.curveParameters(e);
            const a = kernel.curvePointAtParam(e, first);
            const b = kernel.curvePointAtParam(e, last);
            return Math.abs(a.x) < 1e-9 && Math.abs(b.x) < 1e-9;
        });
        expect(shared).toBeDefined();
        const rest = [
            kernel.makeLineEdge(p(0, 0, 0), p(10, 0, 0)),
            kernel.makeLineEdge(p(10, 0, 0), p(10, 10, 0)),
            kernel.makeLineEdge(p(10, 10, 0), p(0, 10, 0)),
        ];
        const bulge = { points: [p(5, 5, 2)] };
        const smooth = kernel.fillSurface([...rest, { edge: shared, support: apron }], bulge);
        const loose = kernel.fillSurface([...rest, shared], bulge);
        const at = p(0, 5, 0);
        expect(Math.abs(normalNear(smooth, at).z)).toBeGreaterThan(0.9999);
        expect(Math.abs(normalNear(loose, at).z)).toBeLessThan(0.99);
        expect(distanceTo(smooth, p(5, 5, 2))).toBeLessThan(1e-3);
    });

    it("passes through a guide edge inside the boundary", () => {
        const guide = kernel.makeLineEdge(p(2, 5, 1), p(8, 5, 1));
        const face = kernel.fillSurface(loop(SQUARE), { guides: [guide] });
        expect(distanceTo(face, p(5, 5, 1))).toBeLessThan(1e-3);
    });

    it("accepts tuned solver controls", () => {
        const face = kernel.fillSurface(loop(SQUARE), {
            points: [p(5, 5, 2)],
            degree: 3,
            pointsOnCurve: 20,
            iterations: 3,
            tolerance3d: 1e-5,
            maxDegree: 8,
            maxSegments: 12,
        });
        expect(distanceTo(face, p(5, 5, 2))).toBeLessThan(1e-4);
    });

    it("rejects malformed input", () => {
        const u32 = (ids: number[]) => {
            const v = new Module.VectorUint32();
            for (const id of ids) v.push_back(id);
            return v;
        };
        const i32 = (xs: number[]) => {
            const v = new Module.VectorInt();
            for (const x of xs) v.push_back(x);
            return v;
        };
        const f64 = (xs: number[]) => {
            const v = new Module.VectorDouble();
            for (const x of xs) v.push_back(x);
            return v;
        };
        const edges = loop(SQUARE);
        const face = kernel.makeFace(kernel.makeWire(edges));
        const call = (free: number[], sup: number[], faces: number[], orders: number[], params: number[]) =>
            raw.fillSurface(u32(free), u32(sup), u32(faces), i32(orders), u32([]), f64([]), 0, f64(params));
        expect(() => call([], [], [], [], [])).toThrow();
        expect(() => call(edges, [], [], [], [3, 15])).toThrow();
        expect(() => call(edges.slice(1), [edges[0]], [face], [], [])).toThrow();
        expect(() => call(edges.slice(1), [edges[0]], [face], [3], [])).toThrow();
    });
});

describe("edgeOnSurface", () => {
    function lateral(cylinder: number): number {
        const face = kernel
            .getSubShapes(cylinder, "face")
            .find((f: number) => kernel.surfaceType(f) === "cylinder");
        expect(face).toBeDefined();
        return face;
    }

    function radiusAt(edge: number, frac: number): { r: number; z: number } {
        const { first, last } = kernel.curveParameters(edge);
        const q = kernel.curvePointAtParam(edge, first + (last - first) * frac);
        return { r: Math.hypot(q.x, q.y), z: q.z };
    }

    it("lays a closed loop onto a cylinder across its seam", () => {
        const face = lateral(kernel.makeCylinder(5, 10));
        const pts = Array.from({ length: 48 }, (_, i) => {
            const t = (2 * Math.PI * i) / 48;
            return p(5 * Math.cos(t), 5 * Math.sin(t), 5);
        });
        const edge = kernel.edgeOnSurface(face, pts, 1e-4, true);
        expect(kernel.getShapeType(edge)).toBe("edge");
        expect(kernel.getLength(edge)).toBeCloseTo(2 * Math.PI * 5, 2);
        for (const f of [0, 0.13, 0.5, 0.77, 1]) {
            const { r, z } = radiusAt(edge, f);
            expect(r).toBeCloseTo(5, 6);
            expect(z).toBeCloseTo(5, 3);
        }
    });

    it("projects points that sit off the surface onto it", () => {
        const face = lateral(kernel.makeCylinder(5, 10));
        // An open arc crossing the seam at angle 0, rising, 0.02 mm proud.
        const pts = Array.from({ length: 12 }, (_, i) => {
            const t = -1 + (2 * i) / 11;
            return p(5.02 * Math.cos(t), 5.02 * Math.sin(t), 3 + t);
        });
        const edge = kernel.edgeOnSurface(face, pts, 1e-3);
        for (const f of [0, 0.25, 0.5, 0.75, 1]) {
            expect(radiusAt(edge, f).r).toBeCloseTo(5, 6);
        }
        const { first, last } = kernel.curveParameters(edge);
        const start = kernel.curvePointAtParam(edge, first);
        const end = kernel.curvePointAtParam(edge, last);
        expect(start.z).toBeCloseTo(2, 2);
        expect(end.z).toBeCloseTo(4, 2);
    });

    it("rejects too few points and a non-positive tolerance", () => {
        const face = lateral(kernel.makeCylinder(5, 10));
        expect(() => kernel.edgeOnSurface(face, [p(5, 0, 1)])).toThrow();
        expect(() => kernel.edgeOnSurface(face, [p(5, 0, 1), p(0, 5, 2)], 0)).toThrow();
    });
});
