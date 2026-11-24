/**
 * A fillet on a 4.5 long line edge of a faceted arc, whose ends meet edges
 * only 0.04 to 0.06 long. From radius 0.08 to 0.15 OCCT splits the fillet
 * into a piece that covers no edge, and a build with exceptions refuses it.
 * This build must refuse it too, without a trap, so that a caller can try
 * the next radius with the same kernel.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { OcctError, OcctErrorCode, OcctKernel, type OcctModuleFactory, type ShapeHandle } from "../ts/src/index.ts";

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

function body(): { solid: ShapeHandle; edge: ShapeHandle } {
    const solid = kernel.fromBREP(readFileSync(new URL("fixtures/fillet-oob.brep", import.meta.url), "utf8"));
    const edge = kernel.getSubShapes(solid, "edge")[4];
    if (edge === undefined) throw new Error("edge 4 not found");
    return { solid, edge };
}

function failure(run: () => unknown): OcctError {
    try {
        run();
    } catch (e) {
        if (e instanceof OcctError) return e;
        throw e;
    }
    throw new Error("expected the operation to fail");
}

describe("a fillet that outgrows the short edges at its ends", () => {
    it("builds a valid fillet at a radius that fits", () => {
        const { solid, edge } = body();
        expect(kernel.isValid(kernel.fillet(solid, [edge], 0.05))).toBe(true);
    });

    it.each([0.1, 0.15, 0.2])("refuses radius %s and names the edge", (radius) => {
        const { solid, edge } = body();
        const error = failure(() => kernel.fillet(solid, [edge], radius));
        expect(error.code).toBe(OcctErrorCode.ConstructionFailed);
        expect(error.faultyEdges).toEqual([edge]);
    });

    it("keeps the kernel usable after each refusal", () => {
        const { solid, edge } = body();
        for (const radius of [0.08, 0.1, 0.12, 0.15]) {
            expect(failure(() => kernel.fillet(solid, [edge], radius)).code).toBe(OcctErrorCode.ConstructionFailed);
        }
        expect(kernel.isValid(kernel.fillet(solid, [edge], 0.05))).toBe(true);
    });
});
