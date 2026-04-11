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

/// Shape evolution data from operations with history tracking.
#[derive(Debug, Clone)]
pub struct EvolutionData {
    /// The result shape handle ID.
    pub result_id: u32,
    /// Modified face tracking data.
    pub modified: Vec<i32>,
    /// Generated face tracking data.
    pub generated: Vec<i32>,
    /// Deleted face hashes.
    pub deleted: Vec<i32>,
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
