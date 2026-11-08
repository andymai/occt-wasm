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
        const expected = 59063;
        expect(kernel.getVolume(kernel.fuse(load("seam-body"), load("seam-fin")))).toBeGreaterThan(expected);
        expect(kernel.getVolume(kernel.booleanOp(BooleanOp.Fuse, [load("seam-body")], [load("seam-fin")]).result)).toBeGreaterThan(expected);
    });

    it("keeps an operand's absorption inside the other as it is", () => {
        // Every face of the inner box is gone from the result, as for a lost operand.
        const outer = kernel.makeBox(10, 10, 10);
        const inner = kernel.translate(kernel.makeBox(2, 2, 2), 4, 4, 4);
        expect(kernel.getVolume(kernel.fuse(outer, inner))).toBeCloseTo(1000, 6);
        expect(kernel.getVolume(kernel.fuse(inner, outer))).toBeCloseTo(1000, 6);
    });
});
