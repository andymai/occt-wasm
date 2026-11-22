/**
 * A ruled loft joins its sections with straight edges, which OCCT makes as
 * Bezier curves of degree 1. The loft gives each of them a line instead, so
 * that an intersection with one takes OCCT's exact line solution.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { OcctKernel, type OcctModuleFactory, type ShapeHandle, type Vec3 } from "../ts/src/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");

let kernel: OcctKernel;
const BOUND = 1_000_000_000;

beforeAll(async () => {
    const createModule = ((await import(jsPath)) as { default: OcctModuleFactory }).default;
    kernel = await OcctKernel.init({ createModule, wasm: wasmPath });
}, 30_000);

afterEach(() => kernel.releaseAll());
afterAll(() => {
    kernel?.[Symbol.dispose]();
});

const p = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const edgesOf = (shape: ShapeHandle): ShapeHandle[] => kernel.getSubShapes(shape, "edge");
const curveKinds = (shape: ShapeHandle): Set<string> => new Set(edgesOf(shape).map((e) => kernel.curveType(e)));
const surfaceKinds = (shape: ShapeHandle): Set<string> =>
    new Set(kernel.getSubShapes(shape, "face").map((f) => kernel.surfaceType(f)));

function square(z: number, half: number): ShapeHandle {
    const points = [p(-half, -half, z), p(half, -half, z), p(half, half, z), p(-half, half, z)];
    return kernel.makeWire(points.map((a, i) => kernel.makeLineEdge(a, points[(i + 1) % 4]!)));
}

/** A rectangle of half-size `half` whose corners are arcs of the given radius. */
function roundedSquare(z: number, half: number, radius: number): ShapeHandle {
    const inner = half - radius;
    const reach = radius * Math.SQRT1_2;
    const edges: ShapeHandle[] = [];
    const corners: [number, number][] = [
        [1, 1],
        [-1, 1],
        [-1, -1],
        [1, -1],
    ];
    corners.forEach(([sx, sy], i) => {
        const [nx, ny] = corners[(i + 1) % 4]!;
        // The arc turns from the side before this corner to the side after it.
        const start = i % 2 === 0 ? p(sx * half, sy * inner, z) : p(sx * inner, sy * half, z);
        const end = i % 2 === 0 ? p(sx * inner, sy * half, z) : p(sx * half, sy * inner, z);
        const mid = p(sx * (inner + reach), sy * (inner + reach), z);
        edges.push(kernel.makeArcEdge(start, mid, end));
        const next = i % 2 === 0 ? p(nx * inner, ny * half, z) : p(nx * half, ny * inner, z);
        edges.push(kernel.makeLineEdge(end, next));
    });
    return kernel.makeWire(edges);
}

/** Every line edge is parametrised by its length, as a line is. */
function expectLinesByLength(shape: ShapeHandle): void {
    for (const edge of edgesOf(shape)) {
        if (kernel.curveType(edge) !== "line") continue;
        const { first, last } = kernel.curveParameters(edge);
        expect(last - first).toBeCloseTo(kernel.curveLength(edge), 9);
    }
}

describe("a ruled loft's straight edges", () => {
    it("are lines between flat sides", () => {
        const solid = kernel.loft([square(0, 2), square(10, 3), square(20, 2)], true, true);
        expect(curveKinds(solid)).toEqual(new Set(["line"]));
        expect(kernel.isValid(solid)).toBe(true);
        expect(kernel.getVolume(solid)).toBeCloseTo(2 * (10 / 3) * (16 + 36 + 24), 6);
        expectLinesByLength(solid);
    });

    it("are lines on the cones and cylinders between rounded sections", () => {
        const sections = [roundedSquare(0, 10, 3), roundedSquare(4, 10, 3), roundedSquare(6, 8, 1)];
        const solid = kernel.loft(sections, true, true);
        expect(curveKinds(solid)).toEqual(new Set(["line", "circle"]));
        expect(surfaceKinds(solid)).toEqual(new Set(["plane", "cylinder", "cone"]));
        expect(kernel.isValid(solid)).toBe(true);
        expectLinesByLength(solid);
    });

    it("are lines where a flat side meets a curved section", () => {
        const circle = kernel.makeWire([kernel.makeCircleEdge(p(0, 0, 10), p(0, 0, 1), 3)]);
        const solid = kernel.loft([square(0, 4), circle], true, true);
        expect(curveKinds(solid).has("bezier")).toBe(false);
        expect(kernel.isValid(solid)).toBe(true);
        expect(kernel.getVolume(solid)).toBeGreaterThan(0);
        expectLinesByLength(solid);
    });

    it("are lines up to a vertex", () => {
        const apex = kernel.makeVertex(0, 0, 9);
        const solid = kernel.loftWithVertices([square(0, 3)], true, true, 0 as ShapeHandle, apex);
        expect(curveKinds(solid)).toEqual(new Set(["line"]));
        expect(kernel.isValid(solid)).toBe(true);
        expect(kernel.getVolume(solid)).toBeCloseTo((36 * 9) / 3, 6);
    });

    it("are lines in a loft that reports its history", () => {
        const sections = [roundedSquare(0, 10, 3), roundedSquare(6, 8, 1)];
        const evo = kernel.loftWithHistory(sections, true, true, [], BOUND);
        expect(curveKinds(evo.result)).toEqual(new Set(["line", "circle"]));
        expect(kernel.isValid(evo.result)).toBe(true);
        expect(kernel.getVolume(evo.result)).toBeCloseTo(kernel.getVolume(kernel.loft(sections, true, true)), 9);
    });

    it("take part in a boolean as lines do", () => {
        const solid = kernel.loft([roundedSquare(0, 10, 3), roundedSquare(6, 8, 1)], true, true);
        const tool = kernel.translate(kernel.makeBox(30, 4, 3), -15, -2, 2);
        const cut = kernel.cut(solid, tool);
        expect(kernel.isValid(cut)).toBe(true);
        const removed = kernel.getVolume(solid) - kernel.getVolume(cut);
        expect(removed).toBeCloseTo(kernel.getVolume(kernel.common(solid, tool)), 6);
        expect(removed).toBeGreaterThan(0);
    });
});

describe("a smooth loft", () => {
    it("keeps the curves it was given", () => {
        const circle = (z: number, r: number): ShapeHandle =>
            kernel.makeWire([kernel.makeCircleEdge(p(0, 0, z), p(0, 0, 1), r)]);
        const solid = kernel.loft([circle(0, 5), circle(10, 3), circle(20, 6)], true, false);
        expect(curveKinds(solid).has("bspline")).toBe(true);
        expect(kernel.isValid(solid)).toBe(true);
    });
});
