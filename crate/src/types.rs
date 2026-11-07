//! Data types for the occt-wasm Rust API.
//!
//! These mirror the TypeScript types in `ts/src/types.ts`.

/// Opaque handle to a shape in the WASM arena.
///
/// Handles are created by kernel methods (e.g. `make_box`) and consumed by
/// operations (e.g. `fuse`). They are valid until released or the kernel is
/// dropped.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct ShapeHandle(pub(crate) u32);

impl ShapeHandle {
    /// Returns the raw arena ID. Useful for debugging.
    #[must_use]
    pub const fn id(self) -> u32 {
        self.0
    }
}

/// Handle to an XCAF document owned by the kernel.
///
/// Returned by `xcaf_new_document` and `xcaf_import_step`, and taken by every
/// other `xcaf_*` method. Freed with `xcaf_close`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct DocumentHandle(pub(crate) u32);

impl DocumentHandle {
    /// Returns the raw document ID. Useful for debugging.
    #[must_use]
    pub const fn id(self) -> u32 {
        self.0
    }
}

/// A 3D vector or point.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Vec3 {
    /// X component.
    pub x: f64,
    /// Y component.
    pub y: f64,
    /// Z component.
    pub z: f64,
}

/// Axis-aligned bounding box.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BoundingBox {
    /// Minimum corner.
    pub min: Vec3,
    /// Maximum corner.
    pub max: Vec3,
}

/// Triangle mesh data from tessellation.
#[derive(Debug, Clone)]
pub struct Mesh {
    /// Vertex positions, xyz interleaved. Length = `vertex_count * 3`.
    pub positions: Vec<f32>,
    /// Vertex normals, xyz interleaved. Length = `vertex_count * 3`.
    pub normals: Vec<f32>,
    /// Triangle indices. Length = `triangle_count * 3`.
    pub indices: Vec<u32>,
    /// Per-face groups: `[tri_start, tri_count, face_hash]` repeated.
    pub face_groups: Vec<i32>,
}

/// Batched mesh data for multiple shapes.
#[derive(Debug, Clone)]
pub struct MeshBatch {
    /// Concatenated vertex positions.
    pub positions: Vec<f32>,
    /// Concatenated vertex normals.
    pub normals: Vec<f32>,
    /// Concatenated triangle indices.
    pub indices: Vec<u32>,
    /// Per-shape offsets: `[pos_start, pos_count, idx_start, idx_count]` repeated.
    pub shape_offsets: Vec<i32>,
}

/// Wireframe edge data.
#[derive(Debug, Clone)]
pub struct EdgeData {
    /// Edge points, xyz interleaved.
    pub points: Vec<f32>,
    /// Per-edge groups: `[point_start, point_count, edge_hash]` repeated.
    pub edge_groups: Vec<i32>,
}

/// NURBS/BSpline curve data.
#[derive(Debug, Clone)]
pub struct NurbsCurveData {
    /// Polynomial degree.
    pub degree: i32,
    /// Whether the curve is rational.
    pub rational: bool,
    /// Whether the curve is periodic.
    pub periodic: bool,
    /// Knot values.
    pub knots: Vec<f64>,
    /// Knot multiplicities.
    pub multiplicities: Vec<i32>,
    /// Control point coordinates, xyz interleaved.
    pub poles: Vec<f64>,
    /// Control point weights (empty if not rational).
    pub weights: Vec<f64>,
}

/// A B-spline surface, in the layout `nurbs_surface` takes.
#[derive(Debug, Clone)]
#[non_exhaustive]
pub struct NurbsSurfaceData {
    /// Degree along u.
    pub degree_u: i32,
    /// Degree along v.
    pub degree_v: i32,
    /// Number of poles along u.
    pub nb_poles_u: i32,
    /// Number of poles along v.
    pub nb_poles_v: i32,
    /// Whether the surface is periodic along u.
    pub periodic_u: bool,
    /// Whether the surface is periodic along v.
    pub periodic_v: bool,
    /// Knot values along u.
    pub knots_u: Vec<f64>,
    /// Knot values along v.
    pub knots_v: Vec<f64>,
    /// Multiplicity of each knot along u.
    pub multiplicities_u: Vec<i32>,
    /// Multiplicity of each knot along v.
    pub multiplicities_v: Vec<i32>,
    /// Pole coordinates, xyz interleaved; pole `(i, j)` is at `i * nb_poles_v + j`.
    pub poles: Vec<f64>,
    /// Pole weights in the same order (empty if not rational).
    pub weights: Vec<f64>,
}

/// The geometry of a curve, by kind.
#[derive(Debug, Clone)]
#[non_exhaustive]
pub enum CurveGeometry {
    /// A straight line.
    Line {
        /// A point on the line.
        point: Vec3,
        /// The line's direction.
        direction: Vec3,
    },
    /// A circle.
    Circle {
        /// The circle's center.
        center: Vec3,
        /// The normal of the circle's plane.
        axis: Vec3,
        /// The direction of parameter 0 from the center.
        x_direction: Vec3,
        /// The radius.
        radius: f64,
    },
    /// An ellipse.
    Ellipse {
        /// The ellipse's center.
        center: Vec3,
        /// The normal of the ellipse's plane.
        axis: Vec3,
        /// The direction of the major axis.
        major_direction: Vec3,
        /// The major radius.
        major_radius: f64,
        /// The minor radius.
        minor_radius: f64,
    },
    /// A hyperbola.
    Hyperbola {
        /// The hyperbola's center.
        center: Vec3,
        /// The normal of the hyperbola's plane.
        axis: Vec3,
        /// The direction of the major axis.
        major_direction: Vec3,
        /// The major radius.
        major_radius: f64,
        /// The minor radius.
        minor_radius: f64,
    },
    /// A parabola.
    Parabola {
        /// The parabola's vertex.
        vertex: Vec3,
        /// The normal of the parabola's plane.
        axis: Vec3,
        /// The direction of the parabola's axis of symmetry.
        x_direction: Vec3,
        /// The focal length.
        focal: f64,
    },
    /// A B-spline. Holds the whole curve the edge lies on.
    BSpline(NurbsCurveData),
    /// A kind without exact parameters here.
    Other {
        /// The kind, as `curve_type` names it.
        kind: String,
        /// A B-spline form, when OCCT can convert the curve: the whole curve for
        /// a Bezier, the edge's range otherwise. Only this conversion can
        /// approximate: an offset curve is fitted to 1e-4.
        bspline: Option<NurbsCurveData>,
    },
}

/// Exact parameters of an edge's curve, with the shape's location applied.
#[derive(Debug, Clone)]
#[non_exhaustive]
pub struct CurveData {
    /// The edge's first parameter on the curve.
    pub first: f64,
    /// The edge's last parameter on the curve.
    pub last: f64,
    /// The curve's geometry.
    pub geometry: CurveGeometry,
}

/// The placement of an elementary surface.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SurfaceFrame {
    /// The frame's origin.
    pub location: Vec3,
    /// The frame's main axis. For a plane, its normal, ignoring the face's orientation.
    pub axis: Vec3,
    /// The frame's x direction.
    pub x_direction: Vec3,
    /// False for a left-handed frame.
    pub is_direct: bool,
}

/// Exact parameters of a face's surface, with the shape's location applied.
#[derive(Debug, Clone)]
#[non_exhaustive]
pub enum SurfaceData {
    /// A plane.
    Plane(SurfaceFrame),
    /// A cylinder.
    Cylinder {
        /// The cylinder's placement.
        frame: SurfaceFrame,
        /// The radius.
        radius: f64,
    },
    /// A cone.
    Cone {
        /// The cone's placement.
        frame: SurfaceFrame,
        /// The radius at the frame's location.
        ref_radius: f64,
        /// The half-angle at the apex, in radians.
        semi_angle: f64,
    },
    /// A sphere.
    Sphere {
        /// The sphere's placement.
        frame: SurfaceFrame,
        /// The radius.
        radius: f64,
    },
    /// A torus.
    Torus {
        /// The torus's placement.
        frame: SurfaceFrame,
        /// The major radius.
        major_radius: f64,
        /// The minor radius.
        minor_radius: f64,
    },
    /// A B-spline. Holds the whole surface the face lies on.
    BSpline(NurbsSurfaceData),
    /// A kind without exact parameters here.
    Other {
        /// The kind, as `surface_type` names it.
        kind: String,
        /// A B-spline form, when OCCT can convert the surface: the whole surface
        /// for a Bezier, the face's UV bounds otherwise. Only this conversion can
        /// approximate: an offset surface is fitted to 1e-4.
        bspline: Option<NurbsSurfaceData>,
    },
}

/// Shape evolution data from operations with history tracking.
///
/// Faces are reported for the input face hashes passed in. Edges are reported
/// for every edge of the input, best effort: if OCCT fails while answering for
/// an input's edges, that input contributes no edge entries and the operation
/// still succeeds.
///
/// `modified`, `generated`, `edge_modified` and `edge_generated` are run-length
/// encoded as `[input_hash, count, result_hash, ...]`, one group per input
/// shape that has any. `deleted` and `edge_deleted` are flat input hashes.
/// `edge_generated` holds result shapes of any type: a fillet's or chamfer's
/// face is reported there, under the input edge it replaces.
///
/// A sweep's faces are in `edge_generated` too, under the profile edge that swept
/// them, and `generated` holds the solid a profile face swept into. Only the sweeps
/// fill the last three fields.
#[derive(Debug, Clone)]
#[non_exhaustive]
pub struct EvolutionData {
    /// The result shape handle ID.
    pub result_id: u32,
    /// Modified face tracking data.
    pub modified: Vec<i32>,
    /// Generated face tracking data.
    pub generated: Vec<i32>,
    /// Deleted face hashes.
    pub deleted: Vec<i32>,
    /// Modified edge tracking data.
    pub edge_modified: Vec<i32>,
    /// Shapes generated from input edges, keyed by the input edge hash.
    pub edge_generated: Vec<i32>,
    /// Deleted edge hashes.
    pub edge_deleted: Vec<i32>,
    /// Result hashes of the faces capping the start of a sweep. Empty when it has none.
    pub first_shape: Vec<i32>,
    /// Result hashes of the faces capping the end of a sweep. Empty when it has none.
    pub last_shape: Vec<i32>,
    /// The faces each spine edge and profile edge swept into together, encoded as
    /// `[spine_edge_hash, profile_edge_hash, count, face_hash, ...]`.
    pub spine_generated: Vec<i32>,
}

impl EvolutionData {
    /// The result as a handle, to pass on to further operations.
    #[must_use]
    pub const fn result(&self) -> ShapeHandle {
        ShapeHandle(self.result_id)
    }
}

/// Hidden line removal projection result.
#[derive(Debug, Clone)]
pub struct ProjectionData {
    /// Visible outline edges.
    pub visible_outline: ShapeHandle,
    /// Visible smooth edges.
    pub visible_smooth: ShapeHandle,
    /// Visible sharp edges.
    pub visible_sharp: ShapeHandle,
    /// Hidden outline edges.
    pub hidden_outline: ShapeHandle,
    /// Hidden smooth edges.
    pub hidden_smooth: ShapeHandle,
    /// Hidden sharp edges.
    pub hidden_sharp: ShapeHandle,
}

/// XCAF document label information.
#[derive(Debug, Clone)]
pub struct LabelInfo {
    /// Label ID within the document.
    pub label_id: i32,
    /// Label name.
    pub name: String,
    /// Whether this label has a color assigned.
    pub has_color: bool,
    /// Red component (0.0-1.0).
    pub r: f64,
    /// Green component (0.0-1.0).
    pub g: f64,
    /// Blue component (0.0-1.0).
    pub b: f64,
    /// Whether this label represents an assembly.
    pub is_assembly: bool,
    /// Whether this label represents a component instance.
    pub is_component: bool,
    /// Shape handle ID (0 if no shape).
    pub shape_id: u32,
}
