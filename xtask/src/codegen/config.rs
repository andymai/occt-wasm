//! Declarative method configuration for the facade code generator.
//!
//! Each entry in [`TARGET_METHODS`] describes one `OcctKernel` method that
//! can be auto-generated from a template. Methods with complex multi-step
//! logic are marked [`MethodKind::Skip`] and remain hand-written.

use super::types::{FacadeParam, MethodKind, MethodSpec, ReturnType};

/// All facade methods that the code generator knows about.
///
/// Methods marked [`MethodKind::Skip`] are listed for completeness but
/// will not produce generated code.
static TARGET_METHODS: &[MethodSpec] = &[
    // ── Primitives ──────────────────────────────────────────────────
    MethodSpec {
        name: "makeBox",
        kind: MethodKind::SimpleShape,
        params: &[
            FacadeParam::Double("dx"),
            FacadeParam::Double("dy"),
            FacadeParam::Double("dz"),
        ],
        occt_class: "BRepPrimAPI_MakeBox",
        ctor_args: "dx, dy, dz",
        setup_code: "",
        includes: &[],
        category: "primitives",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeBoxFromCorners",
        kind: MethodKind::SimpleShape,
        params: &[
            FacadeParam::Double("x1"),
            FacadeParam::Double("y1"),
            FacadeParam::Double("z1"),
            FacadeParam::Double("x2"),
            FacadeParam::Double("y2"),
            FacadeParam::Double("z2"),
        ],
        occt_class: "BRepPrimAPI_MakeBox",
        ctor_args: "gp_Pnt(x1, y1, z1), gp_Pnt(x2, y2, z2)",
        setup_code: "",
        includes: &["gp_Pnt.hxx"],
        category: "primitives",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeCylinder",
        kind: MethodKind::SimpleShape,
        params: &[FacadeParam::Double("radius"), FacadeParam::Double("height")],
        occt_class: "BRepPrimAPI_MakeCylinder",
        ctor_args: "radius, height",
        setup_code: "",
        includes: &[],
        category: "primitives",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeSphere",
        kind: MethodKind::SimpleShape,
        params: &[FacadeParam::Double("radius")],
        occt_class: "BRepPrimAPI_MakeSphere",
        ctor_args: "radius",
        setup_code: "",
        includes: &[],
        category: "primitives",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeCone",
        kind: MethodKind::SimpleShape,
        params: &[
            FacadeParam::Double("r1"),
            FacadeParam::Double("r2"),
            FacadeParam::Double("height"),
        ],
        occt_class: "BRepPrimAPI_MakeCone",
        ctor_args: "r1, r2, height",
        setup_code: "",
        includes: &[],
        category: "primitives",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeTorus",
        kind: MethodKind::SimpleShape,
        params: &[
            FacadeParam::Double("majorRadius"),
            FacadeParam::Double("minorRadius"),
        ],
        occt_class: "BRepPrimAPI_MakeTorus",
        ctor_args: "majorRadius, minorRadius",
        setup_code: "",
        includes: &[],
        category: "primitives",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeEllipsoid",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::Double("rx"),
            FacadeParam::Double("ry"),
            FacadeParam::Double("rz"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
double maxR = std::max({rx, ry, rz});
BRepPrimAPI_MakeSphere sphereMaker(maxR);
sphereMaker.Build();
if (!sphereMaker.IsDone()) {
    throw std::runtime_error(\"makeEllipsoid: sphere construction failed\");
}
gp_GTrsf gt;
gt.SetValue(1, 1, rx / maxR);
gt.SetValue(2, 2, ry / maxR);
gt.SetValue(3, 3, rz / maxR);
BRepBuilderAPI_GTransform xform(sphereMaker.Shape(), gt, true);
if (!xform.IsDone()) {
    throw std::runtime_error(\"makeEllipsoid: transform failed\");
}
return store(xform.Shape());",
        includes: &[
            "BRepPrimAPI_MakeSphere.hxx",
            "BRepBuilderAPI_GTransform.hxx",
            "gp_GTrsf.hxx",
        ],
        category: "primitives",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeRectangle",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::Double("width"), FacadeParam::Double("height")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
gp_Pnt p0(0, 0, 0), p1(width, 0, 0), p2(width, height, 0), p3(0, height, 0);
BRepBuilderAPI_MakeWire wireMaker;
wireMaker.Add(BRepBuilderAPI_MakeEdge(p0, p1).Edge());
wireMaker.Add(BRepBuilderAPI_MakeEdge(p1, p2).Edge());
wireMaker.Add(BRepBuilderAPI_MakeEdge(p2, p3).Edge());
wireMaker.Add(BRepBuilderAPI_MakeEdge(p3, p0).Edge());
if (!wireMaker.IsDone()) {
    throw std::runtime_error(\"makeRectangle: wire construction failed\");
}
BRepBuilderAPI_MakeFace faceMaker(wireMaker.Wire());
if (!faceMaker.IsDone()) {
    throw std::runtime_error(\"makeRectangle: face construction failed\");
}
return store(faceMaker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeEdge.hxx",
            "BRepBuilderAPI_MakeFace.hxx",
            "BRepBuilderAPI_MakeWire.hxx",
            "gp_Pnt.hxx",
        ],
        category: "primitives",
        return_type: ReturnType::ShapeId,
    },
    // ── Booleans ────────────────────────────────────────────────────
    MethodSpec {
        name: "fuse",
        kind: MethodKind::BooleanOp,
        params: &[FacadeParam::ShapeId("a"), FacadeParam::ShapeId("b")],
        occt_class: "BRepAlgoAPI_Fuse",
        ctor_args: "get(a), get(b)",
        setup_code: "",
        includes: &[],
        category: "booleans",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "cut",
        kind: MethodKind::BooleanOp,
        params: &[FacadeParam::ShapeId("a"), FacadeParam::ShapeId("b")],
        occt_class: "BRepAlgoAPI_Cut",
        ctor_args: "get(a), get(b)",
        setup_code: "",
        includes: &[],
        category: "booleans",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "common",
        kind: MethodKind::BooleanOp,
        params: &[FacadeParam::ShapeId("a"), FacadeParam::ShapeId("b")],
        occt_class: "BRepAlgoAPI_Common",
        ctor_args: "get(a), get(b)",
        setup_code: "",
        includes: &[],
        category: "booleans",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "section",
        kind: MethodKind::BooleanOp,
        params: &[FacadeParam::ShapeId("a"), FacadeParam::ShapeId("b")],
        occt_class: "BRepAlgoAPI_Section",
        ctor_args: "get(a), get(b)",
        setup_code: "",
        includes: &[],
        category: "booleans",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "intersect",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("a"), FacadeParam::ShapeId("b")],
        occt_class: "",
        ctor_args: "",
        setup_code: "return common(a, b);",
        includes: &[],
        category: "booleans",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "fuseAll",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::VectorShapeIds("shapeIds")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
if (shapeIds.empty()) {
    throw std::runtime_error(\"fuseAll: no shapes provided\");
}
if (shapeIds.size() == 1) {
    return store(get(shapeIds[0]));
}
NCollection_List<TopoDS_Shape> args;
for (uint32_t sid : shapeIds) {
    args.Append(get(sid));
}
BRepAlgoAPI_BuilderAlgo builder;
builder.SetArguments(args);
builder.SetRunParallel(true);
builder.SetUseOBB(true);
builder.Build();
if (!builder.IsDone() || builder.HasErrors()) {
    throw std::runtime_error(\"fuseAll: operation failed\");
}
return store(builder.Shape());",
        includes: &["BRepAlgoAPI_BuilderAlgo.hxx", "NCollection_List.hxx", "TopoDS_Shape.hxx"],
        category: "booleans",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "cutAll",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("shapeId"), FacadeParam::VectorShapeIds("toolIds")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
if (toolIds.empty()) {
    return store(get(shapeId));
}
NCollection_List<TopoDS_Shape> args;
args.Append(get(shapeId));
NCollection_List<TopoDS_Shape> tools;
for (uint32_t tid : toolIds) {
    tools.Append(get(tid));
}
BRepAlgoAPI_Cut cutter;
cutter.SetArguments(args);
cutter.SetTools(tools);
cutter.SetRunParallel(true);
cutter.SetUseOBB(true);
cutter.Build();
if (!cutter.IsDone() || cutter.HasErrors()) {
    throw std::runtime_error(\"cutAll: operation failed\");
}
return store(cutter.Shape());",
        includes: &["BRepAlgoAPI_Cut.hxx", "NCollection_List.hxx", "TopoDS_Shape.hxx"],
        category: "booleans",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "booleanPipeline",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("baseId"),
            FacadeParam::VectorInt("opCodes"),
            FacadeParam::VectorShapeIds("toolIds"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
if (opCodes.size() != toolIds.size()) {
    throw std::runtime_error(\"booleanPipeline: opCodes and toolIds must have same length\");
}
TopoDS_Shape current = get(baseId);
for (size_t i = 0; i < opCodes.size(); i++) {
    const auto& tool = get(toolIds[i]);
    bool isLast = (i == opCodes.size() - 1);
    Message_ProgressRange progress;
    switch (opCodes[i]) {
    case 0: { BRepAlgoAPI_Fuse op(current, tool, progress); if (!op.IsDone() || op.HasErrors()) throw std::runtime_error(\"booleanPipeline: fuse step failed\"); current = op.Shape(); break; }
    case 1: { BRepAlgoAPI_Cut op(current, tool, progress); if (!op.IsDone() || op.HasErrors()) throw std::runtime_error(\"booleanPipeline: cut step failed\"); current = op.Shape(); break; }
    case 2: { BRepAlgoAPI_Common op(current, tool, progress); if (!op.IsDone() || op.HasErrors()) throw std::runtime_error(\"booleanPipeline: intersect step failed\"); current = op.Shape(); break; }
    default: throw std::runtime_error(\"booleanPipeline: unknown opCode\");
    }
    if (isLast) {
        ShapeUpgrade_UnifySameDomain upgrader(current, Standard_True, Standard_True, Standard_False);
        upgrader.Build();
        current = upgrader.Shape();
    }
}
return store(current);",
        includes: &[
            "BRepAlgoAPI_Fuse.hxx", "BRepAlgoAPI_Cut.hxx", "BRepAlgoAPI_Common.hxx",
            "ShapeUpgrade_UnifySameDomain.hxx", "Message_ProgressRange.hxx",
        ],
        category: "booleans",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "split",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("shapeId"), FacadeParam::VectorShapeIds("toolIds")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
NCollection_List<TopoDS_Shape> args;
args.Append(get(shapeId));
NCollection_List<TopoDS_Shape> tools;
for (uint32_t tid : toolIds) {
    tools.Append(get(tid));
}
BRepAlgoAPI_Splitter splitter;
splitter.SetArguments(args);
splitter.SetTools(tools);
splitter.Build();
if (!splitter.IsDone() || splitter.HasErrors()) {
    throw std::runtime_error(\"split: operation failed\");
}
return store(splitter.Shape());",
        includes: &["BRepAlgoAPI_Splitter.hxx", "NCollection_List.hxx", "TopoDS_Shape.hxx"],
        category: "booleans",
        return_type: ReturnType::ShapeId,
    },
    // ── Modeling ────────────────────────────────────────────────────
    MethodSpec {
        name: "extrude",
        kind: MethodKind::SimpleShape,
        params: &[
            FacadeParam::ShapeId("shapeId"),
            FacadeParam::Double("dx"),
            FacadeParam::Double("dy"),
            FacadeParam::Double("dz"),
        ],
        occt_class: "BRepPrimAPI_MakePrism",
        ctor_args: "get(shapeId), gp_Vec(dx, dy, dz)",
        setup_code: "",
        includes: &["gp_Vec.hxx"],
        category: "modeling",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "revolve",
        kind: MethodKind::SimpleShape,
        params: &[
            FacadeParam::ShapeId("shapeId"),
            FacadeParam::Double("px"),
            FacadeParam::Double("py"),
            FacadeParam::Double("pz"),
            FacadeParam::Double("dx"),
            FacadeParam::Double("dy"),
            FacadeParam::Double("dz"),
            FacadeParam::Double("angleRad"),
        ],
        occt_class: "BRepPrimAPI_MakeRevol",
        ctor_args: "get(shapeId), gp_Ax1(gp_Pnt(px, py, pz), gp_Dir(dx, dy, dz)), angleRad",
        setup_code: "",
        includes: &["gp_Ax1.hxx", "gp_Dir.hxx", "gp_Pnt.hxx"],
        category: "modeling",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "fillet",
        kind: MethodKind::FilletLike,
        params: &[
            FacadeParam::ShapeId("solidId"),
            FacadeParam::VectorShapeIds("edgeIds"),
            FacadeParam::Double("radius"),
        ],
        occt_class: "BRepFilletAPI_MakeFillet",
        ctor_args: "TopoDS::Solid(get(solidId))",
        setup_code: "",
        includes: &["TopoDS.hxx"],
        category: "modeling",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "chamfer",
        kind: MethodKind::FilletLike,
        params: &[
            FacadeParam::ShapeId("solidId"),
            FacadeParam::VectorShapeIds("edgeIds"),
            FacadeParam::Double("distance"),
        ],
        occt_class: "BRepFilletAPI_MakeChamfer",
        ctor_args: "TopoDS::Solid(get(solidId))",
        setup_code: "",
        includes: &["TopoDS.hxx"],
        category: "modeling",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "chamferDistAngle",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("solidId"), FacadeParam::VectorShapeIds("edgeIds"),
            FacadeParam::Double("distance"), FacadeParam::Double("angleDeg"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
double angleRad = angleDeg * M_PI / 180.0;
const auto& solid = get(solidId);
BRepFilletAPI_MakeChamfer maker(TopoDS::Solid(solid));
for (uint32_t eid : edgeIds) {
    const TopoDS_Edge& edge = TopoDS::Edge(get(eid));
    TopoDS_Face adjFace;
    for (TopExp_Explorer ex(solid, TopAbs_FACE); ex.More(); ex.Next()) {
        const TopoDS_Face& f = TopoDS::Face(ex.Current());
        for (TopExp_Explorer ex2(f, TopAbs_EDGE); ex2.More(); ex2.Next()) {
            if (ex2.Current().IsSame(edge)) { adjFace = f; break; }
        }
        if (!adjFace.IsNull()) break;
    }
    if (adjFace.IsNull()) {
        throw std::runtime_error(\"chamferDistAngle: no adjacent face found for edge\");
    }
    maker.AddDA(distance, angleRad, edge, adjFace);
}
maker.Build();
if (!maker.IsDone()) {
    throw std::runtime_error(\"chamferDistAngle: operation failed\");
}
return store(maker.Shape());",
        includes: &["BRepFilletAPI_MakeChamfer.hxx", "TopExp_Explorer.hxx", "TopoDS.hxx"],
        category: "modeling",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "shell",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("solidId"), FacadeParam::VectorShapeIds("faceIds"),
            FacadeParam::Double("thickness"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
NCollection_List<TopoDS_Shape> facesToRemove;
for (uint32_t fid : faceIds) {
    facesToRemove.Append(get(fid));
}
BRepOffsetAPI_MakeThickSolid maker;
maker.MakeThickSolidByJoin(get(solidId), facesToRemove, thickness, 1e-3);
maker.Build();
if (!maker.IsDone()) {
    throw std::runtime_error(\"shell: operation failed\");
}
return store(maker.Shape());",
        includes: &["BRepOffsetAPI_MakeThickSolid.hxx", "NCollection_List.hxx"],
        category: "modeling",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "offset",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("solidId"), FacadeParam::Double("distance")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepOffsetAPI_MakeOffsetShape maker;
maker.PerformByJoin(get(solidId), distance, 1e-3);
maker.Build();
if (!maker.IsDone()) {
    throw std::runtime_error(\"offset: operation failed\");
}
return store(maker.Shape());",
        includes: &["BRepOffsetAPI_MakeOffsetShape.hxx"],
        category: "modeling",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "draft",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("shapeId"), FacadeParam::ShapeId("faceId"),
            FacadeParam::Double("angleRad"),
            FacadeParam::Double("dx"), FacadeParam::Double("dy"), FacadeParam::Double("dz"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
gp_Dir pullDir(dx, dy, dz);
BRepOffsetAPI_DraftAngle maker(get(shapeId));
maker.Add(TopoDS::Face(get(faceId)), pullDir, angleRad, gp_Pln());
maker.Build();
if (!maker.IsDone()) {
    throw std::runtime_error(\"draft: operation failed\");
}
return store(maker.Shape());",
        includes: &["BRepOffsetAPI_DraftAngle.hxx", "TopoDS.hxx", "gp_Dir.hxx"],
        category: "modeling",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "thicken",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("shapeId"), FacadeParam::Double("thickness")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(shapeId);
if (shape.ShapeType() == TopAbs_FACE || shape.ShapeType() == TopAbs_SHELL) {
    BRepOffset_MakeOffset offsetMaker;
    offsetMaker.Initialize(shape, thickness, 1e-3, BRepOffset_Skin, false, false, GeomAbs_Arc, true);
    offsetMaker.MakeOffsetShape();
    if (!offsetMaker.IsDone()) {
        throw std::runtime_error(\"thicken: offset operation failed\");
    }
    return store(offsetMaker.Shape());
}
NCollection_List<TopoDS_Shape> emptyList;
BRepOffsetAPI_MakeThickSolid maker;
maker.MakeThickSolidByJoin(shape, emptyList, thickness, 1e-3);
maker.Build();
if (!maker.IsDone()) {
    throw std::runtime_error(\"thicken: operation failed\");
}
return store(maker.Shape());",
        includes: &[
            "BRepOffset_MakeOffset.hxx", "BRepOffset_Mode.hxx",
            "BRepOffsetAPI_MakeThickSolid.hxx", "NCollection_List.hxx",
            "GeomAbs_JoinType.hxx",
        ],
        category: "modeling",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "defeature",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("shapeId"), FacadeParam::VectorShapeIds("faceIds")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
NCollection_List<TopoDS_Shape> facesToRemove;
for (uint32_t fid : faceIds) {
    facesToRemove.Append(get(fid));
}
BRepOffsetAPI_MakeThickSolid maker;
maker.MakeThickSolidByJoin(get(shapeId), facesToRemove, 0.0, 1e-3);
maker.Build();
if (!maker.IsDone()) {
    throw std::runtime_error(\"defeature: operation failed\");
}
return store(maker.Shape());",
        includes: &["BRepOffsetAPI_MakeThickSolid.hxx", "NCollection_List.hxx"],
        category: "modeling",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "reverseShape",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "return store(get(id).Reversed());",
        includes: &[],
        category: "modeling",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "simplify",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "return unifySameDomain(id);",
        includes: &[],
        category: "modeling",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "filletVariable",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("solidId"), FacadeParam::ShapeId("edgeId"),
            FacadeParam::Double("startRadius"), FacadeParam::Double("endRadius"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepFilletAPI_MakeFillet maker(TopoDS::Solid(get(solidId)));
maker.Add(startRadius, endRadius, TopoDS::Edge(get(edgeId)));
maker.Build();
if (!maker.IsDone()) {
    throw std::runtime_error(\"filletVariable: operation failed\");
}
return store(maker.Shape());",
        includes: &["BRepFilletAPI_MakeFillet.hxx", "TopoDS.hxx"],
        category: "modeling",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "offsetWire2D",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("wireId"), FacadeParam::Double("offset"),
            FacadeParam::Int("joinType"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
GeomAbs_JoinType jt;
switch (joinType) {
case 1: jt = GeomAbs_Intersection; break;
case 2: jt = GeomAbs_Tangent; break;
default: jt = GeomAbs_Arc; break;
}
BRepOffsetAPI_MakeOffset maker(TopoDS::Wire(get(wireId)), jt);
maker.Perform(offset);
if (!maker.IsDone()) {
    throw std::runtime_error(\"offsetWire2D: operation failed\");
}
return store(maker.Shape());",
        includes: &["BRepOffsetAPI_MakeOffset.hxx", "GeomAbs_JoinType.hxx", "TopoDS.hxx"],
        category: "modeling",
        return_type: ReturnType::ShapeId,
    },
    // ── Transforms ────────────────────────────────────────────────
    MethodSpec {
        name: "translate",
        kind: MethodKind::SetupShape,
        params: &[
            FacadeParam::ShapeId("id"),
            FacadeParam::Double("dx"),
            FacadeParam::Double("dy"),
            FacadeParam::Double("dz"),
        ],
        occt_class: "BRepBuilderAPI_Transform",
        ctor_args: "get(id), trsf, true",
        setup_code: "gp_Trsf trsf;\ntrsf.SetTranslation(gp_Vec(dx, dy, dz));",
        includes: &["gp_Trsf.hxx", "gp_Vec.hxx"],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "rotate",
        kind: MethodKind::SetupShape,
        params: &[
            FacadeParam::ShapeId("id"),
            FacadeParam::Double("px"),
            FacadeParam::Double("py"),
            FacadeParam::Double("pz"),
            FacadeParam::Double("dx"),
            FacadeParam::Double("dy"),
            FacadeParam::Double("dz"),
            FacadeParam::Double("angleRad"),
        ],
        occt_class: "BRepBuilderAPI_Transform",
        ctor_args: "get(id), trsf, true",
        setup_code: "gp_Trsf trsf;\ntrsf.SetRotation(gp_Ax1(gp_Pnt(px, py, pz), gp_Dir(dx, dy, dz)), angleRad);",
        includes: &["gp_Trsf.hxx", "gp_Ax1.hxx", "gp_Pnt.hxx", "gp_Dir.hxx"],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "scale",
        kind: MethodKind::SetupShape,
        params: &[
            FacadeParam::ShapeId("id"),
            FacadeParam::Double("px"),
            FacadeParam::Double("py"),
            FacadeParam::Double("pz"),
            FacadeParam::Double("factor"),
        ],
        occt_class: "BRepBuilderAPI_Transform",
        ctor_args: "get(id), trsf, true",
        setup_code: "gp_Trsf trsf;\ntrsf.SetScale(gp_Pnt(px, py, pz), factor);",
        includes: &["gp_Trsf.hxx", "gp_Pnt.hxx"],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "mirror",
        kind: MethodKind::SetupShape,
        params: &[
            FacadeParam::ShapeId("id"),
            FacadeParam::Double("px"),
            FacadeParam::Double("py"),
            FacadeParam::Double("pz"),
            FacadeParam::Double("nx"),
            FacadeParam::Double("ny"),
            FacadeParam::Double("nz"),
        ],
        occt_class: "BRepBuilderAPI_Transform",
        ctor_args: "get(id), trsf, true",
        setup_code: "gp_Trsf trsf;\ntrsf.SetMirror(gp_Ax2(gp_Pnt(px, py, pz), gp_Dir(nx, ny, nz)));",
        includes: &["gp_Trsf.hxx", "gp_Ax2.hxx", "gp_Pnt.hxx", "gp_Dir.hxx"],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "copy",
        kind: MethodKind::SetupShape,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "BRepBuilderAPI_Copy",
        ctor_args: "get(id)",
        setup_code: "",
        includes: &[],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "linearPattern",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("id"),
            FacadeParam::Double("dx"), FacadeParam::Double("dy"), FacadeParam::Double("dz"),
            FacadeParam::Double("spacing"),
            FacadeParam::Int("count"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
TopoDS_Compound compound;
TopoDS_Builder builder;
builder.MakeCompound(compound);
const auto& original = get(id);
builder.Add(compound, original);
gp_Vec step(dx, dy, dz);
step.Normalize();
step.Multiply(spacing);
for (int i = 1; i < count; i++) {
    gp_Trsf trsf;
    gp_Vec offset = step.Multiplied(static_cast<double>(i));
    trsf.SetTranslation(offset);
    BRepBuilderAPI_Transform xform(original, trsf, true);
    builder.Add(compound, xform.Shape());
}
return store(compound);",
        includes: &["TopoDS_Compound.hxx", "TopoDS_Builder.hxx", "gp_Vec.hxx", "gp_Trsf.hxx", "BRepBuilderAPI_Transform.hxx"],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "circularPattern",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("id"),
            FacadeParam::Double("cx"), FacadeParam::Double("cy"), FacadeParam::Double("cz"),
            FacadeParam::Double("ax"), FacadeParam::Double("ay"), FacadeParam::Double("az"),
            FacadeParam::Double("angle"),
            FacadeParam::Int("count"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
TopoDS_Compound compound;
TopoDS_Builder builder;
builder.MakeCompound(compound);
const auto& original = get(id);
builder.Add(compound, original);
gp_Ax1 axis(gp_Pnt(cx, cy, cz), gp_Dir(ax, ay, az));
double stepAngle = angle / static_cast<double>(count);
for (int i = 1; i < count; i++) {
    gp_Trsf trsf;
    trsf.SetRotation(axis, stepAngle * static_cast<double>(i));
    BRepBuilderAPI_Transform xform(original, trsf, true);
    builder.Add(compound, xform.Shape());
}
return store(compound);",
        includes: &["TopoDS_Compound.hxx", "TopoDS_Builder.hxx", "gp_Ax1.hxx", "gp_Pnt.hxx", "gp_Dir.hxx", "gp_Trsf.hxx", "BRepBuilderAPI_Transform.hxx"],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "transform",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id"), FacadeParam::VectorDouble("matrix")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
if (matrix.size() != 12) {
    throw std::runtime_error(\"transform: matrix must have 12 elements (3x4)\");
}
gp_Trsf trsf;
trsf.SetValues(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5], matrix[6],
               matrix[7], matrix[8], matrix[9], matrix[10], matrix[11]);
BRepBuilderAPI_Transform maker(get(id), trsf, true);
return store(maker.Shape());",
        includes: &["gp_Trsf.hxx", "BRepBuilderAPI_Transform.hxx"],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "generalTransform",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id"), FacadeParam::VectorDouble("matrix")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
if (matrix.size() != 12) {
    throw std::runtime_error(\"generalTransform: matrix must have 12 elements (3x4)\");
}
gp_GTrsf gt;
gt.SetValue(1, 1, matrix[0]); gt.SetValue(1, 2, matrix[1]); gt.SetValue(1, 3, matrix[2]); gt.SetValue(1, 4, matrix[3]);
gt.SetValue(2, 1, matrix[4]); gt.SetValue(2, 2, matrix[5]); gt.SetValue(2, 3, matrix[6]); gt.SetValue(2, 4, matrix[7]);
gt.SetValue(3, 1, matrix[8]); gt.SetValue(3, 2, matrix[9]); gt.SetValue(3, 3, matrix[10]); gt.SetValue(3, 4, matrix[11]);
BRepBuilderAPI_GTransform maker(get(id), gt, true);
if (!maker.IsDone()) {
    throw std::runtime_error(\"generalTransform: transform failed\");
}
return store(maker.Shape());",
        includes: &["gp_GTrsf.hxx", "BRepBuilderAPI_GTransform.hxx"],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "translateBatch",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::VectorShapeIds("ids"), FacadeParam::VectorDouble("offsets")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
if (offsets.size() != ids.size() * 3) {
    throw std::runtime_error(\"translateBatch: offsets must have 3 * ids.size() elements\");
}
std::vector<uint32_t> results;
results.reserve(ids.size());
for (size_t i = 0; i < ids.size(); i++) {
    gp_Trsf trsf;
    trsf.SetTranslation(gp_Vec(offsets[i * 3], offsets[i * 3 + 1], offsets[i * 3 + 2]));
    BRepBuilderAPI_Transform maker(get(ids[i]), trsf, true);
    results.push_back(store(maker.Shape()));
}
return results;",
        includes: &["gp_Trsf.hxx", "gp_Vec.hxx", "BRepBuilderAPI_Transform.hxx"],
        category: "transforms",
        return_type: ReturnType::VectorUint32,
    },
    MethodSpec {
        name: "composeTransform",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::VectorDouble("m1"), FacadeParam::VectorDouble("m2")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
if (m1.size() != 12 || m2.size() != 12) {
    throw std::runtime_error(\"composeTransform: each matrix must have 12 elements\");
}
gp_Trsf t1, t2;
t1.SetValues(m1[0], m1[1], m1[2], m1[3], m1[4], m1[5], m1[6], m1[7], m1[8], m1[9], m1[10], m1[11]);
t2.SetValues(m2[0], m2[1], m2[2], m2[3], m2[4], m2[5], m2[6], m2[7], m2[8], m2[9], m2[10], m2[11]);
gp_Trsf result = t1.Multiplied(t2);
return {result.Value(1, 1), result.Value(1, 2), result.Value(1, 3), result.Value(1, 4),
        result.Value(2, 1), result.Value(2, 2), result.Value(2, 3), result.Value(2, 4),
        result.Value(3, 1), result.Value(3, 2), result.Value(3, 3), result.Value(3, 4)};",
        includes: &["gp_Trsf.hxx"],
        category: "transforms",
        return_type: ReturnType::VectorDouble,
    },
    // ── Sweeps ──────────────────────────────────────────────────
    MethodSpec {
        name: "pipe",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("profileId"),
            FacadeParam::ShapeId("spineId"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepOffsetAPI_MakePipe maker(TopoDS::Wire(get(spineId)), get(profileId));
maker.Build();
if (!maker.IsDone()) {
    throw std::runtime_error(\"pipe: operation failed\");
}
return store(maker.Shape());",
        includes: &["BRepOffsetAPI_MakePipe.hxx", "TopoDS.hxx"],
        category: "sweep",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "simplePipe",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("profileId"),
            FacadeParam::ShapeId("spineId"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "return pipe(profileId, spineId);",
        includes: &[],
        category: "sweep",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "revolveVec",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("shapeId"),
            FacadeParam::Double("cx"),
            FacadeParam::Double("cy"),
            FacadeParam::Double("cz"),
            FacadeParam::Double("dx"),
            FacadeParam::Double("dy"),
            FacadeParam::Double("dz"),
            FacadeParam::Double("angle"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "return revolve(shapeId, cx, cy, cz, dx, dy, dz, angle);",
        includes: &[],
        category: "sweep",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "loft",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::VectorShapeIds("wireIds"),
            FacadeParam::Bool("isSolid"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepOffsetAPI_ThruSections maker(isSolid);
for (uint32_t wid : wireIds) {
    maker.AddWire(TopoDS::Wire(get(wid)));
}
maker.Build();
if (!maker.IsDone()) {
    throw std::runtime_error(\"loft: operation failed\");
}
return store(maker.Shape());",
        includes: &["BRepOffsetAPI_ThruSections.hxx", "TopoDS.hxx"],
        category: "sweep",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "loftWithVertices",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::VectorShapeIds("wireIds"),
            FacadeParam::Bool("isSolid"),
            FacadeParam::ShapeId("startVertexId"),
            FacadeParam::ShapeId("endVertexId"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepOffsetAPI_ThruSections maker(isSolid);
if (startVertexId != 0) {
    maker.AddVertex(TopoDS::Vertex(get(startVertexId)));
}
for (uint32_t wid : wireIds) {
    maker.AddWire(TopoDS::Wire(get(wid)));
}
if (endVertexId != 0) {
    maker.AddVertex(TopoDS::Vertex(get(endVertexId)));
}
maker.Build();
if (!maker.IsDone()) {
    throw std::runtime_error(\"loftWithVertices: operation failed\");
}
return store(maker.Shape());",
        includes: &["BRepOffsetAPI_ThruSections.hxx", "TopoDS.hxx"],
        category: "sweep",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "sweep",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("wireId"),
            FacadeParam::ShapeId("spineId"),
            FacadeParam::Int("transitionMode"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepOffsetAPI_MakePipeShell maker(TopoDS::Wire(get(spineId)));
maker.SetTransitionMode(static_cast<BRepBuilderAPI_TransitionMode>(transitionMode));
maker.Add(get(wireId));
maker.Build();
if (!maker.IsDone()) {
    throw std::runtime_error(\"sweep: operation failed\");
}
if (maker.MakeSolid()) {
    return store(maker.Shape());
}
return store(maker.Shape());",
        includes: &[
            "BRepOffsetAPI_MakePipeShell.hxx",
            "BRepBuilderAPI_TransitionMode.hxx",
            "TopoDS.hxx",
        ],
        category: "sweep",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "sweepPipeShell",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("profileId"),
            FacadeParam::ShapeId("spineId"),
            FacadeParam::Bool("freenet"),
            FacadeParam::Bool("smooth"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepOffsetAPI_MakePipeShell maker(TopoDS::Wire(get(spineId)));
if (freenet) {
    maker.SetMode(true);
}
if (smooth) {
    maker.SetTransitionMode(BRepBuilderAPI_RoundCorner);
}
maker.Add(get(profileId));
maker.Build();
if (!maker.IsDone()) {
    throw std::runtime_error(\"sweepPipeShell: operation failed\");
}
maker.MakeSolid();
return store(maker.Shape());",
        includes: &[
            "BRepOffsetAPI_MakePipeShell.hxx",
            "BRepBuilderAPI_TransitionMode.hxx",
            "TopoDS.hxx",
        ],
        category: "sweep",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "draftPrism",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("shapeId"),
            FacadeParam::Double("dx"),
            FacadeParam::Double("dy"),
            FacadeParam::Double("dz"),
            FacadeParam::Double("angleDeg"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepPrimAPI_MakePrism maker(get(shapeId), gp_Vec(dx, dy, dz));
maker.Build();
if (!maker.IsDone()) {
    throw std::runtime_error(\"draftPrism: operation failed\");
}
return store(maker.Shape());",
        includes: &["BRepPrimAPI_MakePrism.hxx", "gp_Vec.hxx"],
        category: "sweep",
        return_type: ReturnType::ShapeId,
    },
    // ── Healing ──────────────────────────────────────────────────
    MethodSpec {
        name: "fixShape",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
ShapeFix_Shape fixer(get(id));
fixer.Perform();
return store(fixer.Shape());",
        includes: &["ShapeFix_Shape.hxx"],
        category: "healing",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "unifySameDomain",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
ShapeUpgrade_UnifySameDomain upgrader(get(id), true, true, false);
upgrader.Build();
return store(upgrader.Shape());",
        includes: &["ShapeUpgrade_UnifySameDomain.hxx"],
        category: "healing",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "isValid",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepCheck_Analyzer checker(get(id));
return checker.IsValid();",
        includes: &["BRepCheck_Analyzer.hxx"],
        category: "healing",
        return_type: ReturnType::Bool,
    },
    MethodSpec {
        name: "healSolid",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id"), FacadeParam::Double("tolerance")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
Handle(ShapeFix_Solid) fixer = new ShapeFix_Solid(TopoDS::Solid(get(id)));
fixer->SetPrecision(tolerance);
fixer->Perform();
return store(fixer->Shape());",
        includes: &["ShapeFix_Solid.hxx", "TopoDS.hxx"],
        category: "healing",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "healFace",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id"), FacadeParam::Double("tolerance")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
ShapeFix_Face fixer(TopoDS::Face(get(id)));
fixer.SetPrecision(tolerance);
fixer.Perform();
return store(fixer.Face());",
        includes: &["ShapeFix_Face.hxx", "TopoDS.hxx"],
        category: "healing",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "healWire",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id"), FacadeParam::Double("tolerance")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
ShapeFix_Wire fixer;
fixer.Load(TopoDS::Wire(get(id)));
fixer.SetPrecision(tolerance);
fixer.Perform();
return store(fixer.Wire());",
        includes: &["ShapeFix_Wire.hxx", "TopoDS.hxx"],
        category: "healing",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "fixFaceOrientations",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
ShapeFix_Shape fixer(get(id));
fixer.Perform();
return store(fixer.Shape());",
        includes: &["ShapeFix_Shape.hxx"],
        category: "healing",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "buildCurves3d",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("wireId")],
        occt_class: "",
        ctor_args: "",
        setup_code: "BRepLib::BuildCurves3d(get(wireId));",
        includes: &["BRepLib.hxx"],
        category: "healing",
        return_type: ReturnType::Void,
    },
    MethodSpec {
        name: "fixWireOnFace",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("wireId"),
            FacadeParam::ShapeId("faceId"),
            FacadeParam::Double("tolerance"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
ShapeFix_Wire fixer(TopoDS::Wire(get(wireId)), TopoDS::Face(get(faceId)), tolerance);
fixer.FixEdgeCurves();
return store(fixer.Wire());",
        includes: &["ShapeFix_Wire.hxx", "TopoDS.hxx"],
        category: "healing",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "removeDegenerateEdges",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
ShapeFix_Shape fixer(get(id));
fixer.Perform();
return store(fixer.Shape());",
        includes: &["ShapeFix_Shape.hxx"],
        category: "healing",
        return_type: ReturnType::ShapeId,
    },
];

/// Returns the complete list of facade method specifications.
///
/// The returned slice includes both generable methods and skipped methods.
/// Filter on [`MethodKind::Skip`] to get only the methods that should
/// produce generated code.
pub fn target_methods() -> &'static [MethodSpec] {
    TARGET_METHODS
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generable_method_count() {
        let count = target_methods()
            .iter()
            .filter(|m| m.kind != MethodKind::Skip)
            .count();
        assert_eq!(count, 60, "expected 60 generable methods");
    }

    #[test]
    fn all_generable_methods_have_occt_class_or_custom_body() {
        for m in target_methods() {
            if m.kind != MethodKind::Skip && m.kind != MethodKind::CustomBody {
                assert!(
                    !m.occt_class.is_empty(),
                    "generable method '{}' is missing occt_class",
                    m.name,
                );
            }
        }
    }

    #[test]
    fn skip_methods_have_empty_fields() {
        for m in target_methods() {
            if m.kind == MethodKind::Skip {
                assert!(
                    m.params.is_empty(),
                    "skipped method '{}' should have empty params",
                    m.name,
                );
            }
        }
    }
}
