//! WASI build pipeline: facade + OCCT → standalone `.wasm` for wasmtime.
//!
//! This produces a WASI-compatible WASM binary with `extern "C"` exports
//! instead of Embind. The output is consumed by the `occt-wasm` Rust crate.
//!
//! Built with `em++ -sSTANDALONE_WASM=1`: same Emscripten toolchain as the
//! npm build (`cargo xtask build`), but emitting a single self-contained
//! wasm with WASI imports (`wasi_snapshot_preview1.*`) and no JS glue.
//! Reuses the existing `occt/build/` Emscripten OCCT static libs.
//!
//! Why emcc-standalone instead of wasi-sdk: wasi-sdk's libc++abi.a ships
//! without C++ exception runtime symbols (`__cxa_throw`, `__cxa_allocate_exception`,
//! `_Unwind_*`), so OCCT — which throws `Standard_Failure` extensively — cannot
//! link against it. emcc bundles its own libc++abi with full EH support.
//!
//! # Build steps
//!
//! 1. Compile facade + `wasi_exports.cpp` with em++ (Embind's `bindings.cpp`
//!    is skipped — only the C ABI is needed for wasmtime consumption).
//! 2. Link against `occt/build/` static libs with `em++ -sSTANDALONE_WASM=1`.
//! 3. wasm-opt with `--experimental-new-eh` to convert emcc's legacy try/catch
//!    (Phase 2 wasm-eh) to the exnref encoding (Phase 4) that wasmtime expects.
//! 4. Brotli-compress → `crate/src/occt-wasm.wasm.br`.

use anyhow::{Context, Result, bail};
use std::path::{Path, PathBuf};
use xshell::{Shell, cmd};

use crate::util::{bytes_to_mb, find_occt_lib_dir, find_wasm_opt, project_root};

/// OCCT static libs not exercised by the WASI build's call graph. Excluding
/// them shrinks the .wasm output without affecting functionality. This list is
/// intentionally much smaller than `xtask::build`'s — the WASI link prunes far
/// fewer libs — so the two are NOT kept in sync.
const EXCLUDED_LIBS: &[&str] = &["libTKDraw.a"];

/// Step 1: Compile facade C++ files for the C-ABI WASI build.
fn compile_facade(sh: &Shell, root: &Path) -> Result<Vec<PathBuf>> {
    let build_dir = root.join("build-wasi");
    sh.create_dir(&build_dir)?;

    let occt_inc = root.join("occt/build/include/opencascade");
    if !occt_inc.exists() {
        bail!(
            "OCCT-Emscripten include dir not found at {}. Run `cargo xtask build-occt` first.",
            occt_inc.display()
        );
    }
    let facade_inc = root.join("facade/include");

    let mut sources: Vec<PathBuf> = vec![root.join("facade/src/kernel.cpp")];

    let gen_dir = root.join("facade/generated");
    if gen_dir.is_dir() {
        // bindings.cpp is Embind-only; skip it for the C-ABI WASI build.
        // wasi_exports.cpp is the C-ABI export layer — required here, skipped by
        // the npm path in xtask::build.
        for entry in std::fs::read_dir(&gen_dir)?.flatten() {
            let path = entry.path();
            let is_cpp = path.extension().is_some_and(|e| e == "cpp");
            let is_bindings = path.file_name().is_some_and(|n| n == "bindings.cpp");
            if is_cpp && !is_bindings {
                sources.push(path);
            }
        }
    }

    sources.sort();
    let mut objects = Vec::new();

    for src in &sources {
        let name = src.file_stem().context("no file stem")?.to_string_lossy();
        // Prefix generated outputs so kernel.cpp from src/ and generated/ don't
        // collide on disk (and link to duplicate symbols).
        let prefix = if src.starts_with(&gen_dir) {
            "gen_"
        } else {
            ""
        };
        let obj = build_dir.join(format!("{prefix}{name}.o"));

        eprintln!("  Compiling {name}.cpp...");
        cmd!(
            sh,
            "em++ -std=c++17 -fwasm-exceptions -O3 -msimd128
            -DIGNORE_NO_ATOMICS=1 -DOCCT_NO_PLUGINS
            -I{occt_inc} -I{facade_inc}
            -w -c {src} -o {obj}"
        )
        .run()?;

        objects.push(obj);
    }

    Ok(objects)
}

/// Step 2: Link facade + OCCT static libs → standalone WASI .wasm.
fn link(root: &Path, objects: &[PathBuf], release: bool) -> Result<PathBuf> {
    let dist_dir = root.join("dist");
    std::fs::create_dir_all(&dist_dir)?;

    let lib_dir = find_occt_lib_dir(&root.join("occt/build"))?;
    let mut occt_libs: Vec<PathBuf> = std::fs::read_dir(&lib_dir)?
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.extension().is_some_and(|e| e == "a")
                && !p
                    .file_name()
                    .is_some_and(|n| EXCLUDED_LIBS.contains(&n.to_string_lossy().as_ref()))
        })
        .collect();
    occt_libs.sort();

    let output = dist_dir.join("occt-wasm-wasi.wasm");
    let export_names = extract_export_names(&root.join("facade/generated/wasi_exports.cpp"))?;
    eprintln!("  Exporting {} occt_* functions.", export_names.len());

    let opt_level = if release { "-O3" } else { "-O2" };

    let mut cmd = std::process::Command::new("em++");
    cmd.args([
        "-fwasm-exceptions",
        "-msimd128",
        opt_level,
        "-sSTANDALONE_WASM=1",
        "-sALLOW_MEMORY_GROWTH=1",
        "-sINITIAL_MEMORY=134217728",
        "-sMAXIMUM_MEMORY=4294967296",
        "--no-entry",
    ]);
    for name in export_names
        .iter()
        .map(String::as_str)
        .chain(["malloc", "free"])
    {
        cmd.arg(format!("-Wl,--export={name}"));
    }
    if release {
        cmd.arg("-flto");
    }
    cmd.args(objects).args(&occt_libs).arg("-o").arg(&output);

    eprintln!("Step 2: Linking WASI WASM ({opt_level})...");
    let status = cmd.status().context("failed to run em++")?;
    if !status.success() {
        bail!("em++ linking failed with status: {status}");
    }
    Ok(output)
}

/// Extract `occt_*` export names from generated `wasi_exports.cpp` by scanning
/// for `<type> occt_<name>(` patterns.
fn extract_export_names(wasi_exports_path: &Path) -> Result<Vec<String>> {
    let content = std::fs::read_to_string(wasi_exports_path)
        .context("failed to read wasi_exports.cpp — run `cargo xtask codegen` first")?;
    let mut names = Vec::new();
    for line in content.lines() {
        let Some(start) = line.find("occt_") else {
            continue;
        };
        let Some(paren) = line[start..].find('(') else {
            continue;
        };
        let name = &line[start..start + paren];
        if name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            names.push(name.to_owned());
        }
    }
    names.sort();
    names.dedup();
    if names.is_empty() {
        bail!("no occt_* exports found in {}", wasi_exports_path.display());
    }
    Ok(names)
}

/// Step 3: Run wasm-opt to convert emcc's legacy exception encoding to the
/// new exnref encoding that wasmtime accepts when `wasm_exceptions(true)` is set.
fn convert_eh(sh: &Shell, wasm: &Path) -> Result<()> {
    let wasm_opt = find_wasm_opt();
    eprintln!("Step 3: wasm-opt --experimental-new-eh...");
    cmd!(
        sh,
        "{wasm_opt} {wasm}
        --translate-to-new-eh --experimental-new-eh
        --strip-debug --strip-producers
        --enable-bulk-memory --enable-sign-ext
        --enable-nontrapping-float-to-int --enable-mutable-globals
        --enable-exception-handling --enable-reference-types --enable-multivalue
        --enable-simd --enable-tail-call
        -o {wasm}"
    )
    .run()?;
    Ok(())
}

/// Step 4: Brotli-compress and install into crate/src/.
fn compress_and_install(root: &Path, wasm: &Path) -> Result<()> {
    let output = root.join("crate/src/occt-wasm.wasm.br");
    if !wasm.exists() {
        bail!("WASI WASM not found at {}", wasm.display());
    }

    eprintln!("Step 4: Brotli-compressing...");
    let input_bytes = std::fs::read(wasm)?;
    let mut output_bytes = Vec::new();
    let params = brotli::enc::BrotliEncoderParams {
        quality: 11,
        ..Default::default()
    };
    brotli::BrotliCompress(&mut input_bytes.as_slice(), &mut output_bytes, &params)
        .context("brotli compression failed")?;
    std::fs::write(&output, &output_bytes)?;

    let raw_mb = bytes_to_mb(input_bytes.len() as u64);
    let br_mb = bytes_to_mb(output_bytes.len() as u64);
    eprintln!("  {raw_mb:.1} MB → {br_mb:.1} MB (brotli)");
    eprintln!("  Installed to {}", output.display());
    Ok(())
}

/// Full WASI build pipeline.
pub fn build_wasi(release: bool) -> Result<()> {
    let root = project_root()?;
    let sh = Shell::new()?;

    if !root.join("facade/generated/wasi_exports.cpp").exists() {
        eprintln!("Generated facade not found, running codegen...");
        crate::codegen::run::run()?;
    }

    eprintln!("Step 1: Compiling facade...");
    let objects = compile_facade(&sh, &root)?;
    eprintln!("  {} object files ready.", objects.len());

    let wasm = link(&root, &objects, release)?;
    convert_eh(&sh, &wasm)?;
    compress_and_install(&root, &wasm)?;

    let size_mb = bytes_to_mb(std::fs::metadata(&wasm)?.len());
    eprintln!("WASI build complete: {} ({size_mb:.1}MB)", wasm.display());

    Ok(())
}
