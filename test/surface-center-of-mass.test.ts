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

    it("differs from getCenterOfMass (volume-based) when called on the same face", () => {
        // The two methods are not aliases. getCenterOfMass uses
        // BRepGProp::VolumeProperties (returns origin for a 2D face with zero
        // volume); getSurfaceCenterOfMass uses BRepGProp::SurfaceProperties
        // (returns the area-weighted point on the face).
        const box = kernel.makeBox(10, 10, 10);
        const faces = kernel.getSubShapes(box, "face");
        const fid = faces.get(0);
        const surfaceCom = vecToArray(kernel.getSurfaceCenterOfMass(fid));
        const volumeCom = vecToArray(kernel.getCenterOfMass(fid));
        // Volume CoM of a face should be at (or very near) the origin since
        // a face has zero volume — OCCT returns the default-constructed gp_Pnt.
        expect(volumeCom[0]).toBeCloseTo(0, 6);
        expect(volumeCom[1]).toBeCloseTo(0, 6);
        expect(volumeCom[2]).toBeCloseTo(0, 6);
        // Surface CoM should be on the face — far enough from origin that
        // the divergence is unambiguous (face center is at (5, 5, 0) or similar).
        const surfaceMagnitude = Math.hypot(surfaceCom[0]!, surfaceCom[1]!, surfaceCom[2]!);
        expect(surfaceMagnitude).toBeGreaterThan(1);
        faces.delete();
    });

    it("loftWithVertices accepts ruled flag at position 3", () => {
        // Regression for the breaking ABI change: ruled was inserted as the
        // 3rd positional arg, before startVertexId/endVertexId. A caller that
        // forgets to update would silently pass startVertex as ruled.
        const wires = new Module.VectorUint32();
        // Build two square wires at z=0 and z=10
        const makeSquareWire = (z: number) => {
            const e1 = kernel.makeLineEdge(0, 0, z, 5, 0, z);
            const e2 = kernel.makeLineEdge(5, 0, z, 5, 5, z);
            const e3 = kernel.makeLineEdge(5, 5, z, 0, 5, z);
            const e4 = kernel.makeLineEdge(0, 5, z, 0, 0, z);
            const ev = new Module.VectorUint32();
            ev.push_back(e1); ev.push_back(e2); ev.push_back(e3); ev.push_back(e4);
            const wire = kernel.makeWire(ev);
            ev.delete();
            return wire;
        };
        wires.push_back(makeSquareWire(0));
        wires.push_back(makeSquareWire(10));
        // ruled=true, no start/end vertex
        const ruledLoft = kernel.loftWithVertices(wires, true, true, 0, 0);
        const smoothLoft = kernel.loftWithVertices(wires, true, false, 0, 0);
        expect(ruledLoft).toBeGreaterThan(0);
        expect(smoothLoft).toBeGreaterThan(0);
        // Both succeed and produce non-zero volume; their geometry differs.
        // (Topology comparison is brittle; existence + non-degeneracy is the
        // contract we care about for the param-plumbing regression.)
        expect(kernel.getVolume(ruledLoft)).toBeGreaterThan(0);
        expect(kernel.getVolume(smoothLoft)).toBeGreaterThan(0);
        wires.delete();
    });
});
