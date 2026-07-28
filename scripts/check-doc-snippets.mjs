#!/usr/bin/env node
/**
 * Typecheck the documented code samples against the real declarations.
 *
 * Issue #223 was a README snippet that could not compile — `getBoundingBox`
 * had gained a required parameter the docs never picked up. Nothing caught it
 * because no tooling ever reads the README.
 *
 * Only fences explicitly marked `” ```typescript check ` are compiled. Marking
 * is opt-in so a block is never silently skipped by a heuristic that quietly
 * stopped matching.
 *
 * Most blocks are fragments that assume a surrounding context — a live
 * `kernel`, a couple of shapes. Name what the block assumes and it is declared
 * for you: `” ```typescript check kernel,a,b `. The names are listed rather
 * than inferred so a fragment can never pass by accident because a heuristic
 * guessed a binding into existence.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "target", "doc-snippets");
const DOCS = ["README.md"];

const FENCE = /^\s*(?:>\s?)?```(\w+)([^\n]*)$/;

function extract(markdown) {
    const blocks = [];
    const lines = markdown.split("\n");
    let open = null;
    lines.forEach((line, i) => {
        const fence = line.match(FENCE);
        if (open) {
            if (fence || /^\s*(?:>\s?)?```\s*$/.test(line)) {
                blocks.push({ ...open, code: open.code.join("\n") });
                open = null;
                return;
            }
            open.code.push(line.replace(/^\s*>\s?/, ""));
            return;
        }
        const marker = fence && fence[2].match(/\bcheck\b\s*([\w,]*)/);
        if (marker) {
            const context = marker[1] ? marker[1].split(",").filter(Boolean) : [];
            open = { lang: fence[1], line: i + 1, code: [], context };
        }
    });
    return blocks;
}

/**
 * Types for the identifiers a fragment may name in its fence. Written as inline
 * `import(...)` types so a preamble can never collide with a block's own
 * imports.
 */
const CONTEXT = (idx, wrk) => ({
    kernel: `import("${idx}").OcctKernel`,
    worker: `import("${wrk}").OcctWorker`,
    doc: `import("${idx}").XCAFDocument`,
    a: `import("${idx}").ShapeHandle`,
    b: `import("${idx}").ShapeHandle`,
    base: `import("${idx}").ShapeHandle`,
    tool1: `import("${idx}").ShapeHandle`,
    tool2: `import("${idx}").ShapeHandle`,
    shape: `import("${idx}").ShapeHandle`,
    box: `import("${idx}").ShapeHandle`,
    fused: `import("${idx}").ShapeHandle`,
    profile: `import("${idx}").ShapeHandle`,
    spine: `import("${idx}").ShapeHandle`,
    wire: `import("${idx}").ShapeHandle`,
    face: `import("${idx}").ShapeHandle`,
    edge: `import("${idx}").ShapeHandle`,
    gear: `import("${idx}").ShapeHandle`,
    stepData: "string",
});

const rel = (...p) => relative(OUT, join(ROOT, ...p)).replace(/\\/g, "/");
const entrypoint = rel("ts", "src", "index.ts");
const workerpoint = rel("ts", "src", "worker.ts");
const types = CONTEXT(entrypoint, workerpoint);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const written = [];
for (const doc of DOCS) {
    const blocks = extract(readFileSync(join(ROOT, doc), "utf8"));
    blocks.forEach((block, n) => {
        const name = `${doc.replace(/\W+/g, "_")}-${block.line}.ts`;
        const unknown = block.context.filter((c) => !(c in types));
        if (unknown.length) {
            console.error(`${doc}:${block.line} names unknown context: ${unknown.join(", ")}`);
            console.error(`Add it to CONTEXT in ${rel("scripts", "check-doc-snippets.mjs")}.`);
            process.exit(1);
        }
        const preamble = block.context.map((c) => `declare const ${c}: ${types[c]};`).join("\n");
        // Samples import the published package name; point that at the source.
        const code = block.code
            .replace(/(from\s+["'])occt-wasm\/worker(["'])/g, `$1${workerpoint}$2`)
            .replace(/(from\s+["'])occt-wasm(["'])/g, `$1${entrypoint}$2`);
        // `export {}` keeps each snippet its own module, so declarations in one
        // cannot leak into another and mask a missing import.
        writeFileSync(join(OUT, name), `${preamble}\nexport {};\n${code}\n`);
        written.push({ name, doc, line: block.line, n, context: block.context });
    });
}

if (written.length === 0) {
    console.error("No snippets marked for checking — expected at least one ```typescript check fence.");
    process.exit(1);
}

writeFileSync(
    join(OUT, "tsconfig.json"),
    `${JSON.stringify(
        {
            compilerOptions: {
                strict: true,
                target: "ES2022",
                lib: ["ES2022", "ESNext.Disposable", "DOM"],
                module: "ESNext",
                moduleResolution: "bundler",
                allowImportingTsExtensions: true,
                noUncheckedIndexedAccess: true,
                exactOptionalPropertyTypes: true,
                noEmit: true,
                skipLibCheck: true,
                types: [],
            },
            include: ["./*.ts"],
        },
        null,
        2,
    )}\n`,
);

console.log(`Checking ${written.length} documented snippet(s):`);
for (const w of written) console.log(`  ${w.doc}:${w.line}`);

try {
    execFileSync("npx", ["tsgo", "--noEmit", "-p", join(OUT, "tsconfig.json")], {
        cwd: join(ROOT, "ts"),
        stdio: "inherit",
    });
} catch {
    console.error(
        "\nA documented snippet no longer compiles against ts/src. Fix the snippet or the API — this is what issue #223 was.",
    );
    process.exit(1);
}
console.log("All documented snippets compile.");
