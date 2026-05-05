/**
 * Regression tests for the parity-bug class fixed in 3.0.0: shell-family
 * facade methods that hardcoded the OCCT tolerance to 1e-3 (PR #94 missed
 * these; only `offset` was fixed there). brepjs-occt callers default to
 * 1e-6, so the silent coercion produced different topology and volume.
 *
 * These tests don't assert the *correct* answer — there isn't one without
 * a reference implementation — only that the tolerance argument is wired
 * through to OCCT and is load-bearing. If a future refactor drops it back
 * to a hardcoded constant, these tests will catch the regression by
 * showing the two tolerance values produce identical output.
 *
 * Also covers `getBoundingBox` switching from `BRepBndLib::Add` to
 * `AddOptimal`: the old path overshoots curved geometry by ~0.27·r when
 * triangulation is absent. This test verifies the new bounds are tight
 * for a cylinder, where the old behavior would have given xmin ≈ −r·1.27
 * instead of xmin ≈ −r.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Module: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let kernel: any;

beforeAll(async () => {
    const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
    const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");
    const createModule = (await import(jsPath)).default;
    Module = await createModule({
        locateFile: (path: string) =>
            path.endsWith(".wasm") ? wasmPath : path,
    });
    kernel = new Module.OcctKernel();
}, 30_000);

afterEach(() => {
    kernel.releaseAll();
});

afterAll(() => {
    kernel.releaseAll();
    kernel.delete();
});

describe("shell tolerance plumbing", () => {
    // Build a curved-edge solid: extruding a filleted square produces enough
    // tolerance-sensitive topology that 1e-3 vs 1e-6 should yield distinct
    // shell results. A plain box is too easy and both tolerances will agree.
    function makeFilletedSolid(): number {
        const box = kernel.makeBox(20, 20, 10);
        const edges = kernel.getSubShapes(box, "edge");
        // Fillet the four vertical edges (small radius).
        const verticals = new Module.VectorUint32();
        for (let i = 0; i < edges.size(); i++) {
            const eid = edges.get(i);
            const bb = kernel.getBoundingBox(eid, true);
            const dx = bb.xmax - bb.xmin;
            const dy = bb.ymax - bb.ymin;
            const dz = bb.zmax - bb.zmin;
            if (dz > dx && dz > dy) verticals.push_back(eid);
        }
        edges.delete();
        const filleted = kernel.fillet(box, verticals, 1.5);
        verticals.delete();
        return filleted;
    }

    it("forwards tolerance to MakeThickSolidByJoin", () => {
        const solid1 = makeFilletedSolid();
        const solid2 = makeFilletedSolid();
        const faces1 = kernel.getSubShapes(solid1, "face");
        const faces2 = kernel.getSubShapes(solid2, "face");
        // Pick the +Z (top) face on each.
        const pickTop = (faces: any, id: number): number => {
            for (let i = 0; i < faces.size(); i++) {
                const fid = faces.get(i);
                const bb = kernel.getBoundingBox(fid, true);
                if (bb.zmin > 9.9 && bb.zmax < 10.1) return fid;
            }
            throw new Error(`top face not found for ${id}`);
        };
        const facesA = new Module.VectorUint32();
        facesA.push_back(pickTop(faces1, solid1));
        const facesB = new Module.VectorUint32();
        facesB.push_back(pickTop(faces2, solid2));
        faces1.delete();
        faces2.delete();

        // Same input geometry, different tolerance.
        const shellLoose = kernel.shell(solid1, facesA, 1.0, 1e-3);
        const shellTight = kernel.shell(solid2, facesB, 1.0, 1e-6);
        facesA.delete();
        facesB.delete();

        expect(shellLoose).toBeGreaterThan(0);
        expect(shellTight).toBeGreaterThan(0);

        // Both must be valid solids.
        expect(kernel.getVolume(shellLoose)).toBeGreaterThan(0);
        expect(kernel.getVolume(shellTight)).toBeGreaterThan(0);

        // The whole point of this regression test: tolerance is load-bearing
        // and reaches OCCT. If a future refactor reverts to a hardcoded
        // tolerance, both shell results would be byte-identical and this
        // assertion catches it. We allow either volume or face-count to
        // differ — OCCT may produce identical output for some inputs at
        // these tolerances, but at least one of these signals should differ
        // for the filleted-solid case.
        const volLoose = kernel.getVolume(shellLoose);
        const volTight = kernel.getVolume(shellTight);
        const facesShellLoose = kernel.getSubShapes(shellLoose, "face");
        const facesShellTight = kernel.getSubShapes(shellTight, "face");
        const fcLoose = facesShellLoose.size();
        const fcTight = facesShellTight.size();
        facesShellLoose.delete();
        facesShellTight.delete();

        const volumesDiffer = Math.abs(volLoose - volTight) > 1e-9;
        const faceCountsDiffer = fcLoose !== fcTight;
        // If both happen to agree exactly, that's still legal output — but
        // we check the tolerance arg was at least *seen* by OCCT by passing
        // an absurd tolerance and expecting failure or a clearly different
        // result.
        if (!volumesDiffer && !faceCountsDiffer) {
            // Try a wildly coarse tolerance — if it still produces the same
            // result, the arg is being silently ignored.
            const solid3 = makeFilletedSolid();
            const faces3 = kernel.getSubShapes(solid3, "face");
            const facesC = new Module.VectorUint32();
            facesC.push_back(pickTop(faces3, solid3));
            faces3.delete();
            let shellAbsurd: number | undefined;
            try {
                shellAbsurd = kernel.shell(solid3, facesC, 1.0, 10.0);
            } catch {
                // OCCT rejecting a 10mm tolerance on a 20mm solid is itself
                // proof the tolerance was honored.
                facesC.delete();
                return;
            }
            facesC.delete();
            const volAbsurd = kernel.getVolume(shellAbsurd);
            // Either the absurd tolerance produces a different volume or
            // fails to build at all; if it builds and matches the tight
            // tolerance result, the arg is ignored.
            expect(volAbsurd).not.toBeCloseTo(volTight, 6);
        }
    });
});

describe("getBoundingBox uses surface-precise bounds", () => {
    it("gives tight bounds on a cylinder without prior tessellation", () => {
        // Cylinder of radius 5, height 10, axis +Z, base at origin.
        // True bounds: x ∈ [−5, 5], y ∈ [−5, 5], z ∈ [0, 10].
        // The old BRepBndLib::Add path (without triangulation) would give
        // x ∈ [≈−6.35, ≈6.35] from BSpline pole hulls — overshoot ≈ r·0.27.
        const cyl = kernel.makeCylinder(5, 10);
        const bbox = kernel.getBoundingBox(cyl, true);

        // Tight to within OCCT tolerance, NOT pole-hull overshoot.
        expect(bbox.xmin).toBeCloseTo(-5, 3);
        expect(bbox.xmax).toBeCloseTo(5, 3);
        expect(bbox.ymin).toBeCloseTo(-5, 3);
        expect(bbox.ymax).toBeCloseTo(5, 3);
        expect(bbox.zmin).toBeCloseTo(0, 3);
        expect(bbox.zmax).toBeCloseTo(10, 3);

        // Specifically, xmin must NOT have the ≈1.27 overshoot the old path
        // produced — that was the source of the issue #90 1.2 mm shift.
        expect(bbox.xmin).toBeGreaterThan(-5.5);
    });

    it("matches reference bounds on a sphere", () => {
        const sphere = kernel.makeSphere(7);
        const bbox = kernel.getBoundingBox(sphere, true);
        expect(bbox.xmin).toBeCloseTo(-7, 3);
        expect(bbox.xmax).toBeCloseTo(7, 3);
    });
});
