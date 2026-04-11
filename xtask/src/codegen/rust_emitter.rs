//! Rust host API emitter for the facade code generator.
//!
//! Generates `kernel_generated.rs` — the Rust wrapper methods that call
//! into the WASM module via wasmtime. Each `MethodSpec` produces one
//! `pub fn method_name(&mut self, ...) -> OcctResult<T>` method on `OcctKernel`.

use std::fmt::Write as _;

use super::types::{FacadeParam, MethodKind, MethodSpec, ReturnType};
use super::wasi_emitter::camel_to_snake;

/// Convert a `FacadeParam` to a Rust function parameter declaration.
fn param_to_rust(param: &FacadeParam) -> String {
    match param {
        FacadeParam::ShapeId(name) => format!("{}: ShapeHandle", rust_param_name(name)),
        FacadeParam::Double(name) => format!("{}: f64", rust_param_name(name)),
        FacadeParam::Bool(name) => format!("{}: bool", rust_param_name(name)),
        FacadeParam::Int(name) => format!("{}: i32", rust_param_name(name)),
        FacadeParam::String(name) => format!("{}: &str", rust_param_name(name)),
        FacadeParam::VectorShapeIds(name) => format!("{}: &[ShapeHandle]", rust_param_name(name)),
        FacadeParam::VectorDouble(name) => format!("{}: &[f64]", rust_param_name(name)),
        FacadeParam::VectorInt(name) => format!("{}: &[i32]", rust_param_name(name)),
    }
}

/// Convert a `camelCase` param name to `snake_case` for Rust.
fn rust_param_name(name: &str) -> String {
    camel_to_snake(name)
}

/// Build the Rust parameter list for a method.
fn rust_param_list(params: &[FacadeParam]) -> String {
    if params.is_empty() {
        return String::new();
    }
    params
        .iter()
        .map(param_to_rust)
        .collect::<Vec<_>>()
        .join(", ")
}

/// The Rust return type for a given `ReturnType`.
const fn rust_return_type(rt: ReturnType) -> &'static str {
    match rt {
        ReturnType::ShapeId => "OcctResult<ShapeHandle>",
        ReturnType::Uint32 => "OcctResult<u32>",
        ReturnType::Bool => "OcctResult<bool>",
        ReturnType::Void => "OcctResult<()>",
        ReturnType::Double => "OcctResult<f64>",
        ReturnType::Int => "OcctResult<i32>",
        ReturnType::String => "OcctResult<String>",
        ReturnType::VectorUint32 => "OcctResult<Vec<u32>>",
        ReturnType::VectorDouble => "OcctResult<Vec<f64>>",
        ReturnType::VectorInt => "OcctResult<Vec<i32>>",
        ReturnType::BBoxData => "OcctResult<BoundingBox>",
        ReturnType::MeshData => "OcctResult<Mesh>",
        ReturnType::MeshBatchData => "OcctResult<MeshBatch>",
        ReturnType::EdgeData => "OcctResult<EdgeData>",
        ReturnType::NurbsCurveData => "OcctResult<NurbsCurveData>",
        ReturnType::EvolutionData => "OcctResult<EvolutionData>",
        ReturnType::ProjectionData => "OcctResult<ProjectionData>",
        ReturnType::XCAFLabelInfo => "OcctResult<LabelInfo>",
    }
}

/// Collect the names of heap-allocated parameters (those that need `write_bytes`).
fn heap_param_names(params: &[FacadeParam]) -> Vec<String> {
    params
        .iter()
        .filter_map(|p| match p {
            FacadeParam::String(name)
            | FacadeParam::VectorShapeIds(name)
            | FacadeParam::VectorDouble(name)
            | FacadeParam::VectorInt(name) => Some(rust_param_name(name)),
            _ => None,
        })
        .collect()
}

/// Generate the WASM call arguments for a method.
///
/// This generates the code to prepare and pass arguments to the WASM function.
/// When a method has multiple heap-allocated params, each allocation is guarded:
/// if a later `write_bytes` fails, previously allocated buffers are freed before
/// propagating the error.
fn emit_wasm_call_setup(buf: &mut String, params: &[FacadeParam]) {
    // Track which allocations have been completed so far (for cleanup-on-error).
    let mut allocated_so_far: Vec<String> = Vec::new();

    for param in params {
        match param {
            FacadeParam::String(name) => {
                let rname = rust_param_name(name);
                // Use match instead of ? to clean up prior allocations on error
                if allocated_so_far.is_empty() {
                    let _ = writeln!(
                        buf,
                        "        let {rname}_ptr = self.write_bytes({rname}.as_bytes())?;"
                    );
                } else {
                    emit_guarded_write_bytes(
                        buf,
                        &rname,
                        &format!("{rname}.as_bytes()"),
                        &allocated_so_far,
                    );
                }
                let _ = writeln!(buf, "        let {rname}_len = {rname}.len() as u32;");
                allocated_so_far.push(rname);
            }
            FacadeParam::VectorShapeIds(name) => {
                let rname = rust_param_name(name);
                let _ = writeln!(
                    buf,
                    "        let {rname}_bytes: Vec<u8> = {rname}.iter().flat_map(|h| h.0.to_le_bytes()).collect();"
                );
                if allocated_so_far.is_empty() {
                    let _ = writeln!(
                        buf,
                        "        let {rname}_ptr = self.write_bytes(&{rname}_bytes)?;"
                    );
                } else {
                    emit_guarded_write_bytes(
                        buf,
                        &rname,
                        &format!("&{rname}_bytes"),
                        &allocated_so_far,
                    );
                }
                let _ = writeln!(buf, "        let {rname}_len = {rname}.len() as u32;");
                allocated_so_far.push(rname);
            }
            FacadeParam::VectorDouble(name) | FacadeParam::VectorInt(name) => {
                let rname = rust_param_name(name);
                let _ = writeln!(
                    buf,
                    "        let {rname}_bytes: Vec<u8> = {rname}.iter().flat_map(|v| v.to_le_bytes()).collect();"
                );
                if allocated_so_far.is_empty() {
                    let _ = writeln!(
                        buf,
                        "        let {rname}_ptr = self.write_bytes(&{rname}_bytes)?;"
                    );
                } else {
                    emit_guarded_write_bytes(
                        buf,
                        &rname,
                        &format!("&{rname}_bytes"),
                        &allocated_so_far,
                    );
                }
                let _ = writeln!(buf, "        let {rname}_len = {rname}.len() as u32;");
                allocated_so_far.push(rname);
            }
            _ => {} // scalar types don't need setup
        }
    }
}

/// Emit a `write_bytes` call that cleans up previously allocated buffers on error.
fn emit_guarded_write_bytes(
    buf: &mut String,
    rname: &str,
    data_expr: &str,
    prior_allocs: &[String],
) {
    let _ = writeln!(
        buf,
        "        let {rname}_ptr = match self.write_bytes({data_expr}) {{"
    );
    let _ = writeln!(buf, "            Ok(ptr) => ptr,");
    let _ = writeln!(buf, "            Err(e) => {{");
    for prior in prior_allocs {
        let _ = writeln!(buf, "                let _ = self.free_bytes({prior}_ptr);");
    }
    let _ = writeln!(buf, "                return Err(e);");
    let _ = writeln!(buf, "            }}");
    let _ = writeln!(buf, "        }};");
}

/// Generate the WASM call expression arguments.
fn emit_wasm_call_args(params: &[FacadeParam]) -> String {
    if params.is_empty() {
        return String::new();
    }
    let args: Vec<String> = params
        .iter()
        .flat_map(|p| match p {
            FacadeParam::ShapeId(name) => vec![format!("{}.0", rust_param_name(name))],
            FacadeParam::Double(name) | FacadeParam::Int(name) => {
                vec![rust_param_name(name)]
            }
            FacadeParam::Bool(name) => vec![format!("i32::from({})", rust_param_name(name))],
            FacadeParam::String(name)
            | FacadeParam::VectorShapeIds(name)
            | FacadeParam::VectorDouble(name)
            | FacadeParam::VectorInt(name) => {
                let rname = rust_param_name(name);
                vec![format!("{rname}_ptr as i32"), format!("{rname}_len as i32")]
            }
        })
        .collect();
    args.join(", ")
}

/// Generate the cleanup code for allocated memory.
fn emit_wasm_call_cleanup(buf: &mut String, params: &[FacadeParam]) {
    for param in params {
        match param {
            FacadeParam::String(name)
            | FacadeParam::VectorShapeIds(name)
            | FacadeParam::VectorDouble(name)
            | FacadeParam::VectorInt(name) => {
                let rname = rust_param_name(name);
                let _ = writeln!(buf, "        self.free_bytes({rname}_ptr)?;");
            }
            _ => {}
        }
    }
}

/// Count the number of WASM-level parameters (strings/vectors expand to 2).
fn wasm_param_count(params: &[FacadeParam]) -> usize {
    params
        .iter()
        .map(|p| match p {
            FacadeParam::String(_)
            | FacadeParam::VectorShapeIds(_)
            | FacadeParam::VectorDouble(_)
            | FacadeParam::VectorInt(_) => 2,
            _ => 1,
        })
        .sum()
}

/// Generate the wasmtime `TypedFunc` type for a method's parameters.
fn wasm_typed_func_type(spec: &MethodSpec) -> String {
    let param_count = wasm_param_count(spec.params);

    // Build param types tuple
    let param_types: Vec<&str> = spec
        .params
        .iter()
        .flat_map(|p| match p {
            FacadeParam::ShapeId(_) => vec!["u32"],
            FacadeParam::Double(_) => vec!["f64"],
            FacadeParam::Bool(_) | FacadeParam::Int(_) => vec!["i32"],
            FacadeParam::String(_)
            | FacadeParam::VectorShapeIds(_)
            | FacadeParam::VectorDouble(_)
            | FacadeParam::VectorInt(_) => vec!["i32", "i32"],
        })
        .collect();

    let ret_type = match spec.return_type {
        ReturnType::ShapeId | ReturnType::Uint32 => "u32",
        ReturnType::Double => "f64",
        _ => "i32",
    };

    if param_count == 0 {
        format!("TypedFunc<(), {ret_type}>")
    } else if param_count == 1 {
        format!("TypedFunc<({},), {ret_type}>", param_types[0])
    } else {
        format!("TypedFunc<({}), {ret_type}>", param_types.join(", "))
    }
}

/// Emit a single method implementation.
#[allow(clippy::too_many_lines)]
fn emit_rust_method(buf: &mut String, spec: &MethodSpec) {
    let snake_name = camel_to_snake(spec.name);
    let rust_ret = rust_return_type(spec.return_type);
    let rust_params = rust_param_list(spec.params);

    let params_str = if rust_params.is_empty() {
        String::from("&mut self")
    } else {
        format!("&mut self, {rust_params}")
    };

    let _ = writeln!(
        buf,
        "    pub fn {snake_name}({params_str}) -> {rust_ret} {{"
    );

    // Setup: write complex params to WASM memory
    emit_wasm_call_setup(buf, spec.params);

    // Build the call arguments
    let call_args = emit_wasm_call_args(spec.params);
    let call_tuple = if wasm_param_count(spec.params) == 0 {
        "()".to_owned()
    } else if wasm_param_count(spec.params) == 1 {
        format!("({call_args},)")
    } else {
        format!("({call_args})")
    };

    let fn_field = format!("generated.fn_{snake_name}");
    let has_heap_params = !heap_param_names(spec.params).is_empty();

    // For methods with heap-allocated params, capture the call result without `?`
    // so we can always run cleanup before propagating errors.
    let call_suffix = if has_heap_params { "" } else { "?" };

    // Call + result handling based on return type
    match spec.return_type {
        ReturnType::ShapeId => {
            let _ = writeln!(
                buf,
                "        let result = self.{fn_field}.call(&mut self.store, {call_tuple}){call_suffix};"
            );
            if has_heap_params {
                emit_wasm_call_cleanup(buf, spec.params);
                let _ = writeln!(buf, "        let result = result?;");
            }
            let _ = writeln!(buf, "        self.check_error(\"{snake_name}\")?;");
            let _ = writeln!(buf, "        if result == 0 {{");
            let _ = writeln!(
                buf,
                "            return Err(self.read_last_error(\"{snake_name}\"));"
            );
            let _ = writeln!(buf, "        }}");
            let _ = writeln!(buf, "        Ok(ShapeHandle(result))");
        }
        ReturnType::Uint32 | ReturnType::Double | ReturnType::Int => {
            let _ = writeln!(
                buf,
                "        let result = self.{fn_field}.call(&mut self.store, {call_tuple}){call_suffix};"
            );
            if has_heap_params {
                emit_wasm_call_cleanup(buf, spec.params);
                let _ = writeln!(buf, "        let result = result?;");
            }
            let _ = writeln!(buf, "        self.check_error(\"{snake_name}\")?;");
            let _ = writeln!(buf, "        Ok(result)");
        }
        ReturnType::Bool => {
            let _ = writeln!(
                buf,
                "        let result = self.{fn_field}.call(&mut self.store, {call_tuple}){call_suffix};"
            );
            if has_heap_params {
                emit_wasm_call_cleanup(buf, spec.params);
                let _ = writeln!(buf, "        let result = result?;");
            }
            let _ = writeln!(buf, "        if result < 0 {{");
            let _ = writeln!(
                buf,
                "            return Err(self.read_last_error(\"{snake_name}\"));"
            );
            let _ = writeln!(buf, "        }}");
            let _ = writeln!(buf, "        Ok(result != 0)");
        }
        ReturnType::Void => {
            let _ = writeln!(
                buf,
                "        let result = self.{fn_field}.call(&mut self.store, {call_tuple}){call_suffix};"
            );
            if has_heap_params {
                emit_wasm_call_cleanup(buf, spec.params);
                let _ = writeln!(buf, "        let result = result?;");
            }
            let _ = writeln!(buf, "        if result < 0 {{");
            let _ = writeln!(
                buf,
                "            return Err(self.read_last_error(\"{snake_name}\"));"
            );
            let _ = writeln!(buf, "        }}");
            let _ = writeln!(buf, "        Ok(())");
        }
        ReturnType::String => {
            let _ = writeln!(
                buf,
                "        let len = self.{fn_field}.call(&mut self.store, {call_tuple}){call_suffix};"
            );
            if has_heap_params {
                emit_wasm_call_cleanup(buf, spec.params);
                let _ = writeln!(buf, "        let len = len?;");
            }
            let _ = writeln!(buf, "        if len < 0 {{");
            let _ = writeln!(
                buf,
                "            return Err(self.read_last_error(\"{snake_name}\"));"
            );
            let _ = writeln!(buf, "        }}");
            let _ = writeln!(buf, "        self.read_string_result()");
        }
        ReturnType::VectorUint32 => {
            let _ = writeln!(
                buf,
                "        let len = self.{fn_field}.call(&mut self.store, {call_tuple}){call_suffix};"
            );
            if has_heap_params {
                emit_wasm_call_cleanup(buf, spec.params);
                let _ = writeln!(buf, "        let len = len?;");
            }
            let _ = writeln!(buf, "        if len < 0 {{");
            let _ = writeln!(
                buf,
                "            return Err(self.read_last_error(\"{snake_name}\"));"
            );
            let _ = writeln!(buf, "        }}");
            let _ = writeln!(buf, "        self.read_vec_u32_result()");
        }
        ReturnType::VectorDouble => {
            let _ = writeln!(
                buf,
                "        let len = self.{fn_field}.call(&mut self.store, {call_tuple}){call_suffix};"
            );
            if has_heap_params {
                emit_wasm_call_cleanup(buf, spec.params);
                let _ = writeln!(buf, "        let len = len?;");
            }
            let _ = writeln!(buf, "        if len < 0 {{");
            let _ = writeln!(
                buf,
                "            return Err(self.read_last_error(\"{snake_name}\"));"
            );
            let _ = writeln!(buf, "        }}");
            let _ = writeln!(buf, "        self.read_vec_f64_result()");
        }
        ReturnType::VectorInt => {
            let _ = writeln!(
                buf,
                "        let len = self.{fn_field}.call(&mut self.store, {call_tuple}){call_suffix};"
            );
            if has_heap_params {
                emit_wasm_call_cleanup(buf, spec.params);
                let _ = writeln!(buf, "        let len = len?;");
            }
            let _ = writeln!(buf, "        if len < 0 {{");
            let _ = writeln!(
                buf,
                "            return Err(self.read_last_error(\"{snake_name}\"));"
            );
            let _ = writeln!(buf, "        }}");
            let _ = writeln!(buf, "        self.read_vec_i32_result()");
        }
        ReturnType::BBoxData
        | ReturnType::MeshData
        | ReturnType::MeshBatchData
        | ReturnType::EdgeData
        | ReturnType::NurbsCurveData
        | ReturnType::EvolutionData
        | ReturnType::ProjectionData
        | ReturnType::XCAFLabelInfo => {
            let reader = match spec.return_type {
                ReturnType::BBoxData => "self.read_bbox_result()",
                ReturnType::MeshData => "self.read_mesh_result()",
                ReturnType::MeshBatchData => "self.read_mesh_batch_result()",
                ReturnType::EdgeData => "self.read_edge_result()",
                ReturnType::NurbsCurveData => "self.read_nurbs_result()",
                ReturnType::EvolutionData => "self.read_evolution_result()",
                ReturnType::ProjectionData => "self.read_projection_result()",
                ReturnType::XCAFLabelInfo => "self.read_label_info_result()",
                _ => unreachable!(),
            };
            let _ = writeln!(
                buf,
                "        let status = self.{fn_field}.call(&mut self.store, {call_tuple}){call_suffix};"
            );
            if has_heap_params {
                emit_wasm_call_cleanup(buf, spec.params);
                let _ = writeln!(buf, "        let status = status?;");
            }
            let _ = writeln!(buf, "        if status < 0 {{");
            let _ = writeln!(
                buf,
                "            return Err(self.read_last_error(\"{snake_name}\"));"
            );
            let _ = writeln!(buf, "        }}");
            let _ = writeln!(buf, "        {reader}");
        }
    }

    let _ = writeln!(buf, "    }}");
}

/// Generate the typed function field declarations for the struct.
fn emit_func_fields(buf: &mut String, methods: &[&MethodSpec]) {
    for spec in methods {
        if matches!(spec.kind, MethodKind::Skip) {
            continue;
        }
        let snake_name = camel_to_snake(spec.name);
        let func_type = wasm_typed_func_type(spec);
        let _ = writeln!(buf, "    fn_{snake_name}: {func_type},");
    }
}

/// Generate the function lookup code for initialization.
fn emit_func_lookups(buf: &mut String, methods: &[&MethodSpec]) {
    for spec in methods {
        if matches!(spec.kind, MethodKind::Skip) {
            continue;
        }
        let snake_name = camel_to_snake(spec.name);
        let _ = writeln!(
            buf,
            "            fn_{snake_name}: instance.get_typed_func(&mut store, \"occt_{snake_name}\")?,",
        );
    }
}

/// Generate the contents of `crate/src/kernel_generated.rs`.
///
/// This file contains:
/// 1. The function fields for the `OcctKernel` struct
/// 2. The `impl OcctKernel` block with all method wrappers
/// 3. The function lookup initialization code
#[allow(clippy::too_many_lines)]
pub fn emit_rust_host(methods: &[&MethodSpec]) -> String {
    let mut buf = String::with_capacity(32768);

    let _ = writeln!(
        buf,
        "// AUTO-GENERATED by cargo xtask codegen -- DO NOT EDIT"
    );
    let _ = writeln!(
        buf,
        "// Rust host API for occt-wasm WASI module via wasmtime"
    );
    let _ = writeln!(buf);
    let _ = writeln!(buf, "use wasmtime::TypedFunc;");
    let _ = writeln!(buf);
    let _ = writeln!(buf, "use crate::error::OcctResult;");
    let _ = writeln!(buf, "use crate::types::{{");
    let _ = writeln!(
        buf,
        "    BoundingBox, EdgeData, EvolutionData, LabelInfo, Mesh, MeshBatch,"
    );
    let _ = writeln!(buf, "    NurbsCurveData, ProjectionData, ShapeHandle,");
    let _ = writeln!(buf, "}};");
    let _ = writeln!(buf);

    // Struct fields section (to be included in the kernel struct)
    let _ = writeln!(buf, "/// Cached WASM function handles for kernel methods.");
    let _ = writeln!(buf, "///");
    let _ = writeln!(
        buf,
        "/// Include this in the `OcctKernel` struct definition:"
    );
    let _ = writeln!(buf, "/// ```ignore");
    let _ = writeln!(buf, "/// pub struct OcctKernel {{");
    let _ = writeln!(buf, "///     // ... core fields ...");
    let _ = writeln!(buf, "///     #[doc(hidden)]");
    let _ = writeln!(buf, "///     generated: GeneratedFuncs,");
    let _ = writeln!(buf, "/// }}");
    let _ = writeln!(buf, "/// ```");
    let _ = writeln!(
        buf,
        "#[allow(clippy::type_complexity, clippy::redundant_pub_crate, clippy::struct_field_names)]"
    );
    let _ = writeln!(buf, "pub(crate) struct GeneratedFuncs {{");
    emit_func_fields(&mut buf, methods);
    let _ = writeln!(buf, "}}");
    let _ = writeln!(buf);

    // Init function to resolve all typed funcs
    let _ = writeln!(buf, "impl GeneratedFuncs {{");
    let _ = writeln!(buf, "    #[allow(clippy::too_many_lines)]");
    let _ = writeln!(buf, "    pub(crate) fn resolve(");
    let _ = writeln!(buf, "        instance: &wasmtime::Instance,");
    let _ = writeln!(buf, "        mut store: &mut wasmtime::Store<()>,");
    let _ = writeln!(buf, "    ) -> OcctResult<Self> {{");
    let _ = writeln!(buf, "        Ok(Self {{");
    emit_func_lookups(&mut buf, methods);
    let _ = writeln!(buf, "        }})");
    let _ = writeln!(buf, "    }}");
    let _ = writeln!(buf, "}}");
    let _ = writeln!(buf);

    // Method implementations
    let _ = writeln!(buf, "/// Generated kernel methods.");
    let _ = writeln!(buf, "///");
    let _ = writeln!(
        buf,
        "/// All facade methods wrapped as safe Rust functions."
    );
    let _ = writeln!(buf, "#[allow(missing_docs, clippy::too_many_arguments)]");
    let _ = writeln!(buf, "impl crate::kernel::OcctKernel {{");

    let generable: Vec<&&MethodSpec> = methods
        .iter()
        .filter(|m| !matches!(m.kind, MethodKind::Skip))
        .collect();

    for (i, spec) in generable.iter().enumerate() {
        emit_rust_method(&mut buf, spec);
        if i + 1 < generable.len() {
            let _ = writeln!(buf);
        }
    }

    let _ = writeln!(buf, "}}");

    buf.trim_end().to_owned() + "\n"
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codegen::types::{FacadeParam, MethodKind, MethodSpec, ReturnType};

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

    static FUSE: MethodSpec = MethodSpec {
        name: "fuse",
        kind: MethodKind::BooleanOp,
        params: &[FacadeParam::ShapeId("a"), FacadeParam::ShapeId("b")],
        return_type: ReturnType::ShapeId,
        occt_class: "BRepAlgoAPI_Fuse",
        ctor_args: "get(a), get(b)",
        setup_code: "",
        includes: &[],
        category: "booleans",
    };

    #[test]
    fn generates_make_box_method() {
        let output = emit_rust_host(&[&MAKE_BOX]);
        assert!(output.contains(
            "pub fn make_box(&mut self, dx: f64, dy: f64, dz: f64) -> OcctResult<ShapeHandle>"
        ));
        assert!(output.contains("fn_make_box"));
        assert!(output.contains("ShapeHandle(result)"));
    }

    #[test]
    fn generates_fuse_method() {
        let output = emit_rust_host(&[&FUSE]);
        assert!(output.contains(
            "pub fn fuse(&mut self, a: ShapeHandle, b: ShapeHandle) -> OcctResult<ShapeHandle>"
        ));
        assert!(output.contains("a.0"));
        assert!(output.contains("b.0"));
    }

    #[test]
    fn generates_struct_fields() {
        let output = emit_rust_host(&[&MAKE_BOX, &FUSE]);
        assert!(output.contains("fn_make_box: TypedFunc<(f64, f64, f64), u32>"));
        assert!(output.contains("fn_fuse: TypedFunc<(u32, u32), u32>"));
    }

    #[test]
    fn generates_func_lookups() {
        let output = emit_rust_host(&[&MAKE_BOX]);
        assert!(output.contains("instance.get_typed_func(&mut store, \"occt_make_box\")"));
    }

    #[test]
    fn string_param_generates_write_bytes() {
        static IMPORT: MethodSpec = MethodSpec {
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
        let output = emit_rust_host(&[&IMPORT]);
        assert!(output.contains("data: &str"));
        assert!(output.contains("self.write_bytes(data.as_bytes())"));
        assert!(output.contains("self.free_bytes(data_ptr)"));
    }

    #[test]
    fn bool_return_method() {
        static IS_VALID: MethodSpec = MethodSpec {
            name: "isValid",
            kind: MethodKind::CustomBody,
            params: &[FacadeParam::ShapeId("id")],
            return_type: ReturnType::Bool,
            occt_class: "",
            ctor_args: "",
            setup_code: "BRepCheck_Analyzer checker(get(id));\nreturn checker.IsValid();",
            includes: &["BRepCheck_Analyzer.hxx"],
            category: "healing",
        };
        let output = emit_rust_host(&[&IS_VALID]);
        assert!(output.contains("pub fn is_valid(&mut self, id: ShapeHandle) -> OcctResult<bool>"));
        assert!(output.contains("Ok(result != 0)"));
    }
}
