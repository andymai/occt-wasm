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

describe("modeling operations", () => {
    it("extrudes a face along a direction", () => {
        // Build a planar face: square wire → face → extrude
        const v1 = kernel.makeVertex(0, 0, 0);
        const v2 = kernel.makeVertex(10, 0, 0);
        const v3 = kernel.makeVertex(10, 10, 0);
        const v4 = kernel.makeVertex(0, 10, 0);
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
        const face = kernel.makeFace(wire);
        const extruded = kernel.extrude(face, 0, 0, 20);
        expect(extruded).toBeGreaterThan(0);
        // 10 x 10 x 20 = 2000
        expect(kernel.getVolume(extruded)).toBeCloseTo(2000, 0);
        edgeVec.delete();
    });

    it("revolves a face around an axis", () => {
        // Build a face, revolve 360° around Y axis at x=20
        const v1 = kernel.makeVertex(15, 0, -5);
        const v2 = kernel.makeVertex(25, 0, -5);
        const v3 = kernel.makeVertex(25, 0, 5);
        const v4 = kernel.makeVertex(15, 0, 5);
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
        const face = kernel.makeFace(wire);
        const revolved = kernel.revolve(face, 0, 0, 0, 0, 0, 1, Math.PI * 2);
        expect(revolved).toBeGreaterThan(0);
        expect(kernel.getVolume(revolved)).toBeGreaterThan(0);
        edgeVec.delete();
    });

    it("fillets edges of a box", () => {
        const box = kernel.makeBox(20, 20, 20);
        const edges = kernel.getSubShapes(box, "edge");
        expect(edges.size()).toBeGreaterThanOrEqual(12);

        // Fillet with first 4 unique edges
        const edgeVec = new Module.VectorUint32();
        const seen = new Set();
        for (let i = 0; i < edges.size() && seen.size < 4; i++) {
            const eid = edges.get(i);
            if (!seen.has(eid)) {
                edgeVec.push_back(eid);
                seen.add(eid);
            }
        }
        const filleted = kernel.fillet(box, edgeVec, 2.0);
        expect(filleted).toBeGreaterThan(0);

        // Filleted box has less volume than original
        expect(kernel.getVolume(filleted)).toBeLessThan(kernel.getVolume(box));

        edgeVec.delete();
        edges.delete();
    });

    it("chamfers edges of a box", () => {
        const box = kernel.makeBox(20, 20, 20);
        const edges = kernel.getSubShapes(box, "edge");
        const edgeVec = new Module.VectorUint32();
        const seen = new Set();
        for (let i = 0; i < edges.size() && seen.size < 4; i++) {
            const eid = edges.get(i);
            if (!seen.has(eid)) {
                edgeVec.push_back(eid);
                seen.add(eid);
            }
        }
        const chamfered = kernel.chamfer(box, edgeVec, 2.0);
        expect(chamfered).toBeGreaterThan(0);
        expect(kernel.getVolume(chamfered)).toBeLessThan(kernel.getVolume(box));
        edgeVec.delete();
        edges.delete();
    });

    it("offsets a solid", () => {
        const box = kernel.makeBox(10, 10, 10);
        const offset = kernel.offset(box, 1.0);
        expect(offset).toBeGreaterThan(0);
        // Offset solid should have larger volume
        expect(kernel.getVolume(offset)).toBeGreaterThan(kernel.getVolume(box));
    });
});

describe("transforms", () => {
    it("translates a shape", () => {
        const box = kernel.makeBox(10, 10, 10);
        const moved = kernel.translate(box, 100, 200, 300);
        expect(moved).toBeGreaterThan(0);
        const bbox = kernel.getBoundingBox(moved);
        expect(bbox.xmin).toBeCloseTo(100, 1);
        expect(bbox.ymin).toBeCloseTo(200, 1);
        expect(bbox.zmin).toBeCloseTo(300, 1);
    });

    it("rotates a shape", () => {
        const box = kernel.makeBox(10, 10, 10);
        const rotated = kernel.rotate(box, 0, 0, 0, 0, 0, 1, Math.PI / 2);
        expect(rotated).toBeGreaterThan(0);
        // Volume should be preserved
        expect(kernel.getVolume(rotated)).toBeCloseTo(kernel.getVolume(box), 1);
    });

    it("scales a shape", () => {
        const box = kernel.makeBox(10, 10, 10);
        const scaled = kernel.scale(box, 0, 0, 0, 2.0);
        expect(scaled).toBeGreaterThan(0);
        // Volume scales by factor^3
        expect(kernel.getVolume(scaled)).toBeCloseTo(1000 * 8, 0);
    });

    it("mirrors a shape", () => {
        const box = kernel.makeBox(10, 10, 10);
        const mirrored = kernel.mirror(box, 0, 0, 0, 1, 0, 0);
        expect(mirrored).toBeGreaterThan(0);
        const bbox = kernel.getBoundingBox(mirrored);
        expect(bbox.xmax).toBeCloseTo(0, 1);
        expect(bbox.xmin).toBeCloseTo(-10, 1);
    });

    it("copies a shape", () => {
        const box = kernel.makeBox(10, 20, 30);
        const copied = kernel.copy(box);
        expect(copied).toBeGreaterThan(0);
        expect(copied).not.toBe(box);
        expect(kernel.getVolume(copied)).toBeCloseTo(kernel.getVolume(box), 1);
    });
});

describe("topology query", () => {
    it("gets shape type", () => {
        const box = kernel.makeBox(10, 10, 10);
        expect(kernel.getShapeType(box)).toBe("solid");
    });

    it("gets sub-shapes", () => {
        const box = kernel.makeBox(10, 10, 10);
        const faces = kernel.getSubShapes(box, "face");
        expect(faces.size()).toBe(6); // box has 6 faces
        const edges = kernel.getSubShapes(box, "edge");
        // TopExp_Explorer returns edges with multiplicity (each edge shared by 2 faces)
        expect(edges.size()).toBeGreaterThanOrEqual(12);
        const vertices = kernel.getSubShapes(box, "vertex");
        expect(vertices.size()).toBeGreaterThanOrEqual(8);
        faces.delete();
        edges.delete();
        vertices.delete();
    });

    it("computes distance between shapes", () => {
        const a = kernel.makeBox(10, 10, 10);
        const b = kernel.translate(kernel.makeBox(10, 10, 10), 20, 0, 0);
        const dist = kernel.distanceBetween(a, b);
        expect(dist).toBeCloseTo(10, 1); // 10 unit gap
    });
});

describe("construction", () => {
    it("creates vertices", () => {
        const v = kernel.makeVertex(1, 2, 3);
        expect(v).toBeGreaterThan(0);
        expect(kernel.getShapeType(v)).toBe("vertex");
    });

    it("creates edges from vertices", () => {
        const v1 = kernel.makeVertex(0, 0, 0);
        const v2 = kernel.makeVertex(10, 0, 0);
        const edge = kernel.makeEdge(v1, v2);
        expect(edge).toBeGreaterThan(0);
        expect(kernel.getShapeType(edge)).toBe("edge");
    });

    it("creates a wire from edges", () => {
        const v1 = kernel.makeVertex(0, 0, 0);
        const v2 = kernel.makeVertex(10, 0, 0);
        const v3 = kernel.makeVertex(10, 10, 0);
        const v4 = kernel.makeVertex(0, 10, 0);
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
        expect(wire).toBeGreaterThan(0);
        expect(kernel.getShapeType(wire)).toBe("wire");
        edgeVec.delete();
    });

    it("creates a face from a wire", () => {
        const v1 = kernel.makeVertex(0, 0, 0);
        const v2 = kernel.makeVertex(10, 0, 0);
        const v3 = kernel.makeVertex(10, 10, 0);
        const v4 = kernel.makeVertex(0, 10, 0);
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
        const face = kernel.makeFace(wire);
        expect(face).toBeGreaterThan(0);
        expect(kernel.getShapeType(face)).toBe("face");
        expect(kernel.getSurfaceArea(face)).toBeCloseTo(100, 0);
        edgeVec.delete();
    });

    it("creates a compound from shapes", () => {
        const a = kernel.makeBox(5, 5, 5);
        const b = kernel.makeSphere(3);
        const shapeVec = new Module.VectorUint32();
        shapeVec.push_back(a);
        shapeVec.push_back(b);
        const compound = kernel.makeCompound(shapeVec);
        expect(compound).toBeGreaterThan(0);
        expect(kernel.getShapeType(compound)).toBe("compound");
        shapeVec.delete();
    });
});

describe("I/O extended", () => {
    it("exports STL (binary)", () => {
        const box = kernel.makeBox(10, 20, 30);
        const stl = kernel.exportStl(box, 0.5);
        expect(stl.length).toBeGreaterThan(80); // STL header is 80 bytes
    });
});

describe("healing", () => {
    it("fixShape returns a valid shape", () => {
        const box = kernel.makeBox(10, 10, 10);
        const fixed = kernel.fixShape(box);
        expect(fixed).toBeGreaterThan(0);
        expect(kernel.getVolume(fixed)).toBeCloseTo(1000, 0);
    });

    it("unifySameDomain simplifies a fused shape", () => {
        const a = kernel.makeBox(10, 10, 10);
        const b = kernel.translate(kernel.makeBox(10, 10, 10), 10, 0, 0);
        const fused = kernel.fuse(a, b);
        const unified = kernel.unifySameDomain(fused);
        expect(unified).toBeGreaterThan(0);

        // After unifying, fewer faces (shared face removed)
        const origFaces = kernel.getSubShapes(fused, "face");
        const unifiedFaces = kernel.getSubShapes(unified, "face");
        expect(unifiedFaces.size()).toBeLessThanOrEqual(origFaces.size());
        origFaces.delete();
        unifiedFaces.delete();
    });
});
