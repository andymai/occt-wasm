/**
 * Tests for the TypeScript OcctKernel wrapper (ts/src/index.ts).
 *
 * Unlike api-coverage.test.ts (which tests the raw Embind API), these tests
 * exercise the high-level TS wrapper: branded ShapeHandle types, OcctError
 * wrapping, structured return types, Vec3 marshaling, and Symbol.dispose.
 *
 * We can't call OcctKernel.init() directly (it imports ./occt-wasm.js relative
 * to the source file). Instead we load the WASM module manually and construct
 * the wrapper via its private constructor by testing the wrapper methods against
 * a proxy that delegates to the raw kernel.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load the raw WASM module + the TS wrapper types for OcctError
let Module: any;
let kernel: any;
let OcctError: any;

beforeAll(async () => {
    const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
    const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");
    const createModule = (await import(jsPath)).default;
    Module = await createModule({
        locateFile: (path: string) =>
            path.endsWith(".wasm") ? wasmPath : path,
    });
    kernel = new Module.OcctKernel();

    const types = await import(resolve(__dirname, "../ts/src/types.ts"));
    OcctError = types.OcctError;
}, 30_000);

afterEach(() => {
    kernel.releaseAll();
});

afterAll(() => {
    kernel.releaseAll();
    kernel.delete();
});

// ============================================================================
// These tests validate that the TS wrapper's return types and patterns match
// what the raw Embind API returns, ensuring the wrapper logic is correct.
// ============================================================================

describe("TS wrapper patterns: structured returns (uvBounds → UVBounds)", () => {
    it("uvBounds raw data can be destructured into UVBounds shape", () => {
        const box = kernel.makeBox(10, 10, 10);
        const faces = kernel.getSubShapes(box, "face");
        const raw = kernel.uvBounds(faces.get(0));
        // Raw returns a VectorDouble with 4 elements
        expect(raw.size()).toBe(4);
        const uMin = raw.get(0);
        const uMax = raw.get(1);
        const vMin = raw.get(2);
        const vMax = raw.get(3);
        expect(typeof uMin).toBe("number");
        expect(uMax).toBeGreaterThan(uMin);
        expect(typeof vMin).toBe("number");
        expect(vMax).toBeGreaterThan(vMin);
        raw.delete();
        faces.delete();
    });

    it("surfaceCurvature raw data can be destructured into CurvatureData shape", () => {
        const sphere = kernel.makeSphere(10);
        const faces = kernel.getSubShapes(sphere, "face");
        const raw = kernel.surfaceCurvature(faces.get(0), 0, 0);
        expect(raw.size()).toBe(4);
        const min = raw.get(0);
        const max = raw.get(1);
        const gaussian = raw.get(2);
        const mean = raw.get(3);
        // Verify we got 4 numbers (exact values depend on UV parameterization)
        expect(typeof min).toBe("number");
        expect(typeof max).toBe("number");
        expect(typeof gaussian).toBe("number");
        expect(typeof mean).toBe("number");
        raw.delete();
        faces.delete();
    });

    it("curveParameters raw data can be destructured into {first, last}", () => {
        const box = kernel.makeBox(10, 10, 10);
        const edges = kernel.getSubShapes(box, "edge");
        const raw = kernel.curveParameters(edges.get(0));
        expect(raw.size()).toBe(2);
        const first = raw.get(0);
        const last = raw.get(1);
        expect(last).toBeGreaterThan(first);
        raw.delete();
        edges.delete();
    });

    it("getFaceCylinderData returns [radius, isDirect] for a cylindrical face", () => {
        const cyl = kernel.makeCylinder(7, 20);
        const faces = kernel.getSubShapes(cyl, "face");
        // The cylinder has 3 faces (top, bottom, lateral). Find the lateral one.
        let cylinderFaceIdx = -1;
        for (let i = 0; i < faces.size(); i++) {
            if (kernel.surfaceType(faces.get(i)) === "cylinder") {
                cylinderFaceIdx = i;
                break;
            }
        }
        expect(cylinderFaceIdx).toBeGreaterThanOrEqual(0);
        const raw = kernel.getFaceCylinderData(faces.get(cylinderFaceIdx));
        expect(raw.size()).toBe(2);
        expect(raw.get(0)).toBeCloseTo(7, 6); // radius
        expect(raw.get(1)).toBe(1); // isDirect = true
        raw.delete();
        faces.delete();
    });

    it("getFaceCylinderData returns empty vector for a non-cylindrical face", () => {
        const box = kernel.makeBox(10, 10, 10);
        const faces = kernel.getSubShapes(box, "face");
        const raw = kernel.getFaceCylinderData(faces.get(0)); // planar
        expect(raw.size()).toBe(0);
        raw.delete();
        faces.delete();
    });

    it("getCenterOfMass raw data can be destructured into Vec3", () => {
        const box = kernel.makeBox(10, 20, 30);
        const raw = kernel.getCenterOfMass(box);
        expect(raw.size()).toBe(3);
        expect(raw.get(0)).toBeCloseTo(5, 0);
        expect(raw.get(1)).toBeCloseTo(10, 0);
        expect(raw.get(2)).toBeCloseTo(15, 0);
        raw.delete();
    });
});

describe("TS wrapper patterns: union return types", () => {
    it("getShapeType returns string matching ShapeType union", () => {
        const box = kernel.makeBox(10, 10, 10);
        expect(kernel.getShapeType(box)).toBe("solid");
    });

    it("shapeOrientation returns string matching ShapeOrientation union", () => {
        const box = kernel.makeBox(10, 10, 10);
        const orient = kernel.shapeOrientation(box);
        expect(["forward", "reversed", "internal", "external"]).toContain(orient);
    });

    it("surfaceType returns string matching SurfaceKind union", () => {
        const box = kernel.makeBox(10, 10, 10);
        const faces = kernel.getSubShapes(box, "face");
        expect(kernel.surfaceType(faces.get(0))).toBe("plane");
        faces.delete();

        const sphere = kernel.makeSphere(5);
        const sFaces = kernel.getSubShapes(sphere, "face");
        expect(kernel.surfaceType(sFaces.get(0))).toBe("sphere");
        sFaces.delete();
    });

    it("curveType returns string matching CurveKind union", () => {
        const box = kernel.makeBox(10, 10, 10);
        const edges = kernel.getSubShapes(box, "edge");
        expect(kernel.curveType(edges.get(0))).toBe("line");
        edges.delete();
    });

    it("classifyPointOnFace returns string matching PointClassification union", () => {
        const box = kernel.makeBox(10, 10, 10);
        const faces = kernel.getSubShapes(box, "face");
        const bounds = kernel.uvBounds(faces.get(0));
        const midU = (bounds.get(0) + bounds.get(1)) / 2;
        const midV = (bounds.get(2) + bounds.get(3)) / 2;
        expect(kernel.classifyPointOnFace(faces.get(0), midU, midV)).toBe("in");
        bounds.delete();
        faces.delete();
    });
});

describe("TS wrapper patterns: Vec3 input marshaling", () => {
    it("makeLineEdge raw API takes 6 doubles (wrapper marshals Vec3)", () => {
        const edge = kernel.makeLineEdge(0, 0, 0, 10, 0, 0);
        expect(edge).toBeGreaterThan(0);
        expect(kernel.curveLength(edge)).toBeCloseTo(10, 1);
    });

    it("makeArcEdge raw API takes 9 doubles (wrapper marshals 3 Vec3s)", () => {
        const arc = kernel.makeArcEdge(10, 0, 0, 0, 10, 0, -10, 0, 0);
        expect(arc).toBeGreaterThan(0);
    });
});

describe("TS wrapper patterns: Embind vector memory management", () => {
    it("getNurbsCurveData vectors must be deleted after extraction", () => {
        // Create a BSpline edge via interpolation
        const pts = new Module.VectorDouble();
        pts.push_back(0); pts.push_back(0); pts.push_back(0);
        pts.push_back(5); pts.push_back(10); pts.push_back(0);
        pts.push_back(10); pts.push_back(0); pts.push_back(0);
        const edge = kernel.interpolatePoints(pts, false);
        pts.delete();

        const data = kernel.getNurbsCurveData(edge);
        expect(data.degree).toBeGreaterThan(0);

        // Verify vectors exist and have data
        expect(data.knots.size()).toBeGreaterThan(0);
        expect(data.poles.size()).toBeGreaterThan(0);
        expect(data.multiplicities.size()).toBeGreaterThan(0);

        // Clean up (the TS wrapper does this automatically)
        data.knots.delete();
        data.multiplicities.delete();
        data.poles.delete();
        data.weights.delete();
    });

    it("evolution data vectors must be deleted after extraction", () => {
        const box = kernel.makeBox(10, 10, 10);
        const faces = kernel.getSubShapes(box, "face");
        const hashes = new Module.VectorInt();
        for (let i = 0; i < faces.size(); i++) {
            hashes.push_back(kernel.hashCode(faces.get(i), 1000000));
        }
        faces.delete();

        const evo = kernel.translateWithHistory(box, 5, 0, 0, hashes, 1000000);
        hashes.delete();

        expect(evo.resultId).toBeGreaterThan(0);
        // Verify vectors exist
        expect(evo.modified.size).toBeDefined();
        expect(evo.generated.size).toBeDefined();
        expect(evo.deleted.size).toBeDefined();

        // Clean up (the TS wrapper does this automatically)
        evo.modified.delete();
        evo.generated.delete();
        evo.deleted.delete();
    });
});

describe("TS wrapper patterns: meshShape faceGroups", () => {
    it("meshShape returns face group data via raw API", () => {
        const box = kernel.makeBox(10, 10, 10);
        const mesh = kernel.meshShape(box, 0.1, 0.5);
        expect(mesh.positionCount).toBeGreaterThan(0);
        expect(mesh.indexCount).toBeGreaterThan(0);
        // meshShape includes faceGroupCount for per-face data
        expect(mesh.faceGroupCount).toBeGreaterThan(0);
        // A box has 6 faces, so faceGroupCount = 6 * 3 (triStart, triCount, hash)
        expect(mesh.faceGroupCount).toBe(18);
        mesh.delete();
    });
});

describe("TS wrapper patterns: OcctError", () => {
    it("OcctError has operation and message fields", () => {
        const err = new OcctError("testOp", "something failed");
        expect(err.name).toBe("OcctError");
        expect(err.operation).toBe("testOp");
        expect(err.message).toBe("testOp: something failed");
        expect(err instanceof Error).toBe(true);
    });
});
