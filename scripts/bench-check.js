#!/usr/bin/env node
/**
 * Compare benchmark results against a stored baseline.
 * Fails with exit code 1 if a benchmark regresses by more than BOTH a relative
 * (15%) and an absolute (0.5ms) margin. The absolute floor keeps sub-millisecond
 * benchmarks (e.g. mesh sphere ~0.6ms) from flake-failing on timer/scheduling
 * jitter, where a 0.1ms swing is already +17% but is pure noise.
 *
 * Reads results from benchmarks/last-run.json, which test/bench.test.ts writes
 * directly via fs. (It used to parse the markdown table from vitest's stdout,
 * but the default reporter suppresses per-test console.log when piped, so the
 * gate received zero rows and passed silently.)
 *
 * Usage:
 *   npx vitest run test/bench.test.ts && node scripts/bench-check.js
 *   node scripts/bench-check.js --update-baseline   # after a run
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = resolve(__dirname, '../benchmarks/baseline.json');
const RESULTS_PATH = resolve(__dirname, '../benchmarks/last-run.json');
const THRESHOLD = 0.15; // 15% relative regression threshold
const MIN_ABSOLUTE_MS = 0.5; // ignore regressions smaller than this in absolute terms (sub-ms noise)

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

// Every benchmark in the baseline must appear in the output. A missing one means
// the table was empty or partial, so the regression gate never actually ran for
// it — fail loudly instead of passing silently.
const missing = Object.keys(baseline).filter((name) => !(name in results));
if (missing.length > 0) {
    console.log(`\nERROR: ${missing.length} baseline benchmark(s) missing from output:`);
    for (const name of missing) console.log(`  - ${name}`);
    console.log('The benchmark table was empty or partial; the regression gate cannot run. Failing.');
    process.exit(1);
}

let regressions = 0;

console.log(`\nRegression check (fails at >${THRESHOLD * 100}% AND >${MIN_ABSOLUTE_MS}ms):`);
for (const [name, median] of Object.entries(results)) {
    const base = baseline[name];
    if (base === undefined) {
        console.log(`  ${name}: NEW (no baseline)`);
        continue;
    }
    const change = (median - base) / base;
    const absoluteDelta = median - base;
    if (change > THRESHOLD && absoluteDelta > MIN_ABSOLUTE_MS) {
        console.log(`  REGRESSION: ${name} ${base.toFixed(1)}ms → ${median.toFixed(1)}ms (+${(change * 100).toFixed(0)}%, +${absoluteDelta.toFixed(1)}ms)`);
        regressions++;
    } else if (change > THRESHOLD) {
        console.log(`  OK (sub-${MIN_ABSOLUTE_MS}ms noise): ${name} ${base.toFixed(1)}ms → ${median.toFixed(1)}ms (+${(change * 100).toFixed(0)}%, +${absoluteDelta.toFixed(1)}ms)`);
    } else if (change < -THRESHOLD) {
        console.log(`  IMPROVED: ${name} ${base.toFixed(1)}ms → ${median.toFixed(1)}ms (${(change * 100).toFixed(0)}%)`);
    } else {
        console.log(`  OK: ${name} ${base.toFixed(1)}ms → ${median.toFixed(1)}ms (${(change * 100).toFixed(0)}%)`);
    }
}

if (regressions > 0) {
    console.log(`\n${regressions} benchmark(s) regressed >${THRESHOLD * 100}% AND >${MIN_ABSOLUTE_MS}ms. Failing.`);
    process.exit(1);
} else {
    console.log('\nNo performance regressions detected.');
}
