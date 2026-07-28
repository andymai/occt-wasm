#!/usr/bin/env node
/**
 * Typecheck the documented code samples against the real declarations.
 *
 * Issue #223 was a README snippet that could not compile — `getBoundingBox`
 * had gained a required parameter the docs never picked up. Nothing caught it
 * because no tooling ever reads the README.
 *
 * Only fences explicitly marked `” ```typescript check ` are compiled; most
 * blocks are deliberate fragments that reference undeclared identifiers or
 * redeclare the same binding to show alternatives. Marking is opt-in so a
 * block is never silently skipped by a heuristic that stopped matching.
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
        if (fence && /\bcheck\b/.test(fence[2])) {
            open = { lang: fence[1], line: i + 1, code: [] };
        }
    });
    return blocks;
}

const entrypoint = relative(OUT, join(ROOT, "ts", "src", "index.ts")).replace(/\\/g, "/");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const written = [];
for (const doc of DOCS) {
    const blocks = extract(readFileSync(join(ROOT, doc), "utf8"));
    blocks.forEach((block, n) => {
        const name = `${doc.replace(/\W+/g, "_")}-${block.line}.ts`;
        // Samples import the published package name; point that at the source.
        const code = block.code.replace(/(from\s+["'])occt-wasm(["'])/g, `$1${entrypoint}$2`);
        writeFileSync(join(OUT, name), `${code}\n`);
        written.push({ name, doc, line: block.line, n });
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
