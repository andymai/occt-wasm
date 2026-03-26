//! Build pipeline: OCCT static libs → facade compilation → linking → wasm-opt.

use anyhow::{Context, Result, bail};
use std::path::Path;
use xshell::{Shell, cmd};

/// Project root (parent of xtask/).
fn project_root() -> Result<std::path::PathBuf> {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR")
        .unwrap_or_else(|_| env!("CARGO_MANIFEST_DIR").to_string());
    let root = Path::new(&manifest_dir)
        .parent()
        .context("xtask must be inside the workspace")?
        .to_path_buf();
    Ok(root)
}

/// Build OCCT static libraries via emcmake cmake.
pub fn build_occt() -> Result<()> {
    let root = project_root()?;
    let occt_dir = root.join("occt");
    let build_dir = occt_dir.join("build");

    if !occt_dir.join("CMakeLists.txt").exists() {
        bail!(
            "OCCT source not found at {occt}. Run: git submodule update --init",
            occt = occt_dir.display()
        );
    }

    let sh = Shell::new()?;
    sh.create_dir(&build_dir)?;
    sh.change_dir(&build_dir);

    eprintln!("Configuring OCCT with emcmake cmake...");

    let c_flags = "-fwasm-exceptions -O2 -DIGNORE_NO_ATOMICS=1 -DOCCT_NO_PLUGINS";
    let cxx_flags = c_flags;

    cmd!(
        sh,
        "emcmake cmake ..
        -G Ninja
        -DCMAKE_BUILD_TYPE=Release
        -DBUILD_MODULE_FoundationClasses=TRUE
        -DBUILD_MODULE_ModelingData=TRUE
        -DBUILD_MODULE_ModelingAlgorithms=TRUE
        -DBUILD_MODULE_DataExchange=TRUE
        -DBUILD_MODULE_ApplicationFramework=TRUE
        -DBUILD_MODULE_Visualization=FALSE
        -DBUILD_MODULE_Draw=FALSE
        -DBUILD_MODULE_DETools=FALSE
        -DBUILD_LIBRARY_TYPE=Static
        -DUSE_FREETYPE=ON
        -DUSE_RAPIDJSON=ON
        -DCMAKE_C_FLAGS={c_flags}
        -DCMAKE_CXX_FLAGS={cxx_flags}"
    )
    .run()?;

    eprintln!("Building OCCT...");
    cmd!(sh, "cmake --build . --parallel").run()?;

    eprintln!("OCCT static libs built successfully.");
    Ok(())
}

/// Full build: OCCT + facade + link + wasm-opt.
pub fn build(_release: bool) -> Result<()> {
    // Step 1: Build OCCT static libs (skip if already built)
    let root = project_root()?;
    let occt_build = root.join("occt/build");

    if !occt_build.join("lin/clang/lib").exists() && !occt_build.join("lib").exists() {
        eprintln!("OCCT static libs not found, building...");
        build_occt()?;
    } else {
        eprintln!("OCCT static libs found, skipping rebuild.");
    }

    // Steps 2-6: facade compilation, linking, wasm-opt, packaging
    // TODO: implement after Milestone 0 validates OCCT compilation
    eprintln!("Facade build not yet implemented. Run `cargo xtask build-occt` first.");
    Ok(())
}

/// Remove all build artifacts.
pub fn clean() -> Result<()> {
    let root = project_root()?;
    let sh = Shell::new()?;

    let dirs_to_clean = [
        root.join("occt/build"),
        root.join("dist"),
        root.join("facade/generated"),
    ];

    for dir in &dirs_to_clean {
        if dir.exists() {
            eprintln!("Removing {}", dir.display());
            sh.remove_path(dir)?;
        }
    }

    eprintln!("Clean complete.");
    Ok(())
}

/// Run integration tests.
pub fn test() -> Result<()> {
    let root = project_root()?;
    let sh = Shell::new()?;

    if !root.join("dist/occt-wasm.wasm").exists() {
        bail!("WASM not built. Run `cargo xtask build` first.");
    }

    sh.change_dir(root.join("ts"));
    cmd!(sh, "npx vitest run").run()?;

    Ok(())
}
