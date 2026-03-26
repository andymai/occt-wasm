import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load the Emscripten-generated module
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Module: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let kernel: any;

beforeAll(async () => {
    // Import the ES module factory
    const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");
    const jsPath = resolve(__dirname, "../dist/occt-wasm.js");

    // Dynamic import of the Emscripten module
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

describe("OcctKernel", () => {
    describe("primitives", () => {
        it("creates a box", () => {
            const id = kernel.makeBox(10, 20, 30);
            expect(id).toBeGreaterThan(0);
            expect(kernel.getShapeCount()).toBe(1);
            kernel.release(id);
            expect(kernel.getShapeCount()).toBe(0);
        });

        it("creates a cylinder", () => {
            const id = kernel.makeCylinder(5, 40);
            expect(id).toBeGreaterThan(0);
            kernel.release(id);
        });

        it("creates a sphere", () => {
            const id = kernel.makeSphere(15);
            expect(id).toBeGreaterThan(0);
            kernel.release(id);
        });

        it("creates a cone", () => {
            const id = kernel.makeCone(10, 5, 20);
            expect(id).toBeGreaterThan(0);
            kernel.release(id);
        });

        it("creates a torus", () => {
            const id = kernel.makeTorus(20, 5);
            expect(id).toBeGreaterThan(0);
            kernel.release(id);
        });
    });

    describe("booleans", () => {
        it("fuses two boxes", () => {
            const a = kernel.makeBox(10, 10, 10);
            const b = kernel.makeBox(5, 5, 5);
            const fused = kernel.fuse(a, b);
            expect(fused).toBeGreaterThan(0);
            // Original shapes still valid (arena holds shared refs)
            expect(kernel.getShapeCount()).toBe(3);
            kernel.release(a);
            kernel.release(b);
            kernel.release(fused);
        });

        it("cuts a cylinder from a box", () => {
            const box = kernel.makeBox(20, 20, 20);
            const cyl = kernel.makeCylinder(5, 30);
            const result = kernel.cut(box, cyl);
            expect(result).toBeGreaterThan(0);
            kernel.release(box);
            kernel.release(cyl);
            kernel.release(result);
        });

        it("intersects two boxes", () => {
            const a = kernel.makeBox(10, 10, 10);
            const b = kernel.makeBox(5, 5, 5);
            const result = kernel.common(a, b);
            expect(result).toBeGreaterThan(0);
            kernel.release(a);
            kernel.release(b);
            kernel.release(result);
        });
    });

    describe("tessellation", () => {
        it("tessellates a box into triangles", () => {
            const box = kernel.makeBox(10, 20, 30);
            const mesh = kernel.tessellate(box, 0.1, 0.5);

            expect(mesh.positionCount).toBeGreaterThan(0);
            expect(mesh.normalCount).toBeGreaterThan(0);
            expect(mesh.indexCount).toBeGreaterThan(0);

            // Positions should be 3x vertex count
            expect(mesh.positionCount % 3).toBe(0);
            // Indices should be 3x triangle count
            expect(mesh.indexCount % 3).toBe(0);

            const vertexCount = mesh.positionCount / 3;
            const triCount = mesh.indexCount / 3;
            // A box has 8 vertices (but triangulation may duplicate)
            expect(vertexCount).toBeGreaterThanOrEqual(8);
            // A box has 12 triangles (2 per face * 6 faces)
            expect(triCount).toBe(12);

            // Read positions from WASM heap
            const posPtr = mesh.getPositionsPtr();
            const positions = new Float32Array(
                Module.HEAPF32.buffer,
                posPtr,
                mesh.positionCount,
            );
            // All coordinates should be finite
            for (let i = 0; i < positions.length; i++) {
                expect(Number.isFinite(positions[i])).toBe(true);
            }

            mesh.delete();
            kernel.release(box);
        });

        it("tessellates a sphere", () => {
            const sphere = kernel.makeSphere(10);
            const mesh = kernel.tessellate(sphere, 1.0, 0.5);

            expect(mesh.positionCount).toBeGreaterThan(0);
            expect(mesh.indexCount).toBeGreaterThan(0);

            mesh.delete();
            kernel.release(sphere);
        });
    });

    describe("query", () => {
        it("computes bounding box of a box", () => {
            const box = kernel.makeBox(10, 20, 30);
            const bbox = kernel.getBoundingBox(box);

            expect(bbox.xmin).toBeCloseTo(0, 5);
            expect(bbox.ymin).toBeCloseTo(0, 5);
            expect(bbox.zmin).toBeCloseTo(0, 5);
            expect(bbox.xmax).toBeCloseTo(10, 5);
            expect(bbox.ymax).toBeCloseTo(20, 5);
            expect(bbox.zmax).toBeCloseTo(30, 5);

            kernel.release(box);
        });

        it("computes volume of a box", () => {
            const box = kernel.makeBox(10, 20, 30);
            const volume = kernel.getVolume(box);
            expect(volume).toBeCloseTo(6000, 0); // 10 * 20 * 30
            kernel.release(box);
        });

        it("computes surface area of a box", () => {
            const box = kernel.makeBox(10, 20, 30);
            const area = kernel.getSurfaceArea(box);
            // 2 * (10*20 + 10*30 + 20*30) = 2 * (200 + 300 + 600) = 2200
            expect(area).toBeCloseTo(2200, 0);
            kernel.release(box);
        });
    });

    describe("STEP I/O", () => {
        it("exports and re-imports a box via STEP", () => {
            const box = kernel.makeBox(10, 20, 30);
            const stepData = kernel.exportStep(box);

            expect(stepData).toContain("ISO-10303-21");
            expect(stepData.length).toBeGreaterThan(100);

            const imported = kernel.importStep(stepData);
            expect(imported).toBeGreaterThan(0);

            // Volume should match
            const origVol = kernel.getVolume(box);
            const importedVol = kernel.getVolume(imported);
            expect(importedVol).toBeCloseTo(origVol, 1);

            kernel.release(box);
            kernel.release(imported);
        });
    });

    describe("arena", () => {
        it("tracks shape count", () => {
            const initial = kernel.getShapeCount();
            const a = kernel.makeBox(1, 1, 1);
            const b = kernel.makeBox(2, 2, 2);
            expect(kernel.getShapeCount()).toBe(initial + 2);
            kernel.release(a);
            expect(kernel.getShapeCount()).toBe(initial + 1);
            kernel.release(b);
            expect(kernel.getShapeCount()).toBe(initial);
        });

        it("releaseAll clears everything", () => {
            kernel.makeBox(1, 1, 1);
            kernel.makeBox(2, 2, 2);
            kernel.makeBox(3, 3, 3);
            expect(kernel.getShapeCount()).toBeGreaterThan(0);
            kernel.releaseAll();
            expect(kernel.getShapeCount()).toBe(0);
        });
    });
});
