//! C++ code emitter for the facade code generator.
//!
//! Emits `kernel.cpp` (method implementations) and `bindings.cpp` (Embind
//! reference) from a slice of [`MethodSpec`] descriptors.

use std::collections::BTreeSet;
use std::fmt::Write as _;

use super::types::{FacadeParam, MethodKind, MethodSpec, ReturnType};

/// Format a [`FacadeParam`] as a C++ formal parameter declaration.
fn param_to_cpp(param: &FacadeParam) -> String {
    match param {
        FacadeParam::ShapeId(name) => format!("uint32_t {name}"),
        FacadeParam::Double(name) => format!("double {name}"),
        FacadeParam::VectorShapeIds(name) => format!("std::vector<uint32_t> {name}"),
        FacadeParam::Bool(name) => format!("bool {name}"),
        FacadeParam::Int(name) => format!("int {name}"),
        FacadeParam::String(name) => format!("const std::string& {name}"),
        FacadeParam::VectorDouble(name) => format!("std::vector<double> {name}"),
    }
}

/// Build the C++ parameter list string for a method signature.
fn param_list(params: &[FacadeParam]) -> String {
    params
        .iter()
        .map(param_to_cpp)
        .collect::<Vec<_>>()
        .join(", ")
}

/// Emit a `SimpleShape` method body.
fn emit_simple_shape(buf: &mut String, spec: &MethodSpec) {
    let name = spec.name;
    let cls = spec.occt_class;
    let args = spec.ctor_args;

    let _ = writeln!(
        buf,
        "uint32_t OcctKernel::{name}({params}) {{",
        params = param_list(spec.params)
    );
    let _ = writeln!(buf, "    try {{");
    let _ = writeln!(buf, "        {cls} maker({args});");
    let _ = writeln!(buf, "        maker.Build();");
    let _ = writeln!(buf, "        if (!maker.IsDone()) {{");
    let _ = writeln!(
        buf,
        "            throw std::runtime_error(\"{name}: construction failed\");"
    );
    let _ = writeln!(buf, "        }}");
    let _ = writeln!(buf, "        return store(maker.Shape());");
    let _ = writeln!(buf, "    }} catch (const Standard_Failure& e) {{");
    let _ = writeln!(
        buf,
        "        throw std::runtime_error(std::string(\"{name}: \") + e.what());"
    );
    let _ = writeln!(buf, "    }}");
    let _ = writeln!(buf, "}}");
}

/// Emit a `BooleanOp` method body.
///
/// The `ctor_args` field in the spec already contains the full expression
/// (e.g. `"get(a), get(b)"`), so we pass it directly to the OCCT constructor.
fn emit_boolean_op(buf: &mut String, spec: &MethodSpec) {
    let name = spec.name;
    let cls = spec.occt_class;
    let args = spec.ctor_args;

    let _ = writeln!(
        buf,
        "uint32_t OcctKernel::{name}({params}) {{",
        params = param_list(spec.params)
    );
    let _ = writeln!(buf, "    try {{");
    let _ = writeln!(buf, "        {cls} op({args});");
    let _ = writeln!(buf, "        op.Build();");
    let _ = writeln!(buf, "        if (!op.IsDone() || op.HasErrors()) {{");
    let _ = writeln!(
        buf,
        "            throw std::runtime_error(\"{name}: boolean operation failed\");"
    );
    let _ = writeln!(buf, "        }}");
    let _ = writeln!(buf, "        return store(op.Shape());");
    let _ = writeln!(buf, "    }} catch (const Standard_Failure& e) {{");
    let _ = writeln!(
        buf,
        "        throw std::runtime_error(std::string(\"{name}: \") + e.what());"
    );
    let _ = writeln!(buf, "    }}");
    let _ = writeln!(buf, "}}");
}

/// Emit a `FilletLike` method body.
///
/// Expects params in order: `ShapeId` (solid), `VectorShapeIds` (edges/faces),
/// then one or more scalar params (radius, distance, etc.).
fn emit_fillet_like(buf: &mut String, spec: &MethodSpec) {
    let name = spec.name;
    let cls = spec.occt_class;
    let args = spec.ctor_args;

    let _ = writeln!(
        buf,
        "uint32_t OcctKernel::{name}({params}) {{",
        params = param_list(spec.params)
    );
    let _ = writeln!(buf, "    try {{");
    let _ = writeln!(buf, "        {cls} maker({args});");

    // Find the vector param and the scalar param(s) for the Add() call.
    let vec_param = spec.params.iter().find_map(|p| {
        if let FacadeParam::VectorShapeIds(n) = p {
            Some(*n)
        } else {
            None
        }
    });
    let scalar_params: Vec<&str> = spec
        .params
        .iter()
        .filter_map(|p| match p {
            FacadeParam::Double(n) | FacadeParam::Int(n) => Some(*n),
            _ => None,
        })
        .collect();

    if let Some(vec_name) = vec_param {
        let scalar_args = scalar_params.join(", ");
        let _ = writeln!(buf, "        for (uint32_t eid : {vec_name}) {{");
        let _ = writeln!(
            buf,
            "            maker.Add({scalar_args}, TopoDS::Edge(get(eid)));"
        );
        let _ = writeln!(buf, "        }}");
    }

    let _ = writeln!(buf, "        maker.Build();");
    let _ = writeln!(buf, "        if (!maker.IsDone()) {{");
    let _ = writeln!(
        buf,
        "            throw std::runtime_error(\"{name}: operation failed\");"
    );
    let _ = writeln!(buf, "        }}");
    let _ = writeln!(buf, "        return store(maker.Shape());");
    let _ = writeln!(buf, "    }} catch (const Standard_Failure& e) {{");
    let _ = writeln!(
        buf,
        "        throw std::runtime_error(std::string(\"{name}: \") + e.what());"
    );
    let _ = writeln!(buf, "    }}");
    let _ = writeln!(buf, "}}");
}

/// Emit a `SetupShape` method body.
///
/// Emits `setup_code` verbatim, then constructs the OCCT class with `ctor_args`,
/// and stores the result. No `Build()`/`IsDone()` check.
fn emit_setup_shape(buf: &mut String, spec: &MethodSpec) {
    let name = spec.name;
    let cls = spec.occt_class;
    let args = spec.ctor_args;

    let _ = writeln!(
        buf,
        "uint32_t OcctKernel::{name}({params}) {{",
        params = param_list(spec.params)
    );
    let _ = writeln!(buf, "    try {{");

    // Emit setup code lines with proper indentation.
    if !spec.setup_code.is_empty() {
        for line in spec.setup_code.lines() {
            let _ = writeln!(buf, "        {line}");
        }
    }

    let _ = writeln!(buf, "        {cls} maker({args});");
    let _ = writeln!(buf, "        return store(maker.Shape());");
    let _ = writeln!(buf, "    }} catch (const Standard_Failure& e) {{");
    let _ = writeln!(
        buf,
        "        throw std::runtime_error(std::string(\"{name}: \") + e.what());"
    );
    let _ = writeln!(buf, "    }}");
    let _ = writeln!(buf, "}}");
}

/// Emit a `CustomBody` method — the `setup_code` field contains the complete body.
fn emit_custom_body(buf: &mut String, spec: &MethodSpec) {
    let name = spec.name;
    let ret_type = match spec.return_type {
        ReturnType::ShapeId => "uint32_t",
        ReturnType::Bool => "bool",
        ReturnType::Void => "void",
        ReturnType::VectorUint32 => "std::vector<uint32_t>",
        ReturnType::VectorDouble => "std::vector<double>",
    };

    let _ = writeln!(
        buf,
        "{ret_type} OcctKernel::{name}({params}) {{",
        params = param_list(spec.params)
    );
    let _ = writeln!(buf, "    try {{");

    for line in spec.setup_code.lines() {
        let _ = writeln!(buf, "        {line}");
    }

    let _ = writeln!(buf, "    }} catch (const Standard_Failure& e) {{");
    let _ = writeln!(
        buf,
        "        throw std::runtime_error(std::string(\"{name}: \") + e.what());"
    );
    let _ = writeln!(buf, "    }}");
    let _ = writeln!(buf, "}}");
}

/// Derive the OCCT include header for a class name (e.g. `BRepPrimAPI_MakeBox`
/// becomes `<BRepPrimAPI_MakeBox.hxx>`).
fn class_to_include(cls: &str) -> String {
    format!("{cls}.hxx")
}

/// Collect all unique `#include` paths needed by the given methods.
fn collect_includes(methods: &[&MethodSpec]) -> BTreeSet<String> {
    let mut includes = BTreeSet::new();

    // Always-needed headers.
    includes.insert("Standard_Failure.hxx".to_owned());

    for spec in methods {
        if matches!(spec.kind, MethodKind::Skip) {
            continue;
        }
        if !spec.occt_class.is_empty() {
            includes.insert(class_to_include(spec.occt_class));
        }
        for inc in spec.includes {
            includes.insert((*inc).to_owned());
        }

        // FilletLike methods need TopoDS.hxx for downcasting.
        if matches!(spec.kind, MethodKind::FilletLike) {
            includes.insert("TopoDS.hxx".to_owned());
        }
    }
    includes
}

/// Group methods by category, preserving insertion order within each group.
fn group_by_category<'a>(methods: &[&'a MethodSpec]) -> Vec<(&'a str, Vec<&'a MethodSpec>)> {
    let mut groups: Vec<(&str, Vec<&MethodSpec>)> = Vec::new();
    for spec in methods {
        if matches!(spec.kind, MethodKind::Skip) {
            continue;
        }
        if let Some(group) = groups.iter_mut().find(|(cat, _)| *cat == spec.category) {
            group.1.push(spec);
        } else {
            groups.push((spec.category, vec![spec]));
        }
    }
    groups
}

/// Generate the contents of `facade/generated/kernel.cpp`.
#[allow(clippy::too_many_lines)]
pub fn emit_kernel(methods: &[&MethodSpec]) -> String {
    let mut buf = String::with_capacity(4096);

    // Header.
    let _ = writeln!(
        buf,
        "// AUTO-GENERATED by cargo xtask codegen -- DO NOT EDIT"
    );
    let _ = writeln!(buf);
    let _ = writeln!(buf, "#include \"occt_kernel.h\"");
    let _ = writeln!(buf);

    // OCCT includes.
    let includes = collect_includes(methods);
    for inc in &includes {
        let _ = writeln!(buf, "#include <{inc}>");
    }
    let _ = writeln!(buf);

    // Standard C++ includes.
    let _ = writeln!(buf, "#include <stdexcept>");
    let _ = writeln!(buf, "#include <string>");
    let _ = writeln!(buf);

    // Methods grouped by category.
    let groups = group_by_category(methods);
    for (i, (category, specs)) in groups.iter().enumerate() {
        let _ = writeln!(buf, "// === {category} ===");
        let _ = writeln!(buf);

        for spec in specs {
            match spec.kind {
                MethodKind::SimpleShape => emit_simple_shape(&mut buf, spec),
                MethodKind::BooleanOp => emit_boolean_op(&mut buf, spec),
                MethodKind::FilletLike => emit_fillet_like(&mut buf, spec),
                MethodKind::SetupShape => emit_setup_shape(&mut buf, spec),
                MethodKind::CustomBody => emit_custom_body(&mut buf, spec),
                MethodKind::Skip => {}
            }
            let _ = writeln!(buf);
        }

        // Blank line between category groups, but not after the last one.
        if i + 1 < groups.len() {
            // Already have a trailing newline from the last method.
        }
    }

    // Trim trailing whitespace.
    let trimmed = buf.trim_end().to_owned() + "\n";
    trimmed
}

/// Generate the contents of `facade/generated/bindings.cpp` as a reference
/// file.
///
/// This is **not** compiled or linked. It shows the `.function()` lines that
/// belong in the hand-written `facade/src/bindings.cpp` inside the
/// `class_<OcctKernel>("OcctKernel")` block.
pub fn emit_bindings(methods: &[&MethodSpec]) -> String {
    let mut buf = String::with_capacity(2048);

    let _ = writeln!(buf, "// AUTO-GENERATED reference -- DO NOT COMPILE");
    let _ = writeln!(buf, "//");
    let _ = writeln!(buf, "// These lines belong in facade/src/bindings.cpp");
    let _ = writeln!(
        buf,
        "// inside the class_<OcctKernel>(\"OcctKernel\") block."
    );
    let _ = writeln!(buf);

    let groups = group_by_category(methods);
    for (category, specs) in &groups {
        let _ = writeln!(buf, "// === {category} ===");
        for spec in specs {
            let name = spec.name;
            let _ = writeln!(buf, "// .function(\"{name}\", &OcctKernel::{name})");
        }
        let _ = writeln!(buf);
    }

    let trimmed = buf.trim_end().to_owned() + "\n";
    trimmed
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
        category: "Primitives",
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
        category: "Booleans",
    };

    static FILLET: MethodSpec = MethodSpec {
        name: "fillet",
        kind: MethodKind::FilletLike,
        params: &[
            FacadeParam::ShapeId("solidId"),
            FacadeParam::VectorShapeIds("edgeIds"),
            FacadeParam::Double("radius"),
        ],
        return_type: ReturnType::ShapeId,
        occt_class: "BRepFilletAPI_MakeFillet",
        ctor_args: "TopoDS::Solid(get(solidId))",
        setup_code: "",
        includes: &["TopoDS.hxx"],
        category: "Modeling",
    };

    #[test]
    fn kernel_simple_shape_matches_expected() {
        let methods: Vec<&MethodSpec> = vec![&MAKE_BOX];
        let output = emit_kernel(&methods);

        assert!(output.contains("uint32_t OcctKernel::makeBox(double dx, double dy, double dz)"));
        assert!(output.contains("BRepPrimAPI_MakeBox maker(dx, dy, dz)"));
        assert!(output.contains("maker.Build()"));
        assert!(output.contains("store(maker.Shape())"));
        assert!(output.contains("#include <BRepPrimAPI_MakeBox.hxx>"));
        assert!(output.contains("// === Primitives ==="));
    }

    #[test]
    fn kernel_boolean_op_uses_ctor_args() {
        let methods: Vec<&MethodSpec> = vec![&FUSE];
        let output = emit_kernel(&methods);

        assert!(output.contains("BRepAlgoAPI_Fuse op(get(a), get(b))"));
        assert!(output.contains("op.HasErrors()"));
        assert!(output.contains("boolean operation failed"));
    }

    #[test]
    fn kernel_fillet_like_iterates_edges() {
        let methods: Vec<&MethodSpec> = vec![&FILLET];
        let output = emit_kernel(&methods);

        assert!(output.contains("for (uint32_t eid : edgeIds)"));
        assert!(output.contains("maker.Add(radius, TopoDS::Edge(get(eid)))"));
        assert!(output.contains("#include <TopoDS.hxx>"));
    }

    #[test]
    fn bindings_emits_commented_reference() {
        let methods: Vec<&MethodSpec> = vec![&MAKE_BOX, &FUSE, &FILLET];
        let output = emit_bindings(&methods);

        assert!(output.contains("// AUTO-GENERATED reference"));
        assert!(output.contains("// .function(\"makeBox\", &OcctKernel::makeBox)"));
        assert!(output.contains("// .function(\"fuse\", &OcctKernel::fuse)"));
        assert!(output.contains("// .function(\"fillet\", &OcctKernel::fillet)"));
    }

    #[test]
    fn skip_methods_are_excluded() {
        static SKIPPED: MethodSpec = MethodSpec {
            name: "makeEllipsoid",
            kind: MethodKind::Skip,
            params: &[],
            return_type: ReturnType::ShapeId,
            occt_class: "",
            ctor_args: "",
            setup_code: "",
            includes: &[],
            category: "Primitives",
        };
        let methods: Vec<&MethodSpec> = vec![&SKIPPED, &MAKE_BOX];
        let kernel = emit_kernel(&methods);
        let bindings = emit_bindings(&methods);

        assert!(!kernel.contains("makeEllipsoid"));
        assert!(!bindings.contains("makeEllipsoid"));
    }

    #[test]
    fn includes_are_deduplicated_and_sorted() {
        let methods: Vec<&MethodSpec> = vec![&MAKE_BOX, &FUSE, &FILLET];
        let output = emit_kernel(&methods);

        // All includes should appear exactly once.
        let count = output.matches("#include <TopoDS.hxx>").count();
        assert_eq!(count, 1);

        // Sorted: BRepAlgoAPI_Fuse before BRepPrimAPI_MakeBox.
        let fuse_pos = output
            .find("#include <BRepAlgoAPI_Fuse.hxx>")
            .expect("fuse include");
        let box_pos = output
            .find("#include <BRepPrimAPI_MakeBox.hxx>")
            .expect("box include");
        assert!(fuse_pos < box_pos);
    }
}
