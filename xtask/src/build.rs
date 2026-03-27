//! Build pipeline: OCCT static libs → facade compilation → linking → wasm-opt.

use anyhow::{Context, Result, bail};
use std::path::{Path, PathBuf};
use xshell::{Shell, cmd};

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

/// Locate OCCT static lib directory (varies by platform detection).
fn find_occt_lib_dir(occt_build: &Path) -> Result<PathBuf> {
    // emsdk wasm32 is detected as 32-bit Linux → lin32/clang/lib/
    let candidates = [
        occt_build.join("lin32/clang/lib"),
        occt_build.join("lin/clang/lib"),
        occt_build.join("lib"),
    ];
    for dir in &candidates {
        if dir.exists() {
            return Ok(dir.clone());
        }
    }
    bail!(
        "OCCT static libs not found in any of: {}",
        candidates
            .iter()
            .map(|p| p.display().to_string())
            .collect::<Vec<_>>()
            .join(", ")
    );
}

/// Step 1: Build OCCT static libraries via emcmake cmake.
pub fn build_occt() -> Result<()> {
    let root = project_root()?;
    let occt_dir = root.join("occt");
    let build_dir = occt_dir.join("build");

    if !occt_dir.join("CMakeLists.txt").exists() {
        bail!(
            "OCCT source not found at {}. Run: git submodule update --init",
            occt_dir.display()
        );
    }

    let sh = Shell::new()?;
    sh.create_dir(&build_dir)?;
    sh.change_dir(&build_dir);

    // Skip if already configured
    if build_dir.join("build.ninja").exists() {
        eprintln!("Step 1a: OCCT already configured, skipping cmake.");
    } else {
        eprintln!("Step 1a: Configuring OCCT with emcmake cmake...");

        let c_flags = "-fwasm-exceptions -O2 -DIGNORE_NO_ATOMICS=1 -DOCCT_NO_PLUGINS";
        let cxx_flags = c_flags;
        let rapidjson_inc = root.join("3rdparty/rapidjson").display().to_string();

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
            -DBUILD_LIBRARY_TYPE=Static
            -DUSE_FREETYPE=OFF
            -DUSE_RAPIDJSON=ON
            -D3RDPARTY_RAPIDJSON_INCLUDE_DIR={rapidjson_inc}
            -DCMAKE_C_FLAGS={c_flags}
            -DCMAKE_CXX_FLAGS={cxx_flags}
            -Wno-dev"
        )
        .run()?;
    }

    eprintln!("Step 1b: Building OCCT...");
    cmd!(sh, "cmake --build . --parallel").run()?;

    eprintln!("OCCT static libs built successfully.");
    Ok(())
}

/// Step 2: Compile facade C++ files with emcc.
fn compile_facade(sh: &Shell, root: &Path) -> Result<Vec<PathBuf>> {
    let build_dir = root.join("build");
    sh.create_dir(&build_dir)?;

    let occt_inc = root.join("occt/build/include/opencascade");
    let facade_inc = root.join("facade/include");

    if !occt_inc.exists() {
        bail!(
            "OCCT include dir not found at {}. Run `cargo xtask build-occt` first.",
            occt_inc.display()
        );
    }

    let sources: Vec<PathBuf> = std::fs::read_dir(root.join("facade/src"))?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e == "cpp"))
        .collect();

    let mut objects = Vec::new();
    let occt_inc_str = occt_inc.display().to_string();
    let facade_inc_str = facade_inc.display().to_string();

    for src in &sources {
        let name = src.file_stem().context("no file stem")?.to_string_lossy();
        let obj = build_dir.join(format!("{name}.o"));

        // Skip if .o is newer than .cpp
        if obj.exists() {
            let src_modified = std::fs::metadata(src)?.modified()?;
            let obj_modified = std::fs::metadata(&obj)?.modified()?;
            if obj_modified >= src_modified {
                objects.push(obj);
                continue;
            }
        }

        eprintln!("  Compiling {name}.cpp...");
        let src_str = src.display().to_string();
        let obj_str = obj.display().to_string();
        cmd!(
            sh,
            "em++ -std=c++17 -fwasm-exceptions -O2
            -DIGNORE_NO_ATOMICS=1 -DOCCT_NO_PLUGINS
            -I{occt_inc_str} -I{facade_inc_str}
            -w -c {src_str} -o {obj_str}"
        )
        .run()?;

        objects.push(obj);
    }

    Ok(objects)
}

/// OCCT static libraries not used by the facade — excluded from linking.
const EXCLUDED_LIBS: &[&str] = &[
    // IGES exchange
    "libTKDEIGES.a",
    // Persistence / serialization
    "libTKStd.a",
    "libTKStdL.a",
    "libTKBin.a",
    "libTKBinL.a",
    "libTKBinXCAF.a",
    "libTKBinTObj.a",
    "libTKXml.a",
    "libTKXmlL.a",
    "libTKXmlXCAF.a",
    "libTKXmlTObj.a",
    "libTKTObj.a",
    // Note: TKVCAF NOT excluded — TKXCAF depends on TPrsStd_Driver from TKVCAF
    // Unused exchange formats
    "libTKDEVRML.a",
    "libTKDEOBJ.a",
    "libTKDEPLY.a",
    "libTKDECascade.a",
    "libTKXMesh.a",
    // Note: TKV3d and TKService NOT excluded — TKXCAF depends on Graphic3d_* from TKService
    // Features not used by facade
    "libTKFeat.a",
    "libTKHelix.a",
];

/// Step 3: Link facade objects + OCCT static libs → .wasm + .js
fn link_wasm(
    sh: &Shell,
    root: &Path,
    objects: &[PathBuf],
    release: bool,
    size: bool,
) -> Result<()> {
    let dist_dir = root.join("dist");
    sh.create_dir(&dist_dir)?;

    let occt_lib_dir = find_occt_lib_dir(&root.join("occt/build"))?;

    // Collect all OCCT static lib paths, filtering out unused libraries
    let all_libs: Vec<PathBuf> = std::fs::read_dir(&occt_lib_dir)?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e == "a"))
        .collect();
    let total = all_libs.len();

    let occt_libs: Vec<String> = all_libs
        .into_iter()
        .filter(|p| {
            let name = p.file_name().map(|n| n.to_string_lossy().into_owned());
            !name.is_some_and(|n| EXCLUDED_LIBS.contains(&n.as_str()))
        })
        .map(|p| p.display().to_string())
        .collect();

    let excluded = total - occt_libs.len();
    eprintln!("  Excluded {excluded}/{total} unused OCCT libs from link.");

    let obj_strs: Vec<String> = objects.iter().map(|p| p.display().to_string()).collect();
    let output = dist_dir.join("occt-wasm.js");
    let output_str = output.display().to_string();
    let post_js = root.join("scripts/symbol_dispose.js");
    let post_js_str = post_js.display().to_string();

    let opt_level = if release && size {
        "-Oz"
    } else if release {
        "-O3"
    } else {
        "-O2"
    };

    // Build the full args list
    let mut args: Vec<String> = vec![
        "-lembind".into(),
        "-fwasm-exceptions".into(),
        opt_level.into(),
        "-sINITIAL_MEMORY=134217728".into(),
        "-sMAXIMUM_MEMORY=4294967296".into(),
        "-sALLOW_MEMORY_GROWTH=1".into(),
        "-sEXPORT_ES6=1".into(),
        "-sEVAL_CTORS=2".into(),
        "-sWASM_BIGINT".into(),
        "-sMODULARIZE=1".into(),
        "-sEXPORT_NAME=createOcctWasm".into(),
        "-sEXPORTED_RUNTIME_METHODS=[\"FS\",\"HEAP32\",\"HEAPF32\",\"HEAPU32\"]".into(),
        "-sEXPORT_EXCEPTION_HANDLING_HELPERS=1".into(),
        "--no-entry".into(),
        format!("--post-js={post_js_str}"),
    ];

    if release {
        args.push("-flto".into());
    }

    // Add object files
    args.extend(obj_strs);
    // Add OCCT static libs
    args.extend(occt_libs);
    // Output
    args.push("-o".into());
    args.push(output_str);

    eprintln!("Step 3: Linking WASM ({opt_level})...");

    // xshell cmd! doesn't support dynamic arg lists well, use std::process::Command
    let status = std::process::Command::new("em++")
        .args(&args)
        .status()
        .context("failed to run em++")?;

    if !status.success() {
        bail!("em++ linking failed with status: {status}");
    }

    Ok(())
}

/// Step 4: Run wasm-opt on the output.
fn optimize_wasm(sh: &Shell, root: &Path) -> Result<()> {
    let wasm = root.join("dist/occt-wasm.wasm");
    let wasm_str = wasm.display().to_string();

    // Try emsdk's wasm-opt first (has correct feature support), fall back to PATH
    let wasm_opt_bin = std::env::var("EMSDK")
        .ok()
        .map(|e| PathBuf::from(e).join("upstream/bin/wasm-opt"))
        .filter(|p| p.exists())
        .or_else(|| {
            home_dir()
                .map(|h| h.join("emsdk/upstream/bin/wasm-opt"))
                .filter(|p| p.exists())
        })
        .map_or_else(|| "wasm-opt".into(), |p| p.display().to_string());

    eprintln!("Step 4: Running wasm-opt...");
    cmd!(
        sh,
        "{wasm_opt_bin} -O4 --strip-debug --strip-producers
        --enable-bulk-memory --enable-sign-ext
        --enable-nontrapping-float-to-int --enable-mutable-globals
        --enable-exception-handling
        {wasm_str} -o {wasm_str}"
    )
    .run()?;

    Ok(())
}

fn home_dir() -> Option<PathBuf> {
    std::env::var("HOME").ok().map(PathBuf::from)
}

/// Full build: OCCT + facade + link + wasm-opt.
pub fn build(release: bool, size: bool) -> Result<()> {
    let root = project_root()?;
    let sh = Shell::new()?;

    // Step 1: Build OCCT static libs (skip if already built)
    let occt_lib_dir = find_occt_lib_dir(&root.join("occt/build"));
    if occt_lib_dir.is_err() {
        eprintln!("Step 1: OCCT static libs not found, building...");
        build_occt()?;
    } else {
        eprintln!("Step 1: OCCT static libs found, skipping.");
    }

    // Step 2: Compile facade
    eprintln!("Step 2: Compiling facade...");
    let objects = compile_facade(&sh, &root)?;
    eprintln!("  {} object files ready.", objects.len());

    // Step 3: Link
    link_wasm(&sh, &root, &objects, release, size)?;

    // Step 4: wasm-opt (release only)
    if release {
        optimize_wasm(&sh, &root)?;
    }

    // Report
    let wasm_path = root.join("dist/occt-wasm.wasm");
    if wasm_path.exists() {
        #[allow(clippy::cast_precision_loss)] // file size fits in f64 mantissa
        let size_mb = std::fs::metadata(&wasm_path)?.len() as f64 / 1_048_576.0;
        eprintln!("Build complete: dist/occt-wasm.wasm ({size_mb:.1}MB)");
    }

    Ok(())
}

/// Remove all build artifacts.
pub fn clean() -> Result<()> {
    let root = project_root()?;
    let sh = Shell::new()?;

    let dirs_to_clean = [
        root.join("occt/build"),
        root.join("build"),
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
