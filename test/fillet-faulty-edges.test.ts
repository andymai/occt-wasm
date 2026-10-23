/**
 * A fillet or chamfer OCCT cannot build names the edges that failed, so a
 * caller does not have to retry edge by edge to find them. On a 20x20x2 plate
 * a 3 mm round fits a vertical corner edge (its side faces are 20 wide) but
 * not a top edge (its side face is only 2 tall).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { OcctKernel, OcctError, type OcctModuleFactory, type ShapeHandle } from "../ts/src/index.ts";

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

function plateEdges() {
    const plate = kernel.makeBox(20, 20, 2);
    const edges = kernel.getSubShapes(plate, "edge");
    const span = (edge: ShapeHandle) => {
        const box = kernel.getBoundingBox(edge);
        return { dz: box.zmax - box.zmin, z: box.zmin };
    };
    const vertical = edges.find((e) => span(e).dz > 1);
    const top = edges.find((e) => span(e).dz < 1e-6 && Math.abs(span(e).z - 2) < 1e-6);
    if (vertical === undefined || top === undefined) throw new Error("plate edges not found");
    return { plate, vertical, top };
}

function failure(run: () => unknown): OcctError {
    try {
        run();
    } catch (e) {
        if (e instanceof OcctError) return e;
        throw e;
    }
    throw new Error("expected the operation to fail");
}

describe("fillet and chamfer name their faulty edges", () => {
    it("fillet reports only the edge whose contour failed", () => {
        const { plate, vertical, top } = plateEdges();
        expect(() => kernel.fillet(plate, [vertical], 3)).not.toThrow();

        const error = failure(() => kernel.fillet(plate, [vertical, top], 3));
        expect(error.faultyEdges).toEqual([top]);
        expect(error.message).toContain(`[faulty edges: ${top}]`);
    });

    it("filletWithHistory carries the same report", () => {
        const { plate, vertical, top } = plateEdges();
        const error = failure(() => kernel.filletWithHistory(plate, [vertical, top], 3, [], 2147483647));
        expect(error.faultyEdges).toEqual([top]);
    });

    it("chamfer reports the edge whose contour failed", () => {
        const { plate, vertical, top } = plateEdges();
        const error = failure(() => kernel.chamfer(plate, [vertical, top], 3));
        expect(error.faultyEdges).toEqual([top]);
    });

    it("leaves faultyEdges undefined for errors that name none", () => {
        expect(new OcctError("fillet", "operation failed").faultyEdges).toBeUndefined();
        expect(new OcctError("fillet", "operation failed [faulty edges: 4,9]").faultyEdges).toEqual([4, 9]);
    });
});

describe("makeEllipseArc xDir", () => {
    const start = (edge: ShapeHandle) =>
        kernel.getSubShapes(edge, "vertex").map((v) => kernel.vertexPosition(v));
    const near = (p: { x: number; y: number; z: number }, x: number, y: number) =>
        Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6 && Math.abs(p.z) < 1e-6;
    const origin = { x: 0, y: 0, z: 0 };
    const up = { x: 0, y: 0, z: 1 };

    it("lays the major axis along xDir", () => {
        const arc = kernel.makeEllipseArc(origin, up, 4, 2, 0, Math.PI / 2, { x: 0, y: 1, z: 0 });
        const ends = start(arc);
        // Parameter 0 sits on +major (along xDir = +Y); PI/2 on +minor (normal x xDir = -X).
        expect(ends.some((p) => near(p, 0, 4))).toBe(true);
        expect(ends.some((p) => near(p, -2, 0))).toBe(true);
    });

    it("keeps OCCT's default axis without xDir", () => {
        const arc = kernel.makeEllipseArc(origin, up, 4, 2, 0, Math.PI / 2);
        expect(start(arc).some((p) => near(p, 4, 0))).toBe(true);
    });

    it("rejects an xDir parallel to the normal", () => {
        expect(() => kernel.makeEllipseArc(origin, up, 4, 2, 0, 1, { x: 0, y: 0, z: 2 })).toThrow(OcctError);
    });
});
