/**
 * Tests for the second batch of facade additions: inertia tensor,
 * point-in-solid, binary BREP, clamped B-spline interpolation, project-point-
 * on-edge, relative tessellation, auxiliary-spine sweep, and intersection cells.
 *
 * Constructs the TS wrapper via its private constructor (init() can't run here)
 * to exercise the real shipping methods against real OCCT.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Module: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let kernel: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SweepMode: any;

beforeAll(async () => {
    const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
    const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");
    const createModule = (await import(jsPath)).default;
    Module = await createModule({
        locateFile: (path: string) => (path.endsWith(".wasm") ? wasmPath : path),
    });
    const mod = await import(resolve(__dirname, "../ts/src/index.ts"));
    SweepMode = mod.SweepMode;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kernel = new (mod.OcctKernel as any)(Module);
}, 30_000);

afterEach(() => kernel.releaseAll());
afterAll(() => kernel[Symbol.dispose]());

describe("getInertia", () => {
    it("returns a symmetric 3x3 matrix with positive diagonal", () => {
        const box = kernel.makeBox(10, 20, 30);
        const m = kernel.getInertia(box);
        expect(m).toHaveLength(9);
        expect(m[1]).toBeCloseTo(m[3], 6); // symmetric
        expect(m[2]).toBeCloseTo(m[6], 6);
        expect(m[5]).toBeCloseTo(m[7], 6);
        expect(m[0]).toBeGreaterThan(0);
        expect(m[4]).toBeGreaterThan(0);
        expect(m[8]).toBeGreaterThan(0);
    });
});

describe("containsPoint", () => {
    it("classifies points inside vs outside a solid", () => {
        const box = kernel.makeBox(10, 10, 10); // [0,10]^3
        expect(kernel.containsPoint(box, { x: 5, y: 5, z: 5 })).toBe(true);
        expect(kernel.containsPoint(box, { x: 20, y: 5, z: 5 })).toBe(false);
        expect(kernel.containsPoint(box, { x: -1, y: 5, z: 5 })).toBe(false);
    });
});

describe("binary BREP I/O", () => {
    it("round-trips a shape through binary BREP", () => {
        const box = kernel.makeBox(12, 8, 6);
        const bytes = kernel.toBREPBinary(box);
        expect(bytes).toBeInstanceOf(Uint8Array);
        expect(bytes.length).toBeGreaterThan(0);

        const restored = kernel.fromBREPBinary(bytes);
        expect(kernel.getVolume(restored)).toBeCloseTo(12 * 8 * 6, 3);
    });
});

describe("interpolatePointsWithTangents", () => {
    it("builds an edge through points with clamped end tangents", () => {
        const pts = [
            { x: 0, y: 0, z: 0 },
            { x: 5, y: 5, z: 0 },
            { x: 10, y: 0, z: 0 },
        ];
        const edge = kernel.interpolatePointsWithTangents(
            pts,
            { x: 0, y: 1, z: 0 },
            { x: 0, y: -1, z: 0 },
        );
        expect(kernel.isEdge(edge)).toBe(true);
        expect(kernel.curveLength(edge)).toBeGreaterThan(10);
        // Start tangent should follow the requested +Y direction.
        const t = kernel.curveTangent(edge, kernel.curveParameters(edge).first);
        expect(t.y).toBeGreaterThan(0);
    });
});

describe("projectPointOnEdge", () => {
    it("finds the closest point, tangent, and parameter on a line edge", () => {
        const edge = kernel.makeLineEdge({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 });
        const r = kernel.projectPointOnEdge(edge, { x: 5, y: 4, z: 0 });
        expect(r.point.x).toBeCloseTo(5, 6);
        expect(r.point.y).toBeCloseTo(0, 6);
        expect(Math.abs(r.tangent.x)).toBeCloseTo(1, 6);
    });
});

describe("tessellate relative", () => {
    it("produces a valid mesh with scale-independent deflection", () => {
        const sphere = kernel.makeSphere(50);
        const mesh = kernel.tessellate(sphere, { linearDeflection: 0.01, relative: true });
        expect(mesh.triangleCount).toBeGreaterThan(0);
        expect(mesh.positions.length).toBe(mesh.vertexCount * 3);
    });
});

describe("sweepOriented auxiliary spine", () => {
    it("sweeps with an auxiliary guide wire", () => {
        const profile = kernel.makeWire([
            kernel.makeCircleEdge({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 2),
        ]);
        const spine = kernel.makeWire([
            kernel.makeLineEdge({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 30 }),
        ]);
        const aux = kernel.makeWire([
            kernel.makeLineEdge({ x: 5, y: 0, z: 0 }, { x: 5, y: 0, z: 30 }),
        ]);
        const solid = kernel.sweepOriented(profile, spine, SweepMode.Auxiliary, { x: 0, y: 1, z: 0 }, aux);
        expect(kernel.isValid(solid)).toBe(true);
        expect(kernel.getVolume(solid)).toBeGreaterThan(0);
    });
});

describe("intersectionCells", () => {
    it("extracts the overlap region of two boxes", () => {
        const a = kernel.makeBox(10, 10, 10); // [0,10]^3
        const b = kernel.translate(kernel.makeBox(10, 10, 10), 5, 5, 5); // [5,15]^3
        const overlap = kernel.intersectionCells([a, b]);
        // Overlap is [5,10]^3 = 125.
        expect(kernel.getVolume(overlap)).toBeCloseTo(125, 2);
    });
});
