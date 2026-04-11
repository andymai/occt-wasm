//! # occt-wasm
//!
//! `OpenCascade` CAD kernel via `WebAssembly` — no C++ toolchain required.
//!
//! This crate embeds a pre-built WASM binary of the [OpenCascade](https://github.com/Open-Cascade-SAS/OCCT)
//! B-Rep CAD kernel and runs it via [wasmtime](https://wasmtime.dev/). You get
//! full OCCT functionality (primitives, booleans, sweeps, tessellation, STEP I/O)
//! without installing any C++ compiler, `CMake`, or OCCT libraries.
//!
//! # Quick Start
//!
//! ```no_run
//! use occt_wasm::OcctKernel;
//!
//! let mut kernel = OcctKernel::new().unwrap();
//!
//! // Create shapes
//! let box_shape = kernel.make_box(10.0, 20.0, 30.0).unwrap();
//! let sphere = kernel.make_sphere(8.0).unwrap();
//!
//! // Boolean operations
//! let result = kernel.fuse(box_shape, sphere).unwrap();
//!
//! // Query
//! let volume = kernel.get_volume(result).unwrap();
//!
//! // Tessellate for rendering
//! let mesh = kernel.tessellate(result, 0.1, 0.5).unwrap();
//! println!("vertices: {}, triangles: {}",
//!     mesh.positions.len() / 3,
//!     mesh.indices.len() / 3);
//!
//! // STEP export
//! let step_data = kernel.export_step(result).unwrap();
//! ```
//!
//! # Architecture
//!
//! The WASM binary is brotli-compressed and embedded via `include_bytes!`.
//! On first call to [`OcctKernel::new()`], it is decompressed and compiled
//! by wasmtime. Shape data lives in an arena inside the WASM sandbox,
//! referenced by opaque [`ShapeHandle`] values.

#![doc(html_root_url = "https://docs.rs/occt-wasm/1.5.0")]
// Generated code does cross-boundary integer casting (u32 <-> i32 for WASM ABI)
// and has parameter names from the C++ facade that trigger similar_names.
#![allow(
    clippy::redundant_pub_crate,
    clippy::cast_possible_wrap,
    clippy::cast_sign_loss,
    clippy::cast_possible_truncation,
    clippy::similar_names,
    clippy::too_many_arguments
)]

pub mod error;
pub mod kernel;
mod kernel_generated;
pub mod types;

pub use error::{OcctError, OcctResult};
pub use kernel::OcctKernel;
pub use types::*;
