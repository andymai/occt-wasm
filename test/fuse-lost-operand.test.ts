import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { BooleanOp, OcctKernel, type OcctModuleFactory } from "../ts/src/index.ts";

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

describe("a fuse that would lose an operand", () => {
    // A fin on a revolved body's seam: two of its edges lie a few 1e-7 from the
    // body's, closer than they should be and further than their tolerances reach.
    const load = (name: string) => kernel.fromBREP(readFileSync(new URL(`fixtures/${name}.brep`, import.meta.url), "utf8"));

    it("keeps both, by fuse and by booleanOp", () => {
        const body = load("seam-body");
        const fin = load("seam-fin");
        const apart = kernel.getVolume(body) + kernel.getVolume(fin);
        for (const fused of [kernel.fuse(body, fin), kernel.booleanOp(BooleanOp.Fuse, [body], [fin]).result]) {
            expect(kernel.isValid(fused)).toBe(true);
            expect(kernel.getSubShapes(fused, "solid")).toHaveLength(1);
            // More than the body alone, and less than the two apart: they overlap.
            expect(kernel.getVolume(fused)).toBeGreaterThan(59063);
            expect(kernel.getVolume(fused)).toBeLessThan(apart - 100);
        }
    });

    it("keeps an operand's absorption inside the other as it is", () => {
        // Every face of the inner box is gone from the result, as for a lost operand.
        const outer = kernel.makeBox(10, 10, 10);
        const inner = kernel.translate(kernel.makeBox(2, 2, 2), 4, 4, 4);
        expect(kernel.getVolume(kernel.fuse(outer, inner))).toBeCloseTo(1000, 6);
        expect(kernel.getVolume(kernel.fuse(inner, outer))).toBeCloseTo(1000, 6);
    });
});
