/**
 * Benchmark: occt-wasm vs opencascade.js vs brepjs-opencascade
 *
 * Measures WASM sizes, startup time, and core operations.
 * Run: npx tsx test/benchmark.ts
 */

import { readFileSync, statSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const require = createRequire(import.meta.url);

// ── Helpers ──────────────────────────────────────────────────────────

function fileSizeMB(path: string): number {
  return statSync(path).size / 1048576;
}

function compressedSizeMB(path: string, algo: "gzip" | "brotli"): number {
  const data = readFileSync(path);
  const cmd = algo === "gzip" ? "gzip" : "brotli";
  const result = execFileSync(cmd, ["-c"], { input: data, maxBuffer: 200 * 1024 * 1024 });
  return result.length / 1048576;
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

async function bench(
  name: string,
  fn: () => void | Promise<void>,
  iterations = 10,
): Promise<number> {
  // Warmup
  await fn();
  await fn();

  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  const ms = median(times);
  console.log(`  ${name}: ${ms.toFixed(1)}ms (median of ${iterations})`);
  return ms;
}

// ── Size Comparison ──────────────────────────────────────────────────

console.log("## WASM Size Comparison\n");
console.log(
  "| Build | Raw | gzip | brotli |",
);
console.log("|-------|-----|------|--------|");

const wasmFiles: Array<{ label: string; path: string }> = [];

// occt-wasm
const occtWasm = join(root, "dist/occt-wasm.wasm");
if (existsSync(occtWasm)) {
  wasmFiles.push({ label: "**occt-wasm** (current build)", path: occtWasm });
}

// opencascade.js
const ocjsWasm = join(
  root,
  "node_modules/opencascade.js/dist/opencascade.wasm.wasm",
);
if (existsSync(ocjsWasm)) {
  wasmFiles.push({ label: "opencascade.js 1.1.1", path: ocjsWasm });
}

// brepjs-opencascade (if available)
const brepjsSingle = join(
  root,
  "../brepjs/packages/brepjs-opencascade/src/brepjs_single.wasm",
);
const brepjsExcept = join(
  root,
  "../brepjs/packages/brepjs-opencascade/src/brepjs_with_exceptions.wasm",
);
if (existsSync(brepjsSingle)) {
  wasmFiles.push({ label: "brepjs-opencascade (single)", path: brepjsSingle });
}
if (existsSync(brepjsExcept)) {
  wasmFiles.push({
    label: "brepjs-opencascade (exceptions)",
    path: brepjsExcept,
  });
}

for (const { label, path } of wasmFiles) {
  const raw = fileSizeMB(path);
  const gz = compressedSizeMB(path, "gzip");
  const br = compressedSizeMB(path, "brotli");
  console.log(
    `| ${label} | ${raw.toFixed(1)} MB | ${gz.toFixed(1)} MB | ${br.toFixed(1)} MB |`,
  );
}

// ── Startup Benchmark ────────────────────────────────────────────────

console.log("\n## Startup Time\n");

// occt-wasm startup
const createOcctWasm = (await import(join(root, "dist/occt-wasm.js"))).default;
let occtModule: any;

await bench("occt-wasm init", async () => {
  occtModule = await createOcctWasm({
    locateFile: () => join(root, "dist/occt-wasm.wasm"),
  });
}, 5);

const kernel = new occtModule.OcctKernel();

// ── Core Operations ──────────────────────────────────────────────────

console.log("\n## Core Operations (occt-wasm)\n");

await bench("makeBox", () => {
  const id = kernel.makeBox(10, 20, 30);
  kernel.release(id);
});

await bench("makeSphere", () => {
  const id = kernel.makeSphere(15);
  kernel.release(id);
});

const boxA = kernel.makeBox(10, 10, 10);
const cyl = kernel.makeCylinder(3, 20);

await bench("fuse(box, cylinder)", () => {
  const id = kernel.fuse(boxA, cyl);
  kernel.release(id);
});

await bench("cut(box, cylinder)", () => {
  const id = kernel.cut(boxA, cyl);
  kernel.release(id);
});

const fuseResult = kernel.fuse(boxA, cyl);
await bench("tessellate(fused, 0.1)", () => {
  kernel.tessellate(fuseResult, 0.1);
});

await bench("fillet(box, 1.0)", () => {
  const box = kernel.makeBox(10, 10, 10);
  const edges = kernel.getSubShapes(box, "edge");
  const edgeVec = new occtModule.VectorUint32();
  const edgeCount = edges.size();
  for (let i = 0; i < edgeCount; i++) {
    edgeVec.push_back(edges.get(i));
  }
  const filleted = kernel.fillet(box, edgeVec, 1.0);
  edgeVec.delete();
  kernel.release(filleted);
  kernel.release(box);
});

// STEP export/import
const stepBox = kernel.makeBox(50, 50, 50);
const stepData = kernel.exportStep(stepBox);

await bench("exportStep(box)", () => {
  kernel.exportStep(stepBox);
});

await bench("importStep(box)", () => {
  const id = kernel.importStep(stepData);
  kernel.release(id);
});

// ── Cleanup ──────────────────────────────────────────────────────────

kernel.release(boxA);
kernel.release(cyl);
kernel.release(fuseResult);
kernel.release(stepBox);
kernel.delete();

console.log("\nDone.");
