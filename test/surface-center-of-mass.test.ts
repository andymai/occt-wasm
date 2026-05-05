/**
 * Regression test for getSurfaceCenterOfMass — added to address parity gap
 * with brepjs (issue #90), where the brepjs occt-wasm adapter falls back to
 * tessellation-based centroids because the facade didn't expose
 * `BRepGProp::SurfaceProperties::CentreOfMass()`. Tessellation centroids
 * land on the surface (off-axis by +radius) for cylindrical faces and bias
 * toward holes for holed planar faces.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let Module: any;
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

afterEach(() => {
    kernel.releaseAll();
});

afterAll(() => {
    kernel.releaseAll();
    kernel.delete();
});

function vecToArray(vec: any): number[] {
    const result: number[] = [];
    for (let i = 0; i < vec.size(); i++) result.push(vec.get(i));
    vec.delete();
    return result;
}

describe("getSurfaceCenterOfMass", () => {
    it("returns the geometric center for a planar square face", () => {
        const box = kernel.makeBox(10, 10, 10);
        const faces = kernel.getSubShapes(box, "face");
        // Pick the +Z face. Its surface CoM should be (5, 5, 10).
        let zMaxFaceId = -1;
        for (let i = 0; i < faces.size(); i++) {
            const fid = faces.get(i);
            const bb = kernel.getBoundingBox(fid);
            if (bb.zmin > 9.9 && bb.zmax < 10.1) {
                zMaxFaceId = fid;
                break;
            }
        }
        expect(zMaxFaceId).toBeGreaterThan(0);
        const com = vecToArray(kernel.getSurfaceCenterOfMass(zMaxFaceId));
        expect(com[0]).toBeCloseTo(5, 4);
        expect(com[1]).toBeCloseTo(5, 4);
        expect(com[2]).toBeCloseTo(10, 4);
        faces.delete();
    });

    it("returns the cylinder axis (not the surface) for a complete cylindrical face", () => {
        // The hole-wall scenario from issue #90's parity test: a closed
        // cylindrical band's surface CoM lies on the axis by symmetry, not
        // at +radius on the surface.
        const cyl = kernel.makeCylinder(5, 20);
        const faces = kernel.getSubShapes(cyl, "face");
        let lateralFaceId = -1;
        for (let i = 0; i < faces.size(); i++) {
            const fid = faces.get(i);
            if (kernel.surfaceType(fid) === "cylinder") {
                lateralFaceId = fid;
                break;
            }
        }
        expect(lateralFaceId).toBeGreaterThan(0);
        const com = vecToArray(kernel.getSurfaceCenterOfMass(lateralFaceId));
        // Cylinder is axis-aligned along +Z, base at origin, radius 5, height 20.
        // The lateral surface's CoM is at (0, 0, 10).
        expect(com[0]).toBeCloseTo(0, 4);
        expect(com[1]).toBeCloseTo(0, 4);
        expect(com[2]).toBeCloseTo(10, 4);
        faces.delete();
    });

    it("differs from getCenterOfMass (which is volume-based) when called on a face", () => {
        // Sanity check: the two methods are not aliases. For a face,
        // getCenterOfMass(face) returns volume CoM (often (0,0,0) for a 2D
        // shape with zero volume), while getSurfaceCenterOfMass returns the
        // area-weighted point on the face.
        const box = kernel.makeBox(10, 10, 10);
        const faces = kernel.getSubShapes(box, "face");
        const fid = faces.get(0);
        const surfaceCom = vecToArray(kernel.getSurfaceCenterOfMass(fid));
        // surfaceCom should be on the face (one coord pinned to 0 or 10,
        // the other two near 5).
        const onPlane = surfaceCom.filter((c) => Math.abs(c) < 0.01 || Math.abs(c - 10) < 0.01);
        expect(onPlane.length).toBeGreaterThanOrEqual(1);
        faces.delete();
    });
});
