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
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "booleans",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "fuseAll",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "booleans",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "cutAll",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "booleans",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "split",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
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
        name: "shell",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "modeling",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "offset",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "modeling",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "draft",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
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
        assert_eq!(count, 39, "expected 39 generable methods");
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
