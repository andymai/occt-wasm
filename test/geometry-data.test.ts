/**
 * curveData and surfaceData: exact parameters read from an edge's curve and a
 * face's surface, checked against the values each shape was built from.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { OcctKernel, Vec3 } from "../ts/src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let kernel: OcctKernel;

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
const translation = (x: number, y: number, z: number): number[] => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];

function expectVec(actual: Vec3, expected: Vec3): void {
    expect(actual.x).toBeCloseTo(expected.x, 9);
    expect(actual.y).toBeCloseTo(expected.y, 9);
    expect(actual.z).toBeCloseTo(expected.z, 9);
}

/** The face of a shape whose surface is of the given kind. */
function faceOfKind(shape: ReturnType<OcctKernel["makeBox"]>, kind: string) {
    const face = kernel.getSubShapes(shape, "face").find((f) => kernel.surfaceType(f) === kind);
    if (face === undefined) throw new Error(`no ${kind} face`);
    return face;
}

describe("curveData", () => {
    it("reads a line's point, direction and range", () => {
        const data = kernel.curveData(kernel.makeLineEdge(p(1, 2, 3), p(1, 2, 13)));
        if (data.kind !== "line") throw new Error(data.kind);
        expectVec(data.point, p(1, 2, 3));
        expectVec(data.direction, p(0, 0, 1));
        expect(data.first).toBeCloseTo(0, 9);
        expect(data.last).toBeCloseTo(10, 9);
    });

    it("reads a circle's frame and radius", () => {
        const data = kernel.curveData(kernel.makeCircleEdge(p(1, 2, 3), p(0, 0, 1), 7));
        if (data.kind !== "circle") throw new Error(data.kind);
        expectVec(data.center, p(1, 2, 3));
        expectVec(data.axis, p(0, 0, 1));
        expectVec(data.xDirection, p(1, 0, 0));
        expect(data.radius).toBe(7);
        expect(data.last - data.first).toBeCloseTo(2 * Math.PI, 9);
    });

    it("reads an arc's trimmed range on its circle", () => {
        const data = kernel.curveData(kernel.makeCircleArc(p(0, 0, 0), p(0, 0, 1), 5, 0.5, 2));
        if (data.kind !== "circle") throw new Error(data.kind);
        expect(data.first).toBeCloseTo(0.5, 9);
        expect(data.last).toBeCloseTo(2, 9);
    });

    it("reads an ellipse's major direction and both radii", () => {
        const data = kernel.curveData(
            kernel.makeEllipseArc(p(1, 0, 0), p(0, 0, 1), 8, 3, 0, Math.PI, p(0, 1, 0)),
        );
        if (data.kind !== "ellipse") throw new Error(data.kind);
        expectVec(data.center, p(1, 0, 0));
        expectVec(data.majorDirection, p(0, 1, 0));
        expect(data.majorRadius).toBe(8);
        expect(data.minorRadius).toBe(3);
    });

    it("reads the conics a plane cuts from a cone", () => {
        const cone = kernel.makeCone(10, 0, 20);
        const kinds = (origin: Vec3, normal: Vec3) => {
            const section = kernel.sectionPlane(cone, origin, normal);
            return kernel.getSubShapes(section, "edge").map((e) => kernel.curveData(e));
        };

        const hyperbola = kinds(p(3, 0, 0), p(1, 0, 0)).find((d) => d.kind === "hyperbola");
        if (hyperbola?.kind !== "hyperbola") throw new Error("no hyperbola");
        expect(hyperbola.majorRadius).toBeGreaterThan(0);
        expect(hyperbola.minorRadius).toBeGreaterThan(0);

        // Parallel to a generatrix: the cone falls 2 in height per 1 in radius.
        const parabola = kinds(p(3, 0, 0), p(2, 0, 1)).find((d) => d.kind === "parabola");
        if (parabola?.kind !== "parabola") throw new Error("no parabola");
        expect(parabola.focal).toBeGreaterThan(0);
    });

    it("reads a B-spline exactly, poles and knots of the whole curve", () => {
        const poles = [0, 0, 0, 1, 2, 0, 3, 2, 0, 4, 0, 0];
        const weights = [1, 2, 2, 1];
        const edge = kernel.makeBSplineEdge(poles, weights, [0, 1], [4, 4], 3);
        const data = kernel.curveData(edge);
        if (data.kind !== "bspline") throw new Error(data.kind);
        expect(data.bspline).toEqual({
            degree: 3,
            rational: true,
            periodic: false,
            knots: [0, 1],
            multiplicities: [4, 4],
            poles,
            weights,
        });
        expect(data.bspline).toEqual(kernel.getNurbsCurveData(edge));
        expect(data.first).toBe(0);
        expect(data.last).toBe(1);
    });

    it("offers a Bezier as a B-spline form through its control points", () => {
        const data = kernel.curveData(kernel.makeBezierEdge([p(0, 0, 0), p(1, 2, 0), p(3, 0, 0)]));
        expect(data.kind).toBe("bezier");
        if (data.kind !== "bezier") throw new Error(data.kind);
        expect(data.bspline?.degree).toBe(2);
        expect(data.bspline?.poles).toEqual([0, 0, 0, 1, 2, 0, 3, 0, 0]);
    });

    it("applies the shape's location", () => {
        const edge = kernel.makeCircleEdge(p(0, 0, 0), p(0, 0, 1), 2);
        const data = kernel.curveData(kernel.located(edge, translation(5, 6, 7)));
        if (data.kind !== "circle") throw new Error(data.kind);
        expectVec(data.center, p(5, 6, 7));
    });

    it("applies the shape's location to B-spline poles", () => {
        const edge = kernel.makeBSplineEdge([0, 0, 0, 1, 2, 0, 3, 2, 0, 4, 0, 0], [], [0, 1], [4, 4], 3);
        const data = kernel.curveData(kernel.located(edge, translation(0, 0, 5)));
        if (data.kind !== "bspline") throw new Error(data.kind);
        expect(data.bspline.poles).toEqual([0, 0, 5, 1, 2, 5, 3, 2, 5, 4, 0, 5]);
    });

    it("offers an offset curve as a B-spline form", () => {
        const closed = kernel.interpolatePoints([p(0, 0, 0), p(5, 3, 0), p(10, 0, 0), p(5, -3, 0)], true);
        const offset = kernel.offsetWire2D(kernel.makeWire([closed]), 0.5);
        const curves = kernel.getSubShapes(offset, "edge").map((e) => kernel.curveData(e));
        expect(curves.length).toBeGreaterThan(0);
        for (const curve of curves) {
            if (curve.kind !== "offset") throw new Error(curve.kind);
            expect(curve.bspline).toBeDefined();
        }
    });

    it("rejects a shape that is not an edge", () => {
        expect(() => kernel.curveData(kernel.makeBox(1, 1, 1))).toThrow(/not an edge/);
    });

    it("reads every edge of every primitive, degenerate ones included", () => {
        const shapes = [
            kernel.makeBox(1, 2, 3),
            kernel.makeCylinder(2, 5),
            kernel.makeSphere(3),
            kernel.makeCone(4, 0, 6),
            kernel.makeTorus(5, 1),
        ];
        for (const shape of shapes) {
            for (const edge of kernel.getSubShapes(shape, "edge")) {
                const data = kernel.curveData(edge);
                expect(data.kind).toBe(kernel.curveType(edge));
                expect(Number.isFinite(data.first)).toBe(true);
                expect(Number.isFinite(data.last)).toBe(true);
            }
        }
    });

    it("reads an edge lying on a surface", () => {
        const cylinder = kernel.makeCylinder(5, 10);
        const face = faceOfKind(cylinder, "cylinder");
        const edge = kernel.edgeOnSurface(face, [p(5, 0, 1), p(3, 4, 5), p(0, 5, 9)]);
        expect(kernel.curveData(edge).kind).toBe(kernel.curveType(edge));
    });
});

describe("surfaceData", () => {
    it("reads a plane's location and normal", () => {
        const data = kernel.surfaceData(kernel.makeRectangle(4, 2));
        if (data.kind !== "plane") throw new Error(data.kind);
        expectVec(data.normal, p(0, 0, 1));
        expectVec(data.location, p(2, 1, 0));
        expectVec(data.xDirection, p(1, 0, 0));
        expect(data.isDirect).toBe(true);
    });

    it("reads a cylinder's axis, not just its radius", () => {
        const cylinder = kernel.makeCylinder(5, 10);
        const data = kernel.surfaceData(faceOfKind(cylinder, "cylinder"));
        if (data.kind !== "cylinder") throw new Error(data.kind);
        expect(data.radius).toBe(5);
        expectVec(data.location, p(0, 0, 0));
        expectVec(data.axis, p(0, 0, 1));
        expect(data.isDirect).toBe(true);
    });

    it("reads a cone's reference radius and semi-angle", () => {
        const data = kernel.surfaceData(faceOfKind(kernel.makeCone(10, 5, 20), "cone"));
        if (data.kind !== "cone") throw new Error(data.kind);
        expect(data.refRadius).toBeCloseTo(10, 9);
        expect(Math.abs(data.semiAngle)).toBeCloseTo(Math.atan2(5, 20), 9);
    });

    it("reads a sphere's radius", () => {
        const data = kernel.surfaceData(faceOfKind(kernel.makeSphere(3), "sphere"));
        if (data.kind !== "sphere") throw new Error(data.kind);
        expect(data.radius).toBe(3);
        expectVec(data.location, p(0, 0, 0));
    });

    it("reads a torus's two radii", () => {
        const data = kernel.surfaceData(faceOfKind(kernel.makeTorus(5, 1), "torus"));
        if (data.kind !== "torus") throw new Error(data.kind);
        expect(data.majorRadius).toBe(5);
        expect(data.minorRadius).toBe(1);
    });

    it("applies the shape's location", () => {
        const cylinder = kernel.located(kernel.makeCylinder(5, 10), translation(1, 2, 3));
        const data = kernel.surfaceData(faceOfKind(cylinder, "cylinder"));
        if (data.kind !== "cylinder") throw new Error(data.kind);
        expectVec(data.location, p(1, 2, 3));
    });

    it("reports the handedness a mirror leaves on the frame", () => {
        const mirrored = kernel.mirror(kernel.makeCylinder(5, 10), p(0, 0, 0), p(1, 0, 0));
        const data = kernel.surfaceData(faceOfKind(mirrored, "cylinder"));
        if (data.kind !== "cylinder") throw new Error(data.kind);
        expect(data.isDirect).toBe(false);
    });

    it("reads a B-spline surface in the form nurbsSurface takes", () => {
        const input = {
            degreeU: 2,
            degreeV: 1,
            poles: [
                [p(0, 0, 0), p(0, 10, 1)],
                [p(5, 0, 3), p(5, 10, 4)],
                [p(10, 0, 0), p(10, 10, 1)],
            ],
            weights: [
                [1, 1],
                [2, 2],
                [1, 1],
            ],
            knotsU: [0, 1],
            knotsV: [0, 1],
            multiplicitiesU: [3, 3],
            multiplicitiesV: [2, 2],
            periodicU: false,
            periodicV: false,
        };
        const first = kernel.surfaceData(kernel.nurbsSurface(input));
        if (first.kind !== "bspline") throw new Error(first.kind);
        expect(first.bspline).toEqual(input);

        const rebuilt = kernel.surfaceData(kernel.nurbsSurface(first.bspline));
        expect(rebuilt).toEqual(first);
    });

    it("omits weights on a non-rational surface", () => {
        const data = kernel.surfaceData(
            kernel.nurbsSurface({
                degreeU: 1,
                degreeV: 1,
                poles: [
                    [p(0, 0, 0), p(0, 1, 0)],
                    [p(1, 0, 0), p(1, 1, 0)],
                ],
                knotsU: [0, 1],
                knotsV: [0, 1],
                multiplicitiesU: [2, 2],
                multiplicitiesV: [2, 2],
            }),
        );
        if (data.kind !== "bspline") throw new Error(data.kind);
        expect(data.bspline.weights).toBeUndefined();
    });

    it("offers a swept surface as a B-spline form over the face's bounds", () => {
        const profile = kernel.makeBezierEdge([p(0, 0, 0), p(2, 3, 0), p(4, 0, 0)]);
        const extruded = kernel.extrude(profile, 0, 0, 10);
        const face = kernel.getSubShapes(extruded, "face")[0]!;
        const data = kernel.surfaceData(face);
        expect(data.kind).toBe(kernel.surfaceType(face));
        if (data.kind !== "extrusion" && data.kind !== "bspline") throw new Error(data.kind);
        expect(data.bspline).toBeDefined();

        const rebuilt = kernel.nurbsSurface(data.bspline!);
        expect(kernel.getSurfaceArea(rebuilt)).toBeCloseTo(kernel.getSurfaceArea(face), 6);
    });

    it("offers a revolved surface as a B-spline form", () => {
        const profile = kernel.makeBezierEdge([p(5, 0, 0), p(8, 0, 5), p(5, 0, 10)]);
        const revolved = kernel.revolve(profile, { point: p(0, 0, 0), direction: p(0, 0, 1) }, Math.PI);
        const face = kernel.getSubShapes(revolved, "face")[0]!;
        const data = kernel.surfaceData(face);
        if (data.kind !== "revolution") throw new Error(data.kind);
        expect(data.bspline).toBeDefined();

        const rebuilt = kernel.nurbsSurface(data.bspline!);
        expect(kernel.getSurfaceArea(rebuilt)).toBeCloseTo(kernel.getSurfaceArea(face), 4);
    });

    it("offers an offset surface as a B-spline form", () => {
        const closed = kernel.interpolatePoints([p(0, 0, 0), p(5, 3, 0), p(10, 0, 0), p(5, -3, 0)], true);
        const prism = kernel.extrude(kernel.makeFace(kernel.makeWire([closed])), 0, 0, 10);
        const offset = kernel.offset(prism, 1, 1e-3);
        const data = kernel.surfaceData(faceOfKind(offset, "offset"));
        if (data.kind !== "offset") throw new Error(data.kind);
        expect(data.bspline).toBeDefined();
    });

    it("applies the shape's location to a converted form", () => {
        const profile = kernel.makeBezierEdge([p(0, 0, 0), p(2, 3, 0), p(4, 0, 0)]);
        const extruded = kernel.extrude(profile, 0, 0, 10);
        const zs = (shape: ReturnType<OcctKernel["makeBox"]>): number[] => {
            const data = kernel.surfaceData(kernel.getSubShapes(shape, "face")[0]!);
            if (data.kind !== "extrusion" || data.bspline === undefined) throw new Error(data.kind);
            return data.bspline.poles.flat().map((pole) => pole.z);
        };
        const moved = zs(kernel.located(extruded, translation(0, 0, 5)));
        zs(extruded).forEach((z, i) => expect(moved[i]).toBeCloseTo(z + 5, 9));
    });

    it("rejects a shape that is not a face", () => {
        expect(() => kernel.surfaceData(kernel.makeBox(1, 1, 1))).toThrow(/not a face/);
    });

    it("reads every face of every primitive", () => {
        const shapes = [
            kernel.makeBox(1, 2, 3),
            kernel.makeCylinder(2, 5),
            kernel.makeSphere(3),
            kernel.makeCone(4, 0, 6),
            kernel.makeTorus(5, 1),
        ];
        for (const shape of shapes) {
            for (const face of kernel.getSubShapes(shape, "face")) {
                expect(kernel.surfaceData(face).kind).toBe(kernel.surfaceType(face));
            }
        }
    });
});
