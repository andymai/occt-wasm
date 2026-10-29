//! Integration tests for the occt-wasm Rust crate.
//!
//! These tests require a real WASI WASM binary at `crate/src/occt-wasm.wasm.br`.
//! They are skipped (not failed) when the binary is a placeholder or the build
//! is debug, unless `OCCT_WASM_REQUIRE_KERNEL` is set, which CI does so that a
//! skip cannot pass for a green run.
//!
//! To run: `cargo test --release -p occt-wasm --test integration`

#![allow(clippy::unwrap_used, clippy::panic)]

use std::sync::OnceLock;

use occt_wasm::wasmtime::{Engine, Module, StoreLimitsBuilder};
use occt_wasm::{DocumentHandle, OcctError, OcctKernel, ShapeHandle};

/// The embedded module, compiled once for the whole test binary: compiling
/// takes seconds and over a gigabyte per copy, instantiating about a
/// millisecond. Returns None if the embedded WASM is a placeholder or if
/// running in debug mode (WASM compilation is ~100x slower in debug).
fn shared_module() -> Option<&'static Module> {
    static MODULE: OnceLock<Result<Module, String>> = OnceLock::new();
    if cfg!(debug_assertions) {
        assert!(
            !kernel_required(),
            "OCCT_WASM_REQUIRE_KERNEL needs a release build: `cargo test --release`"
        );
        eprintln!(
            "Skipping test: WASM compilation too slow in debug mode. Use `cargo test --release`."
        );
        return None;
    }
    let compiled = MODULE.get_or_init(|| {
        let engine = Engine::new(&OcctKernel::engine_config()).map_err(|e| e.to_string())?;
        OcctKernel::compile(&engine).map_err(|e| e.to_string())
    });
    match compiled {
        Ok(module) => Some(module),
        Err(msg) => skip_placeholder(msg),
    }
}

/// Try to create a kernel from [`shared_module`], with the same skip rules.
fn try_kernel() -> Option<OcctKernel> {
    match OcctKernel::from_module(shared_module()?) {
        Ok(k) => Some(k),
        Err(e) => skip_placeholder(&e.to_string()),
    }
}

fn kernel_required() -> bool {
    std::env::var_os("OCCT_WASM_REQUIRE_KERNEL").is_some()
}

fn skip_placeholder<T>(msg: &str) -> Option<T> {
    // Placeholder WASM is too small to be a real module
    if !kernel_required()
        && (msg.contains("not enough bytes")
            || msg.contains("unknown import")
            || msg.contains("occt_init")
            || msg.contains("no memory export"))
    {
        eprintln!(
            "Skipping test: WASM binary is a placeholder. Run `cargo xtask build-wasi` first."
        );
        None
    } else {
        panic!("Unexpected kernel init error: {msg}");
    }
}

#[test]
fn kernel_init_and_drop() {
    let Some(_kernel) = try_kernel() else { return };
    // Kernel initializes and drops cleanly
}

#[test]
fn new_compiles_its_own_module() {
    if shared_module().is_none() {
        return;
    }
    let mut kernel = OcctKernel::new().unwrap();
    let shape = kernel.make_box(1.0, 2.0, 3.0).unwrap();
    assert!((kernel.get_volume(shape).unwrap() - 6.0).abs() < 1e-9);
}

#[test]
fn one_module_serves_independent_kernels() {
    let Some(module) = shared_module() else {
        return;
    };
    let mut a = OcctKernel::from_module(module).unwrap();
    let mut b = OcctKernel::from_module(module).unwrap();
    let in_a = a.make_box(1.0, 2.0, 3.0).unwrap();
    let in_b = b.make_box(2.0, 2.0, 2.0).unwrap();
    // Each kernel has its own memory, so the same arena slot holds different shapes.
    assert_eq!(in_a, in_b);
    a.release(in_a).unwrap();
    assert!((b.get_volume(in_b).unwrap() - 8.0).abs() < 1e-9);
}

#[test]
#[allow(unsafe_code)]
fn serialized_module_instantiates() {
    let Some(module) = shared_module() else {
        return;
    };
    let bytes = module.serialize().unwrap();
    let engine = Engine::new(&OcctKernel::engine_config()).unwrap();
    // SAFETY: the bytes come from `Module::serialize` in this process, on an
    // engine with the same configuration.
    let restored = unsafe { Module::deserialize(&engine, &bytes) }.unwrap();
    let mut kernel = OcctKernel::from_module(&restored).unwrap();
    let shape = kernel.make_box(1.0, 2.0, 3.0).unwrap();
    assert!((kernel.get_volume(shape).unwrap() - 6.0).abs() < 1e-9);
}

#[test]
fn memory_limit_below_initial_memory_fails_instantiation() {
    let Some(module) = shared_module() else {
        return;
    };
    let limits = StoreLimitsBuilder::new().memory_size(64 << 20).build();
    match OcctKernel::from_module_with_limiter(module, limits) {
        Err(OcctError::MemoryLimit { current, requested }) => {
            assert_eq!(current, 0);
            assert_eq!(requested, 128 << 20);
        }
        Err(e) => panic!("expected a memory limit error, got {e:?}"),
        Ok(_) => panic!("a 64 MiB cap should not fit the module's 128 MiB of initial memory"),
    }
}

#[test]
fn memory_limit_stops_the_call_that_exceeds_it() {
    let Some(module) = shared_module() else {
        return;
    };
    let cap = 160 << 20;
    let limits = StoreLimitsBuilder::new().memory_size(cap).build();
    let mut kernel = OcctKernel::from_module_with_limiter(module, limits).unwrap();
    let sphere = kernel.make_sphere(10.0).unwrap();
    match kernel.tessellate(sphere, 0.0005, 0.01) {
        Err(OcctError::MemoryLimit { current, requested }) => {
            assert!(
                current <= cap && requested > cap,
                "{current} -> {requested}"
            );
        }
        Err(e) => panic!("expected a memory limit error, got {e:?}"),
        Ok(mesh) => panic!("{} triangles fit under the cap", mesh.indices.len() / 3),
    }
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
fn bounding_box_loose_contains_precise() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let shape = kernel.make_box(10.0, 20.0, 30.0).unwrap();
    let bbox = kernel.get_bounding_box_loose(shape, false).unwrap();
    assert!((bbox.min.x).abs() < 0.01);
    assert!((bbox.max.x - 10.0).abs() < 0.01);
    assert!((bbox.max.z - 30.0).abs() < 0.01);

    let cyl = kernel.make_cylinder(5.0, 10.0).unwrap();
    let precise = kernel.get_bounding_box(cyl, false).unwrap();
    let loose = kernel.get_bounding_box_loose(cyl, false).unwrap();
    assert!(loose.min.x <= precise.min.x && loose.max.x >= precise.max.x);
    assert!(loose.min.y <= precise.min.y && loose.max.y >= precise.max.y);
    assert!(loose.min.z <= precise.min.z && loose.max.z >= precise.max.z);
    assert!((loose.max.z - 10.0).abs() < 0.01);
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
fn brep_binary_roundtrip() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let shape = kernel.make_box(10.0, 20.0, 30.0).unwrap();
    let bytes = kernel.to_brep_binary(shape).unwrap();
    let restored = kernel.from_brep_binary(&bytes).unwrap();
    assert!((kernel.get_volume(restored).unwrap() - 6000.0).abs() < 1e-6);
    assert!(kernel.from_brep_binary(b"not a brep").is_err());
}

#[test]
fn stl_binary_roundtrip() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let shape = kernel.make_box(10.0, 20.0, 30.0).unwrap();
    let bytes = kernel.export_stl_binary(shape, 0.5).unwrap();
    let triangles = u32::from_le_bytes(bytes[80..84].try_into().unwrap()) as usize;
    assert_eq!(triangles, 12);
    assert_eq!(bytes.len(), 84 + triangles * 50);
    for facet in bytes[84..].chunks_exact(50) {
        let mut normal: Vec<f32> = facet[..12]
            .chunks_exact(4)
            .map(|c| f32::from_le_bytes(c.try_into().unwrap()).abs())
            .collect();
        normal.sort_by(f32::total_cmp);
        assert_eq!(normal, [0.0, 0.0, 1.0], "facet normal bytes must survive");
    }

    let imported = kernel.import_stl_binary(&bytes).unwrap();
    let bbox = kernel.get_bounding_box(imported, false).unwrap();
    assert!((bbox.max.x - 10.0).abs() < 1e-3, "bbox: {bbox:?}");
    assert!((bbox.max.y - 20.0).abs() < 1e-3, "bbox: {bbox:?}");
    assert!((bbox.max.z - 30.0).abs() < 1e-3, "bbox: {bbox:?}");
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
    assert_eq!(shape_type, "solid", "box should be a solid");
}

#[test]
fn get_sub_shapes() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let shape = kernel.make_box(10.0, 10.0, 10.0).unwrap();
    let faces = kernel.get_sub_shapes(shape, "face").unwrap();
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

/// An XCAF document with a named, coloured housing and one gear component.
fn housing_with_gear(kernel: &mut OcctKernel) -> (DocumentHandle, i32, i32) {
    let doc = kernel.xcaf_new_document().unwrap();
    let housing = kernel.make_box(20.0, 20.0, 20.0).unwrap();
    let gear = kernel.make_cylinder(5.0, 10.0).unwrap();
    let root = kernel.xcaf_add_shape(doc, housing).unwrap();
    kernel.xcaf_set_name(doc, root, "housing").unwrap();
    kernel.xcaf_set_color(doc, root, 0.8, 0.2, 0.1).unwrap();
    let comp = kernel
        .xcaf_add_component(doc, root, gear, 10.0, 0.0, 5.0, 0.0, 0.0, 0.0)
        .unwrap();
    kernel.xcaf_set_name(doc, comp, "gear-1").unwrap();
    (doc, root, comp)
}

#[test]
fn xcaf_document_assembly() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let (doc, _, comp) = housing_with_gear(&mut kernel);

    let info = kernel.xcaf_get_label_info(doc, comp).unwrap();
    assert!(info.is_component);
    assert_eq!(info.name, "gear-1");
    let proto = kernel.xcaf_get_referred_label(doc, comp).unwrap();
    assert!(proto > 0);
    assert_eq!(kernel.xcaf_get_referred_label(doc, proto).unwrap(), 0);
    let location = kernel.xcaf_get_label_location(doc, comp).unwrap();
    assert_eq!(location.len(), 12);
    assert!((location[3] - 10.0).abs() < 1e-9);
    assert!((location[11] - 5.0).abs() < 1e-9);
    kernel.xcaf_close(doc).unwrap();
}

#[test]
fn xcaf_export_glb() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let (doc, _, _) = housing_with_gear(&mut kernel);
    let glb = kernel.xcaf_export_glb(doc, 0.5, 0.5).unwrap();
    assert_eq!(&glb[..4], b"glTF");
    assert_eq!(u32::from_le_bytes(glb[4..8].try_into().unwrap()), 2);
    let length = u32::from_le_bytes(glb[8..12].try_into().unwrap()) as usize;
    assert_eq!(length, glb.len());
    kernel.xcaf_close(doc).unwrap();
}

#[test]
fn xcaf_step_roundtrip() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let (doc, _, _) = housing_with_gear(&mut kernel);
    let step = kernel.xcaf_export_step(doc).unwrap();
    assert!(step.contains("STEP"));
    kernel.xcaf_close(doc).unwrap();

    let imported = kernel.xcaf_import_step(&step).unwrap();
    let roots = kernel.xcaf_get_root_labels(imported).unwrap();
    assert_eq!(roots.len(), 1);
    let root_info = kernel.xcaf_get_label_info(imported, roots[0]).unwrap();
    assert_eq!(root_info.name, "housing");
    assert!(root_info.shape_id > 0);
    kernel.xcaf_close(imported).unwrap();
}

#[test]
fn enumerated_sub_shapes_feed_back_into_modelling() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    // get_sub_shapes hands back the same handle type the modelling calls take,
    // so an enumerated edge can be filleted without leaving the type system.
    let box_id = kernel.make_box(10.0, 10.0, 10.0).unwrap();
    let edges = kernel.get_sub_shapes(box_id, "edge").unwrap();
    assert_eq!(edges.len(), 12);

    let rounded = kernel.fillet(box_id, &edges[..1], 1.0).unwrap();
    let volume = kernel.get_volume(rounded).unwrap();
    assert!(volume > 990.0 && volume < 1000.0, "volume {volume}");
}

#[test]
fn unbuildable_fillet_reports_an_error_instead_of_trapping() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    // A radius equal to the wall thickness drives OCCT's blend solver into an
    // adaptor holding no curve. Through wasmtime that dereference used to be a
    // trap, which no caller can handle (#348).
    let solid = kernel.make_box(40.0, 30.0, 20.0).unwrap();
    let top = kernel
        .get_sub_shapes(solid, "face")
        .unwrap()
        .into_iter()
        .find(|f| kernel.get_bounding_box(*f, false).unwrap().min.z > 19.999)
        .expect("top face");
    let shelled = kernel.shell(solid, &[top], 2.0, 1e-3).unwrap();

    let edges = kernel.get_sub_shapes(shelled, "edge").unwrap();
    let rim = edges
        .iter()
        .copied()
        .find(|e| {
            let b = kernel.get_bounding_box(*e, false).unwrap();
            b.min.z > 19.999 && b.min.x < 0.001 && b.max.x < 0.001
        })
        .expect("rim edge");

    let failure = kernel.fillet(shelled, &[rim], 2.0).unwrap_err();
    assert!(
        format!("{failure}").contains("fillet"),
        "expected a fillet error, got: {failure}"
    );

    // The store survives the failure, so the next build still works.
    let corner = edges
        .iter()
        .copied()
        .find(|e| {
            let b = kernel.get_bounding_box(*e, false).unwrap();
            b.min.x > 39.999 && b.min.y > 29.999
        })
        .expect("corner edge");
    let good = kernel.fillet(shelled, &[corner], 1.0).unwrap();
    let volume = kernel.get_volume(good).unwrap();
    assert!((7140.0..7152.0).contains(&volume), "volume {volume}");
}

/// L-shaped prism, 20 x 20 x 10, with one concave vertical edge at (10, 10).
/// Offsetting inward pulls that edge's two faces apart, so the join type
/// decides whether the gap is bridged by a cylinder (Arc) or planes (Intersection).
fn l_prism(kernel: &mut OcctKernel) -> ShapeHandle {
    let a = kernel.make_box(20.0, 10.0, 10.0).unwrap();
    let b = kernel.make_box(10.0, 20.0, 10.0).unwrap();
    let fused = kernel.fuse(a, b).unwrap();
    kernel.unify_same_domain(fused).unwrap()
}

fn all_planar(kernel: &mut OcctKernel, shape: ShapeHandle) -> bool {
    kernel
        .get_sub_shapes(shape, "face")
        .unwrap()
        .into_iter()
        .all(|f| kernel.surface_type(f).unwrap() == "plane")
}

fn top_face(kernel: &mut OcctKernel, shape: ShapeHandle) -> ShapeHandle {
    kernel
        .get_sub_shapes(shape, "face")
        .unwrap()
        .into_iter()
        .find(|f| kernel.get_bounding_box(*f, false).unwrap().min.z > 9.999)
        .expect("top face")
}

// Raw join codes: 0 = Arc, 1 = Intersection, 2 = Tangent (rejected in 3D).
const ARC: i32 = 0;
const INTERSECTION: i32 = 1;
const TANGENT: i32 = 2;
const BOUND: i32 = 1_000_000;

#[test]
fn join_type_keeps_the_concave_edge_sharp() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    // Intersection keeps a 2 x 2 square at the concave edge where Arc keeps a
    // quarter circle of radius 2.
    let corner = 4.0 - std::f64::consts::PI;

    let solid = l_prism(&mut kernel);
    let arc = kernel.offset_with_join(solid, -2.0, 1e-6, ARC).unwrap();
    let sharp = kernel
        .offset_with_join(solid, -2.0, 1e-6, INTERSECTION)
        .unwrap();
    assert!(!all_planar(&mut kernel, arc));
    assert!(all_planar(&mut kernel, sharp));
    let lost = kernel.get_volume(arc).unwrap() - kernel.get_volume(sharp).unwrap();
    assert!(
        (lost - corner * 6.0).abs() < 1e-2,
        "offset volume difference {lost}"
    );

    let top = top_face(&mut kernel, solid);
    let arc = kernel
        .shell_with_join(solid, &[top], 2.0, 1e-6, ARC)
        .unwrap();
    let sharp = kernel
        .shell_with_join(solid, &[top], 2.0, 1e-6, INTERSECTION)
        .unwrap();
    assert!(kernel.is_valid(sharp).unwrap());
    assert!(all_planar(&mut kernel, sharp));
    let extra = kernel.get_volume(sharp).unwrap() - kernel.get_volume(arc).unwrap();
    assert!(
        (extra - corner * 8.0).abs() < 1e-2,
        "shell volume difference {extra}"
    );
}

#[test]
fn history_join_variants_return_a_usable_result() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let solid = l_prism(&mut kernel);
    let hashes: Vec<i32> = kernel
        .get_sub_shapes(solid, "face")
        .unwrap()
        .into_iter()
        .map(|f| kernel.hash_code(f, BOUND).unwrap())
        .collect();

    let evo = kernel
        .offset_with_history_and_join(solid, -2.0, 1e-6, &hashes, BOUND, INTERSECTION)
        .unwrap();
    assert!(all_planar(&mut kernel, evo.result()));
    assert!(!evo.generated.is_empty());

    let top = top_face(&mut kernel, solid);
    let evo = kernel
        .shell_with_history_and_join(solid, &[top], 2.0, 1e-6, &hashes, BOUND, INTERSECTION)
        .unwrap();
    assert!(all_planar(&mut kernel, evo.result()));
    assert!(!evo.modified.is_empty());
    let plain = kernel
        .shell_with_join(solid, &[top], 2.0, 1e-6, INTERSECTION)
        .unwrap();
    let with_history = kernel.get_volume(evo.result()).unwrap();
    assert!((with_history - kernel.get_volume(plain).unwrap()).abs() < 1e-6);
}

#[test]
fn join_type_rejects_tangent() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let solid = l_prism(&mut kernel);
    let err = kernel
        .offset_with_join(solid, -2.0, 1e-6, TANGENT)
        .unwrap_err();
    assert!(format!("{err}").contains("joinType"), "got: {err}");
    let err = kernel
        .offset_with_history_and_join(solid, -2.0, 1e-6, &[], 1, TANGENT)
        .unwrap_err();
    assert!(format!("{err}").contains("joinType"), "got: {err}");

    // The store survives the rejection.
    assert!(kernel.offset_with_join(solid, -2.0, 1e-6, ARC).is_ok());
}

/// The four edges of a 10 mm cube that run along Z.
fn vertical_edges(kernel: &mut OcctKernel, solid: ShapeHandle) -> Vec<ShapeHandle> {
    let edges = kernel.get_sub_shapes(solid, "edge").unwrap();
    edges
        .into_iter()
        .filter(|&edge| {
            let bb = kernel.get_bounding_box(edge, false).unwrap();
            (bb.max.z - bb.min.z) > 1.0
        })
        .collect()
}

#[test]
fn fillet_radii_gives_each_edge_its_own_radius() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let cube = kernel.make_box(10.0, 10.0, 10.0).unwrap();
    let edges = vertical_edges(&mut kernel, cube);
    assert_eq!(edges.len(), 4);
    let loss = |r: f64| (1.0 - std::f64::consts::FRAC_PI_4) * r * r * 10.0;

    let rounded = kernel
        .fillet_radii(cube, &edges, &[1.0, 1.0, 3.0, 3.0], &[1.0, 1.0, 3.0, 3.0])
        .unwrap();
    let volume = kernel.get_volume(rounded).unwrap();
    let removed: f64 = [1.0, 1.0, 3.0, 3.0].into_iter().map(loss).sum();
    let expected = 1000.0 - removed;
    assert!(
        (volume - expected).abs() < 1e-6,
        "volume {volume}, expected {expected}"
    );

    let history = kernel
        .fillet_radii_with_history(cube, &edges, &[1.0; 4], &[3.0; 4], &[], 1 << 20)
        .unwrap();
    let radius_one: f64 = [1.0; 4].into_iter().map(loss).sum();
    assert!(kernel.get_volume(history.result()).unwrap() < 1000.0 - radius_one);
}

#[test]
fn chamfer_distances_and_angles_per_edge() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let cube = kernel.make_box(10.0, 10.0, 10.0).unwrap();
    let edges = vertical_edges(&mut kernel, cube);

    let symmetric = kernel
        .chamfer_distances(
            cube,
            &edges,
            &[1.0, 1.0, 2.0, 2.0],
            &[1.0, 1.0, 2.0, 2.0],
            &[],
        )
        .unwrap();
    assert!((kernel.get_volume(symmetric).unwrap() - 950.0).abs() < 1e-6);

    let asymmetric = kernel
        .chamfer_distances(cube, &edges, &[1.0; 4], &[3.0; 4], &[])
        .unwrap();
    assert!((kernel.get_volume(asymmetric).unwrap() - 940.0).abs() < 1e-6);

    let angled = kernel
        .chamfer_dist_angles(cube, &edges, &[1.0; 4], &[45.0; 4], &[])
        .unwrap();
    assert!((kernel.get_volume(angled).unwrap() - 980.0).abs() < 1e-6);

    let err = kernel
        .chamfer_distances(cube, &edges, &[1.0; 4], &[1.0; 3], &[])
        .unwrap_err();
    assert!(err.to_string().contains("one entry per edge"), "{err}");
}

#[test]
fn draft_faces_pivot_about_the_neutral_plane() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let cube = kernel
        .make_box_from_corners(0.0, 0.0, 100.0, 10.0, 10.0, 110.0)
        .unwrap();
    let faces = kernel.get_sub_shapes(cube, "face").unwrap();
    let mut sides = Vec::new();
    for face in faces {
        let center = kernel.get_surface_center_of_mass(face).unwrap();
        if (center[2] - 105.0).abs() < 1e-9 {
            sides.push(face);
        }
    }
    assert_eq!(sides.len(), 4);
    let angle = 5f64.to_radians();
    let drafted = kernel
        .draft_faces(
            cube,
            &sides[..1],
            &[angle],
            0.0,
            0.0,
            1.0,
            0.0,
            0.0,
            100.0,
            0.0,
            0.0,
            1.0,
        )
        .unwrap();
    let wedge = 500.0 * angle.tan();
    let expected = 1000.0 - wedge;
    let volume = kernel.get_volume(drafted).unwrap();
    assert!(
        (volume - expected).abs() < 1e-6,
        "volume {volume}, expected {expected}"
    );

    let all = kernel
        .draft_faces(
            cube,
            &sides,
            &[angle; 4],
            0.0,
            0.0,
            1.0,
            0.0,
            0.0,
            100.0,
            0.0,
            0.0,
            1.0,
        )
        .unwrap();
    assert!(kernel.get_volume(all).unwrap() < volume);
}

#[test]
fn step_export_writes_the_requested_unit() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let cube = kernel.make_box(25.4, 25.4, 25.4).unwrap();
    let step = kernel.export_step_with_unit(cube, "inch").unwrap();
    assert!(step.contains("CONVERSION_BASED_UNIT('INCH'"));
    let back = kernel.import_step(&step).unwrap();
    let volume = kernel.get_volume(back).unwrap();
    assert!((volume - 25.4f64.powi(3)).abs() < 1e-6, "volume {volume}");
    assert!(kernel.export_step_with_unit(cube, "furlong").is_err());

    let doc = kernel.xcaf_new_document().unwrap();
    let label = kernel.xcaf_add_shape(doc, cube).unwrap();
    kernel.xcaf_set_name(doc, label, "Größe").unwrap();
    kernel
        .xcaf_set_color(doc, label, 128.0 / 255.0, 0.5, 0.5)
        .unwrap();
    let info = kernel.xcaf_get_label_info(doc, label).unwrap();
    assert_eq!(info.name, "Größe");
    assert!((info.r - 128.0 / 255.0).abs() < 1e-6);
    let step = kernel.xcaf_export_step_with_unit(doc, "inch").unwrap();
    assert!(step.contains("CONVERSION_BASED_UNIT('INCH'"));
    assert!(
        step.contains("COLOUR_RGB('',0.50196"),
        "colour not written as sRGB"
    );
    kernel.xcaf_close(doc).unwrap();
}

/// The header's `FILE_SCHEMA` entry. OCCT wraps a long one across lines.
fn file_schema(step: &str) -> &str {
    let start = step.find("FILE_SCHEMA").unwrap();
    let len = step[start..].find(';').unwrap();
    &step[start..start + len]
}

#[test]
fn step_export_writes_the_requested_schema() {
    const AP214: &str = "'AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'";
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    // The cone's lateral face is dropped unless DirectFaces runs, so it shows
    // that every protocol still writes it.
    let cone = kernel.make_cone(8.0, 0.0, 24.0).unwrap();
    for (schema, protocol) in [
        ("AP203", "'CONFIG_CONTROL_DESIGN'"),
        ("ap214", AP214),
        (
            "AP242",
            "'AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF {1 0 10303 442 1 1 4 }'",
        ),
    ] {
        let step = kernel
            .export_step_with_options(cone, "inch", schema)
            .unwrap();
        assert!(file_schema(&step).contains(protocol), "{schema}: {step}");
        assert!(step.contains("CONVERSION_BASED_UNIT('INCH'"), "{schema}");
        assert_eq!(step.matches("CONICAL_SURFACE").count(), 1, "{schema}");

        let doc = kernel.xcaf_new_document().unwrap();
        kernel.xcaf_add_shape(doc, cone).unwrap();
        let step = kernel
            .xcaf_export_step_with_options(doc, "", schema)
            .unwrap();
        kernel.xcaf_close(doc).unwrap();
        assert!(
            file_schema(&step).contains(protocol),
            "xcaf {schema}: {step}"
        );
        assert!(step.contains(".MILLI."), "xcaf {schema}");
        assert_eq!(step.matches("CONICAL_SURFACE").count(), 1, "xcaf {schema}");
    }

    let step = kernel.export_step(cone).unwrap();
    assert_eq!(file_schema(&step), format!("FILE_SCHEMA(({AP214}))"));
    assert!(step.contains(".MILLI."));

    let err = kernel
        .export_step_with_options(cone, "", "AP209")
        .unwrap_err();
    assert!(
        format!("{err}").contains("unknown STEP schema 'AP209'"),
        "got: {err}"
    );
    let doc = kernel.xcaf_new_document().unwrap();
    assert!(
        kernel
            .xcaf_export_step_with_options(doc, "mm", "AP209")
            .is_err()
    );
    kernel.xcaf_close(doc).unwrap();
}

#[test]
fn freeform_bounds_and_volume_are_exact() {
    let Some(mut kernel) = try_kernel() else {
        return;
    };
    let ellipsoid = kernel.make_ellipsoid(3.0, 4.0, 5.0).unwrap();
    let bb = kernel.get_bounding_box(ellipsoid, false).unwrap();
    for (got, want) in [
        (bb.min.x, -3.0),
        (bb.min.y, -4.0),
        (bb.min.z, -5.0),
        (bb.max.x, 3.0),
        (bb.max.y, 4.0),
        (bb.max.z, 5.0),
    ] {
        assert!((got - want).abs() < 1e-6, "bound {got}, expected {want}");
    }
    let volume = kernel.get_volume(ellipsoid).unwrap();
    let expected = 4.0 / 3.0 * std::f64::consts::PI * 60.0;
    assert!(
        ((volume - expected) / expected).abs() < 1e-6,
        "volume {volume}"
    );
}
