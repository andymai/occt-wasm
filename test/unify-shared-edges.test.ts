/**
 * unifySameDomain must leave its input alone. A fuse result shares the faces
 * and edges the fuse did not touch with its operands, so a change written into
 * them reaches every shape that shares them (#462).
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { BooleanOp, OcctKernel, type OcctModuleFactory, type ShapeHandle } from "../ts/src/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");

let kernel: OcctKernel;

beforeAll(async () => {
    const createModule = ((await import(jsPath)) as { default: OcctModuleFactory }).default;
    kernel = await OcctKernel.init({ createModule, wasm: wasmPath });
}, 30_000);

afterAll(() => {
    kernel?.[Symbol.dispose]();
});

const BOUND = 1 << 30;
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6;

function verticalEdge(shape: ShapeHandle): ShapeHandle {
    for (const edge of kernel.getSubShapes(shape, "edge")) {
        const [a, b] = kernel.getSubShapes(edge, "vertex").map((v) => kernel.vertexPosition(v));
        if (a && b && near(a.x, b.x) && near(a.y, b.y) && !near(a.z, b.z)) return edge;
    }
    throw new Error("no vertical edge");
}

function topFace(solid: ShapeHandle): ShapeHandle {
    for (const face of kernel.getSubShapes(solid, "face")) {
        if (kernel.getBoundingBox(face).zmin < 9.999) continue;
        const uv = kernel.uvBounds(face);
        if (kernel.surfaceNormal(face, (uv.uMin + uv.uMax) / 2, (uv.vMin + uv.vMax) / 2).z > 0.9) return face;
    }
    throw new Error("no top face");
}

describe("unifySameDomain on a shape that shares edges with another", () => {
    // A filleted box, and a fuse of it with a boss on its whole top face: the
    // fuse keeps the box's side faces, so it shares their edges with the box.
    function setup() {
        const box = kernel.makeBox(20, 20, 10);
        const base = kernel.fillet(box, [verticalEdge(box)], 2);
        const top = topFace(base);
        const fused = kernel.fuse(base, kernel.extrude(top, 0, 0, 5));
        return { base, top, fused };
    }

    const merges: [string, (fused: ShapeHandle) => ShapeHandle][] = [
        ["unifySameDomain", (fused) => kernel.unifySameDomain(fused)],
        ["simplify", (fused) => kernel.simplify(fused)],
        ["unifySameDomainWithHistory", (fused) => kernel.unifySameDomainWithHistory(fused, [], BOUND).result],
    ];

    it.each(merges)("%s leaves a later fuse of the base valid", (_, merge) => {
        const { base, top, fused } = setup();
        const merged = merge(fused);
        expect(kernel.isValid(merged)).toBe(true);
        expect(kernel.getSubShapes(merged, "face")).toHaveLength(7);
        const again = kernel.fuse(base, kernel.extrude(top, 0, 0, 3));
        expect(kernel.isValid(again)).toBe(true);
        expect(kernel.getVolume(again)).toBeCloseTo(kernel.getVolume(base) + 3 * kernel.getSurfaceArea(top), 6);
    });

    it("booleanPipeline's merge leaves a later fuse of the base valid", () => {
        const { base, top } = setup();
        const piped = kernel.booleanPipeline(base, [0], [kernel.extrude(top, 0, 0, 5)]);
        expect(kernel.getSubShapes(piped, "face")).toHaveLength(7);
        expect(kernel.isValid(kernel.fuse(base, kernel.extrude(top, 0, 0, 3)))).toBe(true);
    });

    it("booleanOp's simplify leaves a later fuse of the base valid, and reports the merged faces", () => {
        const { base, top } = setup();
        const hashes = kernel.getSubShapes(base, "face").map((f) => kernel.hashCode(f, BOUND));
        const evo = kernel.booleanOp(BooleanOp.Fuse, [base], [kernel.extrude(top, 0, 0, 5)], {
            simplifyAngularTolerance: 1e-6,
            inputFaceHashes: hashes,
            hashUpperBound: BOUND,
        });
        expect(kernel.getSubShapes(evo.result, "face")).toHaveLength(7);
        const resultHashes = new Set(kernel.getSubShapes(evo.result, "face").map((f) => kernel.hashCode(f, BOUND)));
        // Each side face became a taller face of the result: none is lost.
        for (let i = 0; i < evo.modified.length; i += 2 + evo.modified[i + 1]!) {
            for (const h of evo.modified.slice(i + 2, i + 2 + evo.modified[i + 1]!)) expect(resultHashes.has(h)).toBe(true);
        }
        expect(evo.modified.length).toBeGreaterThan(0);
        expect(kernel.isValid(kernel.fuse(base, kernel.extrude(top, 0, 0, 3)))).toBe(true);
    });

    // A merge that changes something hands back a copy, so even the faces it did
    // not touch get new hashes, and the history must name each one.
    const bottomFace = (shape: ShapeHandle) =>
        kernel.getSubShapes(shape, "face").find((f) => kernel.getBoundingBox(f).zmax < 1e-6)!;
    const decode = (runs: number[]) => {
        const out = new Map<number, number[]>();
        for (let i = 0; i < runs.length; i += 2 + runs[i + 1]!) out.set(runs[i]!, runs.slice(i + 2, i + 2 + runs[i + 1]!));
        return out;
    };

    it("unifySameDomainWithHistory follows a face it did not touch to its copy", () => {
        const { fused } = setup();
        const bottom = kernel.hashCode(bottomFace(fused), BOUND);
        const evo = kernel.unifySameDomainWithHistory(fused, [bottom], BOUND);
        expect(decode(evo.modified).get(bottom)).toEqual([kernel.hashCode(bottomFace(evo.result), BOUND)]);
    });

    it("booleanOp's simplify follows a face it did not touch to its copy", () => {
        const { base, top } = setup();
        const bottom = kernel.hashCode(bottomFace(base), BOUND);
        const evo = kernel.booleanOp(BooleanOp.Fuse, [base], [kernel.extrude(top, 0, 0, 5)], {
            simplifyAngularTolerance: 1e-6,
            inputFaceHashes: [bottom],
            hashUpperBound: BOUND,
        });
        expect(decode(evo.modified).get(bottom)).toEqual([kernel.hashCode(bottomFace(evo.result), BOUND)]);
    });
});
