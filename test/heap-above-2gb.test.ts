/**
 * The heap may grow to 4 GB. Every address that crosses to JavaScript has to
 * stay unsigned: past 2 GB an int address reads back negative, and a typed-array
 * view or slice at a negative offset throws or reads the wrong bytes.
 *
 * The test fills the heap below 2 GB, so what the kernel allocates afterwards
 * lands above it, then runs a boolean, tessellation and the bulk vector paths.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { BooleanOp, OcctKernel, type OcctModuleFactory, type ShapeHandle } from "../ts/src/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");

const TWO_GB = 2 ** 31;

let kernel: OcctKernel;
const filler: number[] = [];

/**
 * Allocate blocks of each size until one lands above 2 GB, largest first, so the
 * holes a larger size leaves below 2 GB are taken by the next smaller one.
 */
function fillBelowTwoGb(): void {
    const raw = kernel.getRawKernel();
    for (const size of [256 << 20, 16 << 20, 1 << 20, 64 << 10, 4 << 10]) {
        for (;;) {
            const ptr = raw.allocBytes(size);
            expect(ptr).toBeGreaterThan(0);
            filler.push(ptr);
            if (ptr >= TWO_GB) break;
        }
    }
}

beforeAll(async () => {
    const createModule = ((await import(jsPath)) as { default: OcctModuleFactory }).default;
    kernel = await OcctKernel.init({ createModule, wasm: wasmPath });
    fillBelowTwoGb();
}, 120_000);

afterAll(() => {
    const raw = kernel?.getRawKernel();
    for (const ptr of filler) raw?.freeBytes(ptr);
    kernel?.[Symbol.dispose]();
});

/** A box with a grid of cylinders standing on it: many faces and edges. */
function pegBoard(): { base: ShapeHandle; pegs: ShapeHandle[] } {
    const base = kernel.makeBox(100, 100, 10);
    const pegs: ShapeHandle[] = [];
    for (let i = 0; i < 9; i++) {
        for (let j = 0; j < 9; j++) {
            pegs.push(kernel.translate(kernel.makeCylinder(3, 20), 6 + i * 11, 6 + j * 11, 5));
        }
    }
    return { base, pegs };
}

describe("heap above 2 GB", () => {
    it("allocates above 2 GB and reads the address back unsigned", () => {
        const raw = kernel.getRawKernel();
        const ptr = raw.allocBytes(64);
        try {
            expect(ptr).toBeGreaterThanOrEqual(TWO_GB);
            const heap = new Uint8Array(kernel.getRawModule().HEAPU32.buffer);
            expect(heap.byteLength).toBeGreaterThan(TWO_GB);
            heap.set([1, 2, 3], ptr);
            expect(Array.from(heap.subarray(ptr, ptr + 3))).toEqual([1, 2, 3]);
        } finally {
            raw.freeBytes(ptr);
        }
    });

    it("runs a boolean with history through the bulk vector paths", () => {
        const { base, pegs } = pegBoard();
        const tool = kernel.makeCompound(pegs);
        const hashes = kernel.subShapeHashes(base, "face", 1 << 30);
        // 81 tools and over 64 face hashes go through the bulk copy into the heap.
        const padded = [...hashes, ...kernel.subShapeHashes(tool, "face", 1 << 30)];
        expect(padded.length).toBeGreaterThan(64);
        const evo = kernel.booleanOp(BooleanOp.Fuse, [base], pegs, {
            inputFaceHashes: padded,
            hashUpperBound: 1 << 30,
        });
        expect(kernel.isValid(evo.result)).toBe(true);
        expect(kernel.getVolume(evo.result)).toBeCloseTo(100 * 100 * 10 + 81 * Math.PI * 9 * 15, 0);
        // Over 64 faces and edges come back through the bulk read of a vector.
        const faces = kernel.getSubShapes(evo.result, "face");
        expect(faces.length).toBe(6 + 81 * 2);
        expect(kernel.subShapeHashes(evo.result, "edge", 1 << 30).length).toBeGreaterThan(64);
        expect(evo.generated.length + evo.modified.length).toBeGreaterThan(0);
    });

    it("tessellates, reads edges and meshes a batch above 2 GB", () => {
        const { base, pegs } = pegBoard();
        const solid = kernel.fuseAll([base, ...pegs]);

        const rawMesh = kernel.getRawKernel().meshShape(solid, 0.1, 0.5);
        try {
            expect(rawMesh.getPositionsPtr()).toBeGreaterThanOrEqual(TWO_GB);
            expect(rawMesh.getIndicesPtr()).toBeGreaterThanOrEqual(TWO_GB);
        } finally {
            rawMesh.delete();
        }

        const mesh = kernel.meshShape(solid, { linearDeflection: 0.1 });
        expect(mesh.triangleCount).toBeGreaterThan(1000);
        expect(mesh.faceCount).toBe(6 + 81 * 2);
        for (const i of mesh.indices) expect(i).toBeLessThan(mesh.vertexCount);
        let maxZ = -Infinity;
        for (let i = 2; i < mesh.positions.length; i += 3) maxZ = Math.max(maxZ, mesh.positions[i]!);
        expect(maxZ).toBeCloseTo(25, 3);

        const edges = kernel.wireframe(solid, 0.1);
        expect(edges.edgeCount).toBeGreaterThan(64);
        expect(edges.points.every((v) => Number.isFinite(v) && Math.abs(v) <= 110)).toBe(true);

        // 82 shapes go through the bulk id copy, and the batch reader.
        const batch = kernel.meshBatch([base, ...pegs]);
        expect(batch.shapeCount).toBe(82);
        expect(batch.triangleCount).toBeGreaterThan(1000);

        const stl = kernel.exportStl(solid, 0.1);
        expect(stl.length).toBe(84 + 50 * new DataView(stl.buffer, stl.byteOffset).getUint32(80, true));
    });
});
