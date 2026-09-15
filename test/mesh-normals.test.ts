import { describe, it, expect, beforeAll, afterAll } from "vitest";
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

interface MeshArrays {
    positions: Float32Array;
    normals: Float32Array;
    indices: Uint32Array;
}

/**
 * For every triangle, the winding normal (cross product of its edges) and the
 * three stored vertex normals must point the same way, and both must point
 * away from `center`. The winding is already flipped for reversed faces, so a
 * disagreement means the vertex normals were not.
 */
function expectNormalsConsistent(mesh: MeshArrays, center: [number, number, number]) {
    const { positions, normals, indices } = mesh;
    expect(indices.length % 3).toBe(0);
    expect(indices.length).toBeGreaterThan(0);
    let checked = 0;
    for (let t = 0; t < indices.length; t += 3) {
        const [a, b, c] = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
        const p = (i: number) => [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!];
        const [pa, pb, pc] = [p(a), p(b), p(c)];
        const e1 = [pb[0]! - pa[0]!, pb[1]! - pa[1]!, pb[2]! - pa[2]!];
        const e2 = [pc[0]! - pa[0]!, pc[1]! - pa[1]!, pc[2]! - pa[2]!];
        const wn = [
            e1[1]! * e2[2]! - e1[2]! * e2[1]!,
            e1[2]! * e2[0]! - e1[0]! * e2[2]!,
            e1[0]! * e2[1]! - e1[1]! * e2[0]!,
        ];
        const wnLen = Math.hypot(wn[0]!, wn[1]!, wn[2]!);
        if (wnLen < 1e-9) continue;
        checked++;
        const centroid = [
            (pa[0]! + pb[0]! + pc[0]!) / 3 - center[0],
            (pa[1]! + pb[1]! + pc[1]!) / 3 - center[1],
            (pa[2]! + pb[2]! + pc[2]!) / 3 - center[2],
        ];
        const outward = wn[0]! * centroid[0]! + wn[1]! * centroid[1]! + wn[2]! * centroid[2]!;
        expect(outward, `triangle ${t / 3} winding points inward`).toBeGreaterThan(0);
        for (const v of [a, b, c]) {
            const n = [normals[v * 3]!, normals[v * 3 + 1]!, normals[v * 3 + 2]!];
            const agree = n[0]! * wn[0]! + n[1]! * wn[1]! + n[2]! * wn[2]!;
            expect(agree, `vertex ${v} normal disagrees with triangle ${t / 3} winding`).toBeGreaterThan(0);
        }
    }
    expect(checked, "no non-degenerate triangles were checked").toBeGreaterThan(0);
}

function readMesh(mesh: {
    getPositionsPtr(): number;
    getNormalsPtr(): number;
    getIndicesPtr(): number;
    positionCount: number;
    normalCount: number;
    indexCount: number;
}): MeshArrays {
    return {
        positions: new Float32Array(Module.HEAPF32.buffer, mesh.getPositionsPtr(), mesh.positionCount),
        normals: new Float32Array(Module.HEAPF32.buffer, mesh.getNormalsPtr(), mesh.normalCount),
        indices: new Uint32Array(Module.HEAPU32.buffer, mesh.getIndicesPtr(), mesh.indexCount),
    };
}

describe("mesh vertex normals follow face orientation", () => {
    it("tessellate: box normals agree with the (already flipped) winding on reversed faces", () => {
        const box = kernel.makeBox(10, 20, 30);
        const mesh = kernel.tessellate(box, 0.1, 0.5);
        expectNormalsConsistent(readMesh(mesh), [5, 10, 15]);
        mesh.delete();
        kernel.release(box);
    });

    it("tessellate: sphere normals point outward", () => {
        const sphere = kernel.makeSphere(5);
        const mesh = kernel.tessellate(sphere, 0.2, 0.5);
        expectNormalsConsistent(readMesh(mesh), [0, 0, 0]);
        mesh.delete();
        kernel.release(sphere);
    });

    it("tessellate: a boolean result keeps normals consistent across all faces", () => {
        const box = kernel.makeBox(20, 20, 20);
        const cyl = kernel.makeCylinder(5, 30);
        const cut = kernel.cut(box, cyl);
        const mesh = kernel.tessellate(cut, 0.2, 0.5);
        const arrays = readMesh(mesh);
        // Not convex, so skip the outward test; winding/normal agreement still must hold.
        const { positions, normals, indices } = arrays;
        expect(indices.length).toBeGreaterThan(0);
        for (let t = 0; t < indices.length; t += 3) {
            const [a, b, c] = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
            const p = (i: number) => [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!];
            const [pa, pb, pc] = [p(a), p(b), p(c)];
            const e1 = [pb[0]! - pa[0]!, pb[1]! - pa[1]!, pb[2]! - pa[2]!];
            const e2 = [pc[0]! - pa[0]!, pc[1]! - pa[1]!, pc[2]! - pa[2]!];
            const wn = [
                e1[1]! * e2[2]! - e1[2]! * e2[1]!,
                e1[2]! * e2[0]! - e1[0]! * e2[2]!,
                e1[0]! * e2[1]! - e1[1]! * e2[0]!,
            ];
            for (const v of [a, b, c]) {
                const agree =
                    normals[v * 3]! * wn[0]! + normals[v * 3 + 1]! * wn[1]! + normals[v * 3 + 2]! * wn[2]!;
                expect(agree, `vertex ${v} normal disagrees with triangle ${t / 3} winding`).toBeGreaterThan(0);
            }
        }
        mesh.delete();
        kernel.release(cut);
        kernel.release(cyl);
        kernel.release(box);
    });

    it("meshBatch: box normals agree with the winding on reversed faces", () => {
        const box = kernel.makeBox(10, 20, 30);
        const ids = new Module.VectorUint32();
        ids.push_back(box);
        const batch = kernel.meshBatch(ids, 0.1, 0.5);
        expectNormalsConsistent(readMesh(batch), [5, 10, 15]);
        batch.delete();
        ids.delete();
        kernel.release(box);
    });
});
