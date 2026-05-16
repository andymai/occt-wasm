# occt-wasm

[![Crates.io](https://img.shields.io/crates/v/occt-wasm.svg)](https://crates.io/crates/occt-wasm)
[![Docs.rs](https://docs.rs/occt-wasm/badge.svg)](https://docs.rs/occt-wasm)
[![CI](https://github.com/andymai/occt-wasm/actions/workflows/ci.yml/badge.svg)](https://github.com/andymai/occt-wasm/actions/workflows/ci.yml)

[OpenCascade](https://github.com/Open-Cascade-SAS/OCCT) V8 CAD kernel as a Rust crate — backed by a pre-built, brotli-compressed WebAssembly module loaded via [wasmtime](https://wasmtime.dev/).

No C++ toolchain, no CMake, no system OCCT. Just `cargo add occt-wasm`.

```toml
[dependencies]
occt-wasm = "1"
```

## Why

OCCT is a 2.5 MLoC C++ library. Building it from source takes ~10 minutes and a working Emscripten or system toolchain. This crate ships the WASM artifact in the package itself (~4 MB compressed → ~21 MB on first load), so you get a fully functional CAD kernel from `cargo build`.

Use this crate when you want OCCT inside a Rust server, CLI, or build script — without taking on the OCCT build pipeline. For the browser, use the [`occt-wasm` npm package](https://www.npmjs.com/package/occt-wasm) instead; it wraps the same WASM via Embind.

## Quick Start

```rust,no_run
use occt_wasm::OcctKernel;

let mut kernel = OcctKernel::new()?;

// Primitives
let box_shape = kernel.make_box(10.0, 20.0, 30.0)?;
let sphere = kernel.make_sphere(8.0)?;

// Booleans
let fused = kernel.fuse(box_shape, sphere)?;

// Query
let volume = kernel.get_volume(fused)?;
let bbox = kernel.get_bounding_box(fused, true)?;

// Tessellation (for rendering)
let mesh = kernel.tessellate(fused, 0.1, 0.5)?;
println!("{} triangles", mesh.indices.len() / 3);

// STEP I/O
let step = kernel.export_step(fused)?;
let reimported = kernel.import_step(&step)?;
# Ok::<(), occt_wasm::OcctError>(())
```

Every shape lives in an arena inside the WASM sandbox and is referenced by an opaque [`ShapeHandle`](https://docs.rs/occt-wasm/latest/occt_wasm/struct.ShapeHandle.html). Drop the `OcctKernel` and the arena (and all its memory) goes away.

## What's Covered

The crate exposes the full OCCT facade — 170+ methods generated from the same declarative spec as the C++/TypeScript bindings:

| Category | Examples |
|----------|----------|
| **Primitives** | `make_box`, `make_cylinder`, `make_sphere`, `make_cone`, `make_torus`, `make_rectangle` |
| **Booleans** | `fuse`, `cut`, `common`, `intersect`, `boolean_pipeline` + `*_with_history` variants |
| **Modeling** | `extrude`, `revolve`, `fillet`, `chamfer`, `shell`, `offset`, `draft`, `thicken` |
| **Sweeps** | `pipe`, `loft`, `sweep`, `draft_prism` |
| **Construction** | `make_vertex/edge/wire/face/solid`, `sew`, `make_compound`, B-spline surface fitting |
| **Transforms** | `translate`, `rotate`, `scale`, `mirror`, batch transforms |
| **Topology** | `get_shape_type`, `get_sub_shapes`, `outer_wire`, `shared_edges`, `distance_between` |
| **Tessellation** | `tessellate` (triangles), `mesh_shape` (with face groups), `mesh_batch` |
| **I/O** | STEP (import/export), STL (import/export), glTF export |
| **Query** | volume, surface area, length, center of mass, curvature |
| **Curves** | NURBS data extraction, point/tangent evaluation, interpolation |
| **Projection** | Hidden line removal (HLR) |
| **Healing** | `fix_shape`, `unify_same_domain`, wire/face/solid repair |
| **Evolution** | Per-face history tracking across modifications |
| **XCAF** | Assembly documents with colors, names, component hierarchies |

See the [API docs](https://docs.rs/occt-wasm) for the complete list.

## Performance

First `OcctKernel::new()` decompresses ~4 MB of brotli and JIT-compiles the WASM module. Expect ~100–500 ms depending on the host. Subsequent calls run at native wasmtime speed — typically within ~2x of native OCCT for compute-heavy operations, and dominated by the wasmtime boundary crossing for tiny operations.

Re-use one `OcctKernel` per worker thread; creation is the slow part, individual calls are cheap.

## Features

- `async` — opt-in tokio-based async runtime support.

```toml
[dependencies]
occt-wasm = { version = "1", features = ["async"] }
```

## Errors

All operations return `OcctResult<T>` (`Result<T, OcctError>`). The error enum carries the failing operation name and the OCCT error message:

```rust,no_run
# use occt_wasm::{OcctKernel, OcctError};
# let mut kernel = OcctKernel::new()?;
# let a = kernel.make_box(1.0, 1.0, 1.0)?;
# let b = kernel.make_box(1.0, 1.0, 1.0)?;
match kernel.fuse(a, b) {
    Ok(result) => { /* ... */ }
    Err(OcctError::Operation { operation, message }) => {
        eprintln!("OCCT op {operation} failed: {message}");
    }
    Err(OcctError::Runtime(e)) => eprintln!("WASM runtime error: {e}"),
    Err(OcctError::Memory(msg)) => eprintln!("memory error: {msg}"),
}
# Ok::<(), OcctError>(())
```

## Browser?

This crate uses `wasmtime`, so it runs on native targets — Linux, macOS, Windows, BSDs, anything wasmtime supports. For browsers, use the [`occt-wasm` npm package](https://www.npmjs.com/package/occt-wasm), which loads the same `.wasm` file via Emscripten's JS glue and Embind.

For higher-level CAD in TypeScript, see [brepjs](https://github.com/andymai/brepjs), which builds on the npm package.

## License

- **Crate / wrapper code**: MIT OR Apache-2.0
- **Embedded WASM binary** (the OCCT build): LGPL-2.1-only, inherited from [OCCT](https://dev.opencascade.org/resources/download)

The LGPL requires that end users can replace the LGPL component. Because this crate ships a pre-built WASM, replacement is possible by forking and rebuilding from the [`occt-wasm` repo](https://github.com/andymai/occt-wasm). If you're shipping a closed-source product, consult the [LGPL FAQ](https://www.gnu.org/licenses/lgpl-3.0.en.html).
