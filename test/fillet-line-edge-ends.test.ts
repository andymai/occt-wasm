/**
 * A herringbone gear of ruled lofts between helices, mirrored at half its
 * height. Each straight edge where the halves meet is a line, and so is the
 * short edge at its foot. A fillet on it must end on that foot edge, not on
 * the infinite line beyond it, where the faces of the loft end.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { OcctKernel, type OcctModuleFactory, type ShapeHandle, type Vec3 } from "../ts/src/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");

let kernel: OcctKernel;

beforeAll(async () => {
    const createModule = ((await import(jsPath)) as { default: OcctModuleFactory }).default;
    kernel = await OcctKernel.init({ createModule, wasm: wasmPath });
}, 30_000);

afterEach(() => kernel.releaseAll());
afterAll(() => {
    kernel?.[Symbol.dispose]();
});

const p = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const RISE = 3;
const TWIST = -Math.PI / 16;
const AXIS = { point: p(0, 0, 0), direction: p(0, 0, 1) };

function gear(): ShapeHandle {
    const corners = Array.from({ length: 12 }, (_, k) => -Math.PI + Math.PI / 120 + (k * Math.PI) / 6).flatMap(
        (start) =>
            (
                [
                    [12.5, 0],
                    [15, 0.03 * Math.PI],
                    [15, 0.12 * Math.PI],
                    [12.5, 0.15 * Math.PI],
                ] as const
            ).map(([r, a]) => ({ r, a: start + a })),
    );
    const pitch = (2 * Math.PI * RISE) / Math.abs(TWIST);
    const rails = corners.map(({ r, a }) =>
        kernel.rotate(kernel.makeHelixWireHanded(AXIS.point, AXIS.direction, pitch, RISE, r, TWIST < 0), AXIS, a),
    );
    const lower = rails.flatMap((rail, i) =>
        kernel.getSubShapes(kernel.loft([rail, rails[(i + 1) % rails.length]!], false, true), "face"),
    );
    const upper = lower.map((face) => kernel.mirror(face, p(0, 0, RISE), p(0, 0, 1)));
    const cap = (z: number): ShapeHandle => {
        const points = corners.map(({ r, a }) => p(r * Math.cos(a), r * Math.sin(a), z));
        return kernel.makeFace(
            kernel.makeWire(points.map((q, i) => kernel.makeLineEdge(q, points[(i + 1) % points.length]!))),
        );
    };
    const shell = kernel.getSubShapes(kernel.sew([...lower, ...upper, cap(0), cap(2 * RISE)], 1e-5), "shell")[0]!;
    const solid = kernel.makeSolid(shell);
    return kernel.getVolume(solid) > 0 ? solid : kernel.makeSolid(kernel.reverseShape(shell));
}

function flankEdges(solid: ShapeHandle): ShapeHandle[] {
    return kernel.getSubShapes(solid, "edge").filter((edge) => {
        const box = kernel.getBoundingBox(edge);
        if (Math.abs(box.zmin - RISE) > 1e-6 || Math.abs(box.zmax - RISE) > 1e-6) return false;
        const [r1, r2] = kernel.getSubShapes(edge, "vertex").map((v) => {
            const q = kernel.vertexPosition(v);
            return Math.hypot(q.x, q.y);
        });
        return Math.abs(r1! - r2!) > 0.5;
    });
}

describe("fillet on the line edges of a herringbone gear", () => {
    it("fillets each flank edge with one new face and a small change in volume", () => {
        const solid = gear();
        const volume = kernel.getVolume(solid);
        const faces = kernel.getSubShapes(solid, "face").length;
        const edges = flankEdges(solid);
        expect(edges).toHaveLength(24);
        for (const edge of edges) {
            expect(kernel.curveType(edge)).toBe("line");
            const filleted = kernel.fillet(solid, [edge], 0.3);
            expect(kernel.isValid(filleted)).toBe(true);
            expect(kernel.getSubShapes(filleted, "face")).toHaveLength(faces + 1);
            expect(Math.abs(kernel.getVolume(filleted) - volume)).toBeLessThan(0.05);
        }
    }, 60_000);

    it("fillets all flank edges together with one new face for each", () => {
        const solid = gear();
        const volume = kernel.getVolume(solid);
        const faces = kernel.getSubShapes(solid, "face").length;
        const filleted = kernel.fillet(solid, flankEdges(solid), 0.3);
        expect(kernel.isValid(filleted)).toBe(true);
        expect(kernel.getSubShapes(filleted, "face")).toHaveLength(faces + 24);
        expect(Math.abs(kernel.getVolume(filleted) - volume)).toBeLessThan(0.05);
    }, 60_000);
});
