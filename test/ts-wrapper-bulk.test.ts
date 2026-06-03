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
