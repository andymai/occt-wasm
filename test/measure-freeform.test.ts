/**
 * Bounds and mass properties of BSpline geometry, here primitives scaled
 * non-uniformly through gp_GTrsf, which turns their faces into rational
 * BSplines that still match the analytic shape exactly.
 *
 * OCCT's AddOptimal stopped short on these (an ellipsoid's xmin read -2.974,
 * not -3) and its fixed-order Gauss quadrature put a 2x-scaled cylinder's
 * volume 0.86% high.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
    const mod = await import(resolve(__dirname, "../ts/src/index.ts"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kernel = new (mod.OcctKernel as any)(Module);
}, 30_000);

afterEach(() => kernel.releaseAll());
afterAll(() => kernel[Symbol.dispose]());

const scaleX2 = [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

function expectBox(bb: Record<string, number>, expected: number[], digits = 6) {
    const got = [bb.xmin, bb.ymin, bb.zmin, bb.xmax, bb.ymax, bb.zmax];
    got.forEach((v, i) => expect(v, `component ${i}`).toBeCloseTo(expected[i] as number, digits));
}

function expectRelative(actual: number, expected: number, tolerance: number) {
    expect(Math.abs(actual - expected) / Math.abs(expected)).toBeLessThan(tolerance);
}

describe("precise bounds on BSpline faces", () => {
    it("reaches an ellipsoid's extremes", () => {
        const ellipsoid = kernel.makeEllipsoid(3, 4, 5);
        expect(kernel.surfaceType(kernel.getSubShapes(ellipsoid, "face")[0])).toBe("bspline");
        expectBox(kernel.getBoundingBox(ellipsoid), [-3, -4, -5, 3, 4, 5]);
    });

    it("reaches the extremes of a sphere scaled through a general transform", () => {
        const sphere = kernel.generalTransform(kernel.makeSphere(5), scaleX2);
        expectBox(kernel.getBoundingBox(sphere), [-10, -5, -5, 10, 5, 5]);
    });

    it("follows the shape's location", () => {
        const moved = kernel.translate(kernel.makeEllipsoid(3, 4, 5), 100, -50, 7);
        expectBox(kernel.getBoundingBox(moved), [97, -54, 2, 103, -46, 12]);
    });

    it("bounds a trimmed BSpline face by its boundary when the surface's extreme is cut away", () => {
        const cylinder = kernel.generalTransform(kernel.makeCylinder(5, 10), scaleX2);
        const half = kernel.cut(cylinder, kernel.makeBoxFromCorners({ x: -20, y: -20, z: -1 }, { x: 0, y: 20, z: 11 }));
        expectBox(kernel.getBoundingBox(half), [0, -5, 0, 10, 5, 10]);
    });

    it("stays inside the loose box", () => {
        const ellipsoid = kernel.makeEllipsoid(3, 4, 5);
        const precise = kernel.getBoundingBox(ellipsoid);
        const loose = kernel.getBoundingBox(ellipsoid, { precise: false });
        expect(loose.xmin).toBeLessThanOrEqual(precise.xmin);
        expect(loose.xmax).toBeGreaterThanOrEqual(precise.xmax);
        expect(loose.zmax).toBeGreaterThanOrEqual(precise.zmax);
    });
});

describe("mass properties on BSpline faces", () => {
    it("integrates a scaled cylinder's volume and center of mass", () => {
        const cylinder = kernel.generalTransform(kernel.makeCylinder(5, 10), scaleX2);
        expectRelative(kernel.getVolume(cylinder), Math.PI * 10 * 5 * 10, 1e-6);
        const com = kernel.getCenterOfMass(cylinder);
        expect(com.x).toBeCloseTo(0, 6);
        expect(com.y).toBeCloseTo(0, 6);
        expect(com.z).toBeCloseTo(5, 6);
    });

    it("integrates an ellipsoid's volume and inertia", () => {
        const ellipsoid = kernel.makeEllipsoid(3, 4, 5);
        const volume = (4 / 3) * Math.PI * 3 * 4 * 5;
        expectRelative(kernel.getVolume(ellipsoid), volume, 1e-6);
        // Ixx of a solid ellipsoid is m (b^2 + c^2) / 5 at unit density.
        const inertia = kernel.getInertia(ellipsoid);
        expectRelative(inertia[0], (volume * (16 + 25)) / 5, 1e-5);
    });

    it("integrates the surface area of a NURBS sphere", () => {
        const sphere = kernel.generalTransform(kernel.makeSphere(5), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
        expect(kernel.surfaceType(kernel.getSubShapes(sphere, "face")[0])).toBe("bspline");
        expectRelative(kernel.getSurfaceArea(sphere), 4 * Math.PI * 25, 1e-6);
    });

    it("integrates a planar face trimmed by a BSpline boundary", () => {
        const cylinder = kernel.generalTransform(kernel.makeCylinder(5, 10), scaleX2);
        const slab = kernel.makeBoxFromCorners({ x: -15, y: -8, z: 2 }, { x: 15, y: 8, z: 8 });
        const holed = kernel.cut(slab, cylinder);
        expectRelative(kernel.getVolume(holed), 30 * 16 * 6 - Math.PI * 10 * 5 * 6, 1e-6);
    });

    it("leaves elementary solids exact", () => {
        expect(kernel.getVolume(kernel.makeBox(10, 20, 30))).toBeCloseTo(6000, 9);
        expect(kernel.getVolume(kernel.makeCylinder(5, 10))).toBeCloseTo(Math.PI * 250, 9);
        expect(kernel.getSurfaceArea(kernel.makeSphere(5))).toBeCloseTo(Math.PI * 100, 9);
    });

    it("reports the same numbers through queryBatch", () => {
        const cylinder = kernel.generalTransform(kernel.makeCylinder(5, 10), scaleX2);
        const [row] = kernel.queryBatch([cylinder]);
        expect(row.volume).toBeCloseTo(kernel.getVolume(cylinder), 9);
        expect(row.area).toBeCloseTo(kernel.getSurfaceArea(cylinder), 9);
        expect(row.centerOfMass.z).toBeCloseTo(5, 6);
    });
});

// A flat spiral strip between two interpolated splines. A prism or a revolve of
// it has swept side walls: one extrusion or revolution surface whose basis curve
// has 20 spans for each turn.
function spiralStrip(turns: number) {
    const r0 = 2;
    const r1 = 7;
    const thick = 0.2;
    const n = Math.ceil(turns * 20);
    const side = (offset: number) =>
        Array.from({ length: n + 1 }, (_, i) => {
            const angle = (i / n) * turns * 2 * Math.PI;
            const r = r0 + ((r1 - r0) * i) / n + offset;
            return { x: r * Math.cos(angle), y: r * Math.sin(angle), z: 0 };
        });
    const inner = side(-thick / 2);
    const outer = side(thick / 2).reverse();
    const innerEdge = kernel.interpolatePoints(inner);
    const outerEdge = kernel.interpolatePoints(outer);
    const face = kernel.makeFace(
        kernel.makeWire([
            innerEdge,
            kernel.makeLineEdge(inner[n], outer[0]),
            outerEdge,
            kernel.makeLineEdge(outer[n], inner[0]),
        ]),
    );
    return {
        face,
        area: kernel.getSurfaceArea(face) as number,
        nominalArea: thick * Math.PI * (r0 + r1) * turns,
        perimeter: kernel.getLength(innerEdge) + kernel.getLength(outerEdge) + 2 * thick,
    };
}

describe("mass properties on swept and offset faces", () => {
    it.each([1, 3, 8, 19.5])("integrates a prism on a %s-turn spiral strip", (turns) => {
        const strip = spiralStrip(turns);
        const height = 1.5;
        const prism = kernel.extrude(strip.face, 0, 0, height);
        const walls = kernel.getSubShapes(prism, "face").map((f: number) => kernel.surfaceType(f));
        expect(walls).toContain("extrusion");

        expectRelative(strip.area, strip.nominalArea, 1e-4);
        expectRelative(kernel.getVolume(prism), strip.area * height, 1e-9);
        expectRelative(kernel.getSurfaceArea(prism), 2 * strip.area + strip.perimeter * height, 1e-9);
        expect(kernel.getCenterOfMass(prism).z).toBeCloseTo(height / 2, 9);
    });

    it("integrates a full revolve of a spiral strip", () => {
        const strip = spiralStrip(3);
        const centroid = kernel.getCenterOfMass(kernel.extrude(strip.face, 0, 0, 1));
        const axis = { point: { x: 20, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } };
        const ring = kernel.revolve(strip.face, axis, 2 * Math.PI);
        const walls = kernel.getSubShapes(ring, "face").map((f: number) => kernel.surfaceType(f));
        expect(walls).toContain("revolution");

        // Pappus: the area times the path of its centroid.
        expectRelative(kernel.getVolume(ring), 2 * Math.PI * (20 - centroid.x) * strip.area, 2e-6);
    });

    it("integrates an offset of a prism on a closed spline", () => {
        const n = 24;
        const oval = kernel.interpolatePoints(
            Array.from({ length: n }, (_, i) => {
                const angle = (i / n) * 2 * Math.PI;
                return { x: 10 * Math.cos(angle), y: 3 * Math.sin(angle), z: 0 };
            }),
            true,
        );
        const face = kernel.makeFace(kernel.makeWire([oval]));
        const area = kernel.getSurfaceArea(face);
        const perimeter = kernel.getLength(oval);
        const height = 10;
        const d = 1;
        const grown = kernel.offset(kernel.extrude(face, 0, 0, height), d, 1e-6);
        const kinds = kernel.getSubShapes(grown, "face").map((f: number) => kernel.surfaceType(f));
        expect(kinds).toContain("offset");

        // Steiner's formula for a convex body grown by a ball of radius d.
        const meanWidth = Math.PI * height + (Math.PI / 2) * perimeter;
        const volume = area * height + d * (2 * area + perimeter * height) + d * d * meanWidth + (4 / 3) * Math.PI * d ** 3;
        const surface = 2 * area + perimeter * height + 2 * d * meanWidth + 4 * Math.PI * d * d;
        expectRelative(kernel.getVolume(grown), volume, 1e-5);
        expectRelative(kernel.getSurfaceArea(grown), surface, 1e-5);
    });
});
