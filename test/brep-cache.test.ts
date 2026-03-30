/**
 * Tests for BREP-based STEP caching round-trip.
 * Validates that exportStep -> fromBREP -> toBREP preserves geometry.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let Module: any;
let kernel: any;

beforeAll(async () => {
    const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
    const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");
    const createModule = (await import(jsPath)).default;
    Module = await createModule({
        locateFile: (path: string) =>
            path.endsWith(".wasm") ? wasmPath : path,
    });
    kernel = new Module.OcctKernel();
}, 30_000);

afterEach(() => {
    kernel.releaseAll();
});

afterAll(() => {
    kernel.releaseAll();
    kernel.delete();
});

describe("BREP cache round-trip", () => {
    it("round-trip preserves geometry", () => {
        // Create a box and get its volume
        const box = kernel.makeBox(10, 20, 30);
        const originalVol = kernel.getVolume(box);

        // Export to STEP, then do the cacheStep flow: importStep -> toBREP
        const stepData = kernel.exportStep(box);
        const imported = kernel.importStep(stepData);
        const brepData = kernel.toBREP(imported);
        kernel.release(imported);

        // Do the loadCached flow: fromBREP
        const cached = kernel.fromBREP(brepData);
        const cachedVol = kernel.getVolume(cached);

        expect(cachedVol).toBeCloseTo(originalVol, 5);
    });

    it("BREP load is faster than STEP import (informational)", () => {
        // Create a box and export to both formats
        const box = kernel.makeBox(10, 20, 30);
        const stepData = kernel.exportStep(box);
        const stepImported = kernel.importStep(stepData);
        const brepData = kernel.toBREP(stepImported);
        kernel.release(stepImported);
        kernel.release(box);

        // Benchmark STEP import (10 iterations)
        const stepTimes: number[] = [];
        for (let i = 0; i < 10; i++) {
            const start = performance.now();
            const s = kernel.importStep(stepData);
            stepTimes.push(performance.now() - start);
            kernel.release(s);
        }

        // Benchmark BREP load (10 iterations)
        const brepTimes: number[] = [];
        for (let i = 0; i < 10; i++) {
            const start = performance.now();
            const s = kernel.fromBREP(brepData);
            brepTimes.push(performance.now() - start);
            kernel.release(s);
        }

        // Take medians
        stepTimes.sort((a, b) => a - b);
        brepTimes.sort((a, b) => a - b);
        const medianStep = stepTimes[5];
        const medianBrep = brepTimes[5];
        const speedup = medianStep / medianBrep;

        console.log(
            `STEP import median: ${medianStep.toFixed(2)}ms, ` +
            `BREP load median: ${medianBrep.toFixed(2)}ms, ` +
            `speedup: ${speedup.toFixed(1)}x`
        );

        // No assertion on speedup — just verify the round-trip works
        expect(medianStep).toBeGreaterThan(0);
        expect(medianBrep).toBeGreaterThan(0);
    });

    it("invalid BREP throws", () => {
        expect(() => kernel.fromBREP("not valid brep data")).toThrow();
    });
});
