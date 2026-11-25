/**
 * A face from a fillet result. The pcurve of the first edge in its wire is a
 * BSpline with 102 poles, some millions of units out. When
 * BRepTopAdaptor_FClass2d makes the wire polygon denser, the discretization
 * of that edge fails and leaves no points.
 * A build with exceptions raises there and BRepCheck reports the face as
 * invalid. This build must do the same, without a trap.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { OcctKernel, type OcctModuleFactory, type ShapeHandle } from "../ts/src/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");

let kernel: OcctKernel;

beforeAll(async () => {
    const createModule = ((await import(jsPath)) as { default: OcctModuleFactory }).default;
    kernel = await OcctKernel.init({ createModule, wasm: wasmPath });
}, 30_000);

afterEach(() => kernel.releaseAll());
afterAll(() => {
    kernel?.[Symbol.dispose]();
});

function face(): ShapeHandle {
    return kernel.fromBREP(readFileSync(new URL("fixtures/fclass2d-no-polygon.brep", import.meta.url), "utf8"));
}

describe("a face whose wire polygon cannot be made denser", () => {
    it("is invalid", () => {
        expect(kernel.isValid(face())).toBe(false);
    });

    it("keeps the kernel usable after each check", () => {
        for (let i = 0; i < 5; i++) {
            expect(kernel.isValid(face())).toBe(false);
        }
        expect(kernel.isValid(kernel.makeBox(1, 2, 3))).toBe(true);
    });
});
