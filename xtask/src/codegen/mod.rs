//! Facade code generator for occt-wasm.
//!
//! Declares the IR types and declarative method configuration used to
//! auto-generate C++ facade implementations from OCCT class patterns.

pub mod config;
pub mod emitter;
pub mod run;
pub mod rust_emitter;
pub mod types;
pub mod wasi_emitter;
