/**
 * Guards scripts/bench-check.js, the CI performance gate.
 *
 * The gate normalizes results by a runner speed factor before comparing, because
 * back to back CI runs of identical code differ by 23-42% per benchmark on shared
 * runners. Getting that normalization wrong is invisible in CI: too aggressive and
 * real regressions are absorbed, too weak and every slow runner turns the build
 * red until someone stops reading the gate. Neither failure mode announces itself,
 * so the arithmetic is pinned here rather than left to the next slow runner.
 *
 * Needs no WASM build; it drives the script over fixture JSON via the
 * BENCH_BASELINE_PATH / BENCH_RESULTS_PATH overrides.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const SCRIPT = join(ROOT, "scripts", "bench-check.js");

const BASELINE: Record<string, number> = {
    "makeBox ×100": 3.5,
    "fuse ×10": 62.1,
    "translate ×1000": 55.6,
    "mesh sphere (tol=0.01)": 0.47,
    "exportSTEP ×10": 27.1,
    "translateBatch ×1000": 55.0,
    "booleanPipeline ×3": 13.4,
    "gridfinity plate cutAll 3×3": 116.9,
    "gridfinity bin fuseAll 5": 58.3,
    "meshBatch ×10 spheres": 0.86,
    "interpolatePoints ×50 push_back": 6.43,
    "interpolatePoints ×50 bulk": 3.7,
};

let dir: string;

const scale = (factor: number): Record<string, number> =>
    Object.fromEntries(Object.entries(BASELINE).map(([name, ms]) => [name, ms * factor]));

function check(
    results: Record<string, number>,
    baseline: Record<string, number> = BASELINE
): { status: number; stdout: string } {
    const baselinePath = join(dir, "baseline.json");
    const resultsPath = join(dir, "last-run.json");
    writeFileSync(baselinePath, JSON.stringify(baseline));
    writeFileSync(resultsPath, JSON.stringify(results));
    const proc = spawnSync("node", [SCRIPT], {
        encoding: "utf8",
        env: {
            ...process.env,
            BENCH_BASELINE_PATH: baselinePath,
            BENCH_RESULTS_PATH: resultsPath,
        },
    });
    return { status: proc.status ?? -1, stdout: proc.stdout + proc.stderr };
}

beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "bench-check-"));
});

afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe("bench-check", () => {
    it("passes a run that matches the baseline exactly", () => {
        const { status, stdout } = check(scale(1));
        expect(status).toBe(0);
        expect(stdout).toContain("No performance regressions detected");
    });

    it("passes a uniformly slow runner and reports the factor", () => {
        const { status, stdout } = check(scale(1.3));
        expect(status).toBe(0);
        expect(stdout).toContain("Runner speed factor: 1.30×");
        expect(stdout).toContain("No performance regressions detected");
    });

    it("passes a uniformly fast runner", () => {
        const { status, stdout } = check(scale(0.75));
        expect(status).toBe(0);
        expect(stdout).toContain("Runner speed factor: 0.75×");
        expect(stdout).toContain("No performance regressions detected");
    });

    it("fails one benchmark that moves against the trend", () => {
        const results = scale(1);
        results["gridfinity plate cutAll 3×3"] *= 1.25;
        const { status, stdout } = check(results);
        expect(status).toBe(1);
        expect(stdout).toContain("REGRESSION: gridfinity plate cutAll 3×3");
        expect(stdout).toContain("1 benchmark(s) regressed");
    });

    it("still fails that benchmark when the whole runner is slow", () => {
        const results = scale(1.3);
        results["gridfinity plate cutAll 3×3"] *= 1.25;
        const { status, stdout } = check(results);
        expect(status).toBe(1);
        expect(stdout).toContain("REGRESSION: gridfinity plate cutAll 3×3");
    });

    it("ignores a large relative move that is under the sub-millisecond floor", () => {
        const results = scale(1);
        results["mesh sphere (tol=0.01)"] *= 1.5; // 0.47ms -> 0.71ms, +50% but +0.24ms
        const { status, stdout } = check(results);
        expect(status).toBe(0);
        expect(stdout).toContain("OK (sub-0.5ms noise): mesh sphere");
    });

    it("fails when the results are missing a baseline benchmark", () => {
        const results = scale(1);
        delete results["fuse ×10"];
        const { status, stdout } = check(results);
        expect(status).toBe(1);
        expect(stdout).toContain("baseline benchmark(s) missing from results");
    });

    it("reports a benchmark with no baseline entry as NEW", () => {
        const results = { ...scale(1), "brand new benchmark": 12.0 };
        const { status, stdout } = check(results);
        expect(status).toBe(0);
        expect(stdout).toContain("brand new benchmark: NEW (no baseline)");
    });

    it("skips normalization when too few benchmarks are shared to trust the median", () => {
        const few = Object.fromEntries(Object.entries(BASELINE).slice(0, 3));
        const { status, stdout } = check(
            Object.fromEntries(Object.entries(few).map(([n, ms]) => [n, ms * 1.3])),
            few
        );
        expect(stdout).toContain("comparing raw medians");
        expect(status).toBe(1); // 1.3x is a real regression when nothing cancels it
    });
});
