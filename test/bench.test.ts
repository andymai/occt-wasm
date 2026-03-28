/**
 * Raw facade-level performance benchmarks.
 *
 * Measures occt-wasm's WASM kernel directly (no brepjs adapter overhead).
 * Core 5: makeBox, fuse, translate×100, mesh-sphere, exportSTEP.
 *
 * Usage:
 *   cargo xtask test               # runs all tests including bench
 *   npx vitest run test/bench.test.ts  # bench only
 */
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
        locateFile: (path: string) => {
            if (path.endsWith(".wasm")) return wasmPath;
            return path;
        },
    });
    kernel = new Module.OcctKernel();
}, 30_000);

afterAll(() => {
    if (kernel) {
        kernel.releaseAll();
        kernel.delete();
    }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface BenchResult {
    name: string;
    median: number;
    mean: number;
    min: number;
    max: number;
    iterations: number;
}

function bench(
    name: string,
    fn: () => void,
    { warmup = 3, iterations = 10 }: { warmup?: number; iterations?: number } = {}
): BenchResult {
    for (let i = 0; i < warmup; i++) fn();
    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        fn();
        times.push(performance.now() - start);
    }
    const sorted = [...times].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median =
        sorted.length % 2 !== 0
            ? sorted[mid]!
            : (sorted[mid - 1]! + sorted[mid]!) / 2;
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    return {
        name,
        median,
        mean,
        min: Math.min(...times),
        max: Math.max(...times),
        iterations,
    };
}

const ALL_RESULTS: BenchResult[] = [];

function record(r: BenchResult): void {
    ALL_RESULTS.push(r);
}

// ---------------------------------------------------------------------------
// Core 5 Benchmarks
// ---------------------------------------------------------------------------

describe("Core 5 — raw facade benchmarks", () => {
    it("makeBox ×100", () => {
        const r = bench("makeBox ×100", () => {
            for (let i = 0; i < 100; i++) kernel.makeBox(10, 20, 30);
        });
        record(r);
        expect(r.median).toBeLessThan(50); // sanity: <50ms for 100 boxes
    });

    it("fuse ×10", () => {
        const r = bench("fuse ×10", () => {
            for (let i = 0; i < 10; i++) {
                const a = kernel.makeBox(10, 10, 10);
                const b = kernel.translate(kernel.makeBox(5, 5, 5), 5, 5, 5);
                kernel.fuse(a, b);
            }
        });
        record(r);
        expect(r.median).toBeLessThan(500); // sanity: <500ms for 10 fuses
    });

    it("translate ×1000", () => {
        const box = kernel.makeBox(10, 10, 10);
        const r = bench("translate ×1000", () => {
            for (let i = 0; i < 1000; i++) {
                kernel.translate(box, i * 0.01, 0, 0);
            }
        });
        record(r);
        expect(r.median).toBeLessThan(100); // sanity: <100ms
    });

    it("mesh sphere (tol=0.01)", () => {
        const sphere = kernel.makeSphere(10);
        const r = bench("mesh sphere (tol=0.01)", () => {
            kernel.tessellate(sphere, 0.01, 0.5);
        });
        record(r);
        expect(r.median).toBeLessThan(200); // sanity
    });

    it("exportSTEP ×10", () => {
        const box = kernel.makeBox(10, 20, 30);
        const r = bench("exportSTEP ×10", () => {
            for (let i = 0; i < 10; i++) kernel.exportStep(box);
        });
        record(r);
        expect(r.median).toBeLessThan(100); // sanity
    });

    it("translateBatch ×1000 (single call)", () => {
        const box = kernel.makeBox(10, 10, 10);
        const ids = new Module.VectorUint32();
        const offsets = new Module.VectorDouble();
        for (let i = 0; i < 1000; i++) {
            ids.push_back(box);
            offsets.push_back(i * 0.01);
            offsets.push_back(0);
            offsets.push_back(0);
        }
        const r = bench("translateBatch ×1000", () => {
            kernel.translateBatch(ids, offsets);
        });
        ids.delete();
        offsets.delete();
        record(r);
        expect(r.median).toBeLessThan(100);
    });

    it("booleanPipeline ×3 (fuse+cut+fuse)", () => {
        const r = bench("booleanPipeline ×3", () => {
            const base = kernel.makeBox(20, 20, 20);
            const t1 = kernel.translate(kernel.makeSphere(8), 10, 10, 10);
            const t2 = kernel.translate(kernel.makeCylinder(3, 30), 10, 10, 0);
            const t3 = kernel.translate(kernel.makeBox(5, 5, 5), -2, -2, -2);
            const ops = new Module.VectorInt();
            const tools = new Module.VectorUint32();
            ops.push_back(0); tools.push_back(t1); // fuse
            ops.push_back(1); tools.push_back(t2); // cut
            ops.push_back(0); tools.push_back(t3); // fuse
            kernel.booleanPipeline(base, ops, tools);
            ops.delete();
            tools.delete();
        });
        record(r);
        expect(r.median).toBeLessThan(500);
    });

    it("meshBatch ×10 spheres (single call)", () => {
        const ids = new Module.VectorUint32();
        for (let i = 0; i < 10; i++) {
            ids.push_back(kernel.translate(kernel.makeSphere(5), i * 15, 0, 0));
        }
        const r = bench("meshBatch ×10 spheres", () => {
            kernel.meshBatch(ids, 0.1, 0.5);
        });
        ids.delete();
        record(r);
        expect(r.median).toBeLessThan(200);
    });

    it("print results", () => {
        console.log(
            "\n| Benchmark | Min (ms) | Median (ms) | Mean (ms) | Max (ms) |"
        );
        console.log(
            "|-----------|----------|-------------|-----------|----------|"
        );
        for (const r of ALL_RESULTS) {
            console.log(
                `| ${r.name} | ${r.min.toFixed(1)} | ${r.median.toFixed(1)} | ${r.mean.toFixed(1)} | ${r.max.toFixed(1)} |`
            );
        }
    });
});
