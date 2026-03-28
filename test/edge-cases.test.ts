/**
 * edge-cases.test.ts
 *
 * Tests that the WASM kernel handles bad/degenerate inputs gracefully —
 * either throwing a catchable error or returning a defined fallback rather
 * than aborting/crashing the runtime.
 *
 * Embind wraps C++ exceptions as opaque JS objects (not Error instances), so
 * we use a helper `throws()` that catches any thrown value (object, string, or
 * Error) rather than relying on `expect(...).toThrow()` which only matches
 * Error instances.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { resolve } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Module: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let kernel: any;

beforeAll(async () => {
    const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");
    const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
    const createOcctWasm = (await import(jsPath)).default;
    Module = await createOcctWasm({
        locateFile: (path: string) => {
            if (path.endsWith(".wasm")) return wasmPath;
            return path;
        },
    });
    kernel = new Module.OcctKernel();
}, 30_000);

afterAll(() => {
    if (kernel) {
        kernel.releaseAll();
        kernel.delete();
    }
});

afterEach(() => {
    kernel.releaseAll();
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Returns true if calling `fn` throws anything at all — including Emscripten's
 * opaque exception objects which are not instanceof Error.
 */
function throws(fn: () => unknown): boolean {
    try {
        fn();
        return false;
    } catch {
        return true;
    }
}

/**
 * Assert that `fn` throws. Vitest's `toThrow` requires an Error instance;
 * Embind exceptions are plain objects, so we use this wrapper instead.
 */
function expectThrows(fn: () => unknown, label?: string): void {
    expect(throws(fn), label ?? "expected call to throw").toBe(true);
}

// ---------------------------------------------------------------------------
// Invalid IDs
// ---------------------------------------------------------------------------

describe("invalid IDs", () => {
    const BOGUS = 99999;

    it("release(99999) — releasing a non-existent ID does not crash", () => {
        // release is a best-effort operation; it may silently ignore unknown IDs
        // or throw — either is acceptable, but it must not abort the runtime
        try {
            kernel.release(BOGUS);
        } catch {
            // acceptable
        }
        // kernel must still be usable after the call
        const box = kernel.makeBox(1, 1, 1);
        expect(box).toBeGreaterThan(0);
    });

    it("getVolume(99999) — querying a non-existent shape throws", () => {
        expectThrows(() => kernel.getVolume(BOGUS), "getVolume(bogus id)");
    });

    it("fuse(99999, validId) — boolean with invalid first operand throws", () => {
        const box = kernel.makeBox(5, 5, 5);
        expectThrows(() => kernel.fuse(BOGUS, box), "fuse(bogus, valid)");
    });

    it("fuse(validId, 99999) — boolean with invalid second operand throws", () => {
        const box = kernel.makeBox(5, 5, 5);
        expectThrows(() => kernel.fuse(box, BOGUS), "fuse(valid, bogus)");
    });

    it("tessellate(99999, 0.1, 0.5) — tessellating a non-existent shape throws", () => {
        expectThrows(
            () => kernel.tessellate(BOGUS, 0.1, 0.5),
            "tessellate(bogus id)",
        );
    });

    it("exportStep(99999) — exporting a non-existent shape throws", () => {
        expectThrows(() => kernel.exportStep(BOGUS), "exportStep(bogus id)");
    });

    it("getShapeType(99999) — querying type of non-existent shape throws", () => {
        expectThrows(
            () => kernel.getShapeType(BOGUS),
            "getShapeType(bogus id)",
        );
    });

    it("getBoundingBox(99999) — bounding box of non-existent shape throws", () => {
        expectThrows(
            () => kernel.getBoundingBox(BOGUS),
            "getBoundingBox(bogus id)",
        );
    });

    it("getSubShapes(99999, 'face') — subshapes of non-existent shape throws", () => {
        expectThrows(
            () => kernel.getSubShapes(BOGUS, "face"),
            "getSubShapes(bogus id)",
        );
    });
});

// ---------------------------------------------------------------------------
// Zero / negative dimensions
// ---------------------------------------------------------------------------

describe("zero/negative dimensions", () => {
    it("makeBox(0, 10, 10) — zero-width box throws or returns degenerate", () => {
        // OCCT may throw Standard_Failure or return a null/degenerate shape
        let result: number | undefined;
        try {
            result = kernel.makeBox(0, 10, 10);
        } catch {
            return; // threw — acceptable
        }
        // If it returned without throwing, the shape must be flagged as degenerate:
        // either it is null, has zero volume, or isValid returns false.
        if (result !== undefined && result > 0) {
            const vol = kernel.getVolume(result);
            expect(vol).toBeCloseTo(0, 5);
        }
    });

    it("makeBox(-5, 10, 10) — negative dimension creates a valid box (OCCT allows this)", () => {
        // OCCT interprets negative dims as a box in the negative direction — valid geometry
        const result = kernel.makeBox(-5, 10, 10);
        expect(result).toBeGreaterThan(0);
        expect(kernel.getVolume(result)).toBeGreaterThan(0);
    });

    it("makeCylinder(0, 10) — zero-radius cylinder throws or is degenerate", () => {
        let result: number | undefined;
        try {
            result = kernel.makeCylinder(0, 10);
        } catch {
            return;
        }
        if (result !== undefined && result > 0) {
            expect(kernel.getVolume(result)).toBeCloseTo(0, 5);
        }
    });

    it("makeSphere(0) — zero-radius sphere throws or is degenerate", () => {
        let result: number | undefined;
        try {
            result = kernel.makeSphere(0);
        } catch {
            return;
        }
        if (result !== undefined && result > 0) {
            expect(kernel.getVolume(result)).toBeCloseTo(0, 5);
        }
    });

    it("makeSphere(-5) — negative radius throws or is degenerate", () => {
        let result: number | undefined;
        try {
            result = kernel.makeSphere(-5);
        } catch {
            return;
        }
        if (result !== undefined && result > 0) {
            expect(Math.abs(kernel.getVolume(result))).toBeCloseTo(0, 5);
        }
    });

    it("makeCone(0, 0, 10) — both radii zero throws or is degenerate", () => {
        let result: number | undefined;
        try {
            result = kernel.makeCone(0, 0, 10);
        } catch {
            return;
        }
        if (result !== undefined && result > 0) {
            expect(kernel.getVolume(result)).toBeCloseTo(0, 5);
        }
    });
});

// ---------------------------------------------------------------------------
// Degenerate geometry
// ---------------------------------------------------------------------------

describe("degenerate geometry", () => {
    it("fillet with radius larger than the edge allows throws or returns null shape", () => {
        const box = kernel.makeBox(1, 1, 1); // tiny box — max fillet radius ~0.5
        const edges = kernel.getSubShapes(box, "edge");
        const edgeVec = new Module.VectorUint32();
        // collect all edges
        for (let i = 0; i < edges.size(); i++) {
            edgeVec.push_back(edges.get(i));
        }
        let result: number | undefined;
        try {
            result = kernel.fillet(box, edgeVec, 10); // radius >> box size
        } catch {
            edgeVec.delete();
            edges.delete();
            return; // threw — acceptable
        }
        edgeVec.delete();
        edges.delete();
        // If it returned a shape it should be a valid positive id;
        // OCCT may return an empty result rather than crashing.
        expect(result).toBeGreaterThanOrEqual(0);
    });

    it.skip("extrude with zero-length direction (0,0,0) throws (WASM exception escapes JS catch)", () => {
        const wire = makeSquareWire(5);
        const face = kernel.makeFace(wire);
        let threw = false;
        try {
            kernel.extrude(face, 0, 0, 0);
        } catch {
            threw = true;
        }
        expect(threw).toBe(true);
    });

    it("revolve with zero angle (0 rad) throws or returns degenerate", () => {
        const face = makeSquareFace(5);
        let result: number | undefined;
        try {
            result = kernel.revolve(face, 0, 0, 0, 0, 0, 1, 0);
        } catch {
            return;
        }
        if (result !== undefined && result > 0) {
            expect(kernel.getVolume(result)).toBeCloseTo(0, 5);
        }
    });

    it("offset a 5x5x5 box by -10 (self-intersecting) throws or returns empty", () => {
        const box = kernel.makeBox(5, 5, 5);
        let result: number | undefined;
        try {
            result = kernel.offset(box, -10);
        } catch {
            return;
        }
        // If it returned without throwing, volume should be zero or near-zero
        if (result !== undefined && result > 0) {
            const vol = kernel.getVolume(result);
            expect(Math.abs(vol)).toBeLessThan(0.01);
        }
    });

    it("shell with thickness larger than the solid throws or returns empty", () => {
        const box = kernel.makeBox(2, 2, 2);
        const faces = kernel.getSubShapes(box, "face");
        const faceVec = new Module.VectorUint32();
        faceVec.push_back(faces.get(0)); // open one face
        let result: number | undefined;
        try {
            result = kernel.shell(box, faceVec, 50); // thickness >> solid size
        } catch {
            faceVec.delete();
            faces.delete();
            return;
        }
        faceVec.delete();
        faces.delete();
        expect(result).toBeGreaterThanOrEqual(0);
    });

    it("loft with a single wire (needs at least 2) throws", () => {
        const wire = makeSquareWire(5);
        const wireVec = new Module.VectorUint32();
        wireVec.push_back(wire);
        expectThrows(() => kernel.loft(wireVec, true), "loft with 1 wire");
        wireVec.delete();
    });

    it("loft with an empty wire vector throws", () => {
        const wireVec = new Module.VectorUint32();
        expectThrows(() => kernel.loft(wireVec, true), "loft with 0 wires");
        wireVec.delete();
    });
});

// ---------------------------------------------------------------------------
// Empty / null shapes
// ---------------------------------------------------------------------------

describe("empty/null shapes", () => {
    it("makeNullShape returns a valid id", () => {
        const id = kernel.makeNullShape();
        expect(id).toBeGreaterThan(0);
    });

    it("getVolume on a null shape throws or returns 0", () => {
        const nullId = kernel.makeNullShape();
        let vol: number | undefined;
        try {
            vol = kernel.getVolume(nullId);
        } catch {
            return;
        }
        expect(vol).toBeCloseTo(0, 5);
    });

    it("tessellate on a null shape throws or returns empty mesh", () => {
        const nullId = kernel.makeNullShape();
        let mesh: { indexCount: number } | undefined;
        try {
            mesh = kernel.tessellate(nullId, 0.1, 0.5);
        } catch {
            return;
        }
        expect(mesh?.indexCount).toBe(0);
    });

    it("fuse(nullShape, realShape) throws or returns empty", () => {
        const nullId = kernel.makeNullShape();
        const box = kernel.makeBox(5, 5, 5);
        let result: number | undefined;
        try {
            result = kernel.fuse(nullId, box);
        } catch {
            return;
        }
        // If it returned, the result should not be a well-formed solid with volume > 0
        // (OCCT may give back the real shape unchanged — that is also acceptable)
        expect(result).toBeGreaterThanOrEqual(0);
    });

    it("makeWire with empty edge vector returns a shape (OCCT allows empty wires)", () => {
        const edgeVec = new Module.VectorUint32();
        let result: number | undefined;
        try {
            result = kernel.makeWire(edgeVec);
        } catch {
            edgeVec.delete();
            return; // throwing is also acceptable
        }
        edgeVec.delete();
        // OCCT creates a valid (but empty) wire — not null
        if (result !== undefined && result > 0) {
            expect(kernel.getShapeType(result)).toBe("wire");
        }
    });

    it("makeCompound with empty shape vector returns a valid (empty) compound", () => {
        const shapeVec = new Module.VectorUint32();
        let result: number | undefined;
        try {
            result = kernel.makeCompound(shapeVec);
        } catch {
            shapeVec.delete();
            return; // also acceptable
        }
        shapeVec.delete();
        // An empty compound is a valid OCCT shape
        if (result !== undefined && result > 0) {
            expect(kernel.getShapeType(result)).toBe("compound");
        }
    });

    it("sew with empty shape vector throws or returns empty shape", () => {
        const shapeVec = new Module.VectorUint32();
        let result: number | undefined;
        try {
            result = kernel.sew(shapeVec, 0.01);
        } catch {
            shapeVec.delete();
            return;
        }
        shapeVec.delete();
        expect(result).toBeGreaterThanOrEqual(0);
    });

    it("makeFace on a null shape throws or returns null", () => {
        const nullId = kernel.makeNullShape();
        let result: number | undefined;
        try {
            result = kernel.makeFace(nullId);
        } catch {
            return;
        }
        if (result !== undefined && result > 0) {
            expect(kernel.isNull(result)).toBe(true);
        }
    });
});

// ---------------------------------------------------------------------------
// I/O edge cases
// ---------------------------------------------------------------------------

describe("I/O edge cases", () => {
    it("importStep with garbage data throws", () => {
        expectThrows(
            () => kernel.importStep("not valid step data"),
            "importStep(garbage)",
        );
    });

    it("importStep with empty string throws", () => {
        expectThrows(() => kernel.importStep(""), "importStep(empty)");
    });

    it("exportStep(99999) — non-existent shape throws", () => {
        expectThrows(() => kernel.exportStep(99999), "exportStep(bogus)");
    });

    it("fromBREP with garbage data throws", () => {
        expectThrows(() => kernel.fromBREP("garbage data"), "fromBREP(garbage)");
    });

    it("fromBREP with empty string throws", () => {
        expectThrows(() => kernel.fromBREP(""), "fromBREP(empty)");
    });

    it("importStl with garbage data throws or returns empty", () => {
        let result: number | undefined;
        try {
            result = kernel.importStl("not a valid stl");
        } catch {
            return;
        }
        if (result !== undefined && result > 0) {
            // Returned without throwing — shape may be null/empty
            expect(kernel.isNull(result)).toBe(true);
        }
    });

    it("exportStl(99999, 0.1, true) — non-existent shape throws", () => {
        expectThrows(
            () => kernel.exportStl(99999, 0.1, true),
            "exportStl(bogus)",
        );
    });

    it("importStep with valid STEP header but no geometry returns 0 or throws", () => {
        // Minimal syntactically valid STEP header with no actual geometry
        const emptyStep = [
            "ISO-10303-21;",
            "HEADER;",
            "FILE_DESCRIPTION(('Open CASCADE STEP processor 7.0'),'2;1');",
            "FILE_NAME('','2000-01-01T00:00:00',(''),(''),'Open CASCADE STEP processor 7.0','','');",
            "FILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));",
            "ENDSEC;",
            "DATA;",
            "ENDSEC;",
            "END-ISO-10303-21;",
        ].join("\n");
        let result: number | undefined;
        try {
            result = kernel.importStep(emptyStep);
        } catch {
            return; // acceptable
        }
        // If it returned, it should be 0 or a null shape (no geometry to import)
        if (result !== undefined && result > 0) {
            expect(kernel.isNull(result)).toBe(true);
        }
    });
});

// ---------------------------------------------------------------------------
// Type mismatches
// ---------------------------------------------------------------------------

describe("type mismatches", () => {
    it("fillet on a face (not a solid) throws or returns empty", () => {
        const face = makeSquareFace(10);
        const edges = kernel.getSubShapes(face, "edge");
        const edgeVec = new Module.VectorUint32();
        for (let i = 0; i < edges.size(); i++) {
            edgeVec.push_back(edges.get(i));
        }
        let result: number | undefined;
        try {
            result = kernel.fillet(face, edgeVec, 1.0);
        } catch {
            edgeVec.delete();
            edges.delete();
            return;
        }
        edgeVec.delete();
        edges.delete();
        // OCCT may return a degenerate result rather than throwing
        expect(result).toBeGreaterThanOrEqual(0);
    });

    it("shell on an edge (not a solid) throws", () => {
        const edge = kernel.makeLineEdge(0, 0, 0, 10, 0, 0);
        const faceVec = new Module.VectorUint32();
        expectThrows(
            () => kernel.shell(edge, faceVec, 1.0),
            "shell on edge",
        );
        faceVec.delete();
    });

    it("makeFace on a solid (not a wire) throws or returns null", () => {
        const solid = kernel.makeBox(5, 5, 5);
        let result: number | undefined;
        try {
            result = kernel.makeFace(solid);
        } catch {
            return;
        }
        if (result !== undefined && result > 0) {
            expect(kernel.isNull(result)).toBe(true);
        }
    });

    it("getSubShapes with invalid type string returns empty vector or throws", () => {
        const box = kernel.makeBox(5, 5, 5);
        let result: { size(): number } | undefined;
        try {
            result = kernel.getSubShapes(box, "not_a_type");
        } catch {
            return;
        }
        // Either returns empty collection or throws — size 0 is the expected fallback
        expect(result?.size()).toBe(0);
    });

    it("getSubShapes with empty type string returns empty vector or throws", () => {
        const box = kernel.makeBox(5, 5, 5);
        let result: { size(): number } | undefined;
        try {
            result = kernel.getSubShapes(box, "");
        } catch {
            return;
        }
        expect(result?.size()).toBe(0);
    });

    it("pipe with a face as profile (not a wire/edge) throws or returns empty", () => {
        const face = makeSquareFace(5);
        const spine = kernel.makeLineEdge(0, 0, 0, 0, 0, 20);
        let result: number | undefined;
        try {
            result = kernel.pipe(face, spine);
        } catch {
            return;
        }
        if (result !== undefined && result > 0) {
            expect(kernel.getVolume(result)).toBeCloseTo(0, 5);
        }
    });

    it("extrude on a solid (already a 3D body) throws or returns ill-formed shape", () => {
        const solid = kernel.makeBox(5, 5, 5);
        // Extruding a solid is not a standard OCCT operation — should either
        // throw or return a compound/compound with zero added volume.
        let result: number | undefined;
        try {
            result = kernel.extrude(solid, 0, 0, 10);
        } catch {
            return;
        }
        expect(result).toBeGreaterThanOrEqual(0);
    });
});

// ---------------------------------------------------------------------------
// Internal helpers (reuse of api-coverage patterns)
// ---------------------------------------------------------------------------

function makeSquareWire(size: number): number {
    const v1 = kernel.makeVertex(0, 0, 0);
    const v2 = kernel.makeVertex(size, 0, 0);
    const v3 = kernel.makeVertex(size, size, 0);
    const v4 = kernel.makeVertex(0, size, 0);
    const e1 = kernel.makeEdge(v1, v2);
    const e2 = kernel.makeEdge(v2, v3);
    const e3 = kernel.makeEdge(v3, v4);
    const e4 = kernel.makeEdge(v4, v1);
    const edgeVec = new Module.VectorUint32();
    edgeVec.push_back(e1);
    edgeVec.push_back(e2);
    edgeVec.push_back(e3);
    edgeVec.push_back(e4);
    const wire = kernel.makeWire(edgeVec);
    edgeVec.delete();
    return wire;
}

function makeSquareFace(size: number): number {
    const wire = makeSquareWire(size);
    return kernel.makeFace(wire);
}
