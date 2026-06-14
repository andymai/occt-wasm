//! Shared utilities for the xtask build tool.

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};

/// Project root (parent of xtask/).
pub fn project_root() -> Result<PathBuf> {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR")
        .unwrap_or_else(|_| env!("CARGO_MANIFEST_DIR").to_string());
    let root = Path::new(&manifest_dir)
        .parent()
        .context("xtask must be inside the workspace")?
        .to_path_buf();
    Ok(root)
}

/// Locate the OCCT static-lib directory in an Emscripten build tree.
///
/// emsdk's wasm32 target is detected by OCCT's build as 32-bit Linux, so the
/// libs land in `lin32/clang/lib`. The other entries are fallbacks for alternate
/// layouts; the specific clang paths are tried before the bare `lib/` so a stray
/// top-level `lib/` can't shadow the real build output. The npm and WASI builds
/// share this one ordering so they always resolve to the same directory.
pub fn find_occt_lib_dir(occt_build: &Path) -> Result<PathBuf> {
    let candidates = [
        occt_build.join("lin32/clang/lib"),
        occt_build.join("lin/clang/lib"),
        occt_build.join("wasm32/clang/lib"),
        occt_build.join("lib"),
    ];
    candidates
        .iter()
        .find(|p| p.exists())
        .cloned()
        .with_context(|| {
            format!(
                "OCCT static libs not found under {}; tried: {}",
                occt_build.display(),
                candidates
                    .iter()
                    .map(|p| p.display().to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        })
}

/// Path to `wasm-opt`, preferring emsdk's bundled copy (which has the correct
/// feature flags) over whatever happens to be on `PATH`.
pub fn find_wasm_opt() -> PathBuf {
    if let Some(p) = std::env::var("EMSDK")
        .ok()
        .map(|e| PathBuf::from(e).join("upstream/bin/wasm-opt"))
        .filter(|p| p.exists())
    {
        return p;
    }
    if let Some(p) = home_dir()
        .map(|h| h.join("emsdk/upstream/bin/wasm-opt"))
        .filter(|p| p.exists())
    {
        return p;
    }
    PathBuf::from("wasm-opt")
}

/// The user's home directory from `$HOME`, if set.
pub fn home_dir() -> Option<PathBuf> {
    std::env::var("HOME").ok().map(PathBuf::from)
}

/// Convert a byte count to mebibytes for human-readable build output.
#[allow(clippy::cast_precision_loss)] // file sizes fit in an f64 mantissa
pub fn bytes_to_mb(n: u64) -> f64 {
    n as f64 / 1_048_576.0
}
