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
