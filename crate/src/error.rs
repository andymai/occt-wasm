//! Error types for the occt-wasm Rust crate.

/// Errors that can occur when using the OCCT WASM kernel.
#[derive(Debug, thiserror::Error)]
pub enum OcctError {
    /// An OCCT operation failed inside the WASM module.
    #[error("{operation}: {message}")]
    Operation {
        /// The facade method that failed (e.g. `make_box`, `fuse`).
        operation: String,
        /// The error message from OCCT.
        message: String,
    },

    /// The WASM runtime encountered an error.
    #[error("WASM runtime error: {0}")]
    Runtime(#[from] wasmtime::Error),

    /// A memory access or data conversion error.
    #[error("memory error: {0}")]
    Memory(String),
}

/// Convenience alias for `Result<T, OcctError>`.
pub type OcctResult<T> = Result<T, OcctError>;
