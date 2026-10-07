import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { resolve } from "node:path";

// Regression test for the occt-wasm `generalTransform` (gp_GTrsf) defect:
// when the input shape already carries a cached triangulation, the top cap of an
// extruded prism (positioned via a TopLoc_Location with tz = extrude height) gets
// that location applied twice when the cached mesh is read back, floating the cap
// to 2x its offset. Only the cached mesh is wrong; the exact geometry is correct.
//
// This test fails on the buggy build (mesh.zmax == 2h) and passes after the fix
// that drops the cached triangulation before applying the general transform.
//
// Run against a built wasm: `npm test` (node, via ../dist/occt-wasm.{js,wasm}).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Module: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let kernel: any;

beforeAll(async () => {
    const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");
    const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
    const createOcctWasm = (await import(jsPath)).default;
    Module = await createOcctWasm({
        locateFile: (path: string) => (path.endsWith(".wasm") ? wasmPath : path),
    });
    kernel = new Module.OcctKernel();
}, 30_000);

afterAll(() => {
    if (kernel) {
        kernel.releaseAll();
        kernel.delete();
    }
});

afterEach(() => kernel.releaseAll());

function makeSquareFace(size: number) {
    const v1 = kernel.makeVertex(0, 0, 0);
    const v2 = kernel.makeVertex(size, 0, 0);
    const v3 = kernel.makeVertex(size, size, 0);
    const v4 = kernel.makeVertex(0, size, 0);
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
    edgeVec.delete();
    return kernel.makeFace(wire);
}

/** Row-major 3x4 gp_GTrsf for a rotation about Z by `deg` degrees. */
function rotZMatrixDeg(deg: number) {
    const t = (deg * Math.PI) / 180;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const m = new Module.VectorDouble();
    [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0].forEach((v) => m.push_back(v));
    return m;
}

describe("generalTransform must not double-apply a face TopLoc on the cached mesh", () => {
    it("pre-meshed extruded prism: exact AND mesh top cap must both stay at z=h", () => {
        const h = 5;
        const face = makeSquareFace(10);
        const prism = kernel.extrude(face, 0, 0, h);
        kernel.meshShape(prism, 0.1, 0.1); // precondition: cached triangulation present

        const mat = rotZMatrixDeg(60);
        const out = kernel.generalTransform(prism, mat);
        mat.delete();

        const exact = kernel.getBoundingBox(out, false);
        const mesh = kernel.getBoundingBox(out, true);

        // exact geometry is always correct (rotation about Z keeps z in [0, h])
        expect(exact.zmin).toBeCloseTo(0, 3);
        expect(exact.zmax).toBeCloseTo(h, 3);
        // regression: the cached mesh must not float the cap to 2h
        expect(mesh.zmin).toBeCloseTo(0, 3);
        expect(mesh.zmax).toBeCloseTo(h, 3);
    });

    it("control: an un-meshed prism is unaffected (no cached triangulation to double-apply)", () => {
        const h = 5;
        const face = makeSquareFace(10);
        const prism = kernel.extrude(face, 0, 0, h);
        // NOTE: deliberately NOT meshed

        const mat = rotZMatrixDeg(60);
        const out = kernel.generalTransform(prism, mat);
        mat.delete();

        const exact = kernel.getBoundingBox(out, false);
        const mesh = kernel.getBoundingBox(out, true);
        expect(exact.zmax).toBeCloseTo(h, 3);
        expect(mesh.zmax).toBeCloseTo(h, 3);
    });

    it("pollution equals the cap's own z offset: h=3/5/10 => mesh top cap h (not 2h)", () => {
        for (const h of [3, 5, 10]) {
            const face = makeSquareFace(10);
            const prism = kernel.extrude(face, 0, 0, h);
            kernel.meshShape(prism, 0.1, 0.1);
            const mat = rotZMatrixDeg(60);
            const out = kernel.generalTransform(prism, mat);
            mat.delete();
            const mesh = kernel.getBoundingBox(out, true);
            expect(mesh.zmax).toBeCloseTo(h, 3);
        }
    });
});
