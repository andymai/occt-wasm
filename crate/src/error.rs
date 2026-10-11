//! Error types for the occt-wasm Rust crate.

/// Errors that can occur when using the OCCT WASM kernel.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum OcctError {
    /// An OCCT operation failed inside the WASM module.
    #[error("{operation}: {message}")]
    Operation {
        /// The facade method that failed (e.g. `make_box`, `fuse`).
        operation: String,
        /// The error message from OCCT.
        message: String,
    },

    /// The limiter given to
    /// [`OcctKernel::from_module_with_limiter()`](crate::OcctKernel::from_module_with_limiter)
    /// refused to grow linear memory.
    ///
    /// The call that needed the memory stopped partway through, so the
    /// kernel's state is undefined: drop it and instantiate a new one.
    #[error("memory limit: growing linear memory from {current} to {requested} bytes was refused")]
    MemoryLimit {
        /// Linear memory size before the refused growth, in bytes.
        current: usize,
        /// The size the module asked to grow to, in bytes.
        requested: usize,
    },

    /// The WASM runtime encountered an error.
    ///
    /// A trap inside OCCT ends up here too. It stops the call partway
    /// through, so after one the kernel's state is undefined: drop it and
    /// instantiate a new one.
    #[error("WASM runtime error: {0}")]
    Runtime(#[source] wasmtime::Error),

    /// A memory access or data conversion error.
    #[error("memory error: {0}")]
    Memory(String),
}

impl From<wasmtime::Error> for OcctError {
    fn from(error: wasmtime::Error) -> Self {
        match error.downcast_ref::<MemoryLimitExceeded>() {
            Some(&MemoryLimitExceeded { current, requested }) => {
                Self::MemoryLimit { current, requested }
            }
            None => Self::Runtime(error),
        }
    }
}

/// Raised by the store's limiter, and turned into [`OcctError::MemoryLimit`]
/// once the trap reaches the host.
#[derive(Debug, thiserror::Error)]
#[error("growing linear memory from {current} to {requested} bytes was refused")]
pub(crate) struct MemoryLimitExceeded {
    pub(crate) current: usize,
    pub(crate) requested: usize,
}

/// Convenience alias for `Result<T, OcctError>`.
pub type OcctResult<T> = Result<T, OcctError>;
