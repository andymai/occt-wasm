/** Branded handle type — prevents passing raw numbers as shape IDs. */
declare const ShapeHandleBrand: unique symbol;
export type ShapeHandle = number & { readonly [ShapeHandleBrand]: never };

/** Triangle mesh data from tessellation. */
export interface Mesh {
    /** XYZ interleaved vertex positions. Length = vertexCount * 3. */
    positions: Float32Array;
    /** XYZ interleaved vertex normals. Length = vertexCount * 3. */
    normals: Float32Array;
    /** Triangle indices into positions/normals arrays. */
    indices: Uint32Array;
    vertexCount: number;
    triangleCount: number;
}

/** Axis-aligned bounding box. */
export interface BoundingBox {
    xmin: number;
    ymin: number;
    zmin: number;
    xmax: number;
    ymax: number;
    zmax: number;
}

/** 3D vector. */
export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

/** Options for tessellation. */
export interface TessellateOptions {
    /** Linear deflection tolerance. Default: 0.1 */
    linearDeflection?: number | undefined;
    /** Angular deflection tolerance in radians. Default: 0.5 */
    angularDeflection?: number | undefined;
}

/** Options for WASM initialization. */
export interface InitOptions {
    /** Browser: URL to .wasm file. */
    wasmUrl?: string | undefined;
    /** Node.js: filesystem path to .wasm file. */
    wasmPath?: string | undefined;
}

// --- XCAF types ---

/** RGB color as [r, g, b], each 0..1. */
export type Color3 = [number, number, number];

/** Branded label ID for type safety within an XCAF document. */
declare const LabelTagBrand: unique symbol;
export type LabelTag = number & { readonly [LabelTagBrand]: never };

/** Position + rotation for assembly component placement. */
export interface Location {
    tx?: number | undefined;
    ty?: number | undefined;
    tz?: number | undefined;
    rx?: number | undefined;
    ry?: number | undefined;
    rz?: number | undefined;
}

/** Options for adding a shape to an XCAF document. */
export interface AddShapeOptions {
    name?: string | undefined;
    color?: Color3 | undefined;
}

/** Options for adding a child component. */
export interface AddChildOptions extends AddShapeOptions {
    location?: Location | undefined;
}

/** Info about a label in an XCAF document. */
export interface LabelInfo {
    labelId: number;
    name: string;
    hasColor: boolean;
    color: Color3;
    isAssembly: boolean;
    isComponent: boolean;
    shapeHandle: ShapeHandle | null;
}

/** Options for glTF export. */
export interface GLTFExportOptions {
    linearDeflection?: number | undefined;
    angularDeflection?: number | undefined;
}

/** Typed error from OCCT operations. */
export class OcctError extends Error {
    readonly operation: string;

    constructor(operation: string, message: string) {
        super(`${operation}: ${message}`);
        this.name = "OcctError";
        this.operation = operation;
    }
}
