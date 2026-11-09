import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { OcctKernel, type OcctModuleFactory, type ShapeHandle, type ThreadGroove } from "../ts/src/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");

let kernel: OcctKernel;

beforeAll(async () => {
    const createModule = ((await import(jsPath)) as { default: OcctModuleFactory }).default;
    kernel = await OcctKernel.init({ createModule, wasm: wasmPath });
}, 30_000);

afterAll(() => {
    kernel?.[Symbol.dispose]();
});

const origin = { x: 0, y: 0, z: 0 };
const up = { x: 0, y: 0, z: 1 };

/** Pappus: the trapezoid's area swept round its centroid, as many turns as the length holds. */
function exactVolume(g: ThreadGroove): number {
    const r = [g.coverRadius, g.rootRadius, g.rootRadius, g.coverRadius];
    const z = [-g.coverHalfWidth, -g.rootHalfWidth, g.rootHalfWidth, g.coverHalfWidth];
    let area = 0;
    let moment = 0;
    for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        const cross = r[i]! * z[j]! - r[j]! * z[i]!;
        area += cross;
        moment += (r[i]! + r[j]!) * cross;
    }
    return Math.abs(area / 2) * 2 * Math.PI * (moment / (3 * area)) * (g.length / g.pitch);
}

/** An ISO 68-1 groove for a tapped hole or a shaft of the size. */
function iso(major: number, pitch: number, length: number, tap?: number): ThreadGroove {
    const h = (Math.sqrt(3) / 2) * pitch;
    const big = major / 2;
    const small = big - (5 * h) / 8;
    if (tap === undefined) {
        return { pitch, length, coverRadius: big, rootRadius: small, coverHalfWidth: (7 * pitch) / 16, rootHalfWidth: pitch / 8, phase: 0.137 * pitch };
    }
    const across = (tap / 2 - small) / (big - small);
    return {
        pitch,
        length,
        coverRadius: tap / 2,
        rootRadius: big,
        coverHalfWidth: (3 * pitch) / 8 + across * (pitch / 16 - (3 * pitch) / 8),
        rootHalfWidth: pitch / 16,
        phase: 0.137 * pitch,
    };
}

function plateWithBore(radius: number, length: number): ShapeHandle {
    const box = kernel.translate(kernel.makeBox(40, 40, length), -20, -20, 0);
    return kernel.cut(box, kernel.translate(kernel.makeCylinder(radius, length + 2), 0, 0, -1));
}

function expectCut(body: ShapeHandle, tool: ShapeHandle, exact: number): void {
    const result = kernel.cut(body, tool);
    expect(kernel.isValid(result)).toBe(true);
    expect(kernel.getSubShapes(result, "solid")).toHaveLength(1);
    expect((kernel.getVolume(body) - kernel.getVolume(result)) / exact).toBeCloseTo(1, 4);
}

describe("threadGroove", () => {
    it("is a valid solid of the exact volume", () => {
        for (const groove of [iso(6, 1, 10), iso(6, 1, 10, 5), iso(5, 0.8, 7.3), iso(12, 1.75, 20, 10.2)]) {
            const tool = kernel.threadGroove(origin, up, groove);
            expect(kernel.isValid(tool)).toBe(true);
            expect(kernel.getShapeType(tool)).toBe("solid");
            expect(kernel.getVolume(tool) / exactVolume(groove)).toBeCloseTo(1, 5);
        }
    });

    it("stays within its length and radii", () => {
        const groove = iso(8, 1.25, 9);
        const box = kernel.getBoundingBox(kernel.threadGroove({ x: 1, y: 2, z: 3 }, up, groove));
        expect(box.zmin).toBeCloseTo(3, 5);
        expect(box.zmax).toBeCloseTo(12, 5);
        expect(box.xmax).toBeLessThanOrEqual(1 + 4 + 1e-3);
    });

    it("cuts the sizes a swept groove left uncut", () => {
        // An M5 x 0.8 tapped hole 10 long: a swept groove removed nothing and reported nothing.
        const m5 = iso(5, 0.8, 10, 4.2);
        expectCut(plateWithBore(2.1, 10), kernel.threadGroove(origin, up, m5), exactVolume(m5));
        const m12 = iso(12, 1.75, 8, 10.2);
        expectCut(plateWithBore(5.1, 8), kernel.threadGroove(origin, up, m12), exactVolume(m12));
    });

    it("cuts a shaft, at any length", () => {
        for (const length of [0.7, 3.3, 10, 17.77]) {
            const groove = iso(6, 1, length);
            expectCut(kernel.makeCylinder(3, length), kernel.threadGroove(origin, up, groove), exactVolume(groove));
        }
    });

    it("stops inside the material, and follows a tilted axis", () => {
        const groove = iso(6, 1, 8);
        const shaft = kernel.translate(kernel.makeCylinder(3, 14), 0, 0, -3);
        expectCut(shaft, kernel.threadGroove(origin, up, groove), exactVolume(groove));

        const axis = { x: 1, y: 1, z: 1 };
        const turn = { point: origin, direction: { x: -1, y: 1, z: 0 } };
        const tilted = kernel.rotate(kernel.makeCylinder(3, 8), turn, Math.acos(1 / Math.sqrt(3)));
        expectCut(tilted, kernel.threadGroove(origin, axis, groove), exactVolume(groove));
    });

    it("lists its faces cover, flank, root, flank, then the two ends", () => {
        const tool = kernel.threadGroove(origin, up, iso(6, 1, 10));
        const kinds = kernel.getSubShapes(tool, "face").map((f) => kernel.surfaceType(f));
        const runs = kinds.filter((k, i) => k !== kinds[i - 1]);
        expect(runs).toEqual(["cylinder", "bspline", "cylinder", "bspline", "plane"]);
        expect(kinds.slice(-2)).toEqual(["plane", "plane"]);
    });

    it("refuses a groove that overlaps its next turn, or does not narrow", () => {
        const good = iso(6, 1, 10);
        expect(() => kernel.threadGroove(origin, up, { ...good, coverHalfWidth: 0.6 })).toThrow(/under a pitch/);
        expect(() => kernel.threadGroove(origin, up, { ...good, rootHalfWidth: good.coverHalfWidth })).toThrow(/narrow/);
        expect(() => kernel.threadGroove(origin, up, { ...good, rootRadius: good.coverRadius })).toThrow(/different/);
        expect(() => kernel.threadGroove(origin, up, { ...good, length: 0 })).toThrow(/positive/);
    });

    it("refuses values that are not finite, a zero axis and a length of too many turns", () => {
        const good = iso(6, 1, 10);
        for (const bad of [Infinity, -Infinity, NaN]) {
            expect(() => kernel.threadGroove(origin, up, { ...good, length: bad })).toThrow(/finite/);
            expect(() => kernel.threadGroove(origin, up, { ...good, phase: bad })).toThrow(/finite/);
            expect(() => kernel.threadGroove(origin, up, { ...good, coverRadius: bad })).toThrow(/finite/);
            expect(() => kernel.threadGroove(origin, { ...up, z: bad }, good)).toThrow(/finite/);
        }
        expect(() => kernel.threadGroove(origin, { x: 0, y: 0, z: 0 }, good)).toThrow(/axis is zero/);
        expect(() => kernel.threadGroove(origin, up, { ...good, pitch: 1e-6, coverHalfWidth: 4e-7, rootHalfWidth: 1e-7 })).toThrow(/10000 turns/);
        expect(() => kernel.threadGroove(origin, up, { ...good, coverRadius: 1000, rootRadius: 1000 - 1e-13 })).toThrow(/too shallow/);
        expect(() => kernel.threadGroove(origin, up, iso(2e6, 3, 9000))).toThrow(/fewer on a wide thread/);
        // A short thread still has its end curves, a turn's worth of spans.
        expect(() => kernel.threadGroove(origin, up, { ...iso(6, 1, 0.001), coverRadius: 1e36, rootRadius: 9e35 })).toThrow(/fewer on a wide thread/);
    });

    it("stays valid and exact on wide threads, for a shaft and a tapped hole", () => {
        // A helix's error grows with its radius, and an end face's arcs sag further
        // from their chords: at 200 both need more points per turn.
        for (const groove of [iso(400, 3, 9), iso(400, 3, 9, 397)]) {
            const tool = kernel.threadGroove(origin, up, groove);
            expect(kernel.isValid(tool)).toBe(true);
            expect(kernel.getVolume(tool) / exactVolume(groove)).toBeCloseTo(1, 5);
        }
    });
});
