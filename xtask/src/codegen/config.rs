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
    // ── Kernel (arena management) ───────────────────────────────────
    MethodSpec {
        name: "release",
        kind: MethodKind::DirectCall,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "arena_.erase(id)",
        setup_code: "",
        includes: &[],
        category: "kernel",
        return_type: ReturnType::Void,
    },
    MethodSpec {
        name: "releaseAll",
        kind: MethodKind::CustomBody,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "arena_.clear();\nnextId_ = 1;",
        includes: &[],
        category: "kernel",
        return_type: ReturnType::Void,
    },
    MethodSpec {
        name: "getShapeCount",
        kind: MethodKind::DirectCall,
        params: &[],
        occt_class: "",
        ctor_args: "static_cast<uint32_t>(arena_.size())",
        setup_code: "",
        includes: &[],
        category: "kernel",
        return_type: ReturnType::Uint32,
    },
    MethodSpec {
        name: "makeNullShape",
        kind: MethodKind::DirectCall,
        params: &[],
        occt_class: "",
        ctor_args: "store(TopoDS_Shape())",
        setup_code: "",
        includes: &[],
        category: "kernel",
        return_type: ReturnType::ShapeId,
    },
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
BRepPrimAPI_MakeSphere maker(maxR);
maker.Build();
if (!maker.IsDone()) {
    throw std::runtime_error(\"makeEllipsoid: sphere construction failed\");
}
// Scale non-uniformly to get ellipsoid
gp_GTrsf gt;
gt.SetValue(1, 1, rx / maxR);
gt.SetValue(2, 2, ry / maxR);
gt.SetValue(3, 3, rz / maxR);
BRepBuilderAPI_GTransform xform(maker.Shape(), gt, true);
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
        includes: &["BRepAlgoAPI_Section.hxx"],
        category: "booleans",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "intersect",
        kind: MethodKind::DirectCall,
        params: &[FacadeParam::ShapeId("a"), FacadeParam::ShapeId("b")],
        occt_class: "",
        ctor_args: "common(a, b)",
        setup_code: "",
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
        includes: &[
            "BRepAlgoAPI_BuilderAlgo.hxx",
            "NCollection_List.hxx",
            "TopoDS_Shape.hxx",
        ],
        category: "booleans",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "cutAll",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("shapeId"),
            FacadeParam::VectorShapeIds("toolIds"),
        ],
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
        includes: &[
            "BRepAlgoAPI_Cut.hxx",
            "NCollection_List.hxx",
            "TopoDS_Shape.hxx",
        ],
        category: "booleans",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "split",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("shapeId"),
            FacadeParam::VectorShapeIds("toolIds"),
        ],
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
        includes: &[
            "BRepAlgoAPI_Splitter.hxx",
            "NCollection_List.hxx",
            "TopoDS_Shape.hxx",
        ],
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
            FacadeParam::ShapeId("solidId"),
            FacadeParam::VectorShapeIds("edgeIds"),
            FacadeParam::Double("distance"),
            FacadeParam::Double("angleDeg"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
double angleRad = angleDeg * M_PI / 180.0;
const auto& solid = get(solidId);
BRepFilletAPI_MakeChamfer maker(TopoDS::Solid(solid));
for (uint32_t eid : edgeIds) {
    const TopoDS_Edge& edge = TopoDS::Edge(get(eid));
    // Find an adjacent face for this edge
    TopoDS_Face adjFace;
    for (TopExp_Explorer ex(solid, TopAbs_FACE); ex.More(); ex.Next()) {
        const TopoDS_Face& f = TopoDS::Face(ex.Current());
        for (TopExp_Explorer ex2(f, TopAbs_EDGE); ex2.More(); ex2.Next()) {
            if (ex2.Current().IsSame(edge)) {
                adjFace = f;
                break;
            }
        }
        if (!adjFace.IsNull())
            break;
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
        includes: &[
            "BRepFilletAPI_MakeChamfer.hxx",
            "TopExp_Explorer.hxx",
            "TopoDS.hxx",
        ],
        category: "modeling",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "shell",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("solidId"),
            FacadeParam::VectorShapeIds("faceIds"),
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
        params: &[
            FacadeParam::ShapeId("solidId"),
            FacadeParam::Double("distance"),
        ],
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
            FacadeParam::ShapeId("shapeId"),
            FacadeParam::ShapeId("faceId"),
            FacadeParam::Double("angleRad"),
            FacadeParam::Double("dx"),
            FacadeParam::Double("dy"),
            FacadeParam::Double("dz"),
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
        params: &[
            FacadeParam::ShapeId("shapeId"),
            FacadeParam::Double("thickness"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(shapeId);

// For faces/shells: use BRepOffset_MakeOffset to produce a solid
if (shape.ShapeType() == TopAbs_FACE || shape.ShapeType() == TopAbs_SHELL) {
    BRepOffset_MakeOffset offsetMaker;
    offsetMaker.Initialize(shape, thickness, 1e-3, BRepOffset_Skin, false, false,
                           GeomAbs_Arc, true);
    offsetMaker.MakeOffsetShape();
    if (!offsetMaker.IsDone()) {
        throw std::runtime_error(\"thicken: offset operation failed\");
    }
    return store(offsetMaker.Shape());
}

// For solids: use MakeThickSolid (hollow)
NCollection_List<TopoDS_Shape> emptyList;
BRepOffsetAPI_MakeThickSolid maker;
maker.MakeThickSolidByJoin(shape, emptyList, thickness, 1e-3);
maker.Build();
if (!maker.IsDone()) {
    throw std::runtime_error(\"thicken: operation failed\");
}
return store(maker.Shape());",
        includes: &[
            "BRepOffset_MakeOffset.hxx",
            "BRepOffset_Mode.hxx",
            "BRepOffsetAPI_MakeThickSolid.hxx",
            "GeomAbs_JoinType.hxx",
            "NCollection_List.hxx",
        ],
        category: "modeling",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "defeature",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("shapeId"),
            FacadeParam::VectorShapeIds("faceIds"),
        ],
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
        kind: MethodKind::DirectCall,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "store(get(id).Reversed())",
        setup_code: "",
        includes: &[],
        category: "modeling",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "simplify",
        kind: MethodKind::DirectCall,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "unifySameDomain(id)",
        setup_code: "",
        includes: &[],
        category: "modeling",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "filletVariable",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("solidId"),
            FacadeParam::ShapeId("edgeId"),
            FacadeParam::Double("startRadius"),
            FacadeParam::Double("endRadius"),
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
            FacadeParam::ShapeId("wireId"),
            FacadeParam::Double("offset"),
            FacadeParam::Int("joinType"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
GeomAbs_JoinType jt;
switch (joinType) {
case 1:
    jt = GeomAbs_Intersection;
    break;
case 2:
    jt = GeomAbs_Tangent;
    break;
default:
    jt = GeomAbs_Arc;
    break;
}
BRepOffsetAPI_MakeOffset maker(TopoDS::Wire(get(wireId)), jt);
maker.Perform(offset);
if (!maker.IsDone()) {
    throw std::runtime_error(\"offsetWire2D: operation failed\");
}
return store(maker.Shape());",
        includes: &[
            "BRepOffsetAPI_MakeOffset.hxx",
            "GeomAbs_JoinType.hxx",
            "TopoDS.hxx",
        ],
        category: "modeling",
        return_type: ReturnType::ShapeId,
    },
    // ── Sweep operations ────────────────────────────────────────────
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
        kind: MethodKind::DirectCall,
        params: &[
            FacadeParam::ShapeId("profileId"),
            FacadeParam::ShapeId("spineId"),
        ],
        occt_class: "",
        ctor_args: "pipe(profileId, spineId)",
        setup_code: "",
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
            "BRepBuilderAPI_TransitionMode.hxx",
            "BRepOffsetAPI_MakePipeShell.hxx",
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
    maker.SetMode(true); // FrenetBiNormal
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
            "BRepBuilderAPI_TransitionMode.hxx",
            "BRepOffsetAPI_MakePipeShell.hxx",
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
double angleRad = angleDeg * M_PI / 180.0;
gp_Vec dir(dx, dy, dz);
double length = dir.Magnitude();
if (length < 1e-10) {
    throw std::runtime_error(\"draftPrism: zero-length direction\");
}
dir.Normalize();
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
    MethodSpec {
        name: "revolveVec",
        kind: MethodKind::DirectCall,
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
        ctor_args: "revolve(shapeId, cx, cy, cz, dx, dy, dz, angle)",
        setup_code: "",
        includes: &[],
        category: "sweep",
        return_type: ReturnType::ShapeId,
    },
    // ── Shape construction ──────────────────────────────────────────
    MethodSpec {
        name: "makeVertex",
        kind: MethodKind::SetupShape,
        params: &[
            FacadeParam::Double("x"),
            FacadeParam::Double("y"),
            FacadeParam::Double("z"),
        ],
        occt_class: "BRepBuilderAPI_MakeVertex",
        ctor_args: "gp_Pnt(x, y, z)",
        setup_code: "",
        includes: &["gp_Pnt.hxx"],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeEdge",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("v1"), FacadeParam::ShapeId("v2")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepBuilderAPI_MakeEdge maker(TopoDS::Vertex(get(v1)), TopoDS::Vertex(get(v2)));
if (!maker.IsDone()) {
    throw std::runtime_error(\"makeEdge: construction failed\");
}
return store(maker.Shape());",
        includes: &["BRepBuilderAPI_MakeEdge.hxx", "TopoDS.hxx"],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeLineEdge",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::Double("x1"),
            FacadeParam::Double("y1"),
            FacadeParam::Double("z1"),
            FacadeParam::Double("x2"),
            FacadeParam::Double("y2"),
            FacadeParam::Double("z2"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepBuilderAPI_MakeEdge maker(gp_Pnt(x1, y1, z1), gp_Pnt(x2, y2, z2));
if (!maker.IsDone()) {
    throw std::runtime_error(\"makeLineEdge: construction failed\");
}
return store(maker.Shape());",
        includes: &["BRepBuilderAPI_MakeEdge.hxx", "gp_Pnt.hxx"],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeCircleEdge",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::Double("cx"),
            FacadeParam::Double("cy"),
            FacadeParam::Double("cz"),
            FacadeParam::Double("nx"),
            FacadeParam::Double("ny"),
            FacadeParam::Double("nz"),
            FacadeParam::Double("radius"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
gp_Ax2 axis(gp_Pnt(cx, cy, cz), gp_Dir(nx, ny, nz));
gp_Circ circle(axis, radius);
BRepBuilderAPI_MakeEdge maker(circle);
if (!maker.IsDone()) {
    throw std::runtime_error(\"makeCircleEdge: construction failed\");
}
return store(maker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeEdge.hxx",
            "gp_Ax2.hxx",
            "gp_Circ.hxx",
            "gp_Dir.hxx",
            "gp_Pnt.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeCircleArc",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::Double("cx"),
            FacadeParam::Double("cy"),
            FacadeParam::Double("cz"),
            FacadeParam::Double("nx"),
            FacadeParam::Double("ny"),
            FacadeParam::Double("nz"),
            FacadeParam::Double("radius"),
            FacadeParam::Double("startAngle"),
            FacadeParam::Double("endAngle"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
gp_Ax2 axis(gp_Pnt(cx, cy, cz), gp_Dir(nx, ny, nz));
gp_Circ circle(axis, radius);
Handle(Geom_TrimmedCurve) arc =
    new Geom_TrimmedCurve(new Geom_Circle(circle), startAngle, endAngle);
BRepBuilderAPI_MakeEdge maker(arc);
if (!maker.IsDone()) {
    throw std::runtime_error(\"makeCircleArc: construction failed\");
}
return store(maker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeEdge.hxx",
            "Geom_Circle.hxx",
            "Geom_TrimmedCurve.hxx",
            "gp_Ax2.hxx",
            "gp_Circ.hxx",
            "gp_Dir.hxx",
            "gp_Pnt.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeArcEdge",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::Double("x1"),
            FacadeParam::Double("y1"),
            FacadeParam::Double("z1"),
            FacadeParam::Double("x2"),
            FacadeParam::Double("y2"),
            FacadeParam::Double("z2"),
            FacadeParam::Double("x3"),
            FacadeParam::Double("y3"),
            FacadeParam::Double("z3"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
GC_MakeArcOfCircle arc(gp_Pnt(x1, y1, z1), gp_Pnt(x2, y2, z2), gp_Pnt(x3, y3, z3));
if (!arc.IsDone()) {
    throw std::runtime_error(\"makeArcEdge: construction failed\");
}
BRepBuilderAPI_MakeEdge maker(arc.Value());
if (!maker.IsDone()) {
    throw std::runtime_error(\"makeArcEdge: edge construction failed\");
}
return store(maker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeEdge.hxx",
            "GC_MakeArcOfCircle.hxx",
            "gp_Pnt.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeEllipseEdge",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::Double("cx"),
            FacadeParam::Double("cy"),
            FacadeParam::Double("cz"),
            FacadeParam::Double("nx"),
            FacadeParam::Double("ny"),
            FacadeParam::Double("nz"),
            FacadeParam::Double("majorRadius"),
            FacadeParam::Double("minorRadius"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
gp_Ax2 axis(gp_Pnt(cx, cy, cz), gp_Dir(nx, ny, nz));
gp_Elips ellipse(axis, majorRadius, minorRadius);
BRepBuilderAPI_MakeEdge maker(ellipse);
if (!maker.IsDone()) {
    throw std::runtime_error(\"makeEllipseEdge: construction failed\");
}
return store(maker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeEdge.hxx",
            "gp_Ax2.hxx",
            "gp_Dir.hxx",
            "gp_Elips.hxx",
            "gp_Pnt.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeEllipseArc",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::Double("cx"),
            FacadeParam::Double("cy"),
            FacadeParam::Double("cz"),
            FacadeParam::Double("nx"),
            FacadeParam::Double("ny"),
            FacadeParam::Double("nz"),
            FacadeParam::Double("majorRadius"),
            FacadeParam::Double("minorRadius"),
            FacadeParam::Double("startAngle"),
            FacadeParam::Double("endAngle"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
gp_Ax2 axis(gp_Pnt(cx, cy, cz), gp_Dir(nx, ny, nz));
gp_Elips ellipse(axis, majorRadius, minorRadius);
Handle(Geom_TrimmedCurve) arc =
    new Geom_TrimmedCurve(new Geom_Ellipse(ellipse), startAngle, endAngle);
BRepBuilderAPI_MakeEdge maker(arc);
if (!maker.IsDone()) {
    throw std::runtime_error(\"makeEllipseArc: construction failed\");
}
return store(maker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeEdge.hxx",
            "Geom_Ellipse.hxx",
            "Geom_TrimmedCurve.hxx",
            "gp_Ax2.hxx",
            "gp_Dir.hxx",
            "gp_Elips.hxx",
            "gp_Pnt.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeBezierEdge",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::VectorDouble("flatPoints")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
int nPts = static_cast<int>(flatPoints.size()) / 3;
if (nPts < 2) {
    throw std::runtime_error(\"makeBezierEdge: need at least 2 points\");
}
NCollection_Array1<gp_Pnt> poles(1, nPts);
for (int i = 0; i < nPts; i++) {
    poles.SetValue(i + 1,
                   gp_Pnt(flatPoints[i * 3], flatPoints[i * 3 + 1], flatPoints[i * 3 + 2]));
}
Handle(Geom_BezierCurve) curve = new Geom_BezierCurve(poles);
BRepBuilderAPI_MakeEdge maker(curve);
if (!maker.IsDone()) {
    throw std::runtime_error(\"makeBezierEdge: construction failed\");
}
return store(maker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeEdge.hxx",
            "Geom_BezierCurve.hxx",
            "NCollection_Array1.hxx",
            "gp_Pnt.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeTangentArc",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::Double("x1"),
            FacadeParam::Double("y1"),
            FacadeParam::Double("z1"),
            FacadeParam::Double("tx"),
            FacadeParam::Double("ty"),
            FacadeParam::Double("tz"),
            FacadeParam::Double("x2"),
            FacadeParam::Double("y2"),
            FacadeParam::Double("z2"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
gp_Pnt startPt(x1, y1, z1);
gp_Vec tangent(tx, ty, tz);
gp_Pnt endPt(x2, y2, z2);
GC_MakeArcOfCircle arcMaker(startPt, tangent, endPt);
if (!arcMaker.IsDone()) {
    throw std::runtime_error(\"makeTangentArc: arc construction failed\");
}
BRepBuilderAPI_MakeEdge edgeMaker(arcMaker.Value());
if (!edgeMaker.IsDone()) {
    throw std::runtime_error(\"makeTangentArc: edge construction failed\");
}
return store(edgeMaker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeEdge.hxx",
            "GC_MakeArcOfCircle.hxx",
            "gp_Pnt.hxx",
            "gp_Vec.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeHelixWire",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::Double("px"),
            FacadeParam::Double("py"),
            FacadeParam::Double("pz"),
            FacadeParam::Double("dx"),
            FacadeParam::Double("dy"),
            FacadeParam::Double("dz"),
            FacadeParam::Double("pitch"),
            FacadeParam::Double("height"),
            FacadeParam::Double("radius"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
gp_Ax3 ax3(gp_Pnt(px, py, pz), gp_Dir(dx, dy, dz));
Handle(Geom_CylindricalSurface) cylinder = new Geom_CylindricalSurface(ax3, radius);
double slope = pitch / (2.0 * M_PI);
double nTurns = height / pitch;
double uMax = nTurns * 2.0 * M_PI;
Handle(Geom2d_Line) line2d = new Geom2d_Line(gp_Pnt2d(0, 0), gp_Dir2d(1, slope));
BRepBuilderAPI_MakeEdge edgeMaker(line2d, cylinder, 0.0, uMax);
if (!edgeMaker.IsDone()) {
    throw std::runtime_error(\"makeHelixWire: edge construction failed\");
}
BRepBuilderAPI_MakeWire wireMaker(edgeMaker.Edge());
if (!wireMaker.IsDone()) {
    throw std::runtime_error(\"makeHelixWire: wire construction failed\");
}
return store(wireMaker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeEdge.hxx",
            "BRepBuilderAPI_MakeWire.hxx",
            "Geom2d_Line.hxx",
            "Geom_CylindricalSurface.hxx",
            "gp_Ax3.hxx",
            "gp_Dir.hxx",
            "gp_Dir2d.hxx",
            "gp_Pnt.hxx",
            "gp_Pnt2d.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeWire",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::VectorShapeIds("edgeIds")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepBuilderAPI_MakeWire maker;
for (uint32_t eid : edgeIds) {
    maker.Add(TopoDS::Edge(get(eid)));
}
if (maker.IsDone()) {
    return store(maker.Shape());
}
BRep_Builder builder;
TopoDS_Wire rawWire;
builder.MakeWire(rawWire);
for (uint32_t eid : edgeIds) {
    builder.Add(rawWire, TopoDS::Edge(get(eid)));
}
ShapeFix_Wire fixer(rawWire, TopoDS_Face(), 1e-3);
fixer.FixConnected();
fixer.FixReorder();
if (fixer.Wire().IsNull()) {
    throw std::runtime_error(\"makeWire: construction failed (even with ShapeFix)\");
}
return store(fixer.Wire());",
        includes: &[
            "BRepBuilderAPI_MakeWire.hxx",
            "BRep_Builder.hxx",
            "ShapeFix_Wire.hxx",
            "TopoDS.hxx",
            "TopoDS_Wire.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeFace",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("wireId")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepBuilderAPI_MakeFace maker(TopoDS::Wire(get(wireId)));
if (!maker.IsDone()) {
    throw std::runtime_error(\"makeFace: construction failed\");
}
return store(maker.Shape());",
        includes: &["BRepBuilderAPI_MakeFace.hxx", "TopoDS.hxx"],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeNonPlanarFace",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("wireId")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepOffsetAPI_MakeFilling filler;
for (TopExp_Explorer ex(get(wireId), TopAbs_EDGE); ex.More(); ex.Next()) {
    filler.Add(TopoDS::Edge(ex.Current()), GeomAbs_C0);
}
filler.Build();
if (!filler.IsDone()) {
    throw std::runtime_error(\"makeNonPlanarFace: construction failed\");
}
return store(filler.Shape());",
        includes: &[
            "BRepOffsetAPI_MakeFilling.hxx",
            "GeomAbs_Shape.hxx",
            "TopExp_Explorer.hxx",
            "TopoDS.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "addHolesInFace",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("faceId"),
            FacadeParam::VectorShapeIds("holeWireIds"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
TopoDS_Face face = TopoDS::Face(get(faceId));
BRepBuilderAPI_MakeFace maker(face);
for (uint32_t wid : holeWireIds) {
    TopoDS_Wire hole = TopoDS::Wire(get(wid));
    hole.Reverse();
    maker.Add(hole);
}
if (!maker.IsDone()) {
    throw std::runtime_error(\"addHolesInFace: construction failed\");
}
return store(maker.Shape());",
        includes: &["BRepBuilderAPI_MakeFace.hxx", "TopoDS.hxx"],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "removeHolesFromFace",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("faceId"),
            FacadeParam::VectorInt("holeIndices"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
TopoDS_Face face = TopoDS::Face(get(faceId));
TopoDS_Wire outer = ShapeAnalysis::OuterWire(face);
std::vector<TopoDS_Wire> innerWires;
for (TopExp_Explorer ex(face, TopAbs_WIRE); ex.More(); ex.Next()) {
    TopoDS_Wire w = TopoDS::Wire(ex.Current());
    if (!w.IsSame(outer)) {
        innerWires.push_back(w);
    }
}
std::set<int> removeSet(holeIndices.begin(), holeIndices.end());
Handle(Geom_Surface) geomSurf = BRep_Tool::Surface(face);
BRepBuilderAPI_MakeFace maker(geomSurf, outer, true);
for (int i = 0; i < static_cast<int>(innerWires.size()); i++) {
    if (removeSet.find(i) == removeSet.end()) {
        maker.Add(innerWires[i]);
    }
}
if (!maker.IsDone()) {
    throw std::runtime_error(\"removeHolesFromFace: construction failed\");
}
return store(maker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeFace.hxx",
            "BRep_Tool.hxx",
            "Geom_Surface.hxx",
            "ShapeAnalysis.hxx",
            "TopExp_Explorer.hxx",
            "TopoDS.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "solidFromShell",
        kind: MethodKind::DirectCall,
        params: &[FacadeParam::ShapeId("shellId")],
        occt_class: "",
        ctor_args: "makeSolid(shellId)",
        setup_code: "",
        includes: &[],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeSolid",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("shellId")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(shellId);
if (shape.ShapeType() == TopAbs_SOLID) {
    return store(shape);
}
if (shape.ShapeType() == TopAbs_COMPOUND) {
    for (TopExp_Explorer ex(shape, TopAbs_SHELL); ex.More(); ex.Next()) {
        BRepBuilderAPI_MakeSolid maker(TopoDS::Shell(ex.Current()));
        if (maker.IsDone()) {
            return store(maker.Shape());
        }
    }
    throw std::runtime_error(\"makeSolid: compound has no valid shell\");
}
BRepBuilderAPI_MakeSolid maker(TopoDS::Shell(shape));
if (!maker.IsDone()) {
    throw std::runtime_error(\"makeSolid: construction failed\");
}
return store(maker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeSolid.hxx",
            "TopExp_Explorer.hxx",
            "TopoDS.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "sew",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::VectorShapeIds("shapeIds"),
            FacadeParam::Double("tolerance"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepBuilderAPI_Sewing sewer(tolerance);
for (uint32_t sid : shapeIds) {
    sewer.Add(get(sid));
}
sewer.Perform();
return store(sewer.SewedShape());",
        includes: &["BRepBuilderAPI_Sewing.hxx"],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "sewAndSolidify",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::VectorShapeIds("faceIds"),
            FacadeParam::Double("tolerance"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepBuilderAPI_Sewing sewer(tolerance);
for (uint32_t fid : faceIds) {
    sewer.Add(get(fid));
}
sewer.Perform();
TopoDS_Shape sewn = sewer.SewedShape();
if (sewn.ShapeType() == TopAbs_SHELL) {
    BRepBuilderAPI_MakeSolid maker(TopoDS::Shell(sewn));
    if (maker.IsDone()) {
        return store(maker.Shape());
    }
}
return store(sewn);",
        includes: &[
            "BRepBuilderAPI_MakeSolid.hxx",
            "BRepBuilderAPI_Sewing.hxx",
            "TopoDS.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "buildSolidFromFaces",
        kind: MethodKind::DirectCall,
        params: &[
            FacadeParam::VectorShapeIds("faceIds"),
            FacadeParam::Double("tolerance"),
        ],
        occt_class: "",
        ctor_args: "sewAndSolidify(faceIds, tolerance)",
        setup_code: "",
        includes: &[],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeCompound",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::VectorShapeIds("shapeIds")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
TopoDS_Compound compound;
TopoDS_Builder builder;
builder.MakeCompound(compound);
for (uint32_t sid : shapeIds) {
    builder.Add(compound, get(sid));
}
return store(compound);",
        includes: &["TopoDS_Builder.hxx", "TopoDS_Compound.hxx"],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "buildTriFace",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::Double("ax"),
            FacadeParam::Double("ay"),
            FacadeParam::Double("az"),
            FacadeParam::Double("bx"),
            FacadeParam::Double("by"),
            FacadeParam::Double("bz"),
            FacadeParam::Double("cx2"),
            FacadeParam::Double("cy2"),
            FacadeParam::Double("cz2"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
gp_Pnt pa(ax, ay, az), pb(bx, by, bz), pc(cx2, cy2, cz2);
BRepBuilderAPI_MakeWire wireMaker;
wireMaker.Add(BRepBuilderAPI_MakeEdge(pa, pb).Edge());
wireMaker.Add(BRepBuilderAPI_MakeEdge(pb, pc).Edge());
wireMaker.Add(BRepBuilderAPI_MakeEdge(pc, pa).Edge());
if (!wireMaker.IsDone()) {
    throw std::runtime_error(\"buildTriFace: wire construction failed\");
}
BRepBuilderAPI_MakeFace faceMaker(wireMaker.Wire());
if (!faceMaker.IsDone()) {
    throw std::runtime_error(\"buildTriFace: face construction failed\");
}
return store(faceMaker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeEdge.hxx",
            "BRepBuilderAPI_MakeFace.hxx",
            "BRepBuilderAPI_MakeWire.hxx",
            "gp_Pnt.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeFaceOnSurface",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("faceId"),
            FacadeParam::ShapeId("wireId"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
Handle(Geom_Surface) surface = BRep_Tool::Surface(TopoDS::Face(get(faceId)));
BRepBuilderAPI_MakeFace maker(surface, TopoDS::Wire(get(wireId)), true);
if (!maker.IsDone()) {
    throw std::runtime_error(\"makeFaceOnSurface: construction failed\");
}
return store(maker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeFace.hxx",
            "BRep_Tool.hxx",
            "Geom_Surface.hxx",
            "TopoDS.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "bsplineSurface",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::VectorDouble("flatPoints"),
            FacadeParam::Int("rows"),
            FacadeParam::Int("cols"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
if (rows < 2 || cols < 2) {
    throw std::runtime_error(\"bsplineSurface: need at least 2x2 grid\");
}
int nPts = static_cast<int>(flatPoints.size()) / 3;
if (nPts != rows * cols) {
    throw std::runtime_error(\"bsplineSurface: point count mismatch\");
}
NCollection_Array2<gp_Pnt> points(1, rows, 1, cols);
for (int r = 0; r < rows; r++) {
    for (int c = 0; c < cols; c++) {
        int idx = (r * cols + c) * 3;
        points.SetValue(r + 1, c + 1,
                        gp_Pnt(flatPoints[idx], flatPoints[idx + 1], flatPoints[idx + 2]));
    }
}
GeomAPI_PointsToBSplineSurface approx(points, 3, 8, GeomAbs_C2, 1e-3);
if (!approx.IsDone()) {
    throw std::runtime_error(\"bsplineSurface: approximation failed\");
}
BRepBuilderAPI_MakeFace faceMaker(approx.Surface(), 1e-3);
if (!faceMaker.IsDone()) {
    throw std::runtime_error(\"bsplineSurface: face construction failed\");
}
return store(faceMaker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeFace.hxx",
            "GeomAPI_PointsToBSplineSurface.hxx",
            "GeomAbs_Shape.hxx",
            "Geom_BSplineSurface.hxx",
            "NCollection_Array2.hxx",
            "gp_Pnt.hxx",
        ],
        category: "construction",
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
        name: "transform",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("id"),
            FacadeParam::VectorDouble("matrix"),
        ],
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
        includes: &["BRepBuilderAPI_Transform.hxx", "gp_Trsf.hxx"],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "generalTransform",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("id"),
            FacadeParam::VectorDouble("matrix"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
if (matrix.size() != 12) {
    throw std::runtime_error(\"generalTransform: matrix must have 12 elements (3x4)\");
}
gp_GTrsf gt;
gt.SetValue(1, 1, matrix[0]);
gt.SetValue(1, 2, matrix[1]);
gt.SetValue(1, 3, matrix[2]);
gt.SetValue(1, 4, matrix[3]);
gt.SetValue(2, 1, matrix[4]);
gt.SetValue(2, 2, matrix[5]);
gt.SetValue(2, 3, matrix[6]);
gt.SetValue(2, 4, matrix[7]);
gt.SetValue(3, 1, matrix[8]);
gt.SetValue(3, 2, matrix[9]);
gt.SetValue(3, 3, matrix[10]);
gt.SetValue(3, 4, matrix[11]);
BRepBuilderAPI_GTransform maker(get(id), gt, true);
if (!maker.IsDone()) {
    throw std::runtime_error(\"generalTransform: transform failed\");
}
return store(maker.Shape());",
        includes: &["BRepBuilderAPI_GTransform.hxx", "gp_GTrsf.hxx"],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "linearPattern",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("id"),
            FacadeParam::Double("dx"),
            FacadeParam::Double("dy"),
            FacadeParam::Double("dz"),
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
        includes: &[
            "BRepBuilderAPI_Transform.hxx",
            "TopoDS_Builder.hxx",
            "TopoDS_Compound.hxx",
            "gp_Trsf.hxx",
            "gp_Vec.hxx",
        ],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "circularPattern",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("id"),
            FacadeParam::Double("cx"),
            FacadeParam::Double("cy"),
            FacadeParam::Double("cz"),
            FacadeParam::Double("ax"),
            FacadeParam::Double("ay"),
            FacadeParam::Double("az"),
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
        includes: &[
            "BRepBuilderAPI_Transform.hxx",
            "TopoDS_Builder.hxx",
            "TopoDS_Compound.hxx",
            "gp_Ax1.hxx",
            "gp_Dir.hxx",
            "gp_Pnt.hxx",
            "gp_Trsf.hxx",
        ],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "composeTransform",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::VectorDouble("m1"),
            FacadeParam::VectorDouble("m2"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
if (m1.size() != 12 || m2.size() != 12) {
    throw std::runtime_error(\"composeTransform: each matrix must have 12 elements\");
}
gp_Trsf t1, t2;
t1.SetValues(m1[0], m1[1], m1[2], m1[3], m1[4], m1[5], m1[6], m1[7], m1[8], m1[9], m1[10],
             m1[11]);
t2.SetValues(m2[0], m2[1], m2[2], m2[3], m2[4], m2[5], m2[6], m2[7], m2[8], m2[9], m2[10],
             m2[11]);
gp_Trsf result = t1.Multiplied(t2);
return {result.Value(1, 1), result.Value(1, 2), result.Value(1, 3), result.Value(1, 4),
        result.Value(2, 1), result.Value(2, 2), result.Value(2, 3), result.Value(2, 4),
        result.Value(3, 1), result.Value(3, 2), result.Value(3, 3), result.Value(3, 4)};",
        includes: &["gp_Trsf.hxx"],
        category: "transforms",
        return_type: ReturnType::VectorDouble,
    },
    // ── Batch operations ────────────────────────────────────────────
    MethodSpec {
        name: "translateBatch",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::VectorShapeIds("ids"),
            FacadeParam::VectorDouble("offsets"),
        ],
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
        includes: &["BRepBuilderAPI_Transform.hxx", "gp_Trsf.hxx", "gp_Vec.hxx"],
        category: "batch",
        return_type: ReturnType::VectorUint32,
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
    case 0: {
        BRepAlgoAPI_Fuse op(current, tool, progress);
        if (!op.IsDone() || op.HasErrors())
            throw std::runtime_error(\"booleanPipeline: fuse step failed\");
        current = op.Shape();
        break;
    }
    case 1: {
        BRepAlgoAPI_Cut op(current, tool, progress);
        if (!op.IsDone() || op.HasErrors())
            throw std::runtime_error(\"booleanPipeline: cut step failed\");
        current = op.Shape();
        break;
    }
    case 2: {
        BRepAlgoAPI_Common op(current, tool, progress);
        if (!op.IsDone() || op.HasErrors())
            throw std::runtime_error(\"booleanPipeline: intersect step failed\");
        current = op.Shape();
        break;
    }
    default:
        throw std::runtime_error(\"booleanPipeline: unknown opCode\");
    }
    if (isLast) {
        ShapeUpgrade_UnifySameDomain upgrader(current, Standard_True, Standard_True,
                                              Standard_False);
        upgrader.Build();
        current = upgrader.Shape();
    }
}
return store(current);",
        includes: &[
            "BRepAlgoAPI_Common.hxx",
            "BRepAlgoAPI_Cut.hxx",
            "BRepAlgoAPI_Fuse.hxx",
            "Message_ProgressRange.hxx",
            "ShapeUpgrade_UnifySameDomain.hxx",
        ],
        category: "batch",
        return_type: ReturnType::ShapeId,
    },
    // ── Topology query ──────────────────────────────────────────────
    MethodSpec {
        name: "getShapeType",
        kind: MethodKind::DirectCall,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "shapeTypeToString(get(id).ShapeType())",
        setup_code: "",
        includes: &[],
        category: "topology",
        return_type: ReturnType::String,
    },
    MethodSpec {
        name: "getSubShapes",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id"), FacadeParam::String("shapeType")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
TopAbs_ShapeEnum toExplore = parseShapeType(shapeType);
std::vector<uint32_t> result;
NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> map;
TopExp::MapShapes(get(id), toExplore, map);
for (int i = 1; i <= map.Extent(); i++) {
    result.push_back(store(map.FindKey(i)));
}
return result;",
        includes: &[
            "NCollection_IndexedMap.hxx",
            "TopExp.hxx",
            "TopTools_ShapeMapHasher.hxx",
        ],
        category: "topology",
        return_type: ReturnType::VectorUint32,
    },
    MethodSpec {
        name: "downcast",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("id"),
            FacadeParam::String("targetType"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
TopAbs_ShapeEnum target = parseShapeType(targetType);
if (shape.ShapeType() != target) {
    throw std::runtime_error(\"downcast: shape type mismatch\");
}
return store(shape);",
        includes: &[],
        category: "topology",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "distanceBetween",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("a"), FacadeParam::ShapeId("b")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepExtrema_DistShapeShape dist(get(a), get(b));
if (!dist.IsDone()) {
    throw std::runtime_error(\"distanceBetween: computation failed\");
}
return dist.Value();",
        includes: &["BRepExtrema_DistShapeShape.hxx"],
        category: "topology",
        return_type: ReturnType::Double,
    },
    MethodSpec {
        name: "isSame",
        kind: MethodKind::DirectCall,
        params: &[FacadeParam::ShapeId("a"), FacadeParam::ShapeId("b")],
        occt_class: "",
        ctor_args: "get(a).IsSame(get(b))",
        setup_code: "",
        includes: &[],
        category: "topology",
        return_type: ReturnType::Bool,
    },
    MethodSpec {
        name: "isEqual",
        kind: MethodKind::DirectCall,
        params: &[FacadeParam::ShapeId("a"), FacadeParam::ShapeId("b")],
        occt_class: "",
        ctor_args: "get(a).IsEqual(get(b))",
        setup_code: "",
        includes: &[],
        category: "topology",
        return_type: ReturnType::Bool,
    },
    MethodSpec {
        name: "isNull",
        kind: MethodKind::DirectCall,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "get(id).IsNull()",
        setup_code: "",
        includes: &[],
        category: "topology",
        return_type: ReturnType::Bool,
    },
    MethodSpec {
        name: "hashCode",
        kind: MethodKind::DirectCall,
        params: &[FacadeParam::ShapeId("id"), FacadeParam::Int("upperBound")],
        occt_class: "",
        ctor_args: "static_cast<int>(TopTools_ShapeMapHasher{}(get(id)) % static_cast<size_t>(upperBound))",
        setup_code: "",
        includes: &["TopTools_ShapeMapHasher.hxx"],
        category: "topology",
        return_type: ReturnType::Int,
    },
    MethodSpec {
        name: "shapeOrientation",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
switch (get(id).Orientation()) {
case TopAbs_FORWARD:
    return \"forward\";
case TopAbs_REVERSED:
    return \"reversed\";
case TopAbs_INTERNAL:
    return \"internal\";
case TopAbs_EXTERNAL:
    return \"external\";
default:
    return \"unknown\";
}",
        includes: &["TopAbs_Orientation.hxx"],
        category: "topology",
        return_type: ReturnType::String,
    },
    MethodSpec {
        name: "sharedEdges",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("faceA"), FacadeParam::ShapeId("faceB")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& fa = get(faceA);
const auto& fb = get(faceB);
std::vector<uint32_t> result;
for (TopExp_Explorer exA(fa, TopAbs_EDGE); exA.More(); exA.Next()) {
    for (TopExp_Explorer exB(fb, TopAbs_EDGE); exB.More(); exB.Next()) {
        if (exA.Current().IsSame(exB.Current())) {
            result.push_back(store(exA.Current()));
            break;
        }
    }
}
return result;",
        includes: &["TopExp_Explorer.hxx"],
        category: "topology",
        return_type: ReturnType::VectorUint32,
    },
    MethodSpec {
        name: "adjacentFaces",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("shapeId"),
            FacadeParam::ShapeId("faceId"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(shapeId);
const auto& targetFace = get(faceId);
std::vector<uint32_t> result;
for (TopExp_Explorer exF(shape, TopAbs_FACE); exF.More(); exF.Next()) {
    if (exF.Current().IsSame(targetFace))
        continue;
    bool adjacent = false;
    for (TopExp_Explorer exE1(targetFace, TopAbs_EDGE); exE1.More() && !adjacent;
         exE1.Next()) {
        for (TopExp_Explorer exE2(exF.Current(), TopAbs_EDGE); exE2.More(); exE2.Next()) {
            if (exE1.Current().IsSame(exE2.Current())) {
                adjacent = true;
                break;
            }
        }
    }
    if (adjacent) {
        result.push_back(store(exF.Current()));
    }
}
return result;",
        includes: &["TopExp_Explorer.hxx"],
        category: "topology",
        return_type: ReturnType::VectorUint32,
    },
    MethodSpec {
        name: "iterShapes",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
std::vector<uint32_t> result;
for (TopoDS_Iterator it(get(id)); it.More(); it.Next()) {
    result.push_back(store(it.Value()));
}
return result;",
        includes: &["TopoDS_Iterator.hxx"],
        category: "topology",
        return_type: ReturnType::VectorUint32,
    },
    MethodSpec {
        name: "edgeToFaceMap",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("id"),
            FacadeParam::Int("hashUpperBound"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
std::vector<int> result;
auto hashShape = [&](const TopoDS_Shape& s) -> int {
    return static_cast<int>(TopTools_ShapeMapHasher{}(s) %
                            static_cast<size_t>(hashUpperBound));
};
for (TopExp_Explorer exE(shape, TopAbs_EDGE); exE.More(); exE.Next()) {
    int edgeHash = hashShape(exE.Current());
    std::vector<int> faceHashes;
    for (TopExp_Explorer exF(shape, TopAbs_FACE); exF.More(); exF.Next()) {
        for (TopExp_Explorer exFE(exF.Current(), TopAbs_EDGE); exFE.More(); exFE.Next()) {
            if (exFE.Current().IsSame(exE.Current())) {
                faceHashes.push_back(hashShape(exF.Current()));
                break;
            }
        }
    }
    if (!faceHashes.empty()) {
        result.push_back(edgeHash);
        result.push_back(static_cast<int>(faceHashes.size()));
        result.insert(result.end(), faceHashes.begin(), faceHashes.end());
    }
}
return result;",
        includes: &["TopExp_Explorer.hxx", "TopTools_ShapeMapHasher.hxx"],
        category: "topology",
        return_type: ReturnType::VectorInt,
    },
    // ── Tessellation / Mesh ─────────────────────────────────────────
    MethodSpec {
        name: "tessellate",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "tessellate",
        return_type: ReturnType::MeshData,
    },
    MethodSpec {
        name: "wireframe",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "tessellate",
        return_type: ReturnType::EdgeData,
    },
    MethodSpec {
        name: "hasTriangulation",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
for (TopExp_Explorer ex(get(id), TopAbs_FACE); ex.More(); ex.Next()) {
    TopLoc_Location loc;
    auto tri = BRep_Tool::Triangulation(TopoDS::Face(ex.Current()), loc);
    if (!tri.IsNull())
        return true;
}
return false;",
        includes: &[
            "BRep_Tool.hxx",
            "TopExp_Explorer.hxx",
            "TopLoc_Location.hxx",
            "TopoDS.hxx",
        ],
        category: "tessellate",
        return_type: ReturnType::Bool,
    },
    MethodSpec {
        name: "meshShape",
        kind: MethodKind::DirectCall,
        params: &[
            FacadeParam::ShapeId("id"),
            FacadeParam::Double("linearDeflection"),
            FacadeParam::Double("angularDeflection"),
        ],
        occt_class: "",
        ctor_args: "tessellate(id, linearDeflection, angularDeflection)",
        setup_code: "",
        includes: &[],
        category: "tessellate",
        return_type: ReturnType::MeshData,
    },
    MethodSpec {
        name: "meshBatch",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "tessellate",
        return_type: ReturnType::MeshBatchData,
    },
    // ── I/O ─────────────────────────────────────────────────────────
    MethodSpec {
        name: "importStep",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "io",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "exportStep",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "io",
        return_type: ReturnType::String,
    },
    MethodSpec {
        name: "importStl",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "io",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "exportStl",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "io",
        return_type: ReturnType::String,
    },
    MethodSpec {
        name: "toBREP",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "io",
        return_type: ReturnType::String,
    },
    MethodSpec {
        name: "fromBREP",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "io",
        return_type: ReturnType::ShapeId,
    },
    // ── Query / Measure ─────────────────────────────────────────────
    MethodSpec {
        name: "getBoundingBox",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
Bnd_Box box;
BRepBndLib::Add(shape, box);
if (box.IsVoid()) {
    throw std::runtime_error(\"getBoundingBox: shape has no geometry\");
}
BBoxData result{};
box.Get(result.xmin, result.ymin, result.zmin, result.xmax, result.ymax, result.zmax);
return result;",
        includes: &["BRepBndLib.hxx", "Bnd_Box.hxx"],
        category: "query",
        return_type: ReturnType::BBoxData,
    },
    MethodSpec {
        name: "getVolume",
        kind: MethodKind::DirectCall,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "props.Mass()",
        setup_code: "const auto& shape = get(id);\nGProp_GProps props;\nBRepGProp::VolumeProperties(shape, props);",
        includes: &["BRepGProp.hxx", "GProp_GProps.hxx"],
        category: "query",
        return_type: ReturnType::Double,
    },
    MethodSpec {
        name: "getSurfaceArea",
        kind: MethodKind::DirectCall,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "props.Mass()",
        setup_code: "const auto& shape = get(id);\nGProp_GProps props;\nBRepGProp::SurfaceProperties(shape, props);",
        includes: &["BRepGProp.hxx", "GProp_GProps.hxx"],
        category: "query",
        return_type: ReturnType::Double,
    },
    MethodSpec {
        name: "getLength",
        kind: MethodKind::DirectCall,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "props.Mass()",
        setup_code: "const auto& shape = get(id);\nGProp_GProps props;\nBRepGProp::LinearProperties(shape, props);",
        includes: &["BRepGProp.hxx", "GProp_GProps.hxx"],
        category: "query",
        return_type: ReturnType::Double,
    },
    MethodSpec {
        name: "getCenterOfMass",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
GProp_GProps props;
BRepGProp::VolumeProperties(shape, props);
gp_Pnt com = props.CentreOfMass();
return {com.X(), com.Y(), com.Z()};",
        includes: &["BRepGProp.hxx", "GProp_GProps.hxx", "gp_Pnt.hxx"],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "getLinearCenterOfMass",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
GProp_GProps props;
BRepGProp::LinearProperties(shape, props);
gp_Pnt com = props.CentreOfMass();
return {com.X(), com.Y(), com.Z()};",
        includes: &["BRepGProp.hxx", "GProp_GProps.hxx", "gp_Pnt.hxx"],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "surfaceCurvature",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("faceId"),
            FacadeParam::Double("u"),
            FacadeParam::Double("v"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepAdaptor_Surface surf(TopoDS::Face(get(faceId)));
BRepLProp_SLProps props(surf, u, v, 2, 1e-6);
if (!props.IsCurvatureDefined()) {
    throw std::runtime_error(\"surfaceCurvature: curvature not defined at point\");
}
double mean = props.MeanCurvature();
double gaussian = props.GaussianCurvature();
double maxK = props.MaxCurvature();
double minK = props.MinCurvature();
return {mean, gaussian, maxK, minK};",
        includes: &[
            "BRepAdaptor_Surface.hxx",
            "BRepLProp_SLProps.hxx",
            "TopoDS.hxx",
        ],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    // ── Vertex/Surface query ────────────────────────────────────────
    MethodSpec {
        name: "vertexPosition",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("vertexId")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
gp_Pnt p = BRep_Tool::Pnt(TopoDS::Vertex(get(vertexId)));
return {p.X(), p.Y(), p.Z()};",
        includes: &["BRep_Tool.hxx", "TopoDS.hxx", "gp_Pnt.hxx"],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "surfaceType",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("faceId")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepAdaptor_Surface surf(TopoDS::Face(get(faceId)));
switch (surf.GetType()) {
case GeomAbs_Plane: return \"plane\";
case GeomAbs_Cylinder: return \"cylinder\";
case GeomAbs_Cone: return \"cone\";
case GeomAbs_Sphere: return \"sphere\";
case GeomAbs_Torus: return \"torus\";
case GeomAbs_BezierSurface: return \"bezier\";
case GeomAbs_BSplineSurface: return \"bspline\";
case GeomAbs_SurfaceOfRevolution: return \"revolution\";
case GeomAbs_SurfaceOfExtrusion: return \"extrusion\";
case GeomAbs_OffsetSurface: return \"offset\";
default: return \"other\";
}",
        includes: &[
            "BRepAdaptor_Surface.hxx",
            "GeomAbs_SurfaceType.hxx",
            "TopoDS.hxx",
        ],
        category: "query",
        return_type: ReturnType::String,
    },
    MethodSpec {
        name: "surfaceNormal",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("faceId"),
            FacadeParam::Double("u"),
            FacadeParam::Double("v"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
TopoDS_Face face = TopoDS::Face(get(faceId));
BRepAdaptor_Surface surf(face);
gp_Pnt pt;
gp_Vec d1u, d1v;
surf.D1(u, v, pt, d1u, d1v);
gp_Vec normal = d1u.Crossed(d1v);
if (normal.Magnitude() > 1e-10) {
    normal.Normalize();
}
if (face.Orientation() == TopAbs_REVERSED) {
    normal.Reverse();
}
return {normal.X(), normal.Y(), normal.Z()};",
        includes: &[
            "BRepAdaptor_Surface.hxx",
            "TopoDS.hxx",
            "gp_Pnt.hxx",
            "gp_Vec.hxx",
        ],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "pointOnSurface",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("faceId"),
            FacadeParam::Double("u"),
            FacadeParam::Double("v"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepAdaptor_Surface surf(TopoDS::Face(get(faceId)));
gp_Pnt pt = surf.Value(u, v);
return {pt.X(), pt.Y(), pt.Z()};",
        includes: &["BRepAdaptor_Surface.hxx", "TopoDS.hxx"],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "outerWire",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("faceId")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
TopoDS_Wire wire = ShapeAnalysis::OuterWire(TopoDS::Face(get(faceId)));
if (wire.IsNull()) {
    throw std::runtime_error(\"outerWire: face has no outer wire\");
}
return store(wire);",
        includes: &["ShapeAnalysis.hxx", "TopoDS.hxx"],
        category: "query",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "uvBounds",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("faceId")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepAdaptor_Surface surf(TopoDS::Face(get(faceId)));
return {surf.FirstUParameter(), surf.LastUParameter(), surf.FirstVParameter(),
        surf.LastVParameter()};",
        includes: &["BRepAdaptor_Surface.hxx", "TopoDS.hxx"],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "uvFromPoint",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("faceId"),
            FacadeParam::Double("x"),
            FacadeParam::Double("y"),
            FacadeParam::Double("z"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
TopoDS_Face face = TopoDS::Face(get(faceId));
Handle(Geom_Surface) geomSurf = BRep_Tool::Surface(face);
ShapeAnalysis_Surface sas(geomSurf);
gp_Pnt2d uv = sas.ValueOfUV(gp_Pnt(x, y, z), 1e-6);
return {uv.X(), uv.Y()};",
        includes: &[
            "BRep_Tool.hxx",
            "Geom_Surface.hxx",
            "ShapeAnalysis_Surface.hxx",
            "TopoDS.hxx",
            "gp_Pnt.hxx",
            "gp_Pnt2d.hxx",
        ],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "projectPointOnFace",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("faceId"),
            FacadeParam::Double("x"),
            FacadeParam::Double("y"),
            FacadeParam::Double("z"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
TopoDS_Face face = TopoDS::Face(get(faceId));
Handle(Geom_Surface) geomSurf = BRep_Tool::Surface(face);
GeomAPI_ProjectPointOnSurf proj(gp_Pnt(x, y, z), geomSurf);
if (proj.NbPoints() == 0) {
    throw std::runtime_error(\"projectPointOnFace: no projection found\");
}
gp_Pnt nearest = proj.NearestPoint();
double u, v;
proj.LowerDistanceParameters(u, v);
return {nearest.X(), nearest.Y(), nearest.Z(), u, v, proj.LowerDistance()};",
        includes: &[
            "BRep_Tool.hxx",
            "GeomAPI_ProjectPointOnSurf.hxx",
            "Geom_Surface.hxx",
            "TopoDS.hxx",
            "gp_Pnt.hxx",
        ],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "classifyPointOnFace",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("faceId"),
            FacadeParam::Double("u"),
            FacadeParam::Double("v"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
TopoDS_Face face = TopoDS::Face(get(faceId));
BRepClass_FaceClassifier classifier(face, gp_Pnt2d(u, v), 1e-6);
switch (classifier.State()) {
case TopAbs_IN: return \"in\";
case TopAbs_OUT: return \"out\";
case TopAbs_ON: return \"on\";
default: return \"unknown\";
}",
        includes: &["BRepClass_FaceClassifier.hxx", "TopoDS.hxx", "gp_Pnt2d.hxx"],
        category: "query",
        return_type: ReturnType::String,
    },
    // ── Curve ops ───────────────────────────────────────────────────
    MethodSpec {
        name: "curveType",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
GeomAbs_CurveType ctype;
if (shape.ShapeType() == TopAbs_WIRE) {
    BRepAdaptor_CompCurve comp(TopoDS::Wire(shape));
    ctype = comp.GetType();
} else {
    BRepAdaptor_Curve curve(TopoDS::Edge(shape));
    ctype = curve.GetType();
}
switch (ctype) {
case GeomAbs_Line: return \"line\";
case GeomAbs_Circle: return \"circle\";
case GeomAbs_Ellipse: return \"ellipse\";
case GeomAbs_Hyperbola: return \"hyperbola\";
case GeomAbs_Parabola: return \"parabola\";
case GeomAbs_BezierCurve: return \"bezier\";
case GeomAbs_BSplineCurve: return \"bspline\";
case GeomAbs_OffsetCurve: return \"offset\";
default: return \"other\";
}",
        includes: &[
            "BRepAdaptor_CompCurve.hxx",
            "BRepAdaptor_Curve.hxx",
            "GeomAbs_CurveType.hxx",
            "TopoDS.hxx",
        ],
        category: "curve",
        return_type: ReturnType::String,
    },
    MethodSpec {
        name: "curvePointAtParam",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id"), FacadeParam::Double("param")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
gp_Pnt pt;
if (shape.ShapeType() == TopAbs_WIRE) {
    BRepAdaptor_CompCurve comp(TopoDS::Wire(shape));
    pt = comp.Value(param);
} else {
    BRepAdaptor_Curve curve(TopoDS::Edge(shape));
    pt = curve.Value(param);
}
return {pt.X(), pt.Y(), pt.Z()};",
        includes: &[
            "BRepAdaptor_CompCurve.hxx",
            "BRepAdaptor_Curve.hxx",
            "TopoDS.hxx",
        ],
        category: "curve",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "curveTangent",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id"), FacadeParam::Double("param")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
gp_Pnt pt;
gp_Vec tangent;
if (shape.ShapeType() == TopAbs_WIRE) {
    BRepAdaptor_CompCurve comp(TopoDS::Wire(shape));
    comp.D1(param, pt, tangent);
} else {
    BRepAdaptor_Curve curve(TopoDS::Edge(shape));
    curve.D1(param, pt, tangent);
}
if (tangent.Magnitude() > 1e-10) {
    tangent.Normalize();
}
return {tangent.X(), tangent.Y(), tangent.Z()};",
        includes: &[
            "BRepAdaptor_CompCurve.hxx",
            "BRepAdaptor_Curve.hxx",
            "TopoDS.hxx",
            "gp_Vec.hxx",
        ],
        category: "curve",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "curveParameters",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
if (shape.ShapeType() == TopAbs_WIRE) {
    BRepAdaptor_CompCurve comp(TopoDS::Wire(shape));
    return {comp.FirstParameter(), comp.LastParameter()};
}
BRepAdaptor_Curve curve(TopoDS::Edge(shape));
return {curve.FirstParameter(), curve.LastParameter()};",
        includes: &[
            "BRepAdaptor_CompCurve.hxx",
            "BRepAdaptor_Curve.hxx",
            "TopoDS.hxx",
        ],
        category: "curve",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "curveIsClosed",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
if (shape.ShapeType() == TopAbs_WIRE) {
    return BRep_Tool::IsClosed(shape);
}
BRepAdaptor_Curve curve(TopoDS::Edge(shape));
return curve.IsClosed();",
        includes: &["BRepAdaptor_Curve.hxx", "BRep_Tool.hxx", "TopoDS.hxx"],
        category: "curve",
        return_type: ReturnType::Bool,
    },
    MethodSpec {
        name: "curveIsPeriodic",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
if (shape.ShapeType() == TopAbs_WIRE) {
    BRepAdaptor_CompCurve comp(TopoDS::Wire(shape));
    return comp.IsPeriodic();
}
BRepAdaptor_Curve curve(TopoDS::Edge(shape));
return curve.IsPeriodic();",
        includes: &[
            "BRepAdaptor_CompCurve.hxx",
            "BRepAdaptor_Curve.hxx",
            "TopoDS.hxx",
        ],
        category: "curve",
        return_type: ReturnType::Bool,
    },
    MethodSpec {
        name: "curveLength",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
if (shape.ShapeType() == TopAbs_WIRE) {
    BRepAdaptor_CompCurve comp(TopoDS::Wire(shape));
    return GCPnts_AbscissaPoint::Length(comp);
}
BRepAdaptor_Curve curve(TopoDS::Edge(shape));
return GCPnts_AbscissaPoint::Length(curve);",
        includes: &[
            "BRepAdaptor_CompCurve.hxx",
            "BRepAdaptor_Curve.hxx",
            "GCPnts_AbscissaPoint.hxx",
            "TopoDS.hxx",
        ],
        category: "curve",
        return_type: ReturnType::Double,
    },
    MethodSpec {
        name: "interpolatePoints",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::VectorDouble("flatPoints"),
            FacadeParam::Bool("periodic"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
int nPts = static_cast<int>(flatPoints.size()) / 3;
if (nPts < 2) {
    throw std::runtime_error(\"interpolatePoints: need at least 2 points\");
}
Handle(NCollection_HArray1<gp_Pnt>) pts = new NCollection_HArray1<gp_Pnt>(1, nPts);
for (int i = 0; i < nPts; i++) {
    pts->SetValue(i + 1,
                  gp_Pnt(flatPoints[i * 3], flatPoints[i * 3 + 1], flatPoints[i * 3 + 2]));
}
GeomAPI_Interpolate interp(pts, periodic, 1e-6);
interp.Perform();
if (!interp.IsDone()) {
    throw std::runtime_error(\"interpolatePoints: interpolation failed\");
}
BRepBuilderAPI_MakeEdge edgeMaker(interp.Curve());
if (!edgeMaker.IsDone()) {
    throw std::runtime_error(\"interpolatePoints: edge construction failed\");
}
return store(edgeMaker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeEdge.hxx",
            "GeomAPI_Interpolate.hxx",
            "NCollection_HArray1.hxx",
            "gp_Pnt.hxx",
        ],
        category: "curve",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "approximatePoints",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::VectorDouble("flatPoints"),
            FacadeParam::Double("tolerance"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
int nPts = static_cast<int>(flatPoints.size()) / 3;
if (nPts < 2) {
    throw std::runtime_error(\"approximatePoints: need at least 2 points\");
}
NCollection_Array1<gp_Pnt> pts(1, nPts);
for (int i = 0; i < nPts; i++) {
    pts.SetValue(i + 1,
                 gp_Pnt(flatPoints[i * 3], flatPoints[i * 3 + 1], flatPoints[i * 3 + 2]));
}
GeomAPI_PointsToBSpline approx(pts, 3, 8, GeomAbs_C2, tolerance);
if (!approx.IsDone()) {
    throw std::runtime_error(\"approximatePoints: approximation failed\");
}
BRepBuilderAPI_MakeEdge edgeMaker(approx.Curve());
if (!edgeMaker.IsDone()) {
    throw std::runtime_error(\"approximatePoints: edge construction failed\");
}
return store(edgeMaker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeEdge.hxx",
            "GeomAPI_PointsToBSpline.hxx",
            "GeomAbs_Shape.hxx",
            "NCollection_Array1.hxx",
            "gp_Pnt.hxx",
        ],
        category: "curve",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "liftCurve2dToPlane",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "curve",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "getNurbsCurveData",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "curve",
        return_type: ReturnType::NurbsCurveData,
    },
    // ── Evolution ───────────────────────────────────────────────────
    MethodSpec {
        name: "translateWithHistory",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "evolution",
        return_type: ReturnType::EvolutionData,
    },
    MethodSpec {
        name: "fuseWithHistory",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "evolution",
        return_type: ReturnType::EvolutionData,
    },
    MethodSpec {
        name: "cutWithHistory",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "evolution",
        return_type: ReturnType::EvolutionData,
    },
    MethodSpec {
        name: "filletWithHistory",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "evolution",
        return_type: ReturnType::EvolutionData,
    },
    MethodSpec {
        name: "rotateWithHistory",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "evolution",
        return_type: ReturnType::EvolutionData,
    },
    MethodSpec {
        name: "mirrorWithHistory",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "evolution",
        return_type: ReturnType::EvolutionData,
    },
    MethodSpec {
        name: "scaleWithHistory",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "evolution",
        return_type: ReturnType::EvolutionData,
    },
    MethodSpec {
        name: "intersectWithHistory",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "evolution",
        return_type: ReturnType::EvolutionData,
    },
    MethodSpec {
        name: "chamferWithHistory",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "evolution",
        return_type: ReturnType::EvolutionData,
    },
    MethodSpec {
        name: "shellWithHistory",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "evolution",
        return_type: ReturnType::EvolutionData,
    },
    MethodSpec {
        name: "offsetWithHistory",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "evolution",
        return_type: ReturnType::EvolutionData,
    },
    MethodSpec {
        name: "thickenWithHistory",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "evolution",
        return_type: ReturnType::EvolutionData,
    },
    // ── Projection (HLR) ────────────────────────────────────────────
    MethodSpec {
        name: "projectEdges",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "projection",
        return_type: ReturnType::ProjectionData,
    },
    // ── Healing / Repair ────────────────────────────────────────────
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
        kind: MethodKind::DirectCall,
        params: &[FacadeParam::ShapeId("wireId")],
        occt_class: "",
        ctor_args: "BRepLib::BuildCurves3d(get(wireId))",
        setup_code: "",
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
    // ── XCAF ────────────────────────────────────────────────────────
    MethodSpec {
        name: "xcafNewDocument",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "xcaf",
        return_type: ReturnType::Uint32,
    },
    MethodSpec {
        name: "xcafClose",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "xcaf",
        return_type: ReturnType::Void,
    },
    MethodSpec {
        name: "xcafAddShape",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "xcaf",
        return_type: ReturnType::Int,
    },
    MethodSpec {
        name: "xcafAddComponent",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "xcaf",
        return_type: ReturnType::Int,
    },
    MethodSpec {
        name: "xcafSetColor",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "xcaf",
        return_type: ReturnType::Void,
    },
    MethodSpec {
        name: "xcafSetName",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "xcaf",
        return_type: ReturnType::Void,
    },
    MethodSpec {
        name: "xcafGetLabelInfo",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "xcaf",
        return_type: ReturnType::XCAFLabelInfo,
    },
    MethodSpec {
        name: "xcafGetChildLabels",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "xcaf",
        return_type: ReturnType::VectorInt,
    },
    MethodSpec {
        name: "xcafGetRootLabels",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "xcaf",
        return_type: ReturnType::VectorInt,
    },
    MethodSpec {
        name: "xcafExportSTEP",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "xcaf",
        return_type: ReturnType::String,
    },
    MethodSpec {
        name: "xcafImportSTEP",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "xcaf",
        return_type: ReturnType::Uint32,
    },
    MethodSpec {
        name: "xcafExportGLTF",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "xcaf",
        return_type: ReturnType::String,
    },
    // ── Extrusion law (unimplemented in facade) ─────────────────────
    MethodSpec {
        name: "buildExtrusionLaw",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "law",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "trimLaw",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "law",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "sweepWithLaw",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "law",
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
        assert_eq!(count, 129, "expected 129 generable methods");
    }

    #[test]
    fn all_generable_methods_have_category() {
        for m in target_methods() {
            if m.kind != MethodKind::Skip {
                assert!(
                    !m.category.is_empty(),
                    "generable method '{}' is missing category",
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

    #[test]
    fn all_header_methods_have_specs() {
        // All ~165 public methods from the header should be covered.
        // This is the total count (generable + skipped).
        let total = target_methods().len();
        assert!(
            total >= 165,
            "expected at least 165 method specs, got {total}",
        );
    }

    #[test]
    fn no_duplicate_method_names() {
        let names: Vec<&str> = target_methods().iter().map(|m| m.name).collect();
        let mut seen = std::collections::HashSet::new();
        for name in &names {
            assert!(seen.insert(name), "duplicate method name: {name}");
        }
    }

    #[test]
    fn custom_body_has_setup_code() {
        for m in target_methods() {
            if m.kind == MethodKind::CustomBody {
                assert!(
                    !m.setup_code.is_empty(),
                    "CustomBody method '{}' must have setup_code",
                    m.name,
                );
            }
        }
    }
}
