import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { resolve } from "node:path";

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

afterEach(() => { kernel.releaseAll(); });
afterAll(() => { if (kernel) { kernel.releaseAll(); kernel.delete(); } });

describe("queryBatch", () => {
    it("returns volume, area, bbox, centerOfMass, shapeType, and isValid for multiple shapes", () => {
        const box = kernel.makeBox(10, 20, 30);
        const sphere = kernel.makeSphere(5);

        const ids = new Module.VectorUint32();
        ids.push_back(box);
        ids.push_back(sphere);

        const result = kernel.queryBatch(ids);
        ids.delete();

        const STRIDE = 14;
        expect(result.size()).toBe(2 * STRIDE);

        // Box: volume = 10*20*30 = 6000
        const boxVolume = result.get(0);
        expect(boxVolume).toBeCloseTo(6000, 0);

        // Box: area = 2*(10*20 + 10*30 + 20*30) = 2200
        const boxArea = result.get(1);
        expect(boxArea).toBeCloseTo(2200, 0);

        // Box: shapeType index = 2 (TopAbs_SOLID)
        expect(result.get(11)).toBe(2);

        // Box: isValid = 1.0
        expect(result.get(12)).toBe(1.0);

        // Sphere: volume = 4/3 * pi * 5^3 ~= 523.6
        const sphereVolume = result.get(STRIDE + 0);
        expect(sphereVolume).toBeCloseTo(523.6, 0);

        // Sphere: shapeType index = 2 (TopAbs_SOLID)
        expect(result.get(STRIDE + 11)).toBe(2);

        // Sphere: isValid
        expect(result.get(STRIDE + 12)).toBe(1.0);

        result.delete();
    });

    it("returns empty result for empty input", () => {
        const ids = new Module.VectorUint32();
        const result = kernel.queryBatch(ids);
        ids.delete();
        expect(result.size()).toBe(0);
        result.delete();
    });
});

describe("filletBatch", () => {
    it("fillets a box with the first 2 edges", () => {
        const box = kernel.makeBox(10, 10, 10);
        const edges = kernel.getSubShapes(box, "edge");
        expect(edges.size()).toBeGreaterThanOrEqual(2);

        const solidIds = new Module.VectorUint32();
        solidIds.push_back(box);

        const edgeCounts = new Module.VectorInt();
        edgeCounts.push_back(2);

        const flatEdgeIds = new Module.VectorUint32();
        flatEdgeIds.push_back(edges.get(0));
        flatEdgeIds.push_back(edges.get(1));

        const radii = new Module.VectorDouble();
        radii.push_back(1.0);

        const result = kernel.filletBatch(solidIds, edgeCounts, flatEdgeIds, radii);

        expect(result.size()).toBe(1);
        const filletedId = result.get(0);
        expect(filletedId).toBeGreaterThan(0);

        // Verify it produced a valid shape (fillet may yield solid or compound)
        const type = kernel.getShapeType(filletedId);
        expect(["solid", "compound"]).toContain(type);

        solidIds.delete();
        edgeCounts.delete();
        flatEdgeIds.delete();
        radii.delete();
        result.delete();
        edges.delete();
    });
});

describe("transformBatch", () => {
    it("transforms 3 boxes with identity-ish matrices (translate by 1,0,0)", () => {
        const b1 = kernel.makeBox(5, 5, 5);
        const b2 = kernel.makeBox(5, 5, 5);
        const b3 = kernel.makeBox(5, 5, 5);

        const ids = new Module.VectorUint32();
        ids.push_back(b1);
        ids.push_back(b2);
        ids.push_back(b3);

        // 3x4 row-major affine matrix: translate by (1,0,0)
        // [1 0 0 1]
        // [0 1 0 0]
        // [0 0 1 0]
        const matrices = new Module.VectorDouble();
        const mat = [1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0];
        for (let i = 0; i < 3; i++) {
            for (const v of mat) matrices.push_back(v);
        }

        const result = kernel.transformBatch(ids, matrices);
        expect(result.size()).toBe(3);

        for (let i = 0; i < 3; i++) {
            const shapeId = result.get(i);
            expect(shapeId).toBeGreaterThan(0);
            expect(kernel.getShapeType(shapeId)).toBe("solid");
        }

        ids.delete();
        matrices.delete();
        result.delete();
    });

    it("throws on wrong matrix length", () => {
        const b = kernel.makeBox(5, 5, 5);
        const ids = new Module.VectorUint32();
        ids.push_back(b);

        // Only 6 values instead of 12
        const matrices = new Module.VectorDouble();
        for (let i = 0; i < 6; i++) matrices.push_back(i);

        expect(() => kernel.transformBatch(ids, matrices)).toThrow();

        ids.delete();
        matrices.delete();
    });
});

describe("rotateBatch", () => {
    it("rotates a box 90 degrees around Z axis", () => {
        const box = kernel.makeBox(10, 1, 1);
        const ids = new Module.VectorUint32();
        ids.push_back(box);

        // params per shape: [px, py, pz, ax, ay, az, angle] = 7 doubles
        // rotate around Z at origin by pi/2
        const params = new Module.VectorDouble();
        const vals = [0, 0, 0, 0, 0, 1, Math.PI / 2];
        for (const v of vals) params.push_back(v);

        const result = kernel.rotateBatch(ids, params);
        expect(result.size()).toBe(1);
        const rotated = result.get(0);
        expect(kernel.getShapeType(rotated)).toBe("solid");

        ids.delete();
        params.delete();
        result.delete();
    });

    it("throws on wrong params length", () => {
        const b = kernel.makeBox(5, 5, 5);
        const ids = new Module.VectorUint32();
        ids.push_back(b);

        // Only 3 values instead of 7
        const params = new Module.VectorDouble();
        for (let i = 0; i < 3; i++) params.push_back(i);

        expect(() => kernel.rotateBatch(ids, params)).toThrow();

        ids.delete();
        params.delete();
    });
});

describe("scaleBatch", () => {
    it("scales a box by factor 2, volume becomes 8x", () => {
        const box = kernel.makeBox(10, 10, 10);
        const origVolume = kernel.getVolume(box);

        const ids = new Module.VectorUint32();
        ids.push_back(box);

        // params per shape: [cx, cy, cz, factor] = 4 doubles
        const params = new Module.VectorDouble();
        const vals = [0, 0, 0, 2];
        for (const v of vals) params.push_back(v);

        const result = kernel.scaleBatch(ids, params);
        expect(result.size()).toBe(1);
        const scaled = result.get(0);

        const scaledVolume = kernel.getVolume(scaled);
        expect(scaledVolume).toBeCloseTo(origVolume * 8, 0);

        ids.delete();
        params.delete();
        result.delete();
    });
});

describe("mirrorBatch", () => {
    it("mirrors a box across the YZ plane", () => {
        // Create a box at (5,0,0) of size (1,1,1) by translating
        const box = kernel.makeBox(1, 1, 1);
        const moved = kernel.translate(box, 5, 0, 0);

        const ids = new Module.VectorUint32();
        ids.push_back(moved);

        // params per shape: [px, py, pz, nx, ny, nz] = 6 doubles
        // mirror across YZ plane: point=(0,0,0), normal=(1,0,0)
        const params = new Module.VectorDouble();
        const vals = [0, 0, 0, 1, 0, 0];
        for (const v of vals) params.push_back(v);

        const result = kernel.mirrorBatch(ids, params);
        expect(result.size()).toBe(1);
        const mirrored = result.get(0);

        // Check the bounding box is on the negative X side
        const bbox = kernel.getBoundingBox(mirrored);
        expect(bbox.xmax).toBeLessThanOrEqual(0);
        expect(bbox.xmin).toBeCloseTo(-6, 0);

        ids.delete();
        params.delete();
        result.delete();
    });
});
