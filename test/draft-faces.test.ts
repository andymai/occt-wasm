/**
 * draftFaces: several faces drafted in one BRepOffsetAPI_DraftAngle, about a
 * caller-given neutral plane.
 *
 * The cube sits at z = 100..110 so a neutral plane through the origin, which
 * `draft` used to hardcode, would be 100 mm away from it.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Module: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let raw: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let kernel: any;

beforeAll(async () => {
    const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
    const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");
    const createModule = (await import(jsPath)).default;
    Module = await createModule({
        locateFile: (path: string) => (path.endsWith(".wasm") ? wasmPath : path),
    });
    const mod = await import(resolve(__dirname, "../ts/src/index.ts"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kernel = new (mod.OcctKernel as any)(Module);
    raw = kernel.getRawKernel();
}, 30_000);

afterEach(() => kernel.releaseAll());
afterAll(() => kernel[Symbol.dispose]());

const deg = (d: number) => (d * Math.PI) / 180;
const UP = { x: 0, y: 0, z: 1 };
const BASE = { origin: { x: 0, y: 0, z: 100 }, normal: UP };
const HASH_BOUND = 2147483647;

function raisedCube(): number {
    return kernel.makeBoxFromCorners({ x: 0, y: 0, z: 100 }, { x: 10, y: 10, z: 110 });
}

/** The side faces, keyed by the axis their normal points along. */
function sideFaces(box: number): { x: number[]; y: number[] } {
    const sides = { x: [] as number[], y: [] as number[] };
    for (const face of kernel.getSubShapes(box, "face")) {
        const c = kernel.getSurfaceCenterOfMass(face);
        if (Math.abs(c.z - 105) > 1e-9) continue;
        if (Math.abs(c.x - 5) > 1e-9) sides.x.push(face);
        else sides.y.push(face);
    }
    return sides;
}

describe("draft about a neutral plane", () => {
    it("pivots a face about the given neutral plane", () => {
        const box = raisedCube();
        const [face] = sideFaces(box).x;
        const drafted = kernel.draft(box, face, deg(5), UP, BASE);
        // A 10 x 10 face tilted 5 degrees about its bottom edge cuts a wedge.
        expect(kernel.getVolume(drafted)).toBeCloseTo(1000 - 0.5 * 10 * 10 * Math.tan(deg(5)) * 10, 6);
        const bb = kernel.getBoundingBox(drafted);
        expect(bb.zmin).toBeCloseTo(100, 6);
        expect(bb.zmax).toBeCloseTo(110, 6);
    });

    it("drafts all four side faces in one operation", () => {
        const box = raisedCube();
        const { x, y } = sideFaces(box);
        const drafted = kernel.draft(box, [...x, ...y], deg(3), UP, BASE);
        // A square frustum: 10 x 10 at the neutral plane, narrower at the top.
        const top = 10 - 2 * 10 * Math.tan(deg(3));
        expect(kernel.getVolume(drafted)).toBeCloseTo((10 / 3) * (100 + top * top + 10 * top), 6);
    });

    it("takes one angle per face", () => {
        const box = raisedCube();
        const { x } = sideFaces(box);
        const drafted = kernel.draft(box, x, [deg(3), deg(6)], UP, BASE);
        // Two opposite faces: a trapezoidal section 10 wide at the base.
        const expected = 1000 - 500 * (Math.tan(deg(3)) + Math.tan(deg(6)));
        expect(kernel.getVolume(drafted)).toBeCloseTo(expected, 6);
    });

    it("keeps the old neutral plane (XY through the origin) when none is given", () => {
        const local = kernel.makeBox(10, 10, 10);
        const localFace = kernel
            .getSubShapes(local, "face")
            .find((f: number) => Math.abs(kernel.getSurfaceCenterOfMass(f).x) < 1e-9);
        const viaDefault = kernel.draft(local, localFace, deg(5), UP);
        const viaRaw = raw.draft(local, localFace, deg(5), 0, 0, 1);
        expect(kernel.getVolume(viaDefault)).toBeCloseTo(kernel.getVolume(viaRaw), 9);
    });

    it("rejects a face that is not on the shape", () => {
        const box = raisedCube();
        const other = raisedCube();
        const [foreign] = sideFaces(other).x;
        expect(() => kernel.draft(box, foreign, deg(3), UP, BASE)).toThrow(/not on the shape/);
    });

    it("rejects mismatched angles and a zero pull direction on the raw surface", () => {
        const box = raisedCube();
        const { x } = sideFaces(box);
        const faces = new Module.VectorUint32();
        x.forEach((f) => faces.push_back(f));
        const oneAngle = new Module.VectorDouble();
        oneAngle.push_back(deg(3));
        const twoAngles = new Module.VectorDouble();
        twoAngles.push_back(deg(3));
        twoAngles.push_back(deg(3));
        try {
            expect(() => raw.draftFaces(box, faces, oneAngle, 0, 0, 1, 0, 0, 100, 0, 0, 1)).toThrow(/one entry per face/);
            expect(() => raw.draftFaces(box, faces, twoAngles, 0, 0, 0, 0, 0, 100, 0, 0, 1)).toThrow(/pull direction/);
            expect(raw.draftFaces(box, faces, twoAngles, 0, 0, 1, 0, 0, 100, 0, 0, 1)).toBeGreaterThan(0);
        } finally {
            [faces, oneAngle, twoAngles].forEach((v) => v.delete());
        }
    });

    it("tracks face history", () => {
        const box = raisedCube();
        const { x, y } = sideFaces(box);
        const hashes = kernel.getSubShapes(box, "face").map((f: number) => kernel.hashCode(f, HASH_BOUND));
        const evo = kernel.draftWithHistory(box, [...x, ...y], deg(3), UP, hashes, HASH_BOUND, BASE);
        const top = 10 - 2 * 10 * Math.tan(deg(3));
        expect(kernel.getVolume(evo.result)).toBeCloseTo((10 / 3) * (100 + top * top + 10 * top), 6);
        // DraftAngle reports each tilted face as generated from its source
        // face, and the top and bottom (re-trimmed, same plane) as modified.
        const sources = (flat: ArrayLike<number>) => {
            const found = new Set<number>();
            for (let i = 0; i < flat.length; i += 2 + (flat[i + 1] as number)) found.add(flat[i] as number);
            return found;
        };
        const generated = sources(evo.generated);
        for (const face of [...x, ...y]) {
            expect(generated.has(kernel.hashCode(face, HASH_BOUND))).toBe(true);
        }
        expect(sources(evo.modified).size).toBe(2);
    });
});
