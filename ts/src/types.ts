/**
 * Branded handle type — prevents passing raw numbers as shape IDs.
 * Obtain handles from kernel methods; release via {@link OcctKernel.release}.
 */
declare const ShapeHandleBrand: unique symbol;
export type ShapeHandle = number & { readonly [ShapeHandleBrand]: never };

/** Triangle mesh data produced by BRepMesh tessellation. */
export interface Mesh {
    /** XYZ interleaved vertex positions. Length = vertexCount * 3. */
    positions: Float32Array;
    /** XYZ interleaved vertex normals. Length = vertexCount * 3. */
    normals: Float32Array;
    /** Triangle indices into the positions/normals arrays. */
    indices: Uint32Array;
    /** Number of vertices (positions.length / 3). */
    vertexCount: number;
    /** Number of triangles (indices.length / 3). */
    triangleCount: number;
    /** Per-face triangle groups: [triStart, triCount, faceHash] triples. Present when using meshShape(). */
    faceGroups?: Int32Array | undefined;
    /** Number of face groups. Present when using meshShape(). */
    faceCount?: number | undefined;
}

/** Axis-aligned bounding box (AABB). */
export interface BoundingBox {
    xmin: number;
    ymin: number;
    zmin: number;
    xmax: number;
    ymax: number;
    zmax: number;
}

/** 3D point or direction vector. */
export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

/** Options controlling BRepMesh tessellation quality. */
export interface TessellateOptions {
    /** Maximum chord deviation from the true surface. Default: 0.1 */
    linearDeflection?: number | undefined;
    /** Maximum angular deviation in radians. Default: 0.5 */
    angularDeflection?: number | undefined;
}

/** Options for WASM module initialization. */
export interface InitOptions {
    /** Browser: URL to the .wasm file (e.g. from a CDN or bundler public path). */
    wasmUrl?: string | undefined;
    /** Node.js: filesystem path to the .wasm file. */
    wasmPath?: string | undefined;
}

// --- XCAF types ---

/** RGB color triple, each channel in the range 0..1. */
export type Color3 = [number, number, number];

/**
 * Branded label ID for type safety within an XCAF document.
 * Obtained from {@link XCAFDocument} methods; not interchangeable across documents.
 */
declare const LabelTagBrand: unique symbol;
export type LabelTag = number & { readonly [LabelTagBrand]: never };

/** Translation + rotation for positioning an assembly component. */
export interface Location {
    /** Translation along X. */
    tx?: number | undefined;
    /** Translation along Y. */
    ty?: number | undefined;
    /** Translation along Z. */
    tz?: number | undefined;
    /** Rotation around X in radians. */
    rx?: number | undefined;
    /** Rotation around Y in radians. */
    ry?: number | undefined;
    /** Rotation around Z in radians. */
    rz?: number | undefined;
}

/** Options for adding a root shape to an XCAF document. */
export interface AddShapeOptions {
    /** Display name for the label. */
    name?: string | undefined;
    /** RGB color to assign to the shape label. */
    color?: Color3 | undefined;
}

/** Options for adding a child component to an assembly label. */
export interface AddChildOptions extends AddShapeOptions {
    /** Placement transform relative to the parent. */
    location?: Location | undefined;
}

/** Metadata for a label in an XCAF document. */
export interface LabelInfo {
    /** Numeric label ID within the document. */
    labelId: number;
    /** Display name (empty string if unset). */
    name: string;
    /** Whether a color has been explicitly set on this label. */
    hasColor: boolean;
    /** RGB color (meaningful only when hasColor is true). */
    color: Color3;
    /** True if this label is an assembly (has child components). */
    isAssembly: boolean;
    /** True if this label is a component reference. */
    isComponent: boolean;
    /** Associated shape handle, or null if the label has no shape. */
    shapeHandle: ShapeHandle | null;
}

/** Options for glTF export via XCAF. */
export interface GLTFExportOptions {
    /** Maximum chord deviation for mesh generation. */
    linearDeflection?: number | undefined;
    /** Maximum angular deviation in radians for mesh generation. */
    angularDeflection?: number | undefined;
}

/** TopAbs_ShapeEnum value returned by getShapeType. */
export type ShapeType = "compound" | "compsolid" | "solid" | "shell" | "face" | "wire" | "edge" | "vertex" | "shape";

/** TopAbs_Orientation value returned by shapeOrientation. */
export type ShapeOrientation = "forward" | "reversed" | "internal" | "external";

/** BRepClass_FaceClassifier result for a UV point relative to a face boundary. */
export type PointClassification = "in" | "on" | "out";

/** Geom_Surface subclass identifier returned by surfaceType. */
export type SurfaceKind = "plane" | "cylinder" | "cone" | "sphere" | "torus" | "bspline" | "bezier" | "offset" | "revolution" | "extrusion" | (string & {});

/** Geom_Curve subclass identifier returned by curveType. */
export type CurveKind = "line" | "circle" | "ellipse" | "hyperbola" | "parabola" | "bspline" | "bezier" | "offset" | (string & {});

/** Transition mode for BRepBuilderAPI_MakeSweep. 0=transformed, 1=right-corner, 2=round-corner. */
export type TransitionMode = 0 | 1 | 2;

/** Join type for BRepOffsetAPI_MakeOffset. 0=arc, 1=tangent, 2=intersection. */
export type JoinType = 0 | 1 | 2;

/** Boolean operation code for booleanPipeline. 0=fuse, 1=cut, 2=common. */
export type BooleanOp = 0 | 1 | 2;

/** UV parameter bounds of a face surface. */
export interface UVBounds {
    uMin: number;
    uMax: number;
    vMin: number;
    vMax: number;
}

/** Principal curvatures at a UV point on a face surface. */
export interface CurvatureData {
    /** Minimum principal curvature. */
    min: number;
    /** Maximum principal curvature. */
    max: number;
    /** Gaussian curvature (min * max). */
    gaussian: number;
    /** Mean curvature ((min + max) / 2). */
    mean: number;
}

/** Polyline edge data from wireframe tessellation. */
export interface EdgeData {
    /** XYZ interleaved edge sample points. Length = pointCount. */
    points: Float32Array;
    /** Per-edge groups: [pointStart, pointCount, edgeHash] triples. */
    edgeGroups: Int32Array;
    /** Total number of floats in points (= number of XYZ coords). */
    pointCount: number;
    /** Number of distinct edges. */
    edgeCount: number;
}

/**
 * Shape history data from an operation that tracks face evolution.
 * Maps input face hashes to their modified/generated/deleted status.
 */
export interface EvolutionData {
    /** Result shape handle. */
    result: ShapeHandle;
    /** Face hashes from the input that were modified in the result. */
    modified: number[];
    /** New face hashes generated by the operation. */
    generated: number[];
    /** Face hashes from the input that no longer exist in the result. */
    deleted: number[];
}

/** HLR (hidden line removal) projection result, split by visibility and edge category. */
export interface ProjectionData {
    /** Visible silhouette/outline edges. */
    visibleOutline: ShapeHandle;
    /** Visible smooth (tangent-continuous) edges. */
    visibleSmooth: ShapeHandle;
    /** Visible sharp (G1-discontinuous) edges. */
    visibleSharp: ShapeHandle;
    /** Hidden silhouette/outline edges. */
    hiddenOutline: ShapeHandle;
    /** Hidden smooth edges. */
    hiddenSmooth: ShapeHandle;
    /** Hidden sharp edges. */
    hiddenSharp: ShapeHandle;
}

/** NURBS/BSpline curve data extracted from an edge via Geom_BSplineCurve. */
export interface NurbsCurveData {
    /** Polynomial degree of the BSpline. */
    degree: number;
    /** True if the curve uses rational weights. */
    rational: boolean;
    /** True if the curve is periodic. */
    periodic: boolean;
    /** Knot values. */
    knots: number[];
    /** Knot multiplicities (same length as knots). */
    multiplicities: number[];
    /** Flat [x,y,z, x,y,z, ...] control point coordinates. */
    poles: number[];
    /** Control point weights (same count as poles/3). */
    weights: number[];
}

/** Concatenated mesh data for multiple shapes, produced by meshBatch. */
export interface MeshBatchData {
    /** Interleaved XYZ positions for all shapes. */
    positions: Float32Array;
    /** Interleaved XYZ normals for all shapes. */
    normals: Float32Array;
    /** Triangle indices for all shapes. */
    indices: Uint32Array;
    /** Per-shape offsets: [posStart, posCount, idxStart, idxCount] quads. */
    shapeOffsets: Int32Array;
    /** Number of shapes in the batch. */
    shapeCount: number;
    /** Total vertex count across all shapes. */
    vertexCount: number;
    /** Total triangle count across all shapes. */
    triangleCount: number;
}

/**
 * Typed error thrown when an OCCT operation fails.
 * The `operation` field identifies which kernel method raised the error.
 */
export class OcctError extends Error {
    /** Name of the kernel method that failed. */
    readonly operation: string;

    constructor(operation: string, message: string) {
        super(`${operation}: ${message}`);
        this.name = "OcctError";
        this.operation = operation;
    }
}
