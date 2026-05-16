//! Standalone Rust example: shape creation, booleans, measurements, STEP I/O.
//!
//! Build & run from the repo root:
//!
//! ```sh
//! cargo run --release --example cli -p occt-wasm
//! cargo run --release --example cli -p occt-wasm -- --step output.step
//! ```
//!
//! Note: `--release` is strongly recommended. Debug-mode wasmtime compilation
//! is ~100x slower than release.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;

use occt_wasm::{OcctError, OcctKernel};

fn main() -> ExitCode {
    println!("occt-wasm Rust CLI Example\n");

    let step_out: Option<PathBuf> = env::args()
        .collect::<Vec<_>>()
        .windows(2)
        .find(|w| w[0] == "--step")
        .map(|w| PathBuf::from(&w[1]));

    match run(step_out.as_deref()) {
        Ok(()) => {
            println!("\nDone.");
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("\nError: {e}");
            ExitCode::FAILURE
        }
    }
}

fn run(step_out: Option<&std::path::Path>) -> Result<(), OcctError> {
    let mut kernel = OcctKernel::new()?;

    // --- Create shapes ---
    let box_shape = kernel.make_box(30.0, 20.0, 15.0)?;
    let cyl = kernel.make_cylinder(6.0, 25.0)?;
    let sphere = kernel.make_sphere(4.0)?;
    let moved_sphere = kernel.translate(sphere, 15.0, 10.0, 15.0)?;

    println!("Created: box 30x20x15, cylinder r=6 h=25, sphere r=4");

    // --- Boolean operations ---
    let with_hole = kernel.cut(box_shape, cyl)?;
    let final_shape = kernel.fuse(with_hole, moved_sphere)?;

    // --- Measurements ---
    let vol = kernel.get_volume(final_shape)?;
    let area = kernel.get_surface_area(final_shape)?;
    let bbox = kernel.get_bounding_box(final_shape, true)?;

    println!("\nResult:");
    println!("  Volume:       {vol:.2} mm^3");
    println!("  Surface area: {area:.2} mm^2");
    println!(
        "  Bounding box: [{:.1}, {:.1}, {:.1}] to [{:.1}, {:.1}, {:.1}]",
        bbox.min.x, bbox.min.y, bbox.min.z, bbox.max.x, bbox.max.y, bbox.max.z
    );

    // --- Topology counts ---
    let faces = kernel.get_sub_shapes(final_shape, "Face")?;
    let edges = kernel.get_sub_shapes(final_shape, "Edge")?;
    let verts = kernel.get_sub_shapes(final_shape, "Vertex")?;
    println!(
        "  Topology:     {} faces, {} edges, {} vertices",
        faces.len(),
        edges.len(),
        verts.len()
    );

    // --- Tessellate (renderer-ready mesh) ---
    let mesh = kernel.tessellate(final_shape, 0.1, 0.5)?;
    println!(
        "  Mesh:         {} vertices, {} triangles",
        mesh.positions.len() / 3,
        mesh.indices.len() / 3
    );

    // --- STEP export ---
    let step_data = kernel.export_step(final_shape)?;
    if let Some(path) = step_out {
        fs::write(path, &step_data)
            .map_err(|e| OcctError::Memory(format!("write {}: {e}", path.display())))?;
        println!("\nSTEP exported to: {}", path.display());
    } else {
        println!("\nTip: pass --step output.step to export the result");
    }

    // --- STEP round-trip ---
    let reimported = kernel.import_step(&step_data)?;
    let reimported_vol = kernel.get_volume(reimported)?;
    println!(
        "  Round-trip:   export -> import, volume delta = {:.6}",
        (vol - reimported_vol).abs()
    );

    Ok(())
}
