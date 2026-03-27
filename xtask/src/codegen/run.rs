//! Orchestrator for the facade code generator.
//!
//! Reads the declarative method configuration, invokes the emitter, and
//! writes the generated C++ files to `facade/generated/`.

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};

use super::config;
use super::emitter;
use super::types::MethodKind;

/// Project root (parent of xtask/).
fn project_root() -> Result<PathBuf> {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR")
        .unwrap_or_else(|_| env!("CARGO_MANIFEST_DIR").to_string());
    let root = Path::new(&manifest_dir)
        .parent()
        .context("xtask must be inside the workspace")?
        .to_path_buf();
    Ok(root)
}

/// Run the facade code generator.
///
/// Reads method specs from `config`, emits C++ via `emitter`, and writes
/// the output to `facade/generated/kernel.cpp` and `bindings.cpp`.
pub fn run() -> Result<()> {
    let root = project_root()?;
    let out_dir = root.join("facade/generated");

    std::fs::create_dir_all(&out_dir).context("failed to create facade/generated/")?;

    let all_methods = config::target_methods();

    // Partition into generable and skipped
    let generable: Vec<&_> = all_methods
        .iter()
        .filter(|m| m.kind != MethodKind::Skip)
        .collect();

    let skipped = all_methods.len() - generable.len();

    eprintln!(
        "Codegen: {} methods generable, {skipped} skipped, {} total",
        generable.len(),
        all_methods.len()
    );

    // Emit C++ files
    let kernel_cpp = emitter::emit_kernel(&generable);
    let bindings_cpp = emitter::emit_bindings(&generable);

    let kernel_path = out_dir.join("kernel.cpp");
    let bindings_path = out_dir.join("bindings.cpp");

    std::fs::write(&kernel_path, &kernel_cpp).context("failed to write kernel.cpp")?;
    std::fs::write(&bindings_path, &bindings_cpp).context("failed to write bindings.cpp")?;

    eprintln!("  Wrote {}", kernel_path.display());
    eprintln!("  Wrote {}", bindings_path.display());

    // Summary by category
    let mut categories: std::collections::BTreeMap<&str, usize> = std::collections::BTreeMap::new();
    for m in &generable {
        *categories.entry(m.category).or_insert(0) += 1;
    }
    for (cat, count) in &categories {
        eprintln!("    {cat}: {count} methods");
    }

    Ok(())
}
