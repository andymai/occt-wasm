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

    // A square swept along a straight spine with a guide parallel to it asks
    // for no rotation at all, so the answer is a prism with six planar faces
    // and an exact volume. Curvilinear equivalence used to be forced on, which
    // approximated two of those faces as B-splines; the error scaled with the
    // model until the sweep failed outright.
    const squarePrism = (f: number) => {
        const h = 2 * f;
        const l = 20 * f;
        const r = 5 * f;
        const corners = [
            { x: -h, y: -h, z: 0 },
            { x: h, y: -h, z: 0 },
            { x: h, y: h, z: 0 },
            { x: -h, y: h, z: 0 },
        ];
        return {
            profile: kernel.makeWire(
                corners.map((c: { x: number; y: number; z: number }, i: number) =>
                    kernel.makeLineEdge(c, corners[(i + 1) % corners.length]),
                ),
            ),
            spine: kernel.makeWire([
                kernel.makeLineEdge({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: l }),
            ]),
            guide: kernel.makeWire([
                kernel.makeLineEdge({ x: r, y: 0, z: 0 }, { x: r, y: 0, z: l }),
            ]),
            volume: 2 * h * (2 * h) * l,
        };
    };

    it("keeps planar faces exact for a non-rotating guide", () => {
        const { profile, spine, guide, volume } = squarePrism(1);
        const solid = kernel.sweepOriented(profile, spine, SweepMode.Auxiliary, undefined, guide);
        const surfaces = kernel
            .getSubShapes(solid, "face")
            .map((f: number) => kernel.surfaceType(f));
        expect(surfaces).toEqual(["plane", "plane", "plane", "plane", "plane", "plane"]);
        expect(Math.abs(kernel.getVolume(solid))).toBeCloseTo(volume, 9);
    });

    it("stays exact as the model scales up", () => {
        for (const f of [2, 10, 100]) {
            const { profile, spine, guide, volume } = squarePrism(f);
            const solid = kernel.sweepOriented(
                profile,
                spine,
                SweepMode.Auxiliary,
                undefined,
                guide,
            );
            expect(Math.abs(kernel.getVolume(solid)) / volume).toBeCloseTo(1, 9);
        }
    });

    it("still offers curvilinear equivalence when asked for it", () => {
        const { profile, spine, guide } = squarePrism(1);
        const solid = kernel.sweepOriented(
            profile,
            spine,
            SweepMode.Auxiliary,
            undefined,
            guide,
            { curvilinearEquivalence: true },
        );
        expect(kernel.isValid(solid)).toBe(true);
        const surfaces = kernel
            .getSubShapes(solid, "face")
            .map((f: number) => kernel.surfaceType(f));
        expect(surfaces.filter((s: string) => s === "bspline").length).toBe(2);
    });

    // A guide that only covers part of the spine leaves some section planes
    // with nothing to intersect. Curvilinear equivalence papers over that and
    // returns a solid roughly half the true volume; the guide-plane path says
    // so instead.
    it("reports a guide that does not span the spine", () => {
        const { profile, spine } = squarePrism(1);
        const shortGuide = kernel.makeWire([
            kernel.makeLineEdge({ x: 5, y: 0, z: 6 }, { x: 5, y: 0, z: 14 }),
        ]);
        expect(() =>
            kernel.sweepOriented(profile, spine, SweepMode.Auxiliary, undefined, shortGuide),
        ).toThrow(/does not intersect the guide wire/);
    });

    it("tolerates a guide that overhangs both ends of the spine", () => {
        const { profile, spine, volume } = squarePrism(1);
        const longGuide = kernel.makeWire([
            kernel.makeLineEdge({ x: 5, y: 0, z: -10 }, { x: 5, y: 0, z: 30 }),
        ]);
        const solid = kernel.sweepOriented(
            profile,
            spine,
            SweepMode.Auxiliary,
            undefined,
            longGuide,
        );
        expect(Math.abs(kernel.getVolume(solid))).toBeCloseTo(volume, 9);
    });

    it("rejects an out-of-range contact mode", () => {
        const { profile, spine, guide } = squarePrism(1);
        expect(() =>
            kernel.sweepOriented(profile, spine, SweepMode.Auxiliary, undefined, guide, {
                contact: 7,
            }),
        ).toThrow(/contact mode/);
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
