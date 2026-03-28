//! IR types for the facade code generator.
//!
//! Every type uses `&'static str` and `&'static [...]` so that method
//! specifications can be expressed as compile-time constants with zero
//! allocation overhead.

/// How a facade method wraps an OCCT class.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MethodKind {
    /// Instantiate OCCT class with `ctor_args`, call `Build()`, check
    /// `IsDone()`, extract `Shape()`, and store via `store()`.
    SimpleShape,

    /// Boolean operation: takes two shape IDs, builds the op, checks
    /// `HasErrors()`, and stores the result.
    BooleanOp,

    /// Fillet/chamfer pattern: takes a solid ID, a vector of edge IDs,
    /// and a scalar value. Downcasts to `TopoDS::Solid`, iterates edges
    /// with `Add(value, TopoDS::Edge(...))`.
    FilletLike,

    /// Arbitrary setup code before OCCT class instantiation. Uses
    /// `setup_code` for pre-constructor statements, then constructs with
    /// `ctor_args` and stores the result. No `Build()`/`IsDone()` check.
    SetupShape,

    /// Direct call: emits `ctor_args` as a direct expression body.
    /// Used for query methods, void methods, topology methods that
    /// don't instantiate an OCCT class.
    DirectCall,

    /// Custom body: emits the `setup_code` field verbatim as the entire
    /// method body (inside `try/catch`). Used for complex one-off logic.
    CustomBody,

    /// Not auto-generated — the hand-written implementation uses complex
    /// multi-step logic that doesn't fit a template.
    Skip,
}

/// A single facade method parameter.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FacadeParam {
    /// `uint32_t` shape ID resolved via `get(id)`.
    ShapeId(&'static str),

    /// `double` scalar value.
    Double(&'static str),

    /// `std::vector<uint32_t>` of shape IDs.
    VectorShapeIds(&'static str),

    /// `bool` flag.
    Bool(&'static str),

    /// `int` integer.
    Int(&'static str),

    /// `std::string` value.
    String(&'static str),

    /// `std::vector<double>` of double values.
    VectorDouble(&'static str),

    /// `std::vector<int>` of int values.
    VectorInt(&'static str),
}

impl FacadeParam {
    /// Returns the parameter name.
    #[allow(dead_code)] // Will be used when parser validates signatures.
    pub const fn name(self) -> &'static str {
        match self {
            Self::ShapeId(n)
            | Self::Double(n)
            | Self::VectorShapeIds(n)
            | Self::Bool(n)
            | Self::Int(n)
            | Self::String(n)
            | Self::VectorDouble(n)
            | Self::VectorInt(n) => n,
        }
    }
}

/// What the method returns.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReturnType {
    /// A `uint32_t` shape ID stored in the arena.
    ShapeId,
    /// A `double` value.
    Double,
    /// A `std::string` value.
    String,
    /// A `bool` value.
    Bool,
    /// `void` — no return value.
    Void,
    /// `int` value.
    Int,
    /// `uint32_t` (non-shape, e.g. document ID or count).
    Uint32,
    /// `BBoxData` struct.
    BBoxData,
    /// `MeshData` struct.
    MeshData,
    /// `EdgeData` struct.
    EdgeData,
    /// `MeshBatchData` struct.
    MeshBatchData,
    /// `EvolutionData` struct.
    EvolutionData,
    /// `ProjectionData` struct.
    ProjectionData,
    /// `NurbsCurveData` struct.
    NurbsCurveData,
    /// `std::vector<uint32_t>`.
    VectorUint32,
    /// `std::vector<double>`.
    VectorDouble,
    /// `std::vector<int>`.
    VectorInt,
    /// `XCAFLabelInfo` struct.
    XCAFLabelInfo,
}

impl ReturnType {
    /// Returns the C++ return type string.
    pub const fn cpp_type(self) -> &'static str {
        match self {
            Self::ShapeId | Self::Uint32 => "uint32_t",
            Self::Double => "double",
            Self::String => "std::string",
            Self::Bool => "bool",
            Self::Void => "void",
            Self::Int => "int",
            Self::BBoxData => "BBoxData",
            Self::MeshData => "MeshData",
            Self::EdgeData => "EdgeData",
            Self::MeshBatchData => "MeshBatchData",
            Self::EvolutionData => "EvolutionData",
            Self::ProjectionData => "ProjectionData",
            Self::NurbsCurveData => "NurbsCurveData",
            Self::VectorUint32 => "std::vector<uint32_t>",
            Self::VectorDouble => "std::vector<double>",
            Self::VectorInt => "std::vector<int>",
            Self::XCAFLabelInfo => "XCAFLabelInfo",
        }
    }
}

/// A complete facade method specification.
///
/// Each spec declaratively describes one method of `OcctKernel` so the
/// code generator can emit both the C++ implementation and the Embind
/// binding from a single source of truth.
#[derive(Debug, Clone, Copy)]
pub struct MethodSpec {
    /// Facade method name (e.g. `"makeBox"`).
    pub name: &'static str,

    /// Generation strategy.
    pub kind: MethodKind,

    /// Ordered parameter list.
    pub params: &'static [FacadeParam],

    /// OCCT class to instantiate (e.g. `"BRepPrimAPI_MakeBox"`).
    pub occt_class: &'static str,

    /// C++ expression passed to the OCCT constructor.
    pub ctor_args: &'static str,

    /// C++ statements emitted before the OCCT constructor (e.g. `gp_Trsf` setup).
    /// For `SetupShape`: pre-constructor statements.
    /// For `CustomBody`: the entire method body (inside try/catch).
    /// Empty string for other kinds.
    pub setup_code: &'static str,

    /// `#include` directives required beyond the OCCT class header.
    pub includes: &'static [&'static str],

    /// Logical grouping for the generated source file (e.g. `"primitives"`).
    pub category: &'static str,

    /// Return type of the method.
    pub return_type: ReturnType,
}
