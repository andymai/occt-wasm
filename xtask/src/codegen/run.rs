//! Orchestrator for the facade code generator.
//!
//! Reads the declarative method configuration, invokes the emitters, and
//! writes the generated files to `facade/generated/` and `crate/src/`.

use anyhow::{Context, Result};

use super::config;
use super::emitter;
use super::rust_emitter;
use super::types::MethodKind;
use super::wasi_emitter;

use crate::util::project_root;

/// Run the facade code generator.
///
/// Reads method specs from `config`, emits C++ via `emitter`, and writes
/// the output to `facade/generated/kernel.cpp`, `bindings.cpp`,
/// `wasi_exports.cpp`, and `crate/src/kernel_generated.rs`.
pub fn run() -> Result<()> {
    let root = project_root()?;
    let facade_out = root.join("facade/generated");
    let crate_out = root.join("crate/src");

    std::fs::create_dir_all(&facade_out).context("failed to create facade/generated/")?;
    std::fs::create_dir_all(&crate_out).context("failed to create crate/src/")?;

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

    // Emit C++ files (Embind target)
    let kernel_cpp = emitter::emit_kernel(&generable);
    let bindings_cpp = emitter::emit_bindings(&generable);

    let kernel_path = facade_out.join("kernel.cpp");
    let bindings_path = facade_out.join("bindings.cpp");

    std::fs::write(&kernel_path, &kernel_cpp).context("failed to write kernel.cpp")?;
    std::fs::write(&bindings_path, &bindings_cpp).context("failed to write bindings.cpp")?;

    eprintln!("  Wrote {}", kernel_path.display());
    eprintln!("  Wrote {}", bindings_path.display());

    // Emit WASI C-ABI exports
    let wasi_cpp = wasi_emitter::emit_wasi_exports(&generable);
    let wasi_path = facade_out.join("wasi_exports.cpp");
    std::fs::write(&wasi_path, &wasi_cpp).context("failed to write wasi_exports.cpp")?;
    eprintln!("  Wrote {}", wasi_path.display());

    // Emit Rust host API
    let rust_src = rust_emitter::emit_rust_host(&generable);
    let rust_path = crate_out.join("kernel_generated.rs");
    std::fs::write(&rust_path, &rust_src).context("failed to write kernel_generated.rs")?;
    eprintln!("  Wrote {}", rust_path.display());

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
