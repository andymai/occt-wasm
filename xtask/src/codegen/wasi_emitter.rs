//! WASI C-ABI export emitter for the facade code generator.
//!
//! Generates `wasi_exports.cpp` — a set of `extern "C"` functions that wrap
//! `OcctKernel` methods for use with non-JS WASM runtimes (e.g. wasmtime).
//!
//! Design:
//! - Global kernel singleton (`occt_init` / `occt_destroy`)
//! - Error protocol: `occt_has_error` / `occt_get_error` / `occt_clear_error`
//! - Complex return types use static buffers + accessor functions
//! - All names are `snake_case` with `occt_` prefix

use std::fmt::Write as _;

use super::types::{FacadeParam, MethodKind, MethodSpec, ReturnType};

/// Convert `camelCase` to `snake_case`.
pub fn camel_to_snake(s: &str) -> String {
    let mut result = String::with_capacity(s.len() + 4);
    for (i, ch) in s.chars().enumerate() {
        if ch.is_ascii_uppercase() {
            if i > 0 {
                // Don't insert underscore between consecutive capitals
                // unless followed by a lowercase letter (e.g. "HLR" stays "hlr",
                // "glTF" stays "gl_tf")
                let prev_upper = s
                    .as_bytes()
                    .get(i.wrapping_sub(1))
                    .is_some_and(u8::is_ascii_uppercase);
                let next_lower = s.as_bytes().get(i + 1).is_some_and(u8::is_ascii_lowercase);
                if !prev_upper || next_lower {
                    result.push('_');
                }
            }
            result.push(ch.to_ascii_lowercase());
        } else {
            result.push(ch);
        }
    }
    result
}

/// Format a parameter as a C-ABI formal parameter declaration.
///
/// String and vector types expand to pointer+length pairs.
fn param_to_c_abi(param: &FacadeParam) -> String {
    match param {
        FacadeParam::ShapeId(name) => format!("uint32_t {name}"),
        FacadeParam::Double(name) => format!("double {name}"),
        FacadeParam::Bool(name) | FacadeParam::Int(name) => format!("int32_t {name}"),
        FacadeParam::String(name) => format!("const char* {name}_ptr, uint32_t {name}_len"),
        FacadeParam::VectorShapeIds(name) => {
            format!("const uint32_t* {name}_ptr, uint32_t {name}_len")
        }
        FacadeParam::VectorDouble(name) => format!("const double* {name}_ptr, uint32_t {name}_len"),
        FacadeParam::VectorInt(name) => format!("const int32_t* {name}_ptr, uint32_t {name}_len"),
    }
}

/// Build the C-ABI parameter list for a function.
fn c_abi_param_list(params: &[FacadeParam]) -> String {
    if params.is_empty() {
        return String::new();
    }
    params
        .iter()
        .map(param_to_c_abi)
        .collect::<Vec<_>>()
        .join(", ")
}

/// Generate the expression to pass a parameter to the kernel method.
///
/// String/vector types are reconstructed from ptr+len pairs.
fn param_to_call_arg(param: &FacadeParam) -> String {
    match param {
        FacadeParam::ShapeId(name) | FacadeParam::Double(name) | FacadeParam::Int(name) => {
            (*name).to_owned()
        }
        FacadeParam::Bool(name) => format!("({name} != 0)"),
        FacadeParam::String(name) => format!("std::string({name}_ptr, {name}_len)"),
        FacadeParam::VectorShapeIds(name) => {
            format!("std::vector<uint32_t>({name}_ptr, {name}_ptr + {name}_len)")
        }
        FacadeParam::VectorDouble(name) => {
            format!("std::vector<double>({name}_ptr, {name}_ptr + {name}_len)")
        }
        FacadeParam::VectorInt(name) => {
            format!("std::vector<int>({name}_ptr, {name}_ptr + {name}_len)")
        }
    }
}

/// Build the call arguments for a kernel method.
fn call_args(params: &[FacadeParam]) -> String {
    params
        .iter()
        .map(param_to_call_arg)
        .collect::<Vec<_>>()
        .join(", ")
}

/// The C return type for a given `ReturnType`.
const fn c_return_type(rt: ReturnType) -> &'static str {
    match rt {
        ReturnType::ShapeId | ReturnType::Uint32 => "uint32_t",
        ReturnType::Double => "double",
        _ => "int32_t",
    }
}

/// The error sentinel value for a return type.
const fn error_sentinel(rt: ReturnType) -> &'static str {
    match rt {
        ReturnType::ShapeId | ReturnType::Uint32 => "0",
        ReturnType::Double => "std::numeric_limits<double>::quiet_NaN()",
        _ => "-1",
    }
}

/// Generate the body of a WASI export wrapper for one method.
#[allow(clippy::too_many_lines)]
fn emit_wasi_method(buf: &mut String, spec: &MethodSpec) {
    let snake_name = camel_to_snake(spec.name);
    let ret = c_return_type(spec.return_type);
    let params = c_abi_param_list(spec.params);
    let sentinel = error_sentinel(spec.return_type);
    let args = call_args(spec.params);

    let _ = writeln!(buf, "{ret} occt_{snake_name}({params}) {{");
    let _ = writeln!(buf, "    CLEAR_ERROR();");
    let _ = writeln!(buf, "    try {{");

    // Generate the call + return based on return type
    match spec.return_type {
        ReturnType::ShapeId | ReturnType::Uint32 | ReturnType::Double | ReturnType::Int => {
            let _ = writeln!(
                buf,
                "        return g_kernel->{name}({args});",
                name = spec.name
            );
        }
        ReturnType::Bool => {
            let _ = writeln!(
                buf,
                "        return g_kernel->{name}({args}) ? 1 : 0;",
                name = spec.name
            );
        }
        ReturnType::Void => {
            let _ = writeln!(buf, "        g_kernel->{name}({args});", name = spec.name);
            let _ = writeln!(buf, "        return 0;");
        }
        ReturnType::String => {
            let _ = writeln!(
                buf,
                "        g_string_buf = g_kernel->{name}({args});",
                name = spec.name
            );
            let _ = writeln!(
                buf,
                "        return static_cast<int32_t>(g_string_buf.size());"
            );
        }
        ReturnType::VectorUint32 => {
            let _ = writeln!(
                buf,
                "        g_vec_u32_buf = g_kernel->{name}({args});",
                name = spec.name
            );
            let _ = writeln!(
                buf,
                "        return static_cast<int32_t>(g_vec_u32_buf.size());"
            );
        }
        ReturnType::VectorDouble => {
            let _ = writeln!(
                buf,
                "        g_vec_f64_buf = g_kernel->{name}({args});",
                name = spec.name
            );
            let _ = writeln!(
                buf,
                "        return static_cast<int32_t>(g_vec_f64_buf.size());"
            );
        }
        ReturnType::VectorInt => {
            let _ = writeln!(
                buf,
                "        g_vec_i32_buf = g_kernel->{name}({args});",
                name = spec.name
            );
            let _ = writeln!(
                buf,
                "        return static_cast<int32_t>(g_vec_i32_buf.size());"
            );
        }
        ReturnType::BBoxData => {
            let _ = writeln!(
                buf,
                "        g_bbox_buf = g_kernel->{name}({args});",
                name = spec.name
            );
            let _ = writeln!(buf, "        return 0;");
        }
        ReturnType::MeshData => {
            // MeshData has deleted operator=, use destroy + placement new
            let _ = writeln!(buf, "        g_mesh_buf.~MeshData();");
            let _ = writeln!(
                buf,
                "        new (&g_mesh_buf) MeshData(g_kernel->{name}({args}));",
                name = spec.name
            );
            let _ = writeln!(buf, "        return 0;");
        }
        ReturnType::MeshBatchData => {
            let _ = writeln!(buf, "        g_mesh_batch_buf.~MeshBatchData();");
            let _ = writeln!(
                buf,
                "        new (&g_mesh_batch_buf) MeshBatchData(g_kernel->{name}({args}));",
                name = spec.name
            );
            let _ = writeln!(buf, "        return 0;");
        }
        ReturnType::EdgeData => {
            let _ = writeln!(buf, "        g_edge_buf.~EdgeData();");
            let _ = writeln!(
                buf,
                "        new (&g_edge_buf) EdgeData(g_kernel->{name}({args}));",
                name = spec.name
            );
            let _ = writeln!(buf, "        return 0;");
        }
        ReturnType::NurbsCurveData => {
            let _ = writeln!(
                buf,
                "        g_nurbs_buf = g_kernel->{name}({args});",
                name = spec.name
            );
            let _ = writeln!(buf, "        return 0;");
        }
        ReturnType::EvolutionData => {
            let _ = writeln!(
                buf,
                "        g_evo_buf = g_kernel->{name}({args});",
                name = spec.name
            );
            let _ = writeln!(buf, "        return 0;");
        }
        ReturnType::ProjectionData => {
            let _ = writeln!(
                buf,
                "        g_proj_buf = g_kernel->{name}({args});",
                name = spec.name
            );
            let _ = writeln!(buf, "        return 0;");
        }
        ReturnType::XCAFLabelInfo => {
            let _ = writeln!(
                buf,
                "        g_label_info_buf = g_kernel->{name}({args});",
                name = spec.name
            );
            let _ = writeln!(buf, "        return 0;");
        }
    }

    let _ = writeln!(buf, "    }} catch (const std::exception& e) {{");
    let _ = writeln!(buf, "        SET_ERROR(e.what());");
    let _ = writeln!(buf, "        return {sentinel};");
    let _ = writeln!(buf, "    }}");
    let _ = writeln!(buf, "}}");
}

/// Generate the contents of `facade/generated/wasi_exports.cpp`.
#[allow(clippy::too_many_lines)]
pub fn emit_wasi_exports(methods: &[&MethodSpec]) -> String {
    let mut buf = String::with_capacity(16384);

    let _ = writeln!(
        buf,
        "// AUTO-GENERATED by cargo xtask codegen -- DO NOT EDIT"
    );
    let _ = writeln!(
        buf,
        "// WASI C-ABI exports for non-JS WASM runtimes (wasmtime, wasmer)"
    );
    let _ = writeln!(buf);
    let _ = writeln!(buf, "#include \"occt_kernel.h\"");
    let _ = writeln!(buf);
    let _ = writeln!(buf, "#include <cstdlib>");
    let _ = writeln!(buf, "#include <cstring>");
    let _ = writeln!(buf, "#include <limits>");
    let _ = writeln!(buf, "#include <new>");
    let _ = writeln!(buf, "#include <string>");
    let _ = writeln!(buf, "#include <vector>");
    let _ = writeln!(buf);

    // Global state
    let _ = writeln!(buf, "// === Global state ===");
    let _ = writeln!(buf);
    let _ = writeln!(buf, "static OcctKernel* g_kernel = nullptr;");
    let _ = writeln!(buf);
    let _ = writeln!(buf, "// Error state");
    let _ = writeln!(buf, "static bool g_has_error = false;");
    let _ = writeln!(buf, "static std::string g_error_msg;");
    let _ = writeln!(buf);
    let _ = writeln!(buf, "#define CLEAR_ERROR() g_has_error = false");
    let _ = writeln!(
        buf,
        "#define SET_ERROR(msg) do {{ g_has_error = true; g_error_msg = (msg); }} while(0)"
    );
    let _ = writeln!(buf);

    // Result buffers
    let _ = writeln!(buf, "// Result buffers for complex return types");
    let _ = writeln!(buf, "static std::string g_string_buf;");
    let _ = writeln!(buf, "static std::vector<uint32_t> g_vec_u32_buf;");
    let _ = writeln!(buf, "static std::vector<double> g_vec_f64_buf;");
    let _ = writeln!(buf, "static std::vector<int32_t> g_vec_i32_buf;");
    let _ = writeln!(buf, "static MeshData g_mesh_buf;");
    let _ = writeln!(buf, "static MeshBatchData g_mesh_batch_buf;");
    let _ = writeln!(buf, "static EdgeData g_edge_buf;");
    let _ = writeln!(buf, "static BBoxData g_bbox_buf;");
    let _ = writeln!(buf, "static NurbsCurveData g_nurbs_buf;");
    let _ = writeln!(buf, "static EvolutionData g_evo_buf;");
    let _ = writeln!(buf, "static ProjectionData g_proj_buf;");
    let _ = writeln!(buf, "static XCAFLabelInfo g_label_info_buf;");
    let _ = writeln!(buf);

    // extern "C" block
    let _ = writeln!(buf, "extern \"C\" {{");
    let _ = writeln!(buf);

    // Lifecycle
    let _ = writeln!(buf, "// === Lifecycle ===");
    let _ = writeln!(buf);
    let _ = writeln!(buf, "int32_t occt_init() {{");
    let _ = writeln!(buf, "    if (g_kernel) return -1;");
    let _ = writeln!(buf, "    try {{");
    let _ = writeln!(buf, "        g_kernel = new OcctKernel();");
    let _ = writeln!(buf, "        return 0;");
    let _ = writeln!(buf, "    }} catch (const std::exception& e) {{");
    let _ = writeln!(buf, "        SET_ERROR(e.what());");
    let _ = writeln!(buf, "        return -1;");
    let _ = writeln!(buf, "    }}");
    let _ = writeln!(buf, "}}");
    let _ = writeln!(buf);
    let _ = writeln!(buf, "void occt_destroy() {{");
    let _ = writeln!(buf, "    delete g_kernel;");
    let _ = writeln!(buf, "    g_kernel = nullptr;");
    let _ = writeln!(buf, "}}");
    let _ = writeln!(buf);

    // Error accessors
    let _ = writeln!(buf, "// === Error handling ===");
    let _ = writeln!(buf);
    let _ = writeln!(
        buf,
        "int32_t occt_has_error() {{ return g_has_error ? 1 : 0; }}"
    );
    let _ = writeln!(buf);
    let _ = writeln!(
        buf,
        "const char* occt_get_error() {{ return g_error_msg.c_str(); }}"
    );
    let _ = writeln!(buf);
    let _ = writeln!(
        buf,
        "uint32_t occt_get_error_len() {{ return static_cast<uint32_t>(g_error_msg.size()); }}"
    );
    let _ = writeln!(buf);
    let _ = writeln!(
        buf,
        "void occt_clear_error() {{ g_has_error = false; g_error_msg.clear(); }}"
    );
    let _ = writeln!(buf);

    // Memory allocation (for host→guest data transfer)
    let _ = writeln!(buf, "// === Memory management ===");
    let _ = writeln!(buf);
    let _ = writeln!(
        buf,
        "void* occt_alloc(uint32_t size) {{ return malloc(size); }}"
    );
    let _ = writeln!(buf);
    let _ = writeln!(buf, "void occt_free(void* ptr) {{ free(ptr); }}");
    let _ = writeln!(buf);

    // Result buffer accessors
    let _ = writeln!(buf, "// === Result buffer accessors ===");
    let _ = writeln!(buf);
    let _ = writeln!(
        buf,
        "const char* occt_get_string_result() {{ return g_string_buf.data(); }}"
    );
    let _ = writeln!(
        buf,
        "uint32_t occt_get_string_result_len() {{ return static_cast<uint32_t>(g_string_buf.size()); }}"
    );
    let _ = writeln!(buf);
    let _ = writeln!(
        buf,
        "const uint32_t* occt_get_vec_u32_result() {{ return g_vec_u32_buf.data(); }}"
    );
    let _ = writeln!(
        buf,
        "uint32_t occt_get_vec_u32_result_len() {{ return static_cast<uint32_t>(g_vec_u32_buf.size()); }}"
    );
    let _ = writeln!(buf);
    let _ = writeln!(
        buf,
        "const double* occt_get_vec_f64_result() {{ return g_vec_f64_buf.data(); }}"
    );
    let _ = writeln!(
        buf,
        "uint32_t occt_get_vec_f64_result_len() {{ return static_cast<uint32_t>(g_vec_f64_buf.size()); }}"
    );
    let _ = writeln!(buf);
    let _ = writeln!(
        buf,
        "const int32_t* occt_get_vec_i32_result() {{ return g_vec_i32_buf.data(); }}"
    );
    let _ = writeln!(
        buf,
        "uint32_t occt_get_vec_i32_result_len() {{ return static_cast<uint32_t>(g_vec_i32_buf.size()); }}"
    );
    let _ = writeln!(buf);

    // BBox accessors
    let _ = writeln!(buf, "// BBox result");
    for field in &["xmin", "ymin", "zmin", "xmax", "ymax", "zmax"] {
        let _ = writeln!(
            buf,
            "double occt_get_bbox_{field}() {{ return g_bbox_buf.{field}; }}"
        );
    }
    let _ = writeln!(buf);

    // Mesh result accessors
    let _ = writeln!(buf, "// Mesh result");
    let _ = writeln!(
        buf,
        "const float* occt_get_mesh_positions() {{ return g_mesh_buf.positions; }}"
    );
    let _ = writeln!(
        buf,
        "int32_t occt_get_mesh_positions_len() {{ return g_mesh_buf.positionCount; }}"
    );
    let _ = writeln!(
        buf,
        "const float* occt_get_mesh_normals() {{ return g_mesh_buf.normals; }}"
    );
    let _ = writeln!(
        buf,
        "int32_t occt_get_mesh_normals_len() {{ return g_mesh_buf.normalCount; }}"
    );
    let _ = writeln!(
        buf,
        "const uint32_t* occt_get_mesh_indices() {{ return g_mesh_buf.indices; }}"
    );
    let _ = writeln!(
        buf,
        "int32_t occt_get_mesh_indices_len() {{ return g_mesh_buf.indexCount; }}"
    );
    let _ = writeln!(
        buf,
        "const int32_t* occt_get_mesh_face_groups() {{ return g_mesh_buf.faceGroups; }}"
    );
    let _ = writeln!(
        buf,
        "int32_t occt_get_mesh_face_groups_len() {{ return g_mesh_buf.faceGroupCount; }}"
    );
    let _ = writeln!(buf);

    // MeshBatch result accessors
    let _ = writeln!(buf, "// MeshBatch result");
    let _ = writeln!(
        buf,
        "const float* occt_get_mesh_batch_positions() {{ return g_mesh_batch_buf.positions; }}"
    );
    let _ = writeln!(
        buf,
        "int32_t occt_get_mesh_batch_positions_len() {{ return g_mesh_batch_buf.positionCount; }}"
    );
    let _ = writeln!(
        buf,
        "const float* occt_get_mesh_batch_normals() {{ return g_mesh_batch_buf.normals; }}"
    );
    let _ = writeln!(
        buf,
        "int32_t occt_get_mesh_batch_normals_len() {{ return g_mesh_batch_buf.normalCount; }}"
    );
    let _ = writeln!(
        buf,
        "const uint32_t* occt_get_mesh_batch_indices() {{ return g_mesh_batch_buf.indices; }}"
    );
    let _ = writeln!(
        buf,
        "int32_t occt_get_mesh_batch_indices_len() {{ return g_mesh_batch_buf.indexCount; }}"
    );
    let _ = writeln!(
        buf,
        "const int32_t* occt_get_mesh_batch_shape_offsets() {{ return g_mesh_batch_buf.shapeOffsets; }}"
    );
    let _ = writeln!(
        buf,
        "int32_t occt_get_mesh_batch_shape_count() {{ return g_mesh_batch_buf.shapeCount; }}"
    );
    let _ = writeln!(buf);

    // Edge result accessors
    let _ = writeln!(buf, "// Edge result");
    let _ = writeln!(
        buf,
        "const float* occt_get_edge_points() {{ return g_edge_buf.points; }}"
    );
    let _ = writeln!(
        buf,
        "int32_t occt_get_edge_points_len() {{ return g_edge_buf.pointCount; }}"
    );
    let _ = writeln!(
        buf,
        "const int32_t* occt_get_edge_groups() {{ return g_edge_buf.edgeGroups; }}"
    );
    let _ = writeln!(
        buf,
        "int32_t occt_get_edge_groups_len() {{ return g_edge_buf.edgeGroupCount; }}"
    );
    let _ = writeln!(buf);

    // NURBS result accessors
    let _ = writeln!(buf, "// NURBS result");
    let _ = writeln!(
        buf,
        "int32_t occt_get_nurbs_degree() {{ return g_nurbs_buf.degree; }}"
    );
    let _ = writeln!(
        buf,
        "int32_t occt_get_nurbs_rational() {{ return g_nurbs_buf.rational ? 1 : 0; }}"
    );
    let _ = writeln!(
        buf,
        "int32_t occt_get_nurbs_periodic() {{ return g_nurbs_buf.periodic ? 1 : 0; }}"
    );
    let _ = writeln!(
        buf,
        "const double* occt_get_nurbs_knots() {{ return g_nurbs_buf.knots.data(); }}"
    );
    let _ = writeln!(
        buf,
        "uint32_t occt_get_nurbs_knots_len() {{ return static_cast<uint32_t>(g_nurbs_buf.knots.size()); }}"
    );
    let _ = writeln!(
        buf,
        "const int32_t* occt_get_nurbs_multiplicities() {{ return reinterpret_cast<const int32_t*>(g_nurbs_buf.multiplicities.data()); }}"
    );
    let _ = writeln!(
        buf,
        "uint32_t occt_get_nurbs_multiplicities_len() {{ return static_cast<uint32_t>(g_nurbs_buf.multiplicities.size()); }}"
    );
    let _ = writeln!(
        buf,
        "const double* occt_get_nurbs_poles() {{ return g_nurbs_buf.poles.data(); }}"
    );
    let _ = writeln!(
        buf,
        "uint32_t occt_get_nurbs_poles_len() {{ return static_cast<uint32_t>(g_nurbs_buf.poles.size()); }}"
    );
    let _ = writeln!(
        buf,
        "const double* occt_get_nurbs_weights() {{ return g_nurbs_buf.weights.data(); }}"
    );
    let _ = writeln!(
        buf,
        "uint32_t occt_get_nurbs_weights_len() {{ return static_cast<uint32_t>(g_nurbs_buf.weights.size()); }}"
    );
    let _ = writeln!(buf);

    // Evolution result accessors
    let _ = writeln!(buf, "// Evolution result");
    let _ = writeln!(
        buf,
        "uint32_t occt_get_evo_result_id() {{ return g_evo_buf.resultId; }}"
    );
    let _ = writeln!(
        buf,
        "const int32_t* occt_get_evo_modified() {{ return reinterpret_cast<const int32_t*>(g_evo_buf.modified.data()); }}"
    );
    let _ = writeln!(
        buf,
        "uint32_t occt_get_evo_modified_len() {{ return static_cast<uint32_t>(g_evo_buf.modified.size()); }}"
    );
    let _ = writeln!(
        buf,
        "const int32_t* occt_get_evo_generated() {{ return reinterpret_cast<const int32_t*>(g_evo_buf.generated.data()); }}"
    );
    let _ = writeln!(
        buf,
        "uint32_t occt_get_evo_generated_len() {{ return static_cast<uint32_t>(g_evo_buf.generated.size()); }}"
    );
    let _ = writeln!(
        buf,
        "const int32_t* occt_get_evo_deleted() {{ return reinterpret_cast<const int32_t*>(g_evo_buf.deleted.data()); }}"
    );
    let _ = writeln!(
        buf,
        "uint32_t occt_get_evo_deleted_len() {{ return static_cast<uint32_t>(g_evo_buf.deleted.size()); }}"
    );
    let _ = writeln!(buf);

    // Projection result accessors
    let _ = writeln!(buf, "// Projection result");
    for field in &[
        "visibleOutline",
        "visibleSmooth",
        "visibleSharp",
        "hiddenOutline",
        "hiddenSmooth",
        "hiddenSharp",
    ] {
        let snake = camel_to_snake(field);
        let _ = writeln!(
            buf,
            "uint32_t occt_get_proj_{snake}() {{ return g_proj_buf.{field}; }}"
        );
    }
    let _ = writeln!(buf);

    // XCAF label info accessors
    let _ = writeln!(buf, "// XCAF label info result");
    let _ = writeln!(
        buf,
        "int32_t occt_get_label_info_label_id() {{ return g_label_info_buf.labelId; }}"
    );
    let _ = writeln!(
        buf,
        "const char* occt_get_label_info_name() {{ return g_label_info_buf.name.c_str(); }}"
    );
    let _ = writeln!(
        buf,
        "uint32_t occt_get_label_info_name_len() {{ return static_cast<uint32_t>(g_label_info_buf.name.size()); }}"
    );
    let _ = writeln!(
        buf,
        "int32_t occt_get_label_info_has_color() {{ return g_label_info_buf.hasColor ? 1 : 0; }}"
    );
    let _ = writeln!(
        buf,
        "double occt_get_label_info_r() {{ return g_label_info_buf.r; }}"
    );
    let _ = writeln!(
        buf,
        "double occt_get_label_info_g() {{ return g_label_info_buf.g; }}"
    );
    let _ = writeln!(
        buf,
        "double occt_get_label_info_b() {{ return g_label_info_buf.b; }}"
    );
    let _ = writeln!(
        buf,
        "int32_t occt_get_label_info_is_assembly() {{ return g_label_info_buf.isAssembly ? 1 : 0; }}"
    );
    let _ = writeln!(
        buf,
        "int32_t occt_get_label_info_is_component() {{ return g_label_info_buf.isComponent ? 1 : 0; }}"
    );
    let _ = writeln!(
        buf,
        "uint32_t occt_get_label_info_shape_id() {{ return g_label_info_buf.shapeId; }}"
    );
    let _ = writeln!(buf);

    // Generated method wrappers
    let _ = writeln!(buf, "// === Kernel methods ===");
    let _ = writeln!(buf);

    for spec in methods {
        if matches!(spec.kind, MethodKind::Skip) {
            continue;
        }
        emit_wasi_method(&mut buf, spec);
        let _ = writeln!(buf);
    }

    // Close extern "C"
    let _ = writeln!(buf, "}} // extern \"C\"");

    buf.trim_end().to_owned() + "\n"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn camel_to_snake_basic() {
        assert_eq!(camel_to_snake("makeBox"), "make_box");
        assert_eq!(camel_to_snake("getBoundingBox"), "get_bounding_box");
        assert_eq!(camel_to_snake("fuse"), "fuse");
        assert_eq!(camel_to_snake("importStep"), "import_step");
        assert_eq!(camel_to_snake("getShapeType"), "get_shape_type");
        assert_eq!(camel_to_snake("xcafNewDocument"), "xcaf_new_document");
        assert_eq!(camel_to_snake("releaseAll"), "release_all");
        assert_eq!(camel_to_snake("fuseAll"), "fuse_all");
        assert_eq!(camel_to_snake("toBREP"), "to_brep");
        assert_eq!(camel_to_snake("fromBREP"), "from_brep");
        assert_eq!(camel_to_snake("xcafExportGLTF"), "xcaf_export_gltf");
    }

    #[test]
    fn emits_lifecycle_functions() {
        let output = emit_wasi_exports(&[]);
        assert!(output.contains("int32_t occt_init()"));
        assert!(output.contains("void occt_destroy()"));
        assert!(output.contains("int32_t occt_has_error()"));
        assert!(output.contains("void* occt_alloc(uint32_t size)"));
    }

    #[test]
    fn emits_simple_shape_method() {
        use super::super::types::{FacadeParam, MethodKind, MethodSpec, ReturnType};

        static MAKE_BOX: MethodSpec = MethodSpec {
            name: "makeBox",
            kind: MethodKind::SimpleShape,
            params: &[
                FacadeParam::Double("dx"),
                FacadeParam::Double("dy"),
                FacadeParam::Double("dz"),
            ],
            return_type: ReturnType::ShapeId,
            occt_class: "BRepPrimAPI_MakeBox",
            ctor_args: "dx, dy, dz",
            setup_code: "",
            includes: &[],
            category: "primitives",
        };

        let output = emit_wasi_exports(&[&MAKE_BOX]);
        assert!(output.contains("uint32_t occt_make_box(double dx, double dy, double dz)"));
        assert!(output.contains("g_kernel->makeBox(dx, dy, dz)"));
        assert!(
            output.contains("return 0;"),
            "error sentinel for ShapeId should be 0"
        );
    }

    #[test]
    fn emits_string_param_method() {
        use super::super::types::{FacadeParam, MethodKind, MethodSpec, ReturnType};

        static IMPORT_STEP: MethodSpec = MethodSpec {
            name: "importStep",
            kind: MethodKind::CustomBody,
            params: &[FacadeParam::String("data")],
            return_type: ReturnType::ShapeId,
            occt_class: "",
            ctor_args: "",
            setup_code: "return store(importStepImpl(data));",
            includes: &[],
            category: "io",
        };

        let output = emit_wasi_exports(&[&IMPORT_STEP]);
        assert!(output.contains("occt_import_step(const char* data_ptr, uint32_t data_len)"));
        assert!(output.contains("std::string(data_ptr, data_len)"));
    }

    #[test]
    fn emits_vector_param_method() {
        use super::super::types::{FacadeParam, MethodKind, MethodSpec, ReturnType};

        static FUSE_ALL: MethodSpec = MethodSpec {
            name: "fuseAll",
            kind: MethodKind::CustomBody,
            params: &[FacadeParam::VectorShapeIds("shapeIds")],
            return_type: ReturnType::ShapeId,
            occt_class: "",
            ctor_args: "",
            setup_code: "// body",
            includes: &[],
            category: "booleans",
        };

        let output = emit_wasi_exports(&[&FUSE_ALL]);
        assert!(
            output.contains("occt_fuse_all(const uint32_t* shapeIds_ptr, uint32_t shapeIds_len)")
        );
        assert!(
            output.contains("std::vector<uint32_t>(shapeIds_ptr, shapeIds_ptr + shapeIds_len)")
        );
    }

    #[test]
    fn emits_string_return_method() {
        use super::super::types::{FacadeParam, MethodKind, MethodSpec, ReturnType};

        static EXPORT_STEP: MethodSpec = MethodSpec {
            name: "exportStep",
            kind: MethodKind::CustomBody,
            params: &[FacadeParam::ShapeId("id")],
            return_type: ReturnType::String,
            occt_class: "",
            ctor_args: "",
            setup_code: "return exportStepImpl(get(id));",
            includes: &[],
            category: "io",
        };

        let output = emit_wasi_exports(&[&EXPORT_STEP]);
        assert!(output.contains("int32_t occt_export_step(uint32_t id)"));
        assert!(output.contains("g_string_buf = g_kernel->exportStep(id)"));
        assert!(output.contains("g_string_buf.size()"));
    }
}
