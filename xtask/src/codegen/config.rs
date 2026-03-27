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
        includes: &[],
        category: "primitives",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeEllipsoid",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        includes: &[],
        category: "primitives",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeRectangle",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        includes: &[],
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
        includes: &[],
        category: "modeling",
        return_type: ReturnType::ShapeId,
    },
    // ── Transforms (all skipped — gp_Trsf setup doesn't fit templates) ──
    MethodSpec {
        name: "translate",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        includes: &[],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "rotate",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        includes: &[],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "scale",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        includes: &[],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "mirror",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        includes: &[],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "copy",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        includes: &[],
        category: "transforms",
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
        assert_eq!(count, 14, "expected 14 generable methods in first pass");
    }

    #[test]
    fn all_generable_methods_have_occt_class() {
        for m in target_methods() {
            if m.kind != MethodKind::Skip {
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
