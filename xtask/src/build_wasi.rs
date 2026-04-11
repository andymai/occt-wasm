//! WASI build pipeline: OCCT + facade → standalone `.wasm` for wasmtime.
//!
//! This produces a WASI-compatible WASM binary with `extern "C"` exports
//! instead of Embind. The output is consumed by the `occt-wasm` Rust crate.
//!
//! # Prerequisites
//!
//! - **wasi-sdk** installed (set `WASI_SDK_PATH` or install to `/opt/wasi-sdk`)
//! - OCCT source at `occt/` (git submodule)
//! - Generated facade at `facade/generated/` (run `cargo xtask codegen` first)
//!
//! # Build steps
//!
//! 1. Configure OCCT with wasi-sdk clang via cmake
//! 2. Build OCCT static libs
//! 3. Compile facade + `wasi_exports.cpp`
//! 4. Link into standalone WASI .wasm
//! 5. wasm-opt post-processing (release only)
//! 6. Brotli-compress → crate/src/occt-wasm.wasm.br

use anyhow::{Context, Result, bail};
use std::path::{Path, PathBuf};
use xshell::{Shell, cmd};

use crate::util::project_root;

/// Locate the wasi-sdk installation.
fn find_wasi_sdk() -> Result<PathBuf> {
    // Check WASI_SDK_PATH env var first
    if let Ok(path) = std::env::var("WASI_SDK_PATH") {
        let p = PathBuf::from(&path);
        if p.join("bin/clang++").exists() {
            return Ok(p);
        }
        bail!("WASI_SDK_PATH={path} does not contain bin/clang++");
    }

    // Common installation paths
    let candidates = [
        PathBuf::from("/opt/wasi-sdk"),
        PathBuf::from("/usr/local/wasi-sdk"),
    ];

    for dir in &candidates {
        if dir.join("bin/clang++").exists() {
            return Ok(dir.clone());
        }
    }

    bail!(
        "wasi-sdk not found. Install it and set WASI_SDK_PATH, or install to /opt/wasi-sdk.\n\
         Download from: https://github.com/WebAssembly/wasi-sdk/releases"
    );
}

/// Step 1: Configure and build OCCT with wasi-sdk.
fn build_occt_wasi(sh: &Shell, root: &Path, wasi_sdk: &Path) -> Result<PathBuf> {
    let occt_dir = root.join("occt");
    let build_dir = occt_dir.join("build-wasi");

    if !occt_dir.join("CMakeLists.txt").exists() {
        bail!(
            "OCCT source not found at {}. Run: git submodule update --init",
            occt_dir.display()
        );
    }

    sh.create_dir(&build_dir)?;

    let clang = wasi_sdk.join("bin/clang");
    let clangxx = wasi_sdk.join("bin/clang++");
    let sysroot = wasi_sdk.join("share/wasi-sysroot");
    let clang_str = clang.display().to_string();
    let clangxx_str = clangxx.display().to_string();
    let sysroot_str = sysroot.display().to_string();

    // C code doesn't throw exceptions, so no -fwasm-exceptions needed
    let c_flags = format!(
        "--sysroot={sysroot_str} -fno-exceptions -O3 -msimd128 \
         -DIGNORE_NO_ATOMICS=1 -DOCCT_NO_PLUGINS"
    );
    let cxx_flags = format!(
        "--sysroot={sysroot_str} -fwasm-exceptions -O3 -msimd128 \
         -DIGNORE_NO_ATOMICS=1 -DOCCT_NO_PLUGINS"
    );
    let rapidjson_inc = root.join("3rdparty/rapidjson").display().to_string();

    // Skip if already configured
    if build_dir.join("build.ninja").exists() {
        eprintln!("Step 1a: OCCT-WASI already configured, skipping cmake.");
    } else {
        eprintln!("Step 1a: Configuring OCCT with wasi-sdk...");

        sh.change_dir(&build_dir);
        cmd!(
            sh,
            "cmake ..
            -G Ninja
            -DCMAKE_SYSTEM_NAME=WASI
            -DCMAKE_SYSTEM_PROCESSOR=wasm32
            -DCMAKE_C_COMPILER={clang_str}
            -DCMAKE_CXX_COMPILER={clangxx_str}
            -DCMAKE_SYSROOT={sysroot_str}
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

    eprintln!("Step 1b: Building OCCT-WASI...");
    sh.change_dir(&build_dir);
    cmd!(sh, "cmake --build . --parallel").run()?;

    Ok(build_dir)
}

/// Step 2: Compile facade C++ files with wasi-sdk clang.
fn compile_facade_wasi(
    sh: &Shell,
    root: &Path,
    wasi_sdk: &Path,
    occt_build: &Path,
) -> Result<Vec<PathBuf>> {
    let build_dir = root.join("build-wasi");
    sh.create_dir(&build_dir)?;

    let clangxx = wasi_sdk.join("bin/clang++");
    let sysroot = wasi_sdk.join("share/wasi-sysroot");
    let occt_inc = occt_build.join("include/opencascade");
    let facade_inc = root.join("facade/include");

    let clangxx_str = clangxx.display().to_string();
    let sysroot_str = sysroot.display().to_string();
    let occt_inc_str = occt_inc.display().to_string();
    let facade_inc_str = facade_inc.display().to_string();

    // Collect facade source files
    let mut sources: Vec<PathBuf> = vec![root.join("facade/src/kernel.cpp")];

    // Add generated files (kernel.cpp for implementations, wasi_exports.cpp for C ABI)
    let gen_dir = root.join("facade/generated");
    if gen_dir.is_dir() {
        for entry in std::fs::read_dir(&gen_dir)?.filter_map(Result::ok) {
            let path = entry.path();
            if path.extension().is_some_and(|e| e == "cpp") {
                let name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default();
                // Skip bindings.cpp (Embind-only) for WASI build
                if name != "bindings.cpp" {
                    sources.push(path);
                }
            }
        }
    }

    sources.sort();
    let mut objects = Vec::new();

    for src in &sources {
        let name = src.file_stem().context("no file stem")?.to_string_lossy();
        let obj = build_dir.join(format!("{name}.o"));

        eprintln!("  Compiling {name}.cpp (wasi-sdk)...");
        let src_str = src.display().to_string();
        let obj_str = obj.display().to_string();

        cmd!(
            sh,
            "{clangxx_str} --target=wasm32-wasi
            --sysroot={sysroot_str}
            -std=c++17 -fwasm-exceptions -O3 -msimd128
            -DIGNORE_NO_ATOMICS=1 -DOCCT_NO_PLUGINS
            -I{occt_inc_str} -I{facade_inc_str}
            -w -c {src_str} -o {obj_str}"
        )
        .run()?;

        objects.push(obj);
    }

    Ok(objects)
}

/// Step 3: Link facade + OCCT static libs → standalone WASI .wasm
fn link_wasi(
    sh: &Shell,
    root: &Path,
    wasi_sdk: &Path,
    occt_build: &Path,
    objects: &[PathBuf],
    release: bool,
) -> Result<()> {
    let dist_dir = root.join("dist");
    sh.create_dir(&dist_dir)?;

    let clangxx = wasi_sdk.join("bin/clang++");
    let sysroot = wasi_sdk.join("share/wasi-sysroot");
    let clangxx_str = clangxx.display().to_string();
    let sysroot_str = sysroot.display().to_string();

    // Find OCCT libs
    let lib_dir = find_occt_wasi_lib_dir(occt_build)?;
    let mut occt_libs: Vec<String> = std::fs::read_dir(&lib_dir)?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e == "a"))
        .map(|p| p.display().to_string())
        .collect();
    occt_libs.sort();

    let obj_strs: Vec<String> = objects.iter().map(|p| p.display().to_string()).collect();
    let output = dist_dir.join("occt-wasm-wasi.wasm");
    let output_str = output.display().to_string();

    let opt_level = if release { "-O3" } else { "-O2" };

    // Read export names from the generated wasi_exports.cpp
    let wasi_exports_path = root.join("facade/generated/wasi_exports.cpp");
    let export_names = extract_export_names(&wasi_exports_path)?;
    eprintln!("  Exporting {} occt_* functions.", export_names.len());

    let mut args: Vec<String> = vec![
        "--target=wasm32-wasi".into(),
        format!("--sysroot={sysroot_str}"),
        "-fwasm-exceptions".into(),
        "-msimd128".into(),
        opt_level.into(),
        "-Wl,--no-entry".into(),
    ];
    // Export only the occt_* functions + memory + malloc/free
    for name in &export_names {
        args.push(format!("-Wl,--export={name}"));
    }
    args.push("-Wl,--export=malloc".into());
    args.push("-Wl,--export=free".into());
    args.push("-Wl,--export=memory".into());

    if release {
        args.push("-flto".into());
    }

    args.extend(obj_strs);
    args.extend(occt_libs);
    args.push("-o".into());
    args.push(output_str);

    eprintln!("Step 3: Linking WASI WASM ({opt_level})...");

    let status = std::process::Command::new(&clangxx_str)
        .args(&args)
        .status()
        .context("failed to run wasi-sdk clang++")?;

    if !status.success() {
        bail!("WASI linking failed with status: {status}");
    }

    Ok(())
}

/// Extract `occt_*` export names from the generated `wasi_exports.cpp`.
///
/// Looks for lines matching `<type> occt_<name>(` to find exported function names.
fn extract_export_names(wasi_exports_path: &Path) -> Result<Vec<String>> {
    let content = std::fs::read_to_string(wasi_exports_path)
        .context("failed to read wasi_exports.cpp — run `cargo xtask codegen` first")?;
    let mut names = Vec::new();
    for line in content.lines() {
        // Match lines like "uint32_t occt_make_box(..." or "void occt_destroy() {"
        let Some(start) = line.find("occt_") else {
            continue;
        };
        if let Some(paren) = line[start..].find('(') {
            let name = &line[start..start + paren];
            if name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
                names.push(name.to_owned());
            }
        }
    }
    names.sort();
    names.dedup();
    if names.is_empty() {
        bail!("no occt_* exports found in {}", wasi_exports_path.display());
    }
    Ok(names)
}

/// Locate OCCT static lib directory in the WASI build.
fn find_occt_wasi_lib_dir(occt_build: &Path) -> Result<PathBuf> {
    let candidates = [
        occt_build.join("lib"),
        occt_build.join("lin32/clang/lib"),
        occt_build.join("wasm32/clang/lib"),
    ];
    for dir in &candidates {
        if dir.exists() {
            return Ok(dir.clone());
        }
    }
    bail!(
        "OCCT-WASI static libs not found in: {}",
        candidates
            .iter()
            .map(|p| p.display().to_string())
            .collect::<Vec<_>>()
            .join(", ")
    );
}

/// Step 4: Brotli-compress and copy to crate/src/.
fn compress_and_install(root: &Path) -> Result<()> {
    let wasm = root.join("dist/occt-wasm-wasi.wasm");
    let output = root.join("crate/src/occt-wasm.wasm.br");

    if !wasm.exists() {
        bail!("WASI WASM not found at {}", wasm.display());
    }

    eprintln!("Step 4: Brotli-compressing...");
    let input_bytes = std::fs::read(&wasm)?;
    let mut output_bytes = Vec::new();

    let params = brotli::enc::BrotliEncoderParams {
        quality: 11,
        ..Default::default()
    };

    brotli::BrotliCompress(&mut input_bytes.as_slice(), &mut output_bytes, &params)
        .context("brotli compression failed")?;

    std::fs::write(&output, &output_bytes)?;

    #[allow(clippy::cast_precision_loss)]
    let raw_mb = input_bytes.len() as f64 / 1_048_576.0;
    #[allow(clippy::cast_precision_loss)]
    let br_mb = output_bytes.len() as f64 / 1_048_576.0;
    eprintln!("  {raw_mb:.1} MB → {br_mb:.1} MB (brotli)");
    eprintln!("  Installed to {}", output.display());

    Ok(())
}

/// Full WASI build pipeline.
pub fn build_wasi(release: bool) -> Result<()> {
    let root = project_root()?;
    let sh = Shell::new()?;

    let wasi_sdk = find_wasi_sdk()?;
    eprintln!("Using wasi-sdk at: {}", wasi_sdk.display());

    // Ensure codegen has been run
    let gen_wasi = root.join("facade/generated/wasi_exports.cpp");
    if !gen_wasi.exists() {
        eprintln!("Generated facade not found, running codegen...");
        crate::codegen::run::run()?;
    }

    // Step 1: Build OCCT with wasi-sdk
    let occt_build = build_occt_wasi(&sh, &root, &wasi_sdk)?;

    // Step 2: Compile facade
    eprintln!("Step 2: Compiling facade (wasi-sdk)...");
    let objects = compile_facade_wasi(&sh, &root, &wasi_sdk, &occt_build)?;
    eprintln!("  {} object files ready.", objects.len());

    // Step 3: Link
    link_wasi(&sh, &root, &wasi_sdk, &occt_build, &objects, release)?;

    // Step 4: Compress and install
    compress_and_install(&root)?;

    let wasm_path = root.join("dist/occt-wasm-wasi.wasm");
    if wasm_path.exists() {
        #[allow(clippy::cast_precision_loss)]
        let size_mb = std::fs::metadata(&wasm_path)?.len() as f64 / 1_048_576.0;
        eprintln!("WASI build complete: dist/occt-wasm-wasi.wasm ({size_mb:.1}MB)");
    }

    Ok(())
}
