//! Integration tests for the occt-wasm Rust crate.
//!
//! These tests require a real WASI WASM binary at `crate/src/occt-wasm.wasm.br`.
//! They are skipped (not failed) when the binary is a placeholder.
//!
//! To run: `cargo xtask build-wasi && cargo test -p occt-wasm`

#![allow(clippy::unwrap_used, clippy::panic)]

use occt_wasm::OcctKernel;

/// Try to create a kernel. Returns None if the embedded WASM is a placeholder
/// or if running in debug mode (WASM compilation is ~100x slower in debug).
fn try_kernel() -> Option<OcctKernel> {
    if cfg!(debug_assertions) {
        eprintln!(
            "Skipping test: WASM compilation too slow in debug mode. Use `cargo test --release`."
        );
        return None;
    }
    match OcctKernel::new() {
        Ok(k) => Some(k),
        Err(e) => {
            let msg = e.to_string();
            // Placeholder WASM is too small to be a real module
            if msg.contains("not enough bytes")
                || msg.contains("unknown import")
                || msg.contains("occt_init")
                || msg.contains("no memory export")
            {
                eprintln!(
                    "Skipping test: WASM binary is a placeholder. Run `cargo xtask build-wasi` first."
                );
                None
            } else {
                panic!("Unexpected kernel init error: {e:?}");
            }
        }
    }
}

#[test]
fn kernel_init_and_drop() {
    let Some(_kernel) = try_kernel() else { return };
    // Kernel initializes and drops cleanly
}

#[test]
fn make_box() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let shape = kernel.make_box(10.0, 20.0, 30.0).unwrap();
    assert!(shape.id() > 0);
}

#[test]
fn box_volume() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let shape = kernel.make_box(10.0, 20.0, 30.0).unwrap();
    let vol = kernel.get_volume(shape).unwrap();
    assert!((vol - 6000.0).abs() < 1.0, "expected ~6000, got {vol}");
}

#[test]
fn fuse_two_boxes() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let a = kernel.make_box(10.0, 10.0, 10.0).unwrap();
    let b = kernel.make_box(10.0, 10.0, 10.0).unwrap();
    let result = kernel.fuse(a, b).unwrap();
    let vol = kernel.get_volume(result).unwrap();
    // Fuse of identical boxes at origin = same volume (overlapping)
    assert!((vol - 1000.0).abs() < 1.0, "expected ~1000, got {vol}");
}

#[test]
fn cut_operation() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let box_shape = kernel.make_box(20.0, 20.0, 20.0).unwrap();
    let sphere = kernel.make_sphere(5.0).unwrap();
    let result = kernel.cut(box_shape, sphere).unwrap();
    let vol = kernel.get_volume(result).unwrap();
    // Box volume - sphere volume (partially inside)
    assert!(vol > 0.0 && vol < 8000.0, "unexpected volume: {vol}");
}

#[test]
fn bounding_box() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let shape = kernel.make_box(10.0, 20.0, 30.0).unwrap();
    let bbox = kernel.get_bounding_box(shape, true).unwrap();
    assert!((bbox.min.x).abs() < 0.01);
    assert!((bbox.min.y).abs() < 0.01);
    assert!((bbox.min.z).abs() < 0.01);
    assert!((bbox.max.x - 10.0).abs() < 0.01);
    assert!((bbox.max.y - 20.0).abs() < 0.01);
    assert!((bbox.max.z - 30.0).abs() < 0.01);
}

#[test]
fn tessellate_box() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let shape = kernel.make_box(10.0, 10.0, 10.0).unwrap();
    let mesh = kernel.tessellate(shape, 0.1, 0.5).unwrap();
    // A box has at least 8 vertices and 12 triangles
    assert!(
        mesh.positions.len() >= 24,
        "expected at least 24 position floats, got {}",
        mesh.positions.len()
    );
    assert!(
        mesh.indices.len() >= 36,
        "expected at least 36 index values, got {}",
        mesh.indices.len()
    );
    assert_eq!(mesh.positions.len(), mesh.normals.len());
}

#[test]
fn step_roundtrip() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let shape = kernel.make_box(10.0, 20.0, 30.0).unwrap();
    let step_data = kernel.export_step(shape).unwrap();
    assert!(step_data.contains("STEP"), "expected STEP format data");

    let imported = kernel.import_step(&step_data).unwrap();
    let vol = kernel.get_volume(imported).unwrap();
    assert!(
        (vol - 6000.0).abs() < 1.0,
        "roundtrip volume mismatch: {vol}"
    );
}

#[test]
fn make_cylinder_and_query() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let cyl = kernel.make_cylinder(5.0, 10.0).unwrap();
    let vol = kernel.get_volume(cyl).unwrap();
    let expected = std::f64::consts::PI * 25.0 * 10.0;
    assert!(
        (vol - expected).abs() < 1.0,
        "expected ~{expected:.0}, got {vol}"
    );
}

#[test]
fn make_sphere_surface_area() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let sphere = kernel.make_sphere(5.0).unwrap();
    let area = kernel.get_surface_area(sphere).unwrap();
    let expected = 4.0 * std::f64::consts::PI * 25.0;
    assert!(
        (area - expected).abs() < 1.0,
        "expected ~{expected:.0}, got {area}"
    );
}

#[test]
fn release_shape() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let shape = kernel.make_box(1.0, 1.0, 1.0).unwrap();
    kernel.release(shape).unwrap();
    // After release, the handle is invalid
}

#[test]
fn get_shape_type() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let shape = kernel.make_box(10.0, 10.0, 10.0).unwrap();
    let shape_type = kernel.get_shape_type(shape).unwrap();
    assert_eq!(shape_type, "Solid", "box should be a Solid");
}

#[test]
fn get_sub_shapes() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let shape = kernel.make_box(10.0, 10.0, 10.0).unwrap();
    let faces = kernel.get_sub_shapes(shape, "Face").unwrap();
    assert_eq!(faces.len(), 6, "box should have 6 faces");
}

#[test]
fn sub_shape_count_and_hashes() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let shape = kernel.make_box(10.0, 10.0, 10.0).unwrap();
    assert_eq!(kernel.sub_shape_count(shape, "face").unwrap(), 6);
    let hashes = kernel.sub_shape_hashes(shape, "face", 1_000_000).unwrap();
    assert_eq!(hashes.len(), 6, "one hash per face, no handles allocated");
}

#[test]
fn checkpoint_release_since() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let _keep = kernel.make_box(1.0, 1.0, 1.0).unwrap();
    let mark = kernel.checkpoint().unwrap();
    let _a = kernel.make_box(2.0, 2.0, 2.0).unwrap();
    let _b = kernel.make_box(3.0, 3.0, 3.0).unwrap();
    assert_eq!(kernel.get_shape_count().unwrap(), 3);
    kernel.release_since(mark).unwrap();
    // Only the pre-checkpoint handle survives.
    assert_eq!(kernel.get_shape_count().unwrap(), 1);
}

#[test]
fn extrude_rectangle() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let rect = kernel.make_rectangle(10.0, 20.0).unwrap();
    let solid = kernel.extrude(rect, 0.0, 0.0, 5.0).unwrap();
    let vol = kernel.get_volume(solid).unwrap();
    assert!(
        (vol - 1000.0).abs() < 1.0,
        "expected 10*20*5=1000, got {vol}"
    );
}

#[test]
fn sweep_oriented_auxiliary_keeps_planes_exact() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let corners = [
        (-2.0, -2.0),
        (2.0, -2.0),
        (2.0, 2.0),
        (-2.0, 2.0),
        (-2.0, -2.0),
    ];
    let profile_edges: Vec<_> = corners
        .windows(2)
        .map(|w| {
            kernel
                .make_line_edge(w[0].0, w[0].1, 0.0, w[1].0, w[1].1, 0.0)
                .unwrap()
        })
        .collect();
    let profile = kernel.make_wire(&profile_edges).unwrap();
    let spine_edge = kernel
        .make_line_edge(0.0, 0.0, 0.0, 0.0, 0.0, 20.0)
        .unwrap();
    let spine = kernel.make_wire(&[spine_edge]).unwrap();
    let guide_edge = kernel
        .make_line_edge(5.0, 0.0, 0.0, 5.0, 0.0, 20.0)
        .unwrap();
    let guide = kernel.make_wire(&[guide_edge]).unwrap();

    let solid = kernel
        .sweep_oriented(
            profile, spine, 3, 0.0, 0.0, 1.0, guide, false, 0, 0.0, 0.0, 0.0,
        )
        .unwrap();
    let vol = kernel.get_volume(solid).unwrap().abs();
    assert!((vol - 320.0).abs() < 1e-6, "expected 4*4*20=320, got {vol}");
}

#[test]
fn helix_handedness_mirrors_across_the_axis_plane() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    // One turn: pitch 5, height 5, radius 3 about +Z through the origin.
    let mut quarter_turn = |left_handed: bool| {
        let wire = kernel
            .make_helix_wire_handed(0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 5.0, 5.0, 3.0, left_handed)
            .unwrap();
        let range = kernel.curve_parameters(wire).unwrap();
        let param = range[0] + (range[1] - range[0]) / 4.0;
        kernel.curve_point_at_param(wire, param).unwrap()
    };
    let right = quarter_turn(false);
    let left = quarter_turn(true);

    assert!(
        (right[1] - 3.0).abs() < 1e-6,
        "right-handed quarter turn should reach +Y, got {right:?}"
    );
    assert!(
        (left[1] + 3.0).abs() < 1e-6,
        "left-handed quarter turn should reach -Y, got {left:?}"
    );
    assert!((left[0] - right[0]).abs() < 1e-6);
    assert!((left[2] - right[2]).abs() < 1e-6);
}
