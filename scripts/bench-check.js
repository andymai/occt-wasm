#!/usr/bin/env node
/**
 * Compare benchmark output against a stored baseline.
 * Fails with exit code 1 if any Core 5 benchmark regresses >15%.
 *
 * Usage:
 *   npx vitest run test/bench.test.ts 2>&1 | node scripts/bench-check.js
 *   node scripts/bench-check.js < bench-output.txt
 *
 * To update the baseline:
 *   node scripts/bench-check.js --update-baseline < bench-output.txt
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = resolve(__dirname, '../benchmarks/baseline.json');
const THRESHOLD = 0.15; // 15% regression threshold

// Read stdin
let input = '';
process.stdin.setEncoding('utf-8');
for await (const chunk of process.stdin) {
    input += chunk;
}

// Parse benchmark table from vitest output
const lines = input.split('\n').filter(l => l.startsWith('|') && !l.includes('---') && !l.includes('Benchmark'));
const results = {};
for (const line of lines) {
    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 3) continue;
    const name = cols[0];
    const median = parseFloat(cols[2]);
    if (!isNaN(median)) results[name] = median;
}

if (Object.keys(results).length === 0) {
    console.log('No benchmark results found in input.');
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
let regressions = 0;

console.log('\nRegression check (threshold: 15%):');
for (const [name, median] of Object.entries(results)) {
    const base = baseline[name];
    if (base === undefined) {
        console.log(`  ${name}: NEW (no baseline)`);
        continue;
    }
    const change = (median - base) / base;
    if (change > THRESHOLD) {
        console.log(`  REGRESSION: ${name} ${base.toFixed(1)}ms → ${median.toFixed(1)}ms (+${(change * 100).toFixed(0)}%)`);
        regressions++;
    } else if (change < -THRESHOLD) {
        console.log(`  IMPROVED: ${name} ${base.toFixed(1)}ms → ${median.toFixed(1)}ms (${(change * 100).toFixed(0)}%)`);
    } else {
        console.log(`  OK: ${name} ${base.toFixed(1)}ms → ${median.toFixed(1)}ms (${(change * 100).toFixed(0)}%)`);
    }
}

if (regressions > 0) {
    console.log(`\n${regressions} benchmark(s) regressed >15%. Failing.`);
    process.exit(1);
} else {
    console.log('\nNo performance regressions detected.');
}
