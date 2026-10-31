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
        FacadeParam::ShapeId(name) | FacadeParam::DocId(name) | FacadeParam::Uint32(name) => {
            format!("uint32_t {name}")
        }
        FacadeParam::Double(name) => format!("double {name}"),
        FacadeParam::VectorShapeIds(name) => format!("std::vector<uint32_t> {name}"),
        FacadeParam::Bool(name) => format!("bool {name}"),
        FacadeParam::Int(name) => format!("int {name}"),
        FacadeParam::String(name) | FacadeParam::Bytes(name) => {
            format!("const std::string& {name}")
        }
        FacadeParam::VectorDouble(name) => format!("std::vector<double> {name}"),
        FacadeParam::VectorInt(name) => format!("std::vector<int> {name}"),
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
    let _ = writeln!(buf, "        {cls} op;");
    let _ = writeln!(buf, "        buildBoolean(op, {args});");
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

    let solid_param = spec.params.iter().find_map(|p| {
        if let FacadeParam::ShapeId(n) = p {
            Some(*n)
        } else {
            None
        }
    });

    let failure = vec_param.map_or_else(
        || format!("std::string(\"{name}: operation failed\")"),
        |vec_name| {
            let scalar_args = scalar_params.join(", ");
            let _ = writeln!(buf, "        std::vector<TopoDS_Edge> edges;");
            let _ = writeln!(buf, "        edges.reserve({vec_name}.size());");
            let _ = writeln!(buf, "        for (uint32_t eid : {vec_name}) {{");
            let _ = writeln!(buf, "            edges.push_back(TopoDS::Edge(get(eid)));");
            let _ = writeln!(buf, "            maker.Add({scalar_args}, edges.back());");
            let _ = writeln!(buf, "        }}");
            match (cls, solid_param, scalar_params.first()) {
                ("BRepFilletAPI_MakeFillet", _, _) => {
                    format!("filletFailure(maker, {vec_name}, edges, \"{name}\")")
                }
                ("BRepFilletAPI_MakeChamfer", Some(solid), Some(distance)) => format!(
                    "chamferFailure(get({solid}), {distance}, {vec_name}, edges, \"{name}\")"
                ),
                _ => format!("std::string(\"{name}: operation failed\")"),
            }
        },
    );

    let _ = writeln!(buf, "        maker.Build();");
    let _ = writeln!(buf, "        if (!maker.IsDone()) {{");
    let _ = writeln!(buf, "            throw std::runtime_error({failure});");
    let _ = writeln!(buf, "        }}");
    let _ = writeln!(
        buf,
        "        return store(validateFilletResult(unwrapSingletonSolid(maker.Shape()), \"{name}\", true));"
    );
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

/// Map a `ReturnType` to its C++ type spelling.
const fn cpp_return_type(ret: ReturnType) -> &'static str {
    match ret {
        ReturnType::ShapeId | ReturnType::DocId | ReturnType::Uint32 => "uint32_t",
        ReturnType::Bool => "bool",
        ReturnType::Void => "void",
        ReturnType::VectorUint32 | ReturnType::VectorShapeIds => "std::vector<uint32_t>",
        ReturnType::VectorDouble => "std::vector<double>",
        ReturnType::Double => "double",
        ReturnType::String | ReturnType::Bytes => "std::string",
        ReturnType::Int => "int",
        ReturnType::VectorInt => "std::vector<int>",
        ReturnType::BBoxData => "BBoxData",
        ReturnType::NurbsCurveData => "NurbsCurveData",
        ReturnType::EvolutionData => "EvolutionData",
        ReturnType::MeshData => "MeshData",
        ReturnType::MeshBatchData => "MeshBatchData",
        ReturnType::EdgeData => "EdgeData",
        ReturnType::ProjectionData => "ProjectionData",
        ReturnType::XCAFLabelInfo => "XCAFLabelInfo",
    }
}

/// Emit a `CustomBody` method — the `setup_code` field contains the complete body.
fn emit_custom_body(buf: &mut String, spec: &MethodSpec) {
    let name = spec.name;
    let ret_type = cpp_return_type(spec.return_type);

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

/// Emit a `CustomBodyRaw` method — `setup_code` is the full body, emitted with
/// no `Standard_Failure` try/catch wrapper (for methods that never enter OCCT).
fn emit_custom_body_raw(buf: &mut String, spec: &MethodSpec) {
    let ret_type = cpp_return_type(spec.return_type);

    let _ = writeln!(
        buf,
        "{ret_type} OcctKernel::{name}({params}) {{",
        name = spec.name,
        params = param_list(spec.params)
    );

    for line in spec.setup_code.lines() {
        let _ = writeln!(buf, "    {line}");
    }

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

    if needs_unwrap_singleton_solid(methods) {
        includes.insert("TopExp_Explorer.hxx".to_owned());
        includes.insert("TopoDS_Shape.hxx".to_owned());
        // validateFilletResult, emitted alongside unwrapSingletonSolid.
        includes.insert("BRepCheck_Analyzer.hxx".to_owned());
        includes.insert("ShapeFix_Shape.hxx".to_owned());
    }

    if needs_solid_join_type(methods) {
        includes.insert("GeomAbs_JoinType.hxx".to_owned());
    }

    if needs_faulty_edges(methods) {
        includes.insert("BRepAdaptor_Curve.hxx".to_owned());
        includes.insert("BRepFilletAPI_MakeFillet.hxx".to_owned());
        includes.insert("BRep_Tool.hxx".to_owned());
        includes.insert("ChFi3d_ChBuilder.hxx".to_owned());
        includes.insert("Extrema_GenLocateExtPS.hxx".to_owned());
        includes.insert("Extrema_POnSurf.hxx".to_owned());
        includes.insert("Geom2d_Curve.hxx".to_owned());
        includes.insert("GeomAdaptor_Surface.hxx".to_owned());
        includes.insert("Geom_Surface.hxx".to_owned());
        includes.insert("gp.hxx".to_owned());
        includes.insert("gp_Pnt.hxx".to_owned());
        includes.insert("gp_Pnt2d.hxx".to_owned());
        includes.insert("gp_Vec.hxx".to_owned());
        includes.insert("NCollection_DataMap.hxx".to_owned());
        includes.insert("NCollection_IndexedDataMap.hxx".to_owned());
        includes.insert("NCollection_List.hxx".to_owned());
        includes.insert("Precision.hxx".to_owned());
        includes.insert("TopAbs_Orientation.hxx".to_owned());
        includes.insert("TopExp.hxx".to_owned());
        includes.insert("TopExp_Explorer.hxx".to_owned());
        includes.insert("TopTools_ShapeMapHasher.hxx".to_owned());
        includes.insert("TopoDS.hxx".to_owned());
        includes.insert("TopoDS_Edge.hxx".to_owned());
        includes.insert("TopoDS_Face.hxx".to_owned());
    }

    if needs_build_boolean(methods) {
        includes.insert("BRepAlgoAPI_BooleanOperation.hxx".to_owned());
        includes.insert("NCollection_List.hxx".to_owned());
        includes.insert("TopoDS_Shape.hxx".to_owned());
    }

    if needs_finite_check(methods) {
        includes.insert("BRep_Tool.hxx".to_owned());
        includes.insert("NCollection_List.hxx".to_owned());
        includes.insert("Precision.hxx".to_owned());
        includes.insert("TopExp_Explorer.hxx".to_owned());
        includes.insert("TopoDS.hxx".to_owned());
        includes.insert("TopoDS_Shape.hxx".to_owned());
    }

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

/// Do any methods need the `unwrapSingletonSolid` helper?
///
/// Every `FilletLike` method calls it, plus any `CustomBody` spec that names it.
fn needs_unwrap_singleton_solid(methods: &[&MethodSpec]) -> bool {
    methods.iter().any(|m| {
        matches!(m.kind, MethodKind::FilletLike) || m.setup_code.contains("unwrapSingletonSolid")
    })
}

/// Do any methods need the `filletFailure` / `chamferFailure` helpers?
///
/// The `FilletLike` template calls them, as does any `CustomBody` spec that names them.
fn needs_faulty_edges(methods: &[&MethodSpec]) -> bool {
    methods.iter().any(|m| {
        matches!(m.kind, MethodKind::FilletLike)
            || m.setup_code.contains("filletFailure(")
            || m.setup_code.contains("chamferFailure(")
            || m.setup_code.contains("chamferEdgesFailure(")
            || m.setup_code.contains("addFilletRadii(")
    })
}

/// Do any methods need the `buildBoolean` helper?
///
/// Every `BooleanOp` method calls it, plus any `CustomBody` spec that names it.
fn needs_build_boolean(methods: &[&MethodSpec]) -> bool {
    methods
        .iter()
        .any(|m| matches!(m.kind, MethodKind::BooleanOp) || m.setup_code.contains("buildBoolean("))
}

/// Do any methods need the `isFiniteShape` / `allFinite` OBB guard?
///
/// `buildBoolean` uses it, as do the n-way booleans that name `allFinite`.
fn needs_finite_check(methods: &[&MethodSpec]) -> bool {
    needs_build_boolean(methods) || methods.iter().any(|m| m.setup_code.contains("allFinite("))
}

fn needs_solid_join_type(methods: &[&MethodSpec]) -> bool {
    methods
        .iter()
        .any(|m| m.setup_code.contains("solidJoinType"))
}

/// Emit static helper functions that generated methods depend on.
///
/// Emits `unwrapSingletonSolid` + `validateFilletResult` for the fillet/chamfer
/// family, `solidJoinType` for the 3D offset join variants, `buildBoolean` for
/// the two-operand booleans, and `buildEvolution` if any method returns
/// `EvolutionData`.
#[allow(clippy::too_many_lines)]
fn emit_helper_functions(buf: &mut String, methods: &[&MethodSpec]) {
    let needs_evolution = methods
        .iter()
        .any(|m| matches!(m.return_type, ReturnType::EvolutionData));
    let needs_unwrap = needs_unwrap_singleton_solid(methods);
    let needs_join = needs_solid_join_type(methods);
    let needs_boolean = needs_build_boolean(methods);
    let needs_finite = needs_finite_check(methods);
    let needs_faulty = needs_faulty_edges(methods);

    if needs_evolution
        || needs_unwrap
        || needs_join
        || needs_boolean
        || needs_finite
        || needs_faulty
    {
        let _ = writeln!(buf, "// === helper functions ===");
        let _ = writeln!(buf);
    }

    if needs_join {
        for line in [
            "/// Map a raw join code for the 3D offset family (shell/offset and their",
            "/// history variants). The codes are the ones `offsetWire2D` takes: 0 = Arc,",
            "/// 1 = Intersection. `BRepOffset_MakeOffset` has no branch for",
            "/// `GeomAbs_Tangent` (raw 2), so it is rejected instead of passed on.",
            "static GeomAbs_JoinType solidJoinType(int joinType, const char* op) {",
            "    switch (joinType) {",
            "    case 0: return GeomAbs_Arc;",
            "    case 1: return GeomAbs_Intersection;",
            "    default:",
            "        throw std::runtime_error(std::string(op) +",
            "                                 \": joinType must be Arc (0) or Intersection (1)\");",
            "    }",
            "}",
        ] {
            let _ = writeln!(buf, "{line}");
        }
        let _ = writeln!(buf);
    }

    if needs_finite {
        for line in [
            "/// True when no face or edge of `shape` is unbounded.",
            "///",
            "/// An oriented bounding box cannot enclose infinite geometry, so with OBB on",
            "/// the interference pre-check drops every pair involving it and a cut by a",
            "/// half-space silently does nothing. An unbounded face (an infinite plane)",
            "/// has no edges; a half-infinite one has an edge with an infinite range.",
            "static bool isFiniteShape(const TopoDS_Shape& shape) {",
            "    for (TopExp_Explorer ex(shape, TopAbs_FACE); ex.More(); ex.Next()) {",
            "        if (!TopExp_Explorer(ex.Current(), TopAbs_EDGE).More()) return false;",
            "    }",
            "    for (TopExp_Explorer ex(shape, TopAbs_EDGE); ex.More(); ex.Next()) {",
            "        double first = 0.0;",
            "        double last = 0.0;",
            "        BRep_Tool::Range(TopoDS::Edge(ex.Current()), first, last);",
            "        if (Precision::IsInfinite(first) || Precision::IsInfinite(last)) return false;",
            "    }",
            "    return true;",
            "}",
            "",
            "static bool allFinite(const NCollection_List<TopoDS_Shape>& shapes) {",
            "    for (const TopoDS_Shape& shape : shapes) {",
            "        if (!isFiniteShape(shape)) return false;",
            "    }",
            "    return true;",
            "}",
        ] {
            let _ = writeln!(buf, "{line}");
        }
        let _ = writeln!(buf);
    }

    if needs_boolean {
        for line in [
            "/// Run a two-operand boolean, building it exactly once.",
            "///",
            "/// The two-shape `BRepAlgoAPI_*` constructors already call `Build()`, and",
            "/// `Build()` starts by clearing the previous result, so constructing with the",
            "/// shapes and then calling `Build()` computes the whole boolean twice. OBB",
            "/// matches `fuseAll`/`cutAll`: a tighter interference pre-check, used only",
            "/// when both operands are finite.",
            "static void buildBoolean(BRepAlgoAPI_BooleanOperation& op, const TopoDS_Shape& a,",
            "                         const TopoDS_Shape& b) {",
            "    NCollection_List<TopoDS_Shape> args;",
            "    args.Append(a);",
            "    NCollection_List<TopoDS_Shape> tools;",
            "    tools.Append(b);",
            "    op.SetArguments(args);",
            "    op.SetTools(tools);",
            "    op.SetUseOBB(allFinite(args) && allFinite(tools));",
            "    op.Build();",
            "}",
        ] {
            let _ = writeln!(buf, "{line}");
        }
        let _ = writeln!(buf);
    }

    if needs_faulty {
        for line in [
            "/// `<op>: operation failed`, plus the caller's ids of the edges that lie on a",
            "/// contour OCCT could not build: ` [faulty edges: 3,7]`. brepjs parses this",
            "/// suffix to point at the failing edges, so keep its shape.",
            "template <typename ContourOf>",
            "static std::string localOperationFailure(const char* op,",
            "                                         const std::vector<uint32_t>& edgeIds,",
            "                                         const std::vector<TopoDS_Edge>& edges,",
            "                                         const std::vector<int>& faultyContours,",
            "                                         ContourOf contourOf) {",
            "    std::string listed;",
            "    for (size_t i = 0; i < edges.size() && i < edgeIds.size(); ++i) {",
            "        const int contour = contourOf(edges[i]);",
            "        if (std::find(faultyContours.begin(), faultyContours.end(), contour) ==",
            "            faultyContours.end()) {",
            "            continue;",
            "        }",
            "        if (!listed.empty()) listed += \",\";",
            "        listed += std::to_string(edgeIds[i]);",
            "    }",
            "    std::string message = std::string(op) + \": operation failed\";",
            "    if (!listed.empty()) message += \" [faulty edges: \" + listed + \"]\";",
            "    return message;",
            "}",
            "",
            "static std::string filletFailure(const BRepFilletAPI_MakeFillet& maker,",
            "                                 const std::vector<uint32_t>& edgeIds,",
            "                                 const std::vector<TopoDS_Edge>& edges, const char* op) {",
            "    std::vector<int> faulty;",
            "    for (int i = 1; i <= maker.NbFaultyContours(); ++i) {",
            "        faulty.push_back(maker.FaultyContour(i));",
            "    }",
            "    return localOperationFailure(op, edgeIds, edges, faulty,",
            "                                 [&](const TopoDS_Edge& e) { return maker.Contour(e); });",
            "}",
            "",
            "/// `<op>: edges a and b are tangent-continuous ...`, naming the caller's ids.",
            "static std::string tangentJoinMessage(const char* op, uint32_t a, uint32_t b,",
            "                                      const std::string& what) {",
            "    return std::string(op) + \": edges \" + std::to_string(a) + \" and \" + std::to_string(b) +",
            "           \" are tangent-continuous, so OCCT builds them as one contour; \" + what;",
            "}",
            "",
            "static bool sameValue(double a, double b) {",
            "    return std::abs(a - b) <= Precision::Confusion() * std::max({1.0, std::abs(a), std::abs(b)});",
            "}",
            "",
            "/// Add every edge to a fillet, each with its own radius: constant when",
            "/// `starts[i] == ends[i]`, otherwise linear from the edge's first vertex (at its",
            "/// first curve parameter) to its last.",
            "///",
            "/// OCCT keeps one continuous radius law per contour of tangent-continuous",
            "/// edges, and `Add(r, edge)` on an edge already in a contour overwrites the",
            "/// radius the earlier edge set at their shared vertex, silently turning it into",
            "/// a taper. So the edges are added first, then each edge's radii are set at its",
            "/// index in its contour, swapped where the contour runs against the edge. Two",
            "/// given edges that meet must agree on the radius at their joint, since a",
            "/// fillet cannot jump there; an edge left out of the list blends between its",
            "/// neighbours.",
            "///",
            "/// A radius of 0 is refused anywhere the fillet continues past the vertex (a",
            "/// joint inside the contour, or any vertex of a closed one). OCCT returns a",
            "/// valid solid for both but drops the fillet beyond a pinch in an open contour",
            "/// and keeps a closed edge's first radius all the way round, so only an open",
            "/// end can run out to 0.",
            "static void addFilletRadii(BRepFilletAPI_MakeFillet& maker, const std::vector<uint32_t>& edgeIds,",
            "                           const std::vector<TopoDS_Edge>& edges, const std::vector<double>& starts,",
            "                           const std::vector<double>& ends, const char* op) {",
            "    for (size_t i = 0; i < edges.size(); ++i) {",
            "        if (!(starts[i] >= 0.0 && ends[i] >= 0.0 && std::isfinite(starts[i]) &&",
            "              std::isfinite(ends[i]))) {",
            "            throw std::runtime_error(std::string(op) + \": every radius must be finite and not negative\");",
            "        }",
            "        if (starts[i] == 0.0 && ends[i] == 0.0) {",
            "            throw std::runtime_error(std::string(op) + \": edge \" + std::to_string(edgeIds[i]) +",
            "                                     \" has radius 0 at both ends\");",
            "        }",
            "        maker.Add(edges[i]);",
            "        if (maker.Contour(edges[i]) == 0) {",
            "            throw std::runtime_error(std::string(op) + \": edge \" + std::to_string(edgeIds[i]) +",
            "                                     \" cannot be filleted (it does not join two faces of the solid)\");",
            "        }",
            "    }",
            "    struct Radii {",
            "        bool set = false;",
            "        double first = 0.0;",
            "        double last = 0.0;",
            "        uint32_t id = 0;",
            "    };",
            "    for (int contour = 1; contour <= maker.NbContours(); ++contour) {",
            "        const int count = maker.NbEdges(contour);",
            "        std::vector<Radii> along(static_cast<size_t>(count) + 1);",
            "        for (size_t i = 0; i < edges.size(); ++i) {",
            "            if (maker.Contour(edges[i]) != contour) continue;",
            "            for (int j = 1; j <= count; ++j) {",
            "                const TopoDS_Edge& stored = maker.Edge(contour, j);",
            "                if (!stored.IsSame(edges[i])) continue;",
            "                const bool reversed = stored.Orientation() == TopAbs_REVERSED;",
            "                along[j] = {true, reversed ? ends[i] : starts[i], reversed ? starts[i] : ends[i],",
            "                            edgeIds[i]};",
            "            }",
            "        }",
            "        auto checkJoint = [&](int a, int b) {",
            "            if (!along[a].set || !along[b].set || sameValue(along[a].last, along[b].first)) return;",
            "            std::ostringstream radii;",
            "            radii << along[a].last << \" and \" << along[b].first;",
            "            throw std::runtime_error(tangentJoinMessage(",
            "                op, along[a].id, along[b].id,",
            "                \"a fillet radius cannot jump where they meet (\" + radii.str() +",
            "                    \"), so give both the same radius there, tapering one if needed\"));",
            "        };",
            "        const bool closed = maker.Closed(contour);",
            "        for (int j = 1; j < count; ++j) checkJoint(j, j + 1);",
            "        if (count > 1 && closed) checkJoint(count, 1);",
            "        for (int j = 1; j <= count; ++j) {",
            "            if (!along[j].set) continue;",
            "            const bool openFirst = j == 1 && !closed;",
            "            const bool openLast = j == count && !closed;",
            "            if ((along[j].first == 0.0 && !openFirst) || (along[j].last == 0.0 && !openLast)) {",
            "                throw std::runtime_error(",
            "                    std::string(op) + \": edge \" + std::to_string(along[j].id) +",
            "                    \" has radius 0 where its fillet continues past the vertex; a radius can only run out to 0 \"",
            "                    \"at an open end of a chain of tangent-continuous edges\");",
            "            }",
            "            maker.SetRadius(along[j].first, along[j].last, contour, j);",
            "        }",
            "    }",
            "}",
            "",
            "/// One edge of a chamfer: `distance` is set back on `face`, and the other side",
            "/// takes `second`, a distance or (when `byAngle`) an angle in radians.",
            "/// `faceGiven` is false when `face` is only the edge's default first face.",
            "struct ChamferEdge {",
            "    TopoDS_Edge edge;",
            "    TopoDS_Face face;",
            "    double distance;",
            "    double second;",
            "    bool byAngle;",
            "    bool faceGiven;",
            "};",
            "",
            "/// Equal distances add the symmetric chamfer `chamfer` builds. Works on both",
            "/// `BRepFilletAPI_MakeChamfer` and `ChFi3d_ChBuilder`, which share these calls.",
            "template <typename Builder>",
            "static void addChamferEdge(Builder& builder, const ChamferEdge& c) {",
            "    if (c.byAngle) {",
            "        builder.AddDA(c.distance, c.second, c.edge, c.face);",
            "    } else if (c.distance == c.second) {",
            "        builder.Add(c.distance, c.edge);",
            "    } else {",
            "        builder.Add(c.distance, c.second, c.edge, c.face);",
            "    }",
            "}",
            "",
            "/// A face of the solid and the sense it runs one of its edges in.",
            "struct FaceSense {",
            "    TopoDS_Face face;",
            "    TopAbs_Orientation sense;",
            "};",
            "",
            "/// Which side of a contour each face of an edge lies on, as a flag that is the",
            "/// same for every face on one side along a tangent chain. A face runs its",
            "/// boundary edges in its own sense, the reverse of the face across each edge,",
            "/// so comparing that sense with the direction the contour runs through the",
            "/// edge separates the two sides. Both senses come from maps built once per",
            "/// check, so a long chain costs one pass over it rather than one per lookup.",
            "class ChamferSides {",
            "public:",
            "    ChamferSides(const TopoDS_Shape& solid, const BRepFilletAPI_MakeChamfer& maker)",
            "        : solid_(solid), maker_(maker) {}",
            "",
            "    bool side(int contour, const TopoDS_Edge& edge, const TopoDS_Face& face) {",
            "        TopAbs_Orientation alongContour = TopAbs_FORWARD;",
            "        if (const TopAbs_Orientation* found = along(contour).Seek(edge)) {",
            "            alongContour = *found;",
            "        }",
            "        return (inFace(edge, face) == TopAbs_FORWARD) == (alongContour == TopAbs_FORWARD);",
            "    }",
            "",
            "    /// The solid's faces around `edge` with their senses, listed as",
            "    /// TopExp::MapShapesAndAncestors lists them; null for an edge of no face.",
            "    const std::vector<FaceSense>* faces(const TopoDS_Edge& edge) {",
            "        return senses().Seek(edge);",
            "    }",
            "",
            "private:",
            "    using Senses = NCollection_DataMap<TopoDS_Shape, TopAbs_Orientation, TopTools_ShapeMapHasher>;",
            "    struct Contour {",
            "        bool mapped = false;",
            "        Senses senses;",
            "    };",
            "",
            "    const NCollection_DataMap<TopoDS_Shape, std::vector<FaceSense>, TopTools_ShapeMapHasher>&",
            "    senses() {",
            "        if (!facesMapped_) {",
            "            facesMapped_ = true;",
            "            for (TopExp_Explorer f(solid_, TopAbs_FACE); f.More(); f.Next()) {",
            "                const TopoDS_Face& face = TopoDS::Face(f.Current());",
            "                for (TopExp_Explorer e(face, TopAbs_EDGE); e.More(); e.Next()) {",
            "                    std::vector<FaceSense>* list = faces_.ChangeSeek(e.Current());",
            "                    if (list == nullptr) list = faces_.Bound(e.Current(), {});",
            "                    list->push_back({face, e.Current().Orientation()});",
            "                }",
            "            }",
            "        }",
            "        return faces_;",
            "    }",
            "",
            "    /// How the contour runs each of its edges, the first time it lists one.",
            "    const Senses& along(int contour) {",
            "        if (contour >= static_cast<int>(contours_.size())) {",
            "            contours_.resize(static_cast<size_t>(contour) + 1);",
            "        }",
            "        Contour& c = contours_[static_cast<size_t>(contour)];",
            "        if (!c.mapped) {",
            "            c.mapped = true;",
            "            for (int j = 1; j <= maker_.NbEdges(contour); ++j) {",
            "                const TopoDS_Edge& edge = maker_.Edge(contour, j);",
            "                if (!c.senses.IsBound(edge)) c.senses.Bind(edge, edge.Orientation());",
            "            }",
            "        }",
            "        return c.senses;",
            "    }",
            "",
            "    /// The sense `face` runs `edge` in, the first time it does.",
            "    TopAbs_Orientation inFace(const TopoDS_Edge& edge, const TopoDS_Face& face) {",
            "        if (const std::vector<FaceSense>* list = senses().Seek(edge)) {",
            "            for (const FaceSense& f : *list) {",
            "                if (f.face.IsEqual(face)) return f.sense;",
            "            }",
            "        }",
            "        for (TopExp_Explorer ex(face, TopAbs_EDGE); ex.More(); ex.Next()) {",
            "            if (ex.Current().IsSame(edge)) return ex.Current().Orientation();",
            "        }",
            "        return TopAbs_FORWARD;",
            "    }",
            "",
            "    const TopoDS_Shape& solid_;",
            "    const BRepFilletAPI_MakeChamfer& maker_;",
            "    bool facesMapped_ = false;",
            "    NCollection_DataMap<TopoDS_Shape, std::vector<FaceSense>, TopTools_ShapeMapHasher> faces_;",
            "    std::vector<Contour> contours_;",
            "};",
            "",
            "/// A face of an edge, ready to cut chamfer sections through: the edge's curve",
            "/// on it, its surface, and whether its normal crossed with the edge's curve",
            "/// points out of the face. The direction into a face is its outward normal",
            "/// crossed with the edge as the face runs it (ChFi3d::DefineConnectType's",
            "/// convention).",
            "struct SectionFace {",
            "    Handle(Geom2d_Curve) pcurve;",
            "    Handle(Geom_Surface) surface;",
            "    bool flip;",
            "};",
            "",
            "static SectionFace sectionFace(const TopoDS_Edge& edge, const TopoDS_Face& face) {",
            "    TopoDS_Edge inFace = edge;",
            "    for (TopExp_Explorer ex(face, TopAbs_EDGE); ex.More(); ex.Next()) {",
            "        if (ex.Current().IsSame(edge)) {",
            "            inFace = TopoDS::Edge(ex.Current());",
            "            break;",
            "        }",
            "    }",
            "    double first = 0.0;",
            "    double last = 0.0;",
            "    return {BRep_Tool::CurveOnSurface(inFace, face, first, last), BRep_Tool::Surface(face),",
            "            (face.Orientation() == TopAbs_REVERSED) != (inFace.Orientation() == TopAbs_REVERSED)};",
            "}",
            "",
            "/// The unit direction into `face` square to its edge at curve parameter `t`,",
            "/// where the edge's curve has derivative `tangent`, and the UV of that point",
            "/// on the face's surface. False where either is degenerate.",
            "static bool intoFace(const SectionFace& face, const gp_Vec& tangent, double t, gp_Vec& into,",
            "                     gp_Pnt2d& uv) {",
            "    if (face.pcurve.IsNull()) return false;",
            "    uv = face.pcurve->Value(t);",
            "    gp_Pnt point;",
            "    gp_Vec du;",
            "    gp_Vec dv;",
            "    face.surface->D1(uv.X(), uv.Y(), point, du, dv);",
            "    into = du.Crossed(dv).Crossed(tangent);",
            "    if (into.Magnitude() <= gp::Resolution()) return false;",
            "    into.Normalize();",
            "    if (face.flip) into.Reverse();",
            "    return true;",
            "}",
            "",
            "/// True when `surface` runs straight from `from` along `direction` for",
            "/// `length`: the point there lies on it, with the normal there still square to",
            "/// `direction`. OCCT measures a distance-angle chamfer's distance as a chord",
            "/// and its angle from the surface's tangent at the chord's far end",
            "/// (BlendFunc_ChAsym), so the triangle in farSetback holds only then.",
            "static bool straightAcross(const Handle(Geom_Surface)& surface, const gp_Pnt2d& uv,",
            "                           const gp_Pnt& from, const gp_Vec& direction, double length) {",
            "    const double tolerance = Precision::Confusion() * std::max(1.0, length);",
            "    GeomAdaptor_Surface adaptor(surface);",
            "    Extrema_GenLocateExtPS projection(adaptor);",
            "    projection.Perform(from.Translated(direction * length), uv.X(), uv.Y());",
            "    if (!projection.IsDone() || projection.SquareDistance() > tolerance * tolerance) {",
            "        return false;",
            "    }",
            "    double u = 0.0;",
            "    double v = 0.0;",
            "    projection.Point().Parameter(u, v);",
            "    gp_Pnt point;",
            "    gp_Vec du;",
            "    gp_Vec dv;",
            "    surface->D1(u, v, point, du, dv);",
            "    const gp_Vec normal = du.Crossed(dv);",
            "    return normal.Magnitude() > gp::Resolution() &&",
            "           std::abs(normal.Normalized().Dot(direction)) <= Precision::Confusion();",
            "}",
            "",
            "/// The setback a distance-angle chamfer makes on the face across from its",
            "/// reference face. In the plane square to the edge it cuts a triangle off the",
            "/// corner, with `dihedral` (the angle between the faces) at the edge and",
            "/// `angle` at its setback `distance` on the reference face, so the law of",
            "/// sines gives the side across, where the chamfer meets that face at",
            "/// pi - dihedral - angle. ChFi3d_ChBuilder seeds its section solver the same",
            "/// way. False where the chamfer cannot reach the other face.",
            "static bool farSetback(double distance, double angle, double dihedral, double& setback) {",
            "    const double across = std::sin(dihedral + angle);",
            "    if (!(across > 0.0)) return false;",
            "    setback = distance * std::sin(angle) / across;",
            "    return true;",
            "}",
            "",
            "/// A contour's first distance-angle chamfer at one point of the contour: the",
            "/// faces' dihedral angle there, its setback on the face across from its",
            "/// reference face, and whether both faces run straight out to its setbacks.",
            "struct RestatedSample {",
            "    double dihedral;",
            "    double across;",
            "    bool straight;",
            "};",
            "",
            "/// Distance-angle chamfer `a`, the first of contour `contour`, at samples along",
            "/// every edge of the contour, its tangent vertices included. OCCT builds `a`'s",
            "/// along the whole contour, so this is what every chamfer stated from the",
            "/// other side must match; it is gathered once per contour. Points where `a`",
            "/// cannot reach the other face are left out: OCCT fails the contour there and",
            "/// reports it.",
            "static std::vector<RestatedSample> restateAlongContour(ChamferSides& sides,",
            "                                                      const BRepFilletAPI_MakeChamfer& maker,",
            "                                                      int contour, const ChamferEdge& a) {",
            "    const bool aSide = sides.side(contour, a.edge, a.face);",
            "    const int intervals = 8;",
            "    std::vector<RestatedSample> samples;",
            "    for (int j = 1; j <= maker.NbEdges(contour); ++j) {",
            "        const TopoDS_Edge& edge = maker.Edge(contour, j);",
            "        const std::vector<FaceSense>* faces = sides.faces(edge);",
            "        if (faces == nullptr) continue;",
            "        TopoDS_Face onA;",
            "        TopoDS_Face across;",
            "        for (const FaceSense& face : *faces) {",
            "            if (sides.side(contour, edge, face.face) == aSide) {",
            "                onA = face.face;",
            "            } else {",
            "                across = face.face;",
            "            }",
            "        }",
            "        if (onA.IsNull() || across.IsNull()) continue;",
            "        const SectionFace faceA = sectionFace(edge, onA);",
            "        const SectionFace faceB = sectionFace(edge, across);",
            "        BRepAdaptor_Curve curve(edge);",
            "        const double first = curve.FirstParameter();",
            "        const double step = (curve.LastParameter() - first) / intervals;",
            "        for (int k = 0; k <= intervals; ++k) {",
            "            const double t = first + step * k;",
            "            gp_Pnt point;",
            "            gp_Vec tangent;",
            "            curve.D1(t, point, tangent);",
            "            gp_Vec intoA;",
            "            gp_Vec intoB;",
            "            gp_Pnt2d uvA;",
            "            gp_Pnt2d uvB;",
            "            if (!intoFace(faceA, tangent, t, intoA, uvA) ||",
            "                !intoFace(faceB, tangent, t, intoB, uvB)) {",
            "                continue;",
            "            }",
            "            const double dihedral = intoA.Angle(intoB);",
            "            double aAcross = 0.0;",
            "            if (!farSetback(a.distance, a.second, dihedral, aAcross)) continue;",
            "            const bool straight = straightAcross(faceA.surface, uvA, point, intoA, a.distance) &&",
            "                                  straightAcross(faceB.surface, uvB, point, intoB, aAcross);",
            "            samples.push_back({dihedral, aAcross, straight});",
            "        }",
            "    }",
            "    return samples;",
            "}",
            "",
            "/// Distance-angle chamfer `b`, measured from a face on the other side of its",
            "/// contour from `a`, the contour's first, must describe `a`'s chamfer from",
            "/// its side wherever the contour runs, setting back on each face what `a`",
            "/// does at every one of `samples` (restateAlongContour). Where a face curves",
            "/// away before a setback, the triangle does not hold and the two cannot be",
            "/// matched.",
            "static void checkOppositeDistAngles(const std::vector<RestatedSample>& samples,",
            "                                    const ChamferEdge& a, const ChamferEdge& b, uint32_t aId,",
            "                                    uint32_t bId, const char* op) {",
            "    bool curved = false;",
            "    for (const RestatedSample& sample : samples) {",
            "        if (!sample.straight) {",
            "            curved = true;",
            "            continue;",
            "        }",
            "        double bAcross = 0.0;",
            "        if (farSetback(b.distance, b.second, sample.dihedral, bAcross) &&",
            "            sameValue(b.distance, sample.across) && sameValue(bAcross, a.distance)) {",
            "            continue;",
            "        }",
            "        std::ostringstream what;",
            "        what << \"measured from opposite faces, their distance-angle chamfers differ where \"",
            "                \"the faces meet at \"",
            "             << sample.dihedral * 180.0 / M_PI << \" degrees (there edge \" << aId << \"'s is \"",
            "             << sample.across << \" at \" << (M_PI - sample.dihedral - a.second) * 180.0 / M_PI",
            "             << \" degrees from edge \" << bId << \"'s reference face)\";",
            "        throw std::runtime_error(tangentJoinMessage(op, aId, bId, what.str()));",
            "    }",
            "    if (curved) {",
            "        throw std::runtime_error(tangentJoinMessage(",
            "            op, aId, bId,",
            "            \"a face along it curves away from the edge within the chamfer, so \"",
            "            \"distance-angle chamfers measured from opposite faces cannot be matched; \"",
            "            \"measure theirs from faces on the same side of the chain\"));",
            "    }",
            "}",
            "",
            "/// OCCT chamfers a contour of tangent-continuous edges with the chamfer of the",
            "/// first edge added, measured from that edge's face on the same side all along",
            "/// the chain, and ignores any later edge of it. So the given edges of one",
            "/// contour must ask for the same chamfer once their setbacks are matched face",
            "/// to face: (1, 3) from the top face and (3, 1) from the side face agree. An",
            "/// edge without a reference face follows the first edge's side. Distance-angle",
            "/// chamfers from opposite sides are matched by checkOppositeDistAngles.",
            "static void checkChamferContours(const TopoDS_Shape& solid,",
            "                                 const BRepFilletAPI_MakeChamfer& maker,",
            "                                 const std::vector<uint32_t>& edgeIds,",
            "                                 const std::vector<ChamferEdge>& specs, const char* op) {",
            "    struct Contour {",
            "        bool seen = false;",
            "        size_t first = 0;",
            "        bool restated = false;",
            "        std::vector<RestatedSample> samples;",
            "        bool matched = false;",
            "        double matchedDistance = 0.0;",
            "        double matchedAngle = 0.0;",
            "    };",
            "    std::vector<Contour> contours(static_cast<size_t>(maker.NbContours()) + 1);",
            "    ChamferSides sides(solid, maker);",
            "    for (size_t i = 0; i < specs.size(); ++i) {",
            "        const int contour = maker.Contour(specs[i].edge);",
            "        if (contour == 0) {",
            "            throw std::runtime_error(std::string(op) + \": edge \" + std::to_string(edgeIds[i]) +",
            "                                     \" cannot be chamfered (it does not join two faces of the solid)\");",
            "        }",
            "        if (contour >= static_cast<int>(contours.size())) {",
            "            contours.resize(static_cast<size_t>(contour) + 1);",
            "        }",
            "        Contour& c = contours[static_cast<size_t>(contour)];",
            "        if (!c.seen) {",
            "            c.seen = true;",
            "            c.first = i;",
            "            continue;",
            "        }",
            "        const ChamferEdge& a = specs[c.first];",
            "        const ChamferEdge& b = specs[i];",
            "        const bool sameSide = !b.faceGiven || sides.side(contour, a.edge, a.face) ==",
            "                                                  sides.side(contour, b.edge, b.face);",
            "        if (a.byAngle && b.byAngle && !sameSide) {",
            "            // The same numbers compare the same against the same samples.",
            "            if (c.matched && b.distance == c.matchedDistance && b.second == c.matchedAngle) {",
            "                continue;",
            "            }",
            "            if (!c.restated) {",
            "                c.samples = restateAlongContour(sides, maker, contour, a);",
            "                c.restated = true;",
            "            }",
            "            checkOppositeDistAngles(c.samples, a, b, edgeIds[c.first], edgeIds[i], op);",
            "            c.matched = true;",
            "            c.matchedDistance = b.distance;",
            "            c.matchedAngle = b.second;",
            "            continue;",
            "        }",
            "        const bool agrees =",
            "            a.byAngle == b.byAngle &&",
            "            (sameSide ? sameValue(a.distance, b.distance) && sameValue(a.second, b.second)",
            "                      : sameValue(a.distance, b.second) && sameValue(a.second, b.distance));",
            "        if (!agrees) {",
            "            throw std::runtime_error(tangentJoinMessage(",
            "                op, edgeIds[c.first], edgeIds[i],",
            "                \"a contour takes a single chamfer, so give them the same setback on each side\"));",
            "        }",
            "    }",
            "}",
            "/// Check per-edge chamfer arrays and resolve each edge's reference face: the",
            "/// given one (it must be adjacent to the edge), or for an empty list or a 0",
            "/// entry the edge's first adjacent face, the face `chamferAsymmetric` defaults to.",
            "template <typename Resolve>",
            "static std::vector<ChamferEdge> chamferEdges(const TopoDS_Shape& solid,",
            "                                             const std::vector<uint32_t>& edgeIds,",
            "                                             const std::vector<uint32_t>& referenceFaceIds,",
            "                                             const std::vector<double>& distances,",
            "                                             const std::vector<double>& seconds, bool byAngle,",
            "                                             const char* op, Resolve resolve) {",
            "    if (edgeIds.empty()) {",
            "        throw std::runtime_error(std::string(op) + \": no edges given\");",
            "    }",
            "    if (distances.size() != edgeIds.size() || seconds.size() != edgeIds.size() ||",
            "        (!referenceFaceIds.empty() && referenceFaceIds.size() != edgeIds.size())) {",
            "        throw std::runtime_error(std::string(op) +",
            "                                 \": per-edge arrays need one entry per edge \"",
            "                                 \"(referenceFaceIds may be empty)\");",
            "    }",
            "    NCollection_IndexedDataMap<TopoDS_Shape, NCollection_List<TopoDS_Shape>,",
            "                               TopTools_ShapeMapHasher>",
            "        edgeFaces;",
            "    TopExp::MapShapesAndAncestors(solid, TopAbs_EDGE, TopAbs_FACE, edgeFaces);",
            "    std::vector<ChamferEdge> result;",
            "    result.reserve(edgeIds.size());",
            "    for (size_t i = 0; i < edgeIds.size(); ++i) {",
            "        const double distance = distances[i];",
            "        const double second = seconds[i];",
            "        if (!(distance > 0.0 && std::isfinite(distance)) ||",
            "            (!byAngle && !(second > 0.0 && std::isfinite(second)))) {",
            "            throw std::runtime_error(std::string(op) +",
            "                                     \": every distance must be positive and finite\");",
            "        }",
            "        if (byAngle && !(second > 0.0 && second < M_PI / 2)) {",
            "            throw std::runtime_error(std::string(op) +",
            "                                     \": every angle must lie strictly between 0 and 90 degrees\");",
            "        }",
            "        const TopoDS_Edge edge = TopoDS::Edge(resolve(edgeIds[i]));",
            "        const int index = edgeFaces.FindIndex(edge);",
            "        if (index == 0) {",
            "            throw std::runtime_error(std::string(op) + \": edge \" + std::to_string(edgeIds[i]) +",
            "                                     \" is not on the solid\");",
            "        }",
            "        const NCollection_List<TopoDS_Shape>& adjacent = edgeFaces(index);",
            "        const uint32_t faceId = referenceFaceIds.empty() ? 0 : referenceFaceIds[i];",
            "        TopoDS_Face face;",
            "        if (faceId == 0) {",
            "            face = TopoDS::Face(adjacent.First());",
            "        } else {",
            "            // Keep the solid's own instance of the face: its orientation tells",
            "            // which side of a contour it lies on (see chamferSide).",
            "            const TopoDS_Shape& given = resolve(faceId);",
            "            for (const TopoDS_Shape& candidate : adjacent) {",
            "                if (candidate.IsSame(given)) face = TopoDS::Face(candidate);",
            "            }",
            "            if (face.IsNull()) {",
            "                throw std::runtime_error(std::string(op) + \": reference face \" +",
            "                                         std::to_string(faceId) + \" is not adjacent to edge \" +",
            "                                         std::to_string(edgeIds[i]));",
            "            }",
            "        }",
            "        result.push_back({edge, face, distance, second, byAngle, faceId != 0});",
            "    }",
            "    return result;",
            "}",
            "",
            "/// `BRepFilletAPI_MakeChamfer` keeps its `ChFi3d` builder private, so a chamfer",
            "/// that failed is rebuilt with `ChFi3d_ChBuilder` to read which contours failed.",
            "/// Only the failure path pays for the second build.",
            "static std::string chamferEdgesFailure(const TopoDS_Shape& solid,",
            "                                       const std::vector<uint32_t>& edgeIds,",
            "                                       const std::vector<ChamferEdge>& specs, const char* op) {",
            "    std::vector<TopoDS_Edge> edges;",
            "    edges.reserve(specs.size());",
            "    for (const ChamferEdge& spec : specs) edges.push_back(spec.edge);",
            "    try {",
            "        ChFi3d_ChBuilder builder(solid);",
            "        for (const ChamferEdge& spec : specs) addChamferEdge(builder, spec);",
            "        builder.Compute();",
            "        std::vector<int> faulty;",
            "        for (int i = 1; i <= builder.NbFaultyContours(); ++i) {",
            "            faulty.push_back(builder.FaultyContour(i));",
            "        }",
            "        return localOperationFailure(",
            "            op, edgeIds, edges, faulty,",
            "            [&](const TopoDS_Edge& e) { return builder.Contains(e); });",
            "    } catch (const Standard_Failure&) {",
            "        return std::string(op) + \": operation failed\";",
            "    }",
            "}",
            "",
            "static std::string chamferFailure(const TopoDS_Shape& solid, double distance,",
            "                                  const std::vector<uint32_t>& edgeIds,",
            "                                  const std::vector<TopoDS_Edge>& edges, const char* op) {",
            "    std::vector<ChamferEdge> specs;",
            "    specs.reserve(edges.size());",
            "    for (const TopoDS_Edge& edge : edges) {",
            "        specs.push_back({edge, TopoDS_Face(), distance, distance, false, false});",
            "    }",
            "    return chamferEdgesFailure(solid, edgeIds, specs, op);",
            "}",
        ] {
            let _ = writeln!(buf, "{line}");
        }
        let _ = writeln!(buf);
    }

    if needs_unwrap {
        for line in [
            "/// Unwrap a singleton compound: if `shape` is a Compound holding exactly one",
            "/// Solid, return that Solid.",
            "///",
            "/// `BRepFilletAPI_MakeFillet`/`MakeChamfer` wrap their result in a Compound even",
            "/// for single-solid input. A later call that expects a Solid then fails in the",
            "/// `TopoDS::Solid(...)` cast with Standard_TypeMismatch, which surfaces as a WASM",
            "/// trap -- so chaining two fillets cannot work. Restoring the Solid type here",
            "/// makes chaining behave as it does through OCP's direct pybind11 binding.",
            "static TopoDS_Shape unwrapSingletonSolid(const TopoDS_Shape& shape) {",
            "    if (shape.IsNull() || shape.ShapeType() != TopAbs_COMPOUND) return shape;",
            "    TopoDS_Shape onlySolid;",
            "    int count = 0;",
            "    for (TopExp_Explorer exp(shape, TopAbs_SOLID); exp.More(); exp.Next()) {",
            "        onlySolid = exp.Current();",
            "        if (++count > 1) return shape;  // multiple solids: keep the compound",
            "    }",
            "    return count == 1 ? onlySolid : shape;",
            "}",
        ] {
            let _ = writeln!(buf, "{line}");
        }
        let _ = writeln!(buf);

        for line in [
            "/// Validate a fillet/chamfer result, repairing when allowed.",
            "///",
            "/// `BRepFilletAPI_MakeFillet`/`MakeChamfer` can report `IsDone()` while producing",
            "/// a geometrically invalid solid (open shells where a blend runs off an edge).",
            "/// Returning that silently hands callers a non-watertight shape (#300). When",
            "/// `repair`, fix with `ShapeFix_Shape` and re-check, throwing only if it is still",
            "/// invalid. History-returning variants pass `repair == false`: a repair would",
            "/// alter topology and desync the Modified/Generated face maps buildEvolution",
            "/// reads from the maker, so they reject outright instead.",
            "///",
            "/// The check is topology-only (`BRepCheck_Analyzer`'s GeomControls = false):",
            "/// the failure mode is an open (non-watertight) shell, which is a topological",
            "/// defect, and skipping the geometric controls keeps the per-fillet cost small.",
            "///",
            "/// The result must also still hold a solid. Past the size a body can take,",
            "/// `ShapeFix_Shape` can turn the open result into a compound that checks",
            "/// valid but holds no solid, with a volume larger than the input's.",
            "static bool isSolidResult(const TopoDS_Shape& shape) {",
            "    return BRepCheck_Analyzer(shape, false).IsValid() &&",
            "           TopExp_Explorer(shape, TopAbs_SOLID).More();",
            "}",
            "",
            "static TopoDS_Shape validateFilletResult(const TopoDS_Shape& shape, const char* op,",
            "                                         bool repair) {",
            "    if (shape.IsNull() || isSolidResult(shape)) return shape;",
            "    if (repair) {",
            "        ShapeFix_Shape fixer(shape);",
            "        fixer.Perform();",
            "        TopoDS_Shape fixed = fixer.Shape();",
            "        if (!fixed.IsNull() && isSolidResult(fixed)) return fixed;",
            "    }",
            "    throw std::runtime_error(std::string(op) + \": produced an invalid solid\");",
            "}",
        ] {
            let _ = writeln!(buf, "{line}");
        }
        let _ = writeln!(buf);
    }

    if needs_evolution {
        for line in [
            "/// Append the Modified/Generated/Deleted history of `inputShape`'s faces to",
            "/// `evo`, for the faces whose hash is in `tracked`.",
            "static void appendEvolution(EvolutionData& evo, BRepBuilderAPI_MakeShape& maker,",
            "                            const TopoDS_Shape& inputShape,",
            "                            const std::unordered_set<int>& tracked, int hashUpperBound) {",
            "    // Every hash is a remainder by this bound, and a zero divisor traps.",
            "    if (hashUpperBound <= 0) {",
            "        throw std::runtime_error(\"hashUpperBound must be positive\");",
            "    }",
            "    auto hashShape = [&](const TopoDS_Shape& s) -> int {",
            "        return static_cast<int>(TopTools_ShapeMapHasher{}(s) % static_cast<size_t>(hashUpperBound));",
            "    };",
            "",
            "    for (TopExp_Explorer ex(inputShape, TopAbs_FACE); ex.More(); ex.Next()) {",
            "        const auto& face = ex.Current();",
            "        int faceHash = hashShape(face);",
            "        if (tracked.count(faceHash) == 0)",
            "            continue;",
            "",
            "        auto modifiedList = maker.Modified(face);",
            "        if (!modifiedList.IsEmpty()) {",
            "            evo.modified.push_back(faceHash);",
            "            evo.modified.push_back(static_cast<int>(modifiedList.Size()));",
            "            for (auto it = modifiedList.begin(); it != modifiedList.end(); ++it) {",
            "                evo.modified.push_back(hashShape(*it));",
            "            }",
            "        }",
            "",
            "        auto generatedList = maker.Generated(face);",
            "        if (!generatedList.IsEmpty()) {",
            "            evo.generated.push_back(faceHash);",
            "            evo.generated.push_back(static_cast<int>(generatedList.Size()));",
            "            for (auto it = generatedList.begin(); it != generatedList.end(); ++it) {",
            "                evo.generated.push_back(hashShape(*it));",
            "            }",
            "        }",
            "",
            "        if (maker.IsDeleted(face)) {",
            "            evo.deleted.push_back(faceHash);",
            "        }",
            "    }",
            "}",
            "",
            "/// Build evolution data by tracking Modified/Generated/Deleted faces.",
            "static EvolutionData buildEvolution(BRepBuilderAPI_MakeShape& maker, uint32_t resultId,",
            "                                    const TopoDS_Shape& inputShape,",
            "                                    const std::vector<int>& inputFaceHashes, int hashUpperBound) {",
            "    EvolutionData evo;",
            "    evo.resultId = resultId;",
            "    std::unordered_set<int> tracked(inputFaceHashes.begin(), inputFaceHashes.end());",
            "    appendEvolution(evo, maker, inputShape, tracked, hashUpperBound);",
            "    return evo;",
            "}",
        ] {
            let _ = writeln!(buf, "{line}");
        }
        let _ = writeln!(buf);
    }
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
    let _ = writeln!(buf, "#include <algorithm>");
    let _ = writeln!(buf, "#include <cmath>");
    let _ = writeln!(buf, "#include <cstdio>");
    let _ = writeln!(buf, "#include <cstdlib>");
    let _ = writeln!(buf, "#include <fstream>");
    let _ = writeln!(buf, "#include <iomanip>");
    let _ = writeln!(buf, "#include <set>");
    let _ = writeln!(buf, "#include <unordered_set>");
    let _ = writeln!(buf, "#include <sstream>");
    let _ = writeln!(buf, "#include <stdexcept>");
    let _ = writeln!(buf, "#include <string>");
    let _ = writeln!(buf, "#include <vector>");
    let _ = writeln!(buf);

    // Emit helper functions needed by generated methods.
    emit_helper_functions(&mut buf, methods);

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
                MethodKind::CustomBodyRaw => emit_custom_body_raw(&mut buf, spec),
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
    buf.trim_end().to_owned() + "\n"
}

/// Generate the contents of `facade/generated/bindings.cpp` as a reference
/// file.
///
/// This is **not** compiled or linked. It shows the `.function()` lines that
/// belong in the hand-written `facade/src/bindings.cpp` inside the
/// `class_<OcctKernel>("OcctKernel")` block.
/// Close an Embind chain: replace the trailing `)\n` with `);\n`.
/// Bind a `ReturnType::Bytes` method through a lambda that copies the bytes
/// into a fresh `Uint8Array`. Binding the member directly would hand Embind a
/// `std::string`, which it decodes as UTF-8 and so mangles every byte >= 0x80.
fn emit_bytes_binding(buf: &mut String, spec: &MethodSpec) {
    let name = spec.name;
    let params = param_list(spec.params);
    let args = spec
        .params
        .iter()
        .map(|p| p.name())
        .collect::<Vec<_>>()
        .join(", ");
    let _ = writeln!(
        buf,
        "        .function(\"{name}\", +[](OcctKernel& kernel, {params}) {{"
    );
    let _ = writeln!(
        buf,
        "            const std::string bytes = kernel.{name}({args});"
    );
    let _ = writeln!(
        buf,
        "            return val::global(\"Uint8Array\").new_(typed_memory_view("
    );
    let _ = writeln!(
        buf,
        "                bytes.size(), reinterpret_cast<const uint8_t*>(bytes.data())));"
    );
    let _ = writeln!(buf, "        }})");
}

fn close_embind_chain(buf: &mut String) {
    if buf.ends_with(")\n") {
        buf.truncate(buf.len() - 2);
        buf.push_str(");\n");
    }
}

/// Generate the contents of `facade/generated/bindings.cpp`.
///
/// This is a real, compilable file that registers all Embind bindings.
#[allow(clippy::too_many_lines)]
pub fn emit_bindings(methods: &[&MethodSpec]) -> String {
    let mut buf = String::with_capacity(4096);

    let _ = writeln!(
        buf,
        "// AUTO-GENERATED by cargo xtask codegen -- DO NOT EDIT"
    );
    let _ = writeln!(buf);
    let _ = writeln!(buf, "#include \"occt_kernel.h\"");
    let _ = writeln!(buf, "#include <cstdint>");
    let _ = writeln!(buf, "#include <emscripten/bind.h>");
    let _ = writeln!(buf);
    let _ = writeln!(buf, "using namespace emscripten;");
    let _ = writeln!(buf);
    let _ = writeln!(buf, "EMSCRIPTEN_BINDINGS(occt_wasm) {{");

    // Vector types. Each is given a dataPtr() returning the address of its
    // contiguous storage, so JS can read large results through one typed-array
    // view over the heap instead of N per-element get() boundary crossings.
    let _ = writeln!(buf, "    // Vector types");
    for (cpp_ty, js_name) in [
        ("uint32_t", "VectorUint32"),
        ("double", "VectorDouble"),
        ("int", "VectorInt"),
    ] {
        let _ = writeln!(buf, "    register_vector<{cpp_ty}>(\"{js_name}\")");
        let _ = writeln!(
            buf,
            "        .function(\"dataPtr\", +[](const std::vector<{cpp_ty}>& v) {{"
        );
        // unsigned int (not int): a heap address above 2 GB would become a
        // negative JS number, and slice(negativeStart) silently wraps instead
        // of throwing. Bit-identical on wasm32, but unambiguous.
        let _ = writeln!(
            buf,
            "            return static_cast<unsigned int>(reinterpret_cast<uintptr_t>(v.data()));"
        );
        let _ = writeln!(buf, "        }});");
    }
    let _ = writeln!(buf);

    // Struct registrations (static boilerplate)
    let _ = writeln!(buf, "    // MeshData");
    let _ = writeln!(buf, "    class_<MeshData>(\"MeshData\")");
    let _ = writeln!(
        buf,
        "        .function(\"getPositionsPtr\", &MeshData::getPositionsPtr)"
    );
    let _ = writeln!(
        buf,
        "        .function(\"getNormalsPtr\", &MeshData::getNormalsPtr)"
    );
    let _ = writeln!(
        buf,
        "        .function(\"getUvsPtr\", &MeshData::getUvsPtr)"
    );
    let _ = writeln!(
        buf,
        "        .function(\"getIndicesPtr\", &MeshData::getIndicesPtr)"
    );
    let _ = writeln!(
        buf,
        "        .property(\"positionCount\", &MeshData::positionCount)"
    );
    let _ = writeln!(buf, "        .property(\"uvCount\", &MeshData::uvCount)");
    let _ = writeln!(
        buf,
        "        .property(\"normalCount\", &MeshData::normalCount)"
    );
    let _ = writeln!(
        buf,
        "        .property(\"indexCount\", &MeshData::indexCount)"
    );
    let _ = writeln!(
        buf,
        "        .function(\"getFaceGroupsPtr\", &MeshData::getFaceGroupsPtr)"
    );
    let _ = writeln!(
        buf,
        "        .property(\"faceGroupCount\", &MeshData::faceGroupCount);"
    );
    let _ = writeln!(buf);

    let _ = writeln!(buf, "    // MeshBatchData");
    let _ = writeln!(buf, "    class_<MeshBatchData>(\"MeshBatchData\")");
    for field in &[
        "getPositionsPtr",
        "getNormalsPtr",
        "getIndicesPtr",
        "getShapeOffsetsPtr",
    ] {
        let _ = writeln!(
            buf,
            "        .function(\"{field}\", &MeshBatchData::{field})"
        );
    }
    for prop in &["positionCount", "normalCount", "indexCount", "shapeCount"] {
        let _ = writeln!(buf, "        .property(\"{prop}\", &MeshBatchData::{prop})");
    }
    // Last one gets semicolon
    close_embind_chain(&mut buf);
    let _ = writeln!(buf);

    let _ = writeln!(buf, "    // BBoxData");
    let _ = writeln!(buf, "    value_object<BBoxData>(\"BBoxData\")");
    for f in &["xmin", "ymin", "zmin", "xmax", "ymax", "zmax"] {
        let _ = writeln!(buf, "        .field(\"{f}\", &BBoxData::{f})");
    }
    close_embind_chain(&mut buf);
    let _ = writeln!(buf);

    let _ = writeln!(buf, "    // EdgeData");
    let _ = writeln!(buf, "    class_<EdgeData>(\"EdgeData\")");
    let _ = writeln!(
        buf,
        "        .function(\"getPointsPtr\", &EdgeData::getPointsPtr)"
    );
    let _ = writeln!(
        buf,
        "        .function(\"getEdgeGroupsPtr\", &EdgeData::getEdgeGroupsPtr)"
    );
    let _ = writeln!(
        buf,
        "        .property(\"pointCount\", &EdgeData::pointCount)"
    );
    let _ = writeln!(
        buf,
        "        .property(\"edgeGroupCount\", &EdgeData::edgeGroupCount);"
    );
    let _ = writeln!(buf);

    let _ = writeln!(buf, "    // ProjectionData");
    let _ = writeln!(buf, "    value_object<ProjectionData>(\"ProjectionData\")");
    for f in &[
        "visibleOutline",
        "visibleSmooth",
        "visibleSharp",
        "hiddenOutline",
        "hiddenSmooth",
        "hiddenSharp",
    ] {
        let _ = writeln!(buf, "        .field(\"{f}\", &ProjectionData::{f})");
    }
    close_embind_chain(&mut buf);
    let _ = writeln!(buf);

    let _ = writeln!(buf, "    // NurbsCurveData");
    let _ = writeln!(buf, "    class_<NurbsCurveData>(\"NurbsCurveData\")");
    for prop in &[
        "degree",
        "rational",
        "periodic",
        "knots",
        "multiplicities",
        "poles",
        "weights",
    ] {
        let _ = writeln!(
            buf,
            "        .property(\"{prop}\", &NurbsCurveData::{prop})"
        );
    }
    close_embind_chain(&mut buf);
    let _ = writeln!(buf);

    let _ = writeln!(buf, "    // EvolutionData");
    let _ = writeln!(buf, "    class_<EvolutionData>(\"EvolutionData\")");
    for prop in &["resultId", "modified", "generated", "deleted"] {
        let _ = writeln!(buf, "        .property(\"{prop}\", &EvolutionData::{prop})");
    }
    close_embind_chain(&mut buf);
    let _ = writeln!(buf);

    let _ = writeln!(buf, "    // XCAFLabelInfo");
    let _ = writeln!(buf, "    value_object<XCAFLabelInfo>(\"XCAFLabelInfo\")");
    for f in &[
        "labelId",
        "name",
        "hasColor",
        "r",
        "g",
        "b",
        "isAssembly",
        "isComponent",
        "shapeId",
    ] {
        let _ = writeln!(buf, "        .field(\"{f}\", &XCAFLabelInfo::{f})");
    }
    close_embind_chain(&mut buf);
    let _ = writeln!(buf);

    // OcctKernel method bindings — auto-generated from specs
    let _ = writeln!(buf, "    // OcctKernel");
    let _ = writeln!(buf, "    class_<OcctKernel>(\"OcctKernel\")");
    let _ = writeln!(buf, "        .constructor<>()");

    let groups = group_by_category(methods);
    for (category, specs) in &groups {
        let _ = writeln!(buf);
        let _ = writeln!(buf, "        // {category}");
        for spec in specs {
            let name = spec.name;
            if spec.return_type == ReturnType::Bytes {
                emit_bytes_binding(&mut buf, spec);
            } else {
                let _ = writeln!(buf, "        .function(\"{name}\", &OcctKernel::{name})");
            }
        }
    }

    close_embind_chain(&mut buf);

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

        assert!(output.contains("BRepAlgoAPI_Fuse op;"));
        assert!(output.contains("buildBoolean(op, get(a), get(b));"));
        assert_eq!(
            output.matches("op.Build();").count(),
            1,
            "only the helper builds"
        );
        assert!(output.contains("static void buildBoolean("));
        assert!(output.contains("static bool isFiniteShape("));
        assert!(output.contains("op.SetUseOBB(allFinite(args) && allFinite(tools));"));
        assert!(output.contains("op.HasErrors()"));
        assert!(output.contains("boolean operation failed"));
    }

    #[test]
    fn kernel_fillet_like_iterates_edges() {
        let methods: Vec<&MethodSpec> = vec![&FILLET];
        let output = emit_kernel(&methods);

        assert!(output.contains("for (uint32_t eid : edgeIds)"));
        assert!(output.contains("edges.push_back(TopoDS::Edge(get(eid)));"));
        assert!(output.contains("maker.Add(radius, edges.back())"));
        assert!(output.contains("#include <TopoDS.hxx>"));
    }

    #[test]
    fn kernel_fillet_like_names_faulty_edges() {
        let methods: Vec<&MethodSpec> = vec![&FILLET];
        let output = emit_kernel(&methods);

        assert!(output.contains(
            "throw std::runtime_error(filletFailure(maker, edgeIds, edges, \"fillet\"));"
        ));
        assert!(output.contains("static std::string filletFailure("));
        assert!(output.contains("static std::string chamferFailure("));
        assert!(output.contains("[faulty edges: "));
        assert!(output.contains("#include <ChFi3d_ChBuilder.hxx>"));
    }

    #[test]
    fn bindings_emits_compilable_embind() {
        let methods: Vec<&MethodSpec> = vec![&MAKE_BOX, &FUSE, &FILLET];
        let output = emit_bindings(&methods);

        assert!(output.contains("// AUTO-GENERATED by cargo xtask codegen"));
        assert!(output.contains("#include <emscripten/bind.h>"));
        assert!(output.contains("EMSCRIPTEN_BINDINGS(occt_wasm)"));
        assert!(output.contains(".function(\"makeBox\", &OcctKernel::makeBox)"));
        assert!(output.contains(".function(\"fuse\", &OcctKernel::fuse)"));
        assert!(output.contains(".function(\"fillet\", &OcctKernel::fillet)"));
        assert!(output.contains("class_<OcctKernel>(\"OcctKernel\")"));
    }

    #[test]
    fn bytes_return_binds_through_a_uint8array_copy() {
        static EXPORT_BYTES: MethodSpec = MethodSpec {
            name: "exportStlBinary",
            kind: MethodKind::CustomBodyRaw,
            params: &[
                FacadeParam::ShapeId("id"),
                FacadeParam::Double("linearDeflection"),
            ],
            return_type: ReturnType::Bytes,
            occt_class: "",
            ctor_args: "",
            setup_code: "return exportStl(id, linearDeflection, false);",
            includes: &[],
            category: "io",
        };
        let bindings = emit_bindings(&[&EXPORT_BYTES]);
        assert!(!bindings.contains("&OcctKernel::exportStlBinary"));
        assert!(bindings.contains(
            ".function(\"exportStlBinary\", +[](OcctKernel& kernel, uint32_t id, double linearDeflection) {"
        ));
        assert!(bindings.contains("kernel.exportStlBinary(id, linearDeflection)"));
        assert!(bindings.contains("val::global(\"Uint8Array\").new_(typed_memory_view("));

        let kernel = emit_kernel(&[&EXPORT_BYTES]);
        assert!(kernel.contains(
            "std::string OcctKernel::exportStlBinary(uint32_t id, double linearDeflection)"
        ));
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

    #[test]
    fn custom_body_bool_return() {
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
        let output = emit_kernel(&[&IS_VALID]);
        assert!(output.contains("bool OcctKernel::isValid(uint32_t id)"));
        assert!(output.contains("BRepCheck_Analyzer checker(get(id))"));
    }

    #[test]
    fn custom_body_void_return() {
        static BUILD_CURVES: MethodSpec = MethodSpec {
            name: "buildCurves3d",
            kind: MethodKind::CustomBody,
            params: &[FacadeParam::ShapeId("wireId")],
            return_type: ReturnType::Void,
            occt_class: "",
            ctor_args: "",
            setup_code: "BRepLib::BuildCurves3d(get(wireId));",
            includes: &["BRepLib.hxx"],
            category: "healing",
        };
        let output = emit_kernel(&[&BUILD_CURVES]);
        assert!(output.contains("void OcctKernel::buildCurves3d(uint32_t wireId)"));
        assert!(output.contains("BRepLib::BuildCurves3d(get(wireId))"));
    }
}
