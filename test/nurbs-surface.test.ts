/**
 * nurbsSurface: a B-spline surface built exactly from its poles and knots,
 * checked against an independent evaluation of the same data.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let kernel: any;

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
}, 30_000);

afterEach(() => kernel.releaseAll());
afterAll(() => kernel[Symbol.dispose]());

type P = { x: number; y: number; z: number };
const p = (x: number, y: number, z: number): P => ({ x, y, z });

/** Expanded knot vector from distinct knots and multiplicities. */
function expand(knots: number[], mults: number[]): number[] {
    return knots.flatMap((k, i) => Array<number>(mults[i] ?? 0).fill(k));
}

/** Cox-de Boor basis values N_{i,p}(t) for every i. */
function basis(t: number, degree: number, flat: number[], count: number): number[] {
    const n = flat.length - 1;
    let values = Array.from({ length: n }, (_, i) => {
        const a = flat[i] ?? 0;
        const b = flat[i + 1] ?? 0;
        // The last non-empty span is closed so t at the end evaluates.
        const last = b === flat[n] && a < b;
        return (t >= a && t < b) || (last && t === b) ? 1 : 0;
    });
    for (let d = 1; d <= degree; d++) {
        values = Array.from({ length: n - d }, (_, i) => {
            const a = flat[i] ?? 0;
            const b = flat[i + d] ?? 0;
            const c = flat[i + 1] ?? 0;
            const e = flat[i + d + 1] ?? 0;
            const left = b > a ? ((t - a) / (b - a)) * (values[i] ?? 0) : 0;
            const right = e > c ? ((e - t) / (e - c)) * (values[i + 1] ?? 0) : 0;
            return left + right;
        });
    }
    return values.slice(0, count);
}

interface Data {
    degreeU: number;
    degreeV: number;
    poles: P[][];
    weights?: number[][];
    knotsU: number[];
    knotsV: number[];
    multiplicitiesU: number[];
    multiplicitiesV: number[];
}

/** The surface point at (u, v), evaluated here rather than by OCCT. */
function evaluate(d: Data, u: number, v: number): P {
    const nu = basis(u, d.degreeU, expand(d.knotsU, d.multiplicitiesU), d.poles.length);
    const nv = basis(v, d.degreeV, expand(d.knotsV, d.multiplicitiesV), d.poles[0]?.length ?? 0);
    let x = 0;
    let y = 0;
    let z = 0;
    let w = 0;
    d.poles.forEach((row, i) =>
        row.forEach((q, j) => {
            const b = (nu[i] ?? 0) * (nv[j] ?? 0) * (d.weights?.[i]?.[j] ?? 1);
            x += b * q.x;
            y += b * q.y;
            z += b * q.z;
            w += b;
        }),
    );
    return p(x / w, y / w, z / w);
}

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** A wavy 6 x 5 bicubic patch with interior knots. */
function wavy(): Data {
    const poles = Array.from({ length: 6 }, (_, i) =>
        Array.from({ length: 5 }, (_, j) => p(2 * i, 3 * j, Math.sin(i) * Math.cos(j) * 2)),
    );
    return {
        degreeU: 3,
        degreeV: 3,
        poles,
        knotsU: [0, 1, 2, 3],
        multiplicitiesU: [4, 1, 1, 4],
        knotsV: [0, 0.5, 2],
        multiplicitiesV: [4, 1, 4],
    };
}

describe("nurbsSurface", () => {
    it("is exactly the surface its poles and knots describe", () => {
        const data = wavy();
        const face = kernel.nurbsSurface(data);
        expect(kernel.getShapeType(face)).toBe("face");
        expect(kernel.surfaceType(face)).toBe("bspline");
        const b = kernel.uvBounds(face);
        expect(b.uMin).toBeCloseTo(0, 12);
        expect(b.uMax).toBeCloseTo(3, 12);
        expect(b.vMin).toBeCloseTo(0, 12);
        expect(b.vMax).toBeCloseTo(2, 12);
        for (const [u, v] of [[0, 0], [0.3, 1.7], [1.5, 0.5], [2.2, 0.1], [3, 2]] as const) {
            const got = kernel.pointOnSurface(face, u, v);
            expect(dist(got, evaluate(data, u, v))).toBeLessThan(1e-9);
        }
        // A clamped surface passes through its corner poles.
        expect(dist(kernel.pointOnSurface(face, 3, 2), data.poles[5]![4]!)).toBeLessThan(1e-12);
    });

    it("weights the poles of a rational surface", () => {
        // A quarter cylinder of radius 4: an exact circular arc along u.
        const r = 4;
        const w = Math.SQRT1_2;
        const arc = [p(r, 0, 0), p(r, r, 0), p(0, r, 0)];
        const data: Data = {
            degreeU: 2,
            degreeV: 1,
            poles: arc.map((q) => [q, p(q.x, q.y, 5)]),
            weights: [[1, 1], [w, w], [1, 1]],
            knotsU: [0, 1],
            multiplicitiesU: [3, 3],
            knotsV: [0, 1],
            multiplicitiesV: [2, 2],
        };
        const face = kernel.nurbsSurface(data);
        for (let k = 0; k <= 8; k++) {
            const q = kernel.pointOnSurface(face, k / 8, 0.5);
            expect(Math.hypot(q.x, q.y)).toBeCloseTo(r, 12);
            expect(q.z).toBeCloseTo(2.5, 12);
        }
    });

    it("closes a periodic direction on itself", () => {
        // A tube: periodic quadratic around, linear along.
        const ring = Array.from({ length: 6 }, (_, i) => {
            const a = (i * Math.PI) / 3;
            return p(3 * Math.cos(a), 3 * Math.sin(a), 0);
        });
        const face = kernel.nurbsSurface({
            degreeU: 2,
            degreeV: 1,
            poles: ring.map((q) => [q, p(q.x, q.y, 4)]),
            knotsU: [0, 1, 2, 3, 4, 5, 6],
            multiplicitiesU: [1, 1, 1, 1, 1, 1, 1],
            periodicU: true,
            knotsV: [0, 1],
            multiplicitiesV: [2, 2],
        });
        const start = kernel.pointOnSurface(face, 0, 0.5);
        const end = kernel.pointOnSurface(face, 6, 0.5);
        expect(dist(start, end)).toBeLessThan(1e-12);
    });

    it("rejects data that does not describe a surface", () => {
        const data = wavy();
        const reject = (change: Partial<Data> & Record<string, unknown>, message: RegExp) =>
            expect(() => kernel.nurbsSurface({ ...data, ...change })).toThrow(message);
        reject({ multiplicitiesU: [4, 1, 4] }, /two or more knots/);
        reject({ knotsU: [0, 2, 1, 3] }, /u knots must increase/);
        reject({ multiplicitiesU: [4, 2, 1, 4] }, /u knots and multiplicities do not fit 6 poles/);
        reject({ multiplicitiesV: [4, 4, 4] }, /v knots and multiplicities do not fit/);
        reject({ degreeU: 0 }, /degrees must be from 1/);
        reject({ weights: data.poles.map((row) => row.map(() => 0)) }, /weights must be positive/);
        reject({ weights: [[1]] }, /weights must have one row per row of poles/);
        reject({ poles: [data.poles[0]!, data.poles[1]!.slice(1)] }, /same length/);
        reject({ poles: [[p(0, 0, 0)]], knotsU: [0, 1], multiplicitiesU: [2, 2] }, /at least 2 poles/);
    });
});
