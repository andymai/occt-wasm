/**
 * Mesh and wireframe groups by position: each face group of meshShape and each
 * edge group of wireframe names its face's or edge's index in getSubShapes order
 * (`faceGroupsIndexed`, `edgeGroupsIndexed`), beside its hash, which two
 * sub-shapes can share.
 *
 * Every oracle is independent of the call under test: the geometry, or the hashes
 * of a shape whose hashes are first checked distinct (where every hash in a list
 * differs, a hash names one sub-shape).
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EdgeData, Mesh, OcctKernel, OcctRawKernel, ShapeHandle, Vec3 } from "../ts/src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let kernel: OcctKernel;
let raw: OcctRawKernel;

beforeAll(async () => {
    const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
    const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");
    const createModule = (await import(jsPath)).default;
    const Module = await createModule({
        locateFile: (path: string) => (path.endsWith(".wasm") ? wasmPath : path),
    });
    const mod = await import(resolve(__dirname, "../ts/src/index.ts"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kernel = new (mod.OcctKernel as any)(Module);
    raw = kernel.getRawKernel();
}, 30_000);

afterEach(() => kernel.releaseAll());
afterAll(() => kernel[Symbol.dispose]());

/** The bound meshShape's and wireframe's group hashes are taken with. */
const BOUND = 2_147_483_647;

/** Three through holes of distinct radii at distinct places: no two faces share a centre. */
function plate(): ShapeHandle {
    let shape = kernel.makeBox(100, 60, 10);
    for (const [x, y, r] of [
        [20, 20, 4],
        [50, 35, 6],
        [80, 22, 3],
    ] as const) {
        shape = kernel.cut(shape, kernel.translate(kernel.makeCylinder(r, 30), x, y, -10));
    }
    return shape;
}

function dist(a: Vec3, b: Vec3): number {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Where each face or edge is: a face's centre of area, an edge's of length. */
function places(shape: ShapeHandle, kind: "face" | "edge"): Vec3[] {
    return kernel
        .getSubShapes(shape, kind)
        .map((s) => (kind === "face" ? kernel.getSurfaceCenterOfMass(s) : kernel.getLinearCenterOfMass(s)));
}

/** The one index of `among` within `tol` of `p`, every other at least `gap` away, so never a near tie. */
function nearest(p: Vec3, among: readonly Vec3[], tol: number, gap: number): number {
    const order = among.map((q, i) => ({ i, d: dist(p, q) })).sort((a, b) => a.d - b.d);
    const [best, next] = order;
    expect(best, "a place to match").toBeDefined();
    expect(best!.d).toBeLessThan(tol);
    if (next) expect(next.d).toBeGreaterThan(gap);
    return best!.i;
}

function expectDistinct(numbers: readonly number[]): void {
    expect(new Set(numbers).size).toBe(numbers.length);
}

/** A mesh group's centre of area, `[start, count]` into `indices`. */
function meshCentroid(mesh: Mesh, start: number, count: number): Vec3 {
    const p = mesh.positions;
    let [ax, ay, az, total] = [0, 0, 0, 0];
    for (let t = start; t < start + count; t += 3) {
        const [a, b, c] = [mesh.indices[t]! * 3, mesh.indices[t + 1]! * 3, mesh.indices[t + 2]! * 3];
        const u = [p[b]! - p[a]!, p[b + 1]! - p[a + 1]!, p[b + 2]! - p[a + 2]!];
        const v = [p[c]! - p[a]!, p[c + 1]! - p[a + 1]!, p[c + 2]! - p[a + 2]!];
        const area =
            Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!) / 2;
        ax += (area * (p[a]! + p[b]! + p[c]!)) / 3;
        ay += (area * (p[a + 1]! + p[b + 1]! + p[c + 1]!)) / 3;
        az += (area * (p[a + 2]! + p[b + 2]! + p[c + 2]!)) / 3;
        total += area;
    }
    return { x: ax / total, y: ay / total, z: az / total };
}

/** A wireframe group's centre of length, `[start, count]` into `points` (floats). */
function polylineCentroid(edges: EdgeData, start: number, count: number): Vec3 {
    const p = edges.points;
    let [ax, ay, az, total] = [0, 0, 0, 0];
    for (let i = start; i + 5 < start + count; i += 3) {
        const len = Math.hypot(p[i + 3]! - p[i]!, p[i + 4]! - p[i + 1]!, p[i + 5]! - p[i + 2]!);
        ax += (len * (p[i]! + p[i + 3]!)) / 2;
        ay += (len * (p[i + 1]! + p[i + 4]!)) / 2;
        az += (len * (p[i + 2]! + p[i + 5]!)) / 2;
        total += len;
    }
    return { x: ax / total, y: ay / total, z: az / total };
}

function triples(groups: Int32Array): [number, number, number][] {
    const out: [number, number, number][] = [];
    for (let g = 0; g + 2 < groups.length; g += 3) out.push([groups[g]!, groups[g + 1]!, groups[g + 2]!]);
    return out;
}

describe("faceGroupsIndexed", () => {
    it("names each face group's face by position, beside its hash", () => {
        const shape = plate();
        const mesh = kernel.meshShape(shape);
        const groups = triples(mesh.faceGroups!);
        const positions = Array.from(mesh.faceGroupsIndexed!);
        expect(positions).toHaveLength(groups.length);

        const hashes = kernel.subShapeHashes(shape, "face", BOUND);
        expectDistinct(hashes);
        const centres = places(shape, "face");
        groups.forEach(([start, count, hash], g) => {
            expect(hashes[positions[g]!], `group ${g}`).toBe(hash);
            expect(nearest(meshCentroid(mesh, start, count), centres, 0.25, 2), `group ${g}`).toBe(positions[g]);
        });
        expect(new Set(positions).size).toBe(centres.length);
    });

    it("names a face the mesher visits twice by its one position both times", () => {
        const face = kernel.getSubShapes(kernel.makeBox(10, 20, 30), "face")[2]!;
        const twice = kernel.makeCompound([face, face]);
        expect(kernel.getSubShapes(twice, "face")).toHaveLength(1);
        expect(Array.from(kernel.meshShape(twice).faceGroupsIndexed!)).toEqual([0, 0]);
    });

    it("reads the index a position query kept, and keeps none of its own", () => {
        const shape = plate();
        const before = raw.topologyIndexCount();
        const fresh = Array.from(kernel.meshShape(shape).faceGroupsIndexed!);
        expect(raw.topologyIndexCount()).toBe(before);
        kernel.subShapesIndexed(shape, shape, "face");
        expect(Array.from(kernel.meshShape(shape).faceGroupsIndexed!)).toEqual(fresh);
        expect(raw.topologyIndexCount()).toBe(before + 1);
    });
});

describe("edgeGroupsIndexed", () => {
    it("names each edge group's edge by position, beside its hash", () => {
        const shape = plate();
        for (const source of ["curve", "triangulation"] as const) {
            if (source === "triangulation") kernel.meshShape(shape);
            const edges = kernel.wireframe(shape, { deflection: 0.1, source });
            const groups = triples(edges.edgeGroups);
            const positions = Array.from(edges.edgeGroupsIndexed);
            expect(positions).toHaveLength(groups.length);

            const hashes = kernel.subShapeHashes(shape, "edge", BOUND);
            expectDistinct(hashes);
            const centres = places(shape, "edge");
            groups.forEach(([start, count, hash], g) => {
                expect(hashes[positions[g]!], `${source} group ${g}`).toBe(hash);
                expect(nearest(polylineCentroid(edges, start, count), centres, 0.25, 2), `${source} group ${g}`).toBe(
                    positions[g],
                );
            });
        }
    });

    it("leaves an edge it skips unnamed and the others' positions unchanged", () => {
        // A sphere's poles are degenerate edges, which the wireframe does not draw.
        const sphere = kernel.makeSphere(10);
        const edges = kernel.getSubShapes(sphere, "edge");
        const drawn = kernel.wireframe(sphere);
        const positions = Array.from(drawn.edgeGroupsIndexed);
        expect(positions.length).toBeLessThan(edges.length);
        const hashes = kernel.subShapeHashes(sphere, "edge", BOUND);
        expectDistinct(hashes);
        expect(positions.map((p) => hashes[p])).toEqual(triples(drawn.edgeGroups).map(([, , hash]) => hash));
        // A drawn edge comes after a skipped one, so a group's index is not its position.
        expect(positions).not.toEqual(positions.map((_, g) => g));
    });
});
