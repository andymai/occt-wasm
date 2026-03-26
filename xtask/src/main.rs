//! Build orchestration for occt-wasm.
//!
//! Compiles OCCT C++ to WASM via Emscripten, builds the C++ facade,
//! and packages the output as `@occt-wasm/core`.

use anyhow::Result;
use clap::Parser;

mod build;

/// occt-wasm build tool.
#[derive(Parser)]
#[command(name = "xtask", version, about)]
enum Cli {
    /// Build OCCT static libs + facade → .wasm + .js + .d.ts
    Build {
        /// Enable release optimizations (LTO, wasm-opt -O4)
        #[arg(long)]
        release: bool,
    },
    /// Build only OCCT static libraries (Milestone 0)
    BuildOcct,
    /// Run the facade code generator (v0.1.1)
    Codegen,
    /// Remove all build artifacts
    Clean,
    /// Run integration tests (requires built WASM)
    Test,
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli {
        Cli::Build { release } => build::build(release),
        Cli::BuildOcct => build::build_occt(),
        Cli::Codegen => {
            eprintln!("codegen: not yet implemented (v0.1.1)");
            Ok(())
        }
        Cli::Clean => build::clean(),
        Cli::Test => build::test(),
    }
}
