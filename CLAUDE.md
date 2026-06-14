# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

occt-wasm compiles OpenCascade (OCCT) C++ to WebAssembly and ships it two ways from one C++ facade: an Embind-based npm package (`occt-wasm`, in `ts/`) and a wasmtime-backed Rust crate (`occt-wasm`, in `crate/`) that embeds a standalone WASI build.

## Build & test

Prerequisites: Rust 1.95 (pinned in `rust-toolchain.toml`), emsdk 5.0.3. Building the OCCT static libs from scratch is slow (~1h); CI and the `docker:*` scripts skip it by using the prebuilt `ghcr.io/andymai/occt-wasm-builder` image, which bakes the libs.

```bash
cargo xtask build-occt           # OCCT static libs (slow; only after an OCCT bump)
cargo xtask build [--release]    # OCCT (if missing) + facade → dist/occt-wasm.{js,wasm}; --release adds LTO + wasm-opt
cargo xtask build-wasi --release # Standalone WASI .wasm → brotli → crate/src/occt-wasm.wasm.br
cargo xtask codegen              # Regenerate the facade from specs (see "Codegen")
cargo xtask test                 # Vitest — requires a prior build (loads dist/occt-wasm.wasm)
cargo xtask clean
```

Tests load the prebuilt WASM from `dist/`, so **run a build before testing**. To iterate faster, drive vitest directly from `ts/`:

```bash
cd ts && npx vitest run ../test/integration.test.ts   # one file
cd ts && npx vitest run -t "fuse"                      # tests whose name matches
cd ts && npx tsc --noEmit && npx eslint src/           # the lint gate — no WASM needed
```

Benchmarks: `npx vitest run test/bench.test.ts` (from repo root, after a build) writes `benchmarks/last-run.json`; `node scripts/bench-check.js` gates it against `baseline.json` (a regression is >15% **and** >0.5ms). Refresh the baseline with `node scripts/bench-check.js --update-baseline` after a run.

## Architecture

Layering: **OCCT C++ → C++ facade (`OcctKernel`) → Embind / WASI C-ABI → TS wrapper or Rust crate**.

- `facade/` — the C++ facade. Almost entirely **generated** (`facade/generated/{kernel,bindings,wasi_exports}.cpp`); only `facade/src/kernel.cpp` (the arena, mesh extraction, XCAF helpers) is hand-written.
- `ts/src/` — the npm package. `index.ts` is the `OcctKernel` wrapper; `raw-types.ts` the Embind type surface; `types.ts` shared types + `OcctError`/`wrap`; `worker.ts` an off-main-thread Comlink proxy; `xcaf-document.ts` the XCAF assembly builder (real OCCT XDE for colors/names/glTF); `svg.ts` HLR projection rendering.
- `xtask/` — Rust build orchestration **and** the code generator (`xtask/src/codegen/`).
- `crate/` — the Rust crate; embeds `occt-wasm.wasm.br` and runs it via wasmtime. `crate/src/kernel_generated.rs` is generated.

### Codegen (the central seam)
`xtask/src/codegen/config.rs` holds a declarative `MethodSpec` list — the single source of truth for the facade surface. Most entries are `MethodKind::CustomBody`, storing the full C++ body as a Rust string literal; a few use templated kinds (`SimpleShape`/`BooleanOp`/`FilletLike`). `cargo xtask codegen` emits the four generated files from these specs and runs `config::validate` first.

The generated files are **committed** (force-tracked despite `.gitignore`). After any change under `xtask/src/codegen/` or to a spec, run `cargo xtask codegen && cargo fmt --all` and commit the result — the CI lint job fails on drift.

### Two build targets, one facade
- **npm** (`cargo xtask build`): facade + OCCT linked with Embind + JS glue → `dist/occt-wasm.{js,wasm}`.
- **crate** (`cargo xtask build-wasi`): linked with `-sSTANDALONE_WASM=1` (no JS, C-ABI exports from `wasi_exports.cpp`) → brotli → `crate/src/occt-wasm.wasm.br`.

Any facade/codegen change invalidates the committed `wasm.br`. CI's "WASI build + stale-check" rebuilds it and **fails** if the bytes differ, uploading a fresh `occt-wasm.wasm.br-fresh` artifact — download it (`gh run download <id> -n occt-wasm.wasm.br-fresh`), drop it at `crate/src/occt-wasm.wasm.br`, and commit. Bumping the OCCT submodule additionally requires rebuilding + pushing the builder image (CI links against its baked libs).

### Memory & errors
Shapes live in a u32-keyed arena (`store`/`get`/`release`/`releaseAll`); IDs are never auto-freed, so the TS wrapper backs them with `Symbol.dispose` + a FinalizationRegistry safety net. Array arguments cross the boundary through `#withU32`/`#withF64`/`#withI32` scope guards (a bulk heap copy above a size threshold). The facade catches OCCT `Standard_Failure` and re-throws `std::runtime_error`; the TS `wrap()` in `types.ts` converts any throw to an `OcctError` whose `code` is inferred by `classifyError` from the operation name + message.

## CI shape
- **lint** (no WASM): `cargo fmt --check`, `clippy -D warnings`, `tsc --noEmit`, `eslint`, plus the codegen drift check.
- **build-test**: builds the Embind WASM in the builder container, runs the full vitest suite + the bench gate.
- **build-wasi**: the `wasm.br` stale-check above. Releases ship via release-please → npm (OIDC) and a `crate-v*` tag → crates.io.

## Conventions
- Rust edition 2024, brepkit-level lints (deny `unsafe`/`unwrap`/`panic`). C++ clang-format (LLVM, 4-space, 100 col). TS strict, ESM-only, branded `ShapeHandle`.
- Conventional Commits; scopes seen in history: `facade`, `xtask`, `ts`, `crate`, `docker`, `ci`, `docs`, `bench`, `test`.
- RapidJSON headers are isolated in `3rdparty/` (gitignored; fetched by `scripts/fetch-rapidjson.sh`) to avoid Emscripten/glibc conflicts.
