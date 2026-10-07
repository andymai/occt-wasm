import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { resolve } from "node:path";

// A prism's top cap is positioned by a TopLoc_Location (tz = height). Once the prism
// carries a cached mesh, generalTransform used to apply that location to the mesh twice,
// floating the meshed cap to 2h while the exact geometry stayed correct.

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

function makePrism(size: number, h: number): number {
    const v1 = kernel.makeVertex(0, 0, 0);
    const v2 = kernel.makeVertex(size, 0, 0);
    const v3 = kernel.makeVertex(size, size, 0);
    const v4 = kernel.makeVertex(0, size, 0);
    const edgeVec = new Module.VectorUint32();
    for (const [a, b] of [
        [v1, v2],
        [v2, v3],
        [v3, v4],
        [v4, v1],
    ]) {
        edgeVec.push_back(kernel.makeEdge(a, b));
    }
    const wire = kernel.makeWire(edgeVec);
    edgeVec.delete();
    return kernel.extrude(kernel.makeFace(wire), 0, 0, h);
}

function generalTransform(shape: number, matrix: number[]): number {
    const vec = new Module.VectorDouble();
    for (const v of matrix) vec.push_back(v);
    try {
        return kernel.generalTransform(shape, vec);
    } finally {
        vec.delete();
    }
}

function rotZ(deg: number): number[] {
    const t = (deg * Math.PI) / 180;
    const c = Math.cos(t);
    const s = Math.sin(t);
    return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0];
}

// The first box catches a stale mesh carried through the transform; the second checks the
// mesh a consumer gets once the result is meshed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function meshBoxes(shape: number): any[] {
    const cached = kernel.getBoundingBox(shape, true);
    kernel.meshShape(shape, 0.1, 0.1);
    return [cached, kernel.getBoundingBox(shape, true)];
}

describe("generalTransform on a pre-meshed shape", () => {
    it.each([3, 5, 10])("keeps a rotated prism's meshed top cap at z=h (h=%d)", (h) => {
        const prism = makePrism(10, h);
        kernel.meshShape(prism, 0.1, 0.1);
        const out = generalTransform(prism, rotZ(60));

        const exact = kernel.getBoundingBox(out, false);
        expect(exact.zmin).toBeCloseTo(0, 3);
        expect(exact.zmax).toBeCloseTo(h, 3);
        for (const mesh of meshBoxes(out)) {
            expect(mesh.zmin).toBeCloseTo(0, 3);
            expect(mesh.zmax).toBeCloseTo(h, 3);
        }
    });

    it("keeps the meshed top cap on the exact geometry under a non-uniform scale", () => {
        const h = 4;
        const prism = makePrism(10, h);
        kernel.meshShape(prism, 0.1, 0.1);
        const out = generalTransform(prism, [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0]);

        for (const mesh of meshBoxes(out)) {
            expect(mesh.xmax).toBeCloseTo(20, 3);
            expect(mesh.ymax).toBeCloseTo(10, 3);
            expect(mesh.zmax).toBeCloseTo(h * 0.5, 3);
        }
    });

    it("leaves an un-meshed prism unaffected", () => {
        const h = 5;
        const out = generalTransform(makePrism(10, h), rotZ(60));
        expect(kernel.getBoundingBox(out, false).zmax).toBeCloseTo(h, 3);
        expect(kernel.getBoundingBox(out, true).zmax).toBeCloseTo(h, 3);
    });
});
