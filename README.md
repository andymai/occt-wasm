# occt-wasm

A better OCCT-to-WASM compilation pipeline. Compiles the [OpenCascade](https://www.opencascade.com/) C++ CAD library to WebAssembly with smaller bundle size, cleaner TypeScript bindings, and a modern build system.

## Status

**Work in progress** — research complete, scaffolding underway.

## Goals

- Compile OCCT C++ to WASM via Emscripten with smaller output (~8-9MB raw, ~2-3MB Brotli)
- Clean TypeScript API with arena-based shape handles (no `Handle_*` naming, no manual `.delete()`)
- Rust-based build orchestration (`cargo xtask build`)
- Docker-based reproducible builds (pinned emsdk 5.0.3)

## Quick Start

```bash
# Prerequisites: Rust 1.85+, Docker

# Clone with OCCT submodule
git clone --recurse-submodules https://github.com/andymai/occt-wasm
cd occt-wasm

# Install Node dependencies (for commit hooks)
npm install

# Build OCCT static libraries (inside Docker)
docker build -t occt-wasm-builder .
docker run -it --rm -v $(pwd):/workspace occt-wasm-builder bash scripts/build.sh

# Or via xtask (once inside Docker)
cargo xtask build-occt
```

## Architecture

See [architecture docs](https://github.com/andymai/occt-wasm/wiki) for details.

## License

Build tooling: MIT OR Apache-2.0

Compiled WASM output: LGPL-2.1 (inherits from OCCT)
