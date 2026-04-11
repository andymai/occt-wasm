# occt-wasm

OCCT-to-WASM build pipeline. Compiles OpenCascade C++ to WebAssembly with a clean TypeScript API.

## Architecture

Emscripten compiles OCCT C++ to WASM. A hand-written C++ facade (`OcctKernel` class) wraps OCCT with an arena-based API (u32 shape IDs). Embind bridges C++ to JS. A TypeScript wrapper (`occt-wasm`) provides the public API.

```
OCCT C++ (submodule) → emcmake cmake → static libs
C++ facade (facade/)  → emcc → .o files
Link (static libs + facade) → emcc -lembind → .wasm + .js
Post-optimize → wasm-opt -O4 → dist/
TS wrapper (ts/) → tsc → occt-wasm
```

## Repo Layout

- `facade/` — C++ facade (OcctKernel class + Embind bindings)
- `ts/` — TypeScript wrapper (occt-wasm npm package)
- `xtask/` — Rust build orchestration (clap + anyhow + xshell)
- `occt/` — OCCT V8.0.0-rc5 (git submodule)
- `3rdparty/` — Isolated third-party headers (RapidJSON for glTF, gitignored)
- `scripts/` — build.sh, symbol_dispose.js, publish.sh, fetch-rapidjson.sh, bench-check.js
- `test/` — Vitest integration tests (integration, expanded, xcaf, bench) + benchmark.ts
- `benchmarks/` — CI benchmark baselines (baseline.json)
- `examples/` — Browser demos (Three.js with tessellation + glTF)
- `dist/` — Build output (gitignored)

## Commands

```bash
cargo xtask build-occt    # Build OCCT static libs (Milestone 0)
cargo xtask build         # Full build: OCCT + facade → .wasm
cargo xtask build --release  # Release build with LTO + wasm-opt
cargo xtask clean         # Remove build artifacts
cargo xtask test          # Run Vitest integration tests
cargo xtask codegen       # Generate facade from OCCT headers (v0.1.1)
./scripts/publish.sh      # Local npm publish (requires tagged commit)
./scripts/publish.sh --dry-run  # Verify build without publishing
npm run docker:build             # Docker: full build + test
npm run docker:dist              # Docker: build + copy dist/ to host
```

## Conventions

- Rust: edition 2024, brepkit-level lints (deny unsafe/unwrap/panic)
- C++: clang-format (LLVM, 4-space, 100 col)
- TypeScript: strict mode, ESM only, branded ShapeHandle type
- Commits: Conventional Commits (scopes: facade, xtask, ts, crate, docker, ci, docs)
- Errors: facade catches Standard_Failure, re-throws as std::runtime_error
- Memory: arena-based u32 IDs, Symbol.dispose support, FinalizationRegistry safety net
- XCAF: per-document label registry (facade IDs), real OCCT XDE for assembly/color/glTF
- Dependencies: RapidJSON headers isolated in 3rdparty/ to avoid Emscripten/glibc conflicts

## Key References

- Architecture: `~/Documents/Obsidian Vault/Projects/occt-wasm/occt-wasm-architecture.md`
- Tasks: `~/Documents/Obsidian Vault/Projects/occt-wasm/occt-wasm-tasks.md`
- brepjs OCCT build: `~/Git/brepjs/packages/brepjs-opencascade/build-config/brepjs.yml`

## Workflow

This project is built entirely via Claude Code. Every session must:
1. Read occt-wasm-tasks.md first
2. Update tasks as work completes
3. Log decisions in occt-wasm-decisions.md
4. Fix architecture doc when reality diverges
5. Update memory file with current state
