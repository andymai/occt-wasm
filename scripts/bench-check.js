#!/usr/bin/env node
/**
 * Compare benchmark results against a stored baseline.
 * Fails with exit code 1 if a benchmark regresses past BOTH a relative (15%) and
 * an absolute (1ms) margin AND ran slower than the baseline in raw wall-clock
 * terms. The absolute floor keeps sub-millisecond benchmarks from flake-failing
 * on timer/scheduling jitter (a 0.5ms swing on a 0.8ms benchmark is +60% but pure
 * noise); the raw-slower guard drops normalization artifacts, where a run that was
 * faster than baseline gets inflated past baseline (see the regression loop).
 *
 * Results are normalized by a runner speed factor before that comparison. Back
 * to back CI runs of identical code differ by 23-42% per benchmark on shared
 * ubuntu-latest runners, and the difference is uniform: a slow runner is slow on
 * every benchmark at once. Comparing raw medians against raw medians therefore
 * measures which machine drew the job, not the code, and no baseline value makes
 * the gate both quiet and sensitive. Dividing every result by the median of the
 * per-benchmark result/baseline ratios cancels the machine, so a single
 * benchmark moving against the trend is what trips the gate.
 *
 * The blind spot is a change that slows every benchmark by the same factor:
 * normalization absorbs it. The factor is printed on every run so that case
 * stays visible in the log.
 *
 * Reads results from benchmarks/last-run.json, which test/bench.test.ts writes
 * directly via fs. (It used to parse the markdown table from vitest's stdout,
 * but the default reporter suppresses per-test console.log when piped, so the
 * gate received zero rows and passed silently.)
 *
 * Usage:
 *   npx vitest run test/bench.test.ts && node scripts/bench-check.js
 *   node scripts/bench-check.js --update-baseline   # after a run
 *
 * --update-baseline writes that run's raw medians. Normalization means the
 * absolute level no longer has to match runner hardware, only the relative cost
 * between benchmarks does, so a local run can seed a baseline. Reconcile a few
 * CI runs (the benchmark-results artifact) before committing one: booleanPipeline
 * has been bimodal run to run, and a baseline that lands on its other mode is
 * wrong in shape, which is the one thing normalization cannot rescue.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Overridable so test/bench-check.test.ts can drive the gate against fixtures
// without clobbering the committed baseline.
const BASELINE_PATH = process.env.BENCH_BASELINE_PATH ?? resolve(__dirname, '../benchmarks/baseline.json');
const RESULTS_PATH = process.env.BENCH_RESULTS_PATH ?? resolve(__dirname, '../benchmarks/last-run.json');
const THRESHOLD = 0.15; // 15% relative regression threshold
// Ignore regressions smaller than this in absolute terms. Sub-millisecond
// benchmarks swing ~0.5ms run to run from timer and scheduling jitter alone
// (meshBatch's 0.76ms baseline was seen at 1.3ms on an unchanged build, +0.54ms
// and +71%), so the floor has to sit clear of that, not on top of it. The cost
// is that a real sub-1ms regression on a fast benchmark reads as noise, but on a
// shared runner it is not separable from noise anyway.
const MIN_ABSOLUTE_MS = 1.0;
// Below this many shared benchmarks the median ratio is too easily swung by a
// real regression, so normalization is skipped rather than trusted.
const MIN_SHARED_FOR_NORMALIZATION = 5;

if (!existsSync(RESULTS_PATH)) {
    console.error(
        `No benchmark results at ${RESULTS_PATH}.\n` +
        'Run `npx vitest run test/bench.test.ts` first (it writes that file).'
    );
    process.exit(1);
}

const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf-8'));

// With no baseline there is nothing to gate against — note and exit cleanly.
// With a baseline, empty/partial results are a FAILURE, not a pass: it usually
// means the suite didn't fully run (a crash or filter), and the missing-benchmark
// check below turns that into a hard failure.
if (Object.keys(results).length === 0 && !existsSync(BASELINE_PATH)) {
    console.log('No benchmark results recorded (and no baseline to check).');
    process.exit(0);
}

console.log(`Parsed ${Object.keys(results).length} benchmarks:`);
for (const [name, median] of Object.entries(results)) {
    console.log(`  ${name}: ${median.toFixed(1)}ms`);
}

// Update baseline mode
if (process.argv.includes('--update-baseline')) {
    writeFileSync(BASELINE_PATH, JSON.stringify(results, null, 2) + '\n');
    console.log(`\nBaseline updated at ${BASELINE_PATH}`);
    process.exit(0);
}

// Compare against baseline
if (!existsSync(BASELINE_PATH)) {
    console.log('\nNo baseline found. Run with --update-baseline to create one.');
    process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));

// Every benchmark in the baseline must appear in the results. A missing one
// means the run was empty or partial, so the regression gate never actually ran
// for it — fail loudly (on stderr, like the missing-file error) instead of
// passing silently.
const missing = Object.keys(baseline).filter((name) => !(name in results));
if (missing.length > 0) {
    console.error(`\nERROR: ${missing.length} baseline benchmark(s) missing from results:`);
    for (const name of missing) console.error(`  - ${name}`);
    console.error('The benchmark run was empty or partial; the regression gate cannot run. Failing.');
    process.exit(1);
}

const medianOf = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const sharedRatios = Object.entries(results)
    .filter(([name]) => baseline[name] !== undefined)
    .map(([name, value]) => value / baseline[name]);

const normalizing = sharedRatios.length >= MIN_SHARED_FOR_NORMALIZATION;
const runnerFactor = normalizing ? medianOf(sharedRatios) : 1;

if (!normalizing) {
    console.log(`\nOnly ${sharedRatios.length} benchmark(s) shared with the baseline; comparing raw medians.`);
} else {
    console.log(`\nRunner speed factor: ${runnerFactor.toFixed(2)}× (median of ${sharedRatios.length} result/baseline ratios).`);
    console.log('Results are divided by it, so comparisons are against baseline-equivalent hardware.');
    if (Math.abs(runnerFactor - 1) > THRESHOLD) {
        console.log(`NOTE: every benchmark moved ~${((runnerFactor - 1) * 100).toFixed(0)}% together. That is normally runner speed,`);
        console.log('but a change that shifts all benchmarks uniformly would look identical. Check the raw values below.');
    }
}

let regressions = 0;

console.log(`\nRegression check (fails at >${THRESHOLD * 100}% AND >${MIN_ABSOLUTE_MS}ms, after normalization):`);
for (const [name, raw] of Object.entries(results)) {
    const base = baseline[name];
    if (base === undefined) {
        console.log(`  ${name}: NEW (no baseline)`);
        continue;
    }
    const scaled = raw / runnerFactor;
    const change = (scaled - base) / base;
    const absoluteDelta = scaled - base;
    // A run that was no slower than the baseline in raw wall-clock terms cannot be
    // a real regression, whatever normalization does to it. exportSTEP carries a
    // fixed STEP-schema/global-controller cost that does not shrink with runner
    // speed, so on a fast runner it slows down less than the compute-bound pack;
    // dividing it by the pack's speed factor then inflates a faster-than-baseline
    // raw time into a phantom regression (seen at raw 17.7ms vs a 20.6ms baseline,
    // reported "+19%"). Requiring raw > base drops exactly that artifact. Blind
    // spot: a genuine regression on a runner fast enough to hold raw at or under
    // baseline is not flagged, but the raw time is printed so it stays visible.
    const ranSlowerRaw = raw > base;
    const shown = `${base.toFixed(1)}ms → ${scaled.toFixed(1)}ms`;
    const rawNote = normalizing ? ` [raw ${raw.toFixed(1)}ms]` : '';
    if (change > THRESHOLD && absoluteDelta > MIN_ABSOLUTE_MS && ranSlowerRaw) {
        console.log(`  REGRESSION: ${name} ${shown} (+${(change * 100).toFixed(0)}%, +${absoluteDelta.toFixed(1)}ms)${rawNote}`);
        regressions++;
    } else if (change > THRESHOLD && !ranSlowerRaw) {
        console.log(`  OK (normalization artifact, raw <= baseline): ${name} ${shown} (+${(change * 100).toFixed(0)}%)${rawNote}`);
    } else if (change > THRESHOLD) {
        console.log(`  OK (sub-${MIN_ABSOLUTE_MS}ms noise): ${name} ${shown} (+${(change * 100).toFixed(0)}%, +${absoluteDelta.toFixed(1)}ms)${rawNote}`);
    } else if (change < -THRESHOLD) {
        console.log(`  IMPROVED: ${name} ${shown} (${(change * 100).toFixed(0)}%)${rawNote}`);
    } else {
        console.log(`  OK: ${name} ${shown} (${(change * 100).toFixed(0)}%)${rawNote}`);
    }
}

if (regressions > 0) {
    console.log(`\n${regressions} benchmark(s) regressed >${THRESHOLD * 100}% AND >${MIN_ABSOLUTE_MS}ms. Failing.`);
    process.exit(1);
} else {
    console.log('\nNo performance regressions detected.');
}
