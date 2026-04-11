//! Build orchestration for occt-wasm.
//!
//! Compiles OCCT C++ to WASM via Emscripten, builds the C++ facade,
//! and packages the output as `@occt-wasm/core`.

use anyhow::Result;
use clap::Parser;

mod build;
mod build_wasi;
mod codegen;
mod util;

/// occt-wasm build tool.
#[derive(Parser)]
#[command(name = "xtask", version, about)]
enum Cli {
    /// Build OCCT static libs + facade → .wasm + .js + .d.ts
    Build {
        /// Enable release optimizations (LTO, wasm-opt -O4)
        #[arg(long)]
        release: bool,
        /// Optimize for size (-Oz) instead of speed (-O3); requires --release
        #[arg(long)]
        size: bool,
    },
    /// Build only OCCT static libraries (Milestone 0)
    BuildOcct,
    /// Build WASI target for Rust crate (requires wasi-sdk)
    BuildWasi {
        /// Enable release optimizations (LTO, wasm-opt)
        #[arg(long)]
        release: bool,
    },
    /// Run the facade code generator (v0.1.1)
    Codegen,
    /// Remove all build artifacts
    Clean {
        /// Keep facade/generated/ (avoid re-running codegen)
        #[arg(long)]
        keep_generated: bool,
    },
    /// Run integration tests (requires built WASM)
    Test {
        /// Run in watch mode (re-runs on file changes)
        #[arg(long)]
        watch: bool,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli {
        Cli::Build { release, size } => build::build(release, size),
        Cli::BuildOcct => build::build_occt(),
        Cli::BuildWasi { release } => build_wasi::build_wasi(release),
        Cli::Codegen => codegen::run::run(),
        Cli::Clean { keep_generated } => build::clean(keep_generated),
        Cli::Test { watch } => build::test(watch),
    }
}
