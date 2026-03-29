/**
 * occt-wasm — OCCT compiled to WASM with clean TypeScript bindings.
 *
 * @example
 * ```ts
 * import { OcctKernel } from 'occt-wasm';
 *
 * const kernel = await OcctKernel.init();
 * const box = kernel.makeBox(10, 20, 30);
 * const mesh = kernel.tessellate(box);
 * console.log(`${mesh.triangleCount} triangles`);
 * kernel.release(box);
 * ```
 */

export {
    BooleanOp,
    JoinType,
    OcctError,
    OcctErrorCode,
    TransitionMode,
    type AddChildOptions,
    type AddShapeOptions,
    type BoundingBox,
    type Color3,
    type CurveKind,
    type CurvatureData,
    type EdgeData,
    type EvolutionData,
    type GLTFExportOptions,
    type InitOptions,
    type LabelInfo,
    type LabelTag,
    type Location,
    type Mesh,
    type MeshBatchData,
    type NurbsCurveData,
    type PointClassification,
    type ProjectionData,
    type ShapeHandle,
    type ShapeOrientation,
    type ShapeType,
    type SurfaceKind,
    type TessellateOptions,
    type UVBounds,
    type Vec3,
} from "./types.js";

export { XCAFDocument, type EmscriptenFS } from "./xcaf-document.js";
import { XCAFDocument as XCAFDocumentImpl, type EmscriptenFS } from "./xcaf-document.js";

import type {
    BoundingBox,
    CurveKind,
    CurvatureData,
    EdgeData,
    EvolutionData,
    InitOptions,
    Mesh,
    MeshBatchData,
    NurbsCurveData,
    PointClassification,
    ProjectionData,
    ShapeHandle,
    ShapeOrientation,
    ShapeType,
    SurfaceKind,
    TessellateOptions,
    BooleanOp,
    UVBounds,
    Vec3,
} from "./types.js";
import { JoinType, OcctError, TransitionMode } from "./types.js";

// ---------------------------------------------------------------------------
// Internal Embind types
// ---------------------------------------------------------------------------

interface EmscriptenModule {
    OcctKernel: new () => RawKernel;
    VectorUint32: new () => EmbindVectorU32;
    VectorDouble: new () => EmbindVectorF64;
    VectorInt: new () => EmbindVectorI32;
    HEAPF32: Float32Array;
    HEAPU32: Uint32Array;
    HEAP32: Int32Array;
    FS: EmscriptenFS;
}

interface RawMeshData {
    positionCount: number;
    normalCount: number;
    indexCount: number;
    faceGroupCount: number;
    getPositionsPtr(): number;
    getNormalsPtr(): number;
    getIndicesPtr(): number;
    getFaceGroupsPtr(): number;
    delete(): void;
}

interface RawMeshBatchData {
    positionCount: number;
    normalCount: number;
    indexCount: number;
    shapeCount: number;
    getPositionsPtr(): number;
    getNormalsPtr(): number;
    getIndicesPtr(): number;
    getShapeOffsetsPtr(): number;
    delete(): void;
}

interface RawEdgeData {
    pointCount: number;
    edgeGroupCount: number;
    getPointsPtr(): number;
    getEdgeGroupsPtr(): number;
    delete(): void;
}

interface RawEvolutionData {
    resultId: number;
    modified: EmbindVectorI32;
    generated: EmbindVectorI32;
    deleted: EmbindVectorI32;
}

interface RawProjectionData {
    visibleOutline: number;
    visibleSmooth: number;
    visibleSharp: number;
    hiddenOutline: number;
    hiddenSmooth: number;
    hiddenSharp: number;
}

interface RawNurbsCurveData {
    degree: number;
    rational: boolean;
    periodic: boolean;
    knots: EmbindVectorF64;
    multiplicities: EmbindVectorI32;
    poles: EmbindVectorF64;
    weights: EmbindVectorF64;
}

interface EmbindVectorU32 {
    push_back(v: number): void;
    get(i: number): number;
    size(): number;
    delete(): void;
}

interface EmbindVectorF64 {
    push_back(v: number): void;
    get(i: number): number;
    size(): number;
    delete(): void;
}

interface EmbindVectorI32 {
    push_back(v: number): void;
    get(i: number): number;
    size(): number;
    delete(): void;
}

interface RawKernel {
    // Arena
    release(id: number): void;
    releaseAll(): void;
    getShapeCount(): number;

    // Primitives
    makeBox(dx: number, dy: number, dz: number): number;
    makeBoxFromCorners(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number;
    makeCylinder(radius: number, height: number): number;
    makeSphere(radius: number): number;
    makeCone(r1: number, r2: number, height: number): number;
    makeTorus(majorRadius: number, minorRadius: number): number;
    makeEllipsoid(rx: number, ry: number, rz: number): number;
    makeRectangle(width: number, height: number): number;

    // Booleans
    fuse(a: number, b: number): number;
    cut(a: number, b: number): number;
    common(a: number, b: number): number;
    intersect(a: number, b: number): number;
    section(a: number, b: number): number;
    fuseAll(shapeIds: EmbindVectorU32): number;
    cutAll(shapeId: number, toolIds: EmbindVectorU32): number;
    split(shapeId: number, toolIds: EmbindVectorU32): number;

    // Modeling
    extrude(id: number, dx: number, dy: number, dz: number): number;
    revolve(id: number, px: number, py: number, pz: number, dx: number, dy: number, dz: number, angle: number): number;
    fillet(solidId: number, edgeIds: EmbindVectorU32, radius: number): number;
    chamfer(solidId: number, edgeIds: EmbindVectorU32, distance: number): number;
    chamferDistAngle(solidId: number, edgeIds: EmbindVectorU32, distance: number, angleDeg: number): number;
    shell(solidId: number, faceIds: EmbindVectorU32, thickness: number): number;
    offset(solidId: number, distance: number): number;
    draft(shapeId: number, faceId: number, angle: number, dx: number, dy: number, dz: number): number;

    // Sweeps
    pipe(profileId: number, spineId: number): number;
    simplePipe(profileId: number, spineId: number): number;
    loft(wireIds: EmbindVectorU32, isSolid: boolean): number;
    loftWithVertices(wireIds: EmbindVectorU32, isSolid: boolean, startVertexId: number, endVertexId: number): number;
    sweep(wireId: number, spineId: number, transitionMode: number): number;
    sweepPipeShell(profileId: number, spineId: number, freenet: boolean, smooth: boolean): number;
    draftPrism(shapeId: number, dx: number, dy: number, dz: number, angleDeg: number): number;
    revolveVec(shapeId: number, cx: number, cy: number, cz: number, dx: number, dy: number, dz: number, angle: number): number;

    // Construction
    makeVertex(x: number, y: number, z: number): number;
    makeEdge(v1: number, v2: number): number;
    makeLineEdge(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number;
    makeCircleEdge(cx: number, cy: number, cz: number, nx: number, ny: number, nz: number, radius: number): number;
    makeCircleArc(cx: number, cy: number, cz: number, nx: number, ny: number, nz: number, radius: number, startAngle: number, endAngle: number): number;
    makeArcEdge(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, x3: number, y3: number, z3: number): number;
    makeEllipseEdge(cx: number, cy: number, cz: number, nx: number, ny: number, nz: number, majorRadius: number, minorRadius: number): number;
    makeEllipseArc(cx: number, cy: number, cz: number, nx: number, ny: number, nz: number, majorRadius: number, minorRadius: number, startAngle: number, endAngle: number): number;
    makeBezierEdge(flatPoints: EmbindVectorF64): number;
    makeTangentArc(x1: number, y1: number, z1: number, tx: number, ty: number, tz: number, x2: number, y2: number, z2: number): number;
    makeHelixWire(px: number, py: number, pz: number, dx: number, dy: number, dz: number, pitch: number, height: number, radius: number): number;
    makeWire(edgeIds: EmbindVectorU32): number;
    makeFace(wireId: number): number;
    makeNonPlanarFace(wireId: number): number;
    addHolesInFace(faceId: number, holeWireIds: EmbindVectorU32): number;
    removeHolesFromFace(faceId: number, holeIndices: EmbindVectorI32): number;
    solidFromShell(shellId: number): number;
    makeSolid(shellId: number): number;
    sew(shapeIds: EmbindVectorU32, tolerance: number): number;
    sewAndSolidify(faceIds: EmbindVectorU32, tolerance: number): number;
    buildSolidFromFaces(faceIds: EmbindVectorU32, tolerance: number): number;
    makeCompound(shapeIds: EmbindVectorU32): number;
    buildTriFace(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): number;
    makeFaceOnSurface(faceId: number, wireId: number): number;

    // Transforms
    translate(id: number, dx: number, dy: number, dz: number): number;
    rotate(id: number, px: number, py: number, pz: number, dx: number, dy: number, dz: number, angle: number): number;
    scale(id: number, px: number, py: number, pz: number, factor: number): number;
    mirror(id: number, px: number, py: number, pz: number, nx: number, ny: number, nz: number): number;
    copy(id: number): number;
    transform(id: number, matrix: EmbindVectorF64): number;
    generalTransform(id: number, matrix: EmbindVectorF64): number;
    linearPattern(id: number, dx: number, dy: number, dz: number, spacing: number, count: number): number;
    circularPattern(id: number, cx: number, cy: number, cz: number, ax: number, ay: number, az: number, angle: number, count: number): number;
    composeTransform(m1: EmbindVectorF64, m2: EmbindVectorF64): EmbindVectorF64;

    // Batch
    translateBatch(ids: EmbindVectorU32, offsets: EmbindVectorF64): EmbindVectorU32;
    booleanPipeline(baseId: number, opCodes: EmbindVectorI32, toolIds: EmbindVectorU32): number;

    // Topology
    getShapeType(id: number): string;
    getSubShapes(id: number, shapeType: string): EmbindVectorU32;
    downcast(id: number, targetType: string): number;
    distanceBetween(a: number, b: number): number;
    isSame(a: number, b: number): boolean;
    isEqual(a: number, b: number): boolean;
    isNull(id: number): boolean;
    hashCode(id: number, upperBound: number): number;
    shapeOrientation(id: number): string;
    sharedEdges(faceA: number, faceB: number): EmbindVectorU32;
    adjacentFaces(shapeId: number, faceId: number): EmbindVectorU32;
    iterShapes(id: number): EmbindVectorU32;
    edgeToFaceMap(id: number, hashUpperBound: number): EmbindVectorI32;

    // Tessellation
    tessellate(id: number, linDefl: number, angDefl: number): RawMeshData;
    wireframe(id: number, deflection: number): RawEdgeData;
    hasTriangulation(id: number): boolean;
    meshShape(id: number, linDefl: number, angDefl: number): RawMeshData;
    meshBatch(ids: EmbindVectorU32, linDefl: number, angDefl: number): RawMeshBatchData;

    // I/O
    importStep(data: string): number;
    exportStep(id: number): string;
    importStl(data: string): number;
    exportStl(id: number, linearDeflection: number, ascii: boolean): string;
    toBREP(id: number): string;
    fromBREP(data: string): number;

    // Query
    getBoundingBox(id: number): BoundingBox;
    getVolume(id: number): number;
    getSurfaceArea(id: number): number;
    getLength(id: number): number;
    getCenterOfMass(id: number): EmbindVectorF64;
    getLinearCenterOfMass(id: number): EmbindVectorF64;
    surfaceCurvature(faceId: number, u: number, v: number): EmbindVectorF64;

    // Surfaces
    vertexPosition(vertexId: number): EmbindVectorF64;
    surfaceType(faceId: number): string;
    surfaceNormal(faceId: number, u: number, v: number): EmbindVectorF64;
    pointOnSurface(faceId: number, u: number, v: number): EmbindVectorF64;
    outerWire(faceId: number): number;
    uvBounds(faceId: number): EmbindVectorF64;
    uvFromPoint(faceId: number, x: number, y: number, z: number): EmbindVectorF64;
    projectPointOnFace(faceId: number, x: number, y: number, z: number): EmbindVectorF64;
    classifyPointOnFace(faceId: number, u: number, v: number): string;
    bsplineSurface(flatPoints: EmbindVectorF64, rows: number, cols: number): number;

    // Curves
    curveType(edgeId: number): string;
    curvePointAtParam(edgeId: number, param: number): EmbindVectorF64;
    curveTangent(edgeId: number, param: number): EmbindVectorF64;
    curveParameters(edgeId: number): EmbindVectorF64;
    curveIsClosed(edgeId: number): boolean;
    curveIsPeriodic(edgeId: number): boolean;
    curveLength(edgeId: number): number;
    interpolatePoints(flatPoints: EmbindVectorF64, periodic: boolean): number;
    approximatePoints(flatPoints: EmbindVectorF64, tolerance: number): number;
    getNurbsCurveData(edgeId: number): RawNurbsCurveData;
    liftCurve2dToPlane(flatPoints2d: EmbindVectorF64, planeOx: number, planeOy: number, planeOz: number, planeZx: number, planeZy: number, planeZz: number, planeXx: number, planeXy: number, planeXz: number): number;

    // Projection
    projectEdges(shapeId: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, xx: number, xy: number, xz: number, hasXAxis: boolean): RawProjectionData;

    // Modifiers
    thicken(shapeId: number, thickness: number): number;
    defeature(shapeId: number, faceIds: EmbindVectorU32): number;
    reverseShape(id: number): number;
    simplify(id: number): number;
    filletVariable(solidId: number, edgeId: number, startRadius: number, endRadius: number): number;
    offsetWire2D(wireId: number, offset: number, joinType: number): number;

    // Evolution
    translateWithHistory(id: number, dx: number, dy: number, dz: number, inputFaceHashes: EmbindVectorI32, hashUpperBound: number): RawEvolutionData;
    fuseWithHistory(a: number, b: number, inputFaceHashes: EmbindVectorI32, hashUpperBound: number): RawEvolutionData;
    cutWithHistory(a: number, b: number, inputFaceHashes: EmbindVectorI32, hashUpperBound: number): RawEvolutionData;
    filletWithHistory(solidId: number, edgeIds: EmbindVectorU32, radius: number, inputFaceHashes: EmbindVectorI32, hashUpperBound: number): RawEvolutionData;
    rotateWithHistory(id: number, px: number, py: number, pz: number, dx: number, dy: number, dz: number, angle: number, inputFaceHashes: EmbindVectorI32, hashUpperBound: number): RawEvolutionData;
    mirrorWithHistory(id: number, px: number, py: number, pz: number, nx: number, ny: number, nz: number, inputFaceHashes: EmbindVectorI32, hashUpperBound: number): RawEvolutionData;
    scaleWithHistory(id: number, cx: number, cy: number, cz: number, factor: number, inputFaceHashes: EmbindVectorI32, hashUpperBound: number): RawEvolutionData;
    intersectWithHistory(a: number, b: number, inputFaceHashes: EmbindVectorI32, hashUpperBound: number): RawEvolutionData;
    chamferWithHistory(solidId: number, edgeIds: EmbindVectorU32, distance: number, inputFaceHashes: EmbindVectorI32, hashUpperBound: number): RawEvolutionData;
    shellWithHistory(solidId: number, faceIds: EmbindVectorU32, thickness: number, inputFaceHashes: EmbindVectorI32, hashUpperBound: number): RawEvolutionData;
    offsetWithHistory(solidId: number, distance: number, inputFaceHashes: EmbindVectorI32, hashUpperBound: number): RawEvolutionData;
    thickenWithHistory(shapeId: number, thickness: number, inputFaceHashes: EmbindVectorI32, hashUpperBound: number): RawEvolutionData;

    // Null shape
    makeNullShape(): number;

    // Extrusion law
    buildExtrusionLaw(profile: string, length: number, endFactor: number): number;
    trimLaw(lawId: number, first: number, last: number): number;
    sweepWithLaw(profileId: number, spineId: number, lawId: number): number;

    // Wire/curve repair
    buildCurves3d(wireId: number): void;
    fixWireOnFace(wireId: number, faceId: number, tolerance: number): number;

    // Healing
    fixShape(id: number): number;
    unifySameDomain(id: number): number;
    isValid(id: number): boolean;
    healSolid(id: number, tolerance: number): number;
    healFace(id: number, tolerance: number): number;
    healWire(id: number, tolerance: number): number;
    fixFaceOrientations(id: number): number;
    removeDegenerateEdges(id: number): number;

    // XCAF (exposed through XCAFDocument, but declared here for type completeness)
    xcafNewDocument(): number;
    xcafClose(docId: number): void;
    xcafAddShape(docId: number, shapeId: number): number;
    xcafAddComponent(docId: number, parentTag: number, shapeId: number, tx: number, ty: number, tz: number, rx: number, ry: number, rz: number): number;
    xcafSetColor(docId: number, tag: number, r: number, g: number, b: number): void;
    xcafSetName(docId: number, tag: number, name: string): void;
    xcafGetLabelInfo(docId: number, tag: number): { labelId: number; name: string; hasColor: boolean; r: number; g: number; b: number; isAssembly: boolean; isComponent: boolean; shapeId: number };
    xcafGetChildLabels(docId: number, parentTag: number): EmbindVectorI32;
    xcafGetRootLabels(docId: number): EmbindVectorI32;
    xcafExportSTEP(docId: number): string;
    xcafImportSTEP(stepData: string): number;
    xcafExportGLTF(docId: number, linDefl: number, angDefl: number): string;

    delete(): void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function handle(id: number): ShapeHandle {
    return id as ShapeHandle;
}

function wrap<T>(operation: string, fn: () => T): T {
    try {
        return fn();
    } catch (e: unknown) {
        if (e instanceof Error) {
            throw new OcctError(operation, e.message);
        }
        throw new OcctError(operation, String(e));
    }
}

function vecToNumbers(vec: EmbindVectorF64 | EmbindVectorI32): number[] {
    const result: number[] = [];
    for (let i = 0; i < vec.size(); i++) {
        result.push(vec.get(i));
    }
    return result;
}

/**
 * Extract the first n elements from an Embind vector into an array,
 * then delete the vector and return the result.
 */
function extractFromVector(vec: EmbindVectorF64 | EmbindVectorI32, count: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < count; i++) {
        result.push(vec.get(i));
    }
    vec.delete();
    return result;
}

function vecToHandles(vec: EmbindVectorU32): ShapeHandle[] {
    const result: ShapeHandle[] = [];
    for (let i = 0; i < vec.size(); i++) {
        result.push(handle(vec.get(i)));
    }
    vec.delete();
    return result;
}

/**
 * Safety net: releases the raw Embind kernel if an OcctKernel instance is
 * garbage-collected without being disposed. Prefer `using` or explicit
 * `kernel[Symbol.dispose]()` — the FinalizationRegistry is a last resort.
 */
const kernelRegistry = new FinalizationRegistry<RawKernel>((raw) => {
    try {
        raw.releaseAll();
        raw.delete();
    } catch {
        // Already disposed — ignore.
    }
});

// ---------------------------------------------------------------------------
// OcctKernel
// ---------------------------------------------------------------------------

/**
 * OCCT kernel compiled to WASM. Arena-based shape management
 * with branded handle types for type safety.
 *
 * Create via `OcctKernel.init()`. Dispose via `kernel[Symbol.dispose]()` or
 * the `using` keyword. A FinalizationRegistry safety net catches leaked
 * instances, but deterministic disposal is strongly preferred.
 */
export class OcctKernel {
    readonly #raw: RawKernel;
    readonly #module: EmscriptenModule;

    private constructor(module: EmscriptenModule) {
        this.#module = module;
        this.#raw = new module.OcctKernel();
        kernelRegistry.register(this, this.#raw, this);
    }

    /**
     * Initialize the WASM module and create a kernel instance.
     *
     * @example
     * ```ts
     * // Auto-detect (works in browser, Node.js, and Workers):
     * const kernel = await OcctKernel.init();
     *
     * // Explicit WASM location:
     * const kernel = await OcctKernel.init({ wasm: '/path/to/occt-wasm.wasm' });
     *
     * // From pre-fetched binary:
     * const binary = await fetch('/occt-wasm.wasm').then(r => r.arrayBuffer());
     * const kernel = await OcctKernel.init({ wasm: binary });
     * ```
     */
    static async init(options?: InitOptions): Promise<OcctKernel> {
        // @ts-expect-error -- occt-wasm.js is generated at build time, no .d.ts
        const imported = await import(/* webpackIgnore: true */ "./occt-wasm.js");
        const createModule = imported.default as (
            opts: Record<string, unknown>,
        ) => Promise<EmscriptenModule>;

        const moduleOpts: Record<string, unknown> = {};

        // Resolve the WASM source: new `wasm` option > legacy `wasmUrl`/`wasmPath`
        const wasmSource = options?.wasm ?? options?.wasmUrl ?? options?.wasmPath;

        if (wasmSource instanceof ArrayBuffer || wasmSource instanceof Uint8Array) {
            // Pre-loaded binary — pass directly to Emscripten
            // For Uint8Array views with non-zero byteOffset, slice to get the correct region
            const bytes = wasmSource instanceof Uint8Array
                ? wasmSource.buffer.slice(wasmSource.byteOffset, wasmSource.byteOffset + wasmSource.byteLength)
                : wasmSource;
            moduleOpts["wasmBinary"] = bytes;
        } else if (wasmSource) {
            // String or URL — use locateFile
            const location = wasmSource instanceof URL ? wasmSource.href : wasmSource;
            moduleOpts["locateFile"] = (path: string) => {
                if (path.endsWith(".wasm")) return location;
                return path;
            };
        }
        // When no source is given, Emscripten's default locateFile resolves
        // relative to the JS module URL, which works when .wasm is co-located.

        const module = await createModule(moduleOpts);
        return new OcctKernel(module);
    }

    // =======================================================================
    // Primitives
    // =======================================================================

    /** Create an axis-aligned box solid with the given dimensions (BRepPrimAPI_MakeBox).
     * @throws OcctError if dimensions are non-positive */
    makeBox(dx: number, dy: number, dz: number): ShapeHandle {
        return wrap("makeBox", () => handle(this.#raw.makeBox(dx, dy, dz)));
    }

    /** Create a box solid from two opposite corner points.
     * @throws OcctError if corners are coincident */
    makeBoxFromCorners(corner1: Vec3, corner2: Vec3): ShapeHandle {
        return wrap("makeBoxFromCorners", () =>
            handle(this.#raw.makeBoxFromCorners(
                corner1.x, corner1.y, corner1.z,
                corner2.x, corner2.y, corner2.z,
            )),
        );
    }

    /** Create a cylinder solid centered on the Z axis (BRepPrimAPI_MakeCylinder).
     * @throws OcctError */
    makeCylinder(radius: number, height: number): ShapeHandle {
        return wrap("makeCylinder", () => handle(this.#raw.makeCylinder(radius, height)));
    }

    /** Create a sphere solid at the origin (BRepPrimAPI_MakeSphere).
     * @throws OcctError */
    makeSphere(radius: number): ShapeHandle {
        return wrap("makeSphere", () => handle(this.#raw.makeSphere(radius)));
    }

    /** Create a cone (or truncated cone) solid along the Z axis (BRepPrimAPI_MakeCone).
     * @param r1 - bottom radius
     * @param r2 - top radius (0 for a full cone)
     * @throws OcctError */
    makeCone(r1: number, r2: number, height: number): ShapeHandle {
        return wrap("makeCone", () => handle(this.#raw.makeCone(r1, r2, height)));
    }

    /** Create a torus solid at the origin (BRepPrimAPI_MakeTorus).
     * @throws OcctError */
    makeTorus(majorRadius: number, minorRadius: number): ShapeHandle {
        return wrap("makeTorus", () => handle(this.#raw.makeTorus(majorRadius, minorRadius)));
    }

    /** Create an ellipsoid solid at the origin by scaling a sphere.
     * @param rx - radius along X
     * @param ry - radius along Y
     * @param rz - radius along Z
     * @throws OcctError */
    makeEllipsoid(rx: number, ry: number, rz: number): ShapeHandle {
        return wrap("makeEllipsoid", () => handle(this.#raw.makeEllipsoid(rx, ry, rz)));
    }

    /** Create a rectangular planar face on the XY plane at the origin.
     * @throws OcctError */
    makeRectangle(width: number, height: number): ShapeHandle {
        return wrap("makeRectangle", () => handle(this.#raw.makeRectangle(width, height)));
    }

    // =======================================================================
    // Booleans
    // =======================================================================

    /** Boolean union (BRepAlgoAPI_Fuse). Combines two shapes into one.
     * @throws OcctError */
    fuse(a: ShapeHandle, b: ShapeHandle): ShapeHandle {
        return wrap("fuse", () => handle(this.#raw.fuse(a, b)));
    }

    /** Boolean subtraction (BRepAlgoAPI_Cut). Removes b from a.
     * @throws OcctError */
    cut(a: ShapeHandle, b: ShapeHandle): ShapeHandle {
        return wrap("cut", () => handle(this.#raw.cut(a, b)));
    }

    /** Boolean intersection (BRepAlgoAPI_Common). Keeps only the overlapping volume.
     * @throws OcctError */
    common(a: ShapeHandle, b: ShapeHandle): ShapeHandle {
        return wrap("common", () => handle(this.#raw.common(a, b)));
    }

    /** Boolean intersection — alias for common (BRepAlgoAPI_Common).
     * @throws OcctError */
    intersect(a: ShapeHandle, b: ShapeHandle): ShapeHandle {
        return wrap("intersect", () => handle(this.#raw.intersect(a, b)));
    }

    /** Compute the intersection edges/vertices of two shapes (BRepAlgoAPI_Section).
     * @returns A compound of edges/vertices at the intersection
     * @throws OcctError */
    section(a: ShapeHandle, b: ShapeHandle): ShapeHandle {
        return wrap("section", () => handle(this.#raw.section(a, b)));
    }

    /** Fuse all shapes in the array into a single shape.
     * @throws OcctError */
    fuseAll(shapes: ShapeHandle[]): ShapeHandle {
        return wrap("fuseAll", () => {
            const vec = this.#makeVectorU32(shapes);
            try { return handle(this.#raw.fuseAll(vec)); }
            finally { vec.delete(); }
        });
    }

    /** Subtract all tool shapes from the base shape.
     * @throws OcctError */
    cutAll(shape: ShapeHandle, tools: ShapeHandle[]): ShapeHandle {
        return wrap("cutAll", () => {
            const vec = this.#makeVectorU32(tools);
            try { return handle(this.#raw.cutAll(shape, vec)); }
            finally { vec.delete(); }
        });
    }

    /** Split a shape using tool shapes as splitting surfaces (BOPAlgo_Splitter).
     * @returns A compound of the split fragments
     * @throws OcctError */
    split(shape: ShapeHandle, tools: ShapeHandle[]): ShapeHandle {
        return wrap("split", () => {
            const vec = this.#makeVectorU32(tools);
            try { return handle(this.#raw.split(shape, vec)); }
            finally { vec.delete(); }
        });
    }

    // =======================================================================
    // Modeling
    // =======================================================================

    /** Extrude a shape along a direction vector (BRepPrimAPI_MakePrism).
     * @param dx - extrusion vector X component
     * @param dy - extrusion vector Y component
     * @param dz - extrusion vector Z component
     * @throws OcctError */
    extrude(shape: ShapeHandle, dx: number, dy: number, dz: number): ShapeHandle {
        return wrap("extrude", () => handle(this.#raw.extrude(shape, dx, dy, dz)));
    }

    /** Revolve a shape around an axis (BRepPrimAPI_MakeRevol).
     * @param axis - rotation axis defined by a point and direction
     * @param angleRad - sweep angle in radians (2*PI for full revolution)
     * @throws OcctError */
    revolve(
        shape: ShapeHandle,
        axis: { point: Vec3; direction: Vec3 },
        angleRad: number,
    ): ShapeHandle {
        return wrap("revolve", () =>
            handle(this.#raw.revolve(
                shape,
                axis.point.x, axis.point.y, axis.point.z,
                axis.direction.x, axis.direction.y, axis.direction.z,
                angleRad,
            )),
        );
    }

    /** Apply a constant-radius fillet to edges of a solid (BRepFilletAPI_MakeFillet).
     * @throws OcctError */
    fillet(solid: ShapeHandle, edges: ShapeHandle[], radius: number): ShapeHandle {
        return wrap("fillet", () => {
            const vec = this.#makeVectorU32(edges);
            try { return handle(this.#raw.fillet(solid, vec, radius)); }
            finally { vec.delete(); }
        });
    }

    chamfer(solid: ShapeHandle, edges: ShapeHandle[], distance: number): ShapeHandle {
        return wrap("chamfer", () => {
            const vec = this.#makeVectorU32(edges);
            try { return handle(this.#raw.chamfer(solid, vec, distance)); }
            finally { vec.delete(); }
        });
    }

    chamferDistAngle(solid: ShapeHandle, edges: ShapeHandle[], distance: number, angleDeg: number): ShapeHandle {
        return wrap("chamferDistAngle", () => {
            const vec = this.#makeVectorU32(edges);
            try { return handle(this.#raw.chamferDistAngle(solid, vec, distance, angleDeg)); }
            finally { vec.delete(); }
        });
    }

    shell(solid: ShapeHandle, facesToRemove: ShapeHandle[], thickness: number): ShapeHandle {
        return wrap("shell", () => {
            const vec = this.#makeVectorU32(facesToRemove);
            try { return handle(this.#raw.shell(solid, vec, thickness)); }
            finally { vec.delete(); }
        });
    }

    offset(solid: ShapeHandle, distance: number): ShapeHandle {
        return wrap("offset", () => handle(this.#raw.offset(solid, distance)));
    }

    draft(shape: ShapeHandle, face: ShapeHandle, angleRad: number, direction: Vec3): ShapeHandle {
        return wrap("draft", () =>
            handle(this.#raw.draft(shape, face, angleRad, direction.x, direction.y, direction.z)),
        );
    }

    // =======================================================================
    // Sweeps
    // =======================================================================

    pipe(profile: ShapeHandle, spine: ShapeHandle): ShapeHandle {
        return wrap("pipe", () => handle(this.#raw.pipe(profile, spine)));
    }

    simplePipe(profile: ShapeHandle, spine: ShapeHandle): ShapeHandle {
        return wrap("simplePipe", () => handle(this.#raw.simplePipe(profile, spine)));
    }

    loft(wires: ShapeHandle[], isSolid: boolean): ShapeHandle {
        return wrap("loft", () => {
            const vec = this.#makeVectorU32(wires);
            try { return handle(this.#raw.loft(vec, isSolid)); }
            finally { vec.delete(); }
        });
    }

    loftWithVertices(wires: ShapeHandle[], isSolid: boolean, startVertex: ShapeHandle, endVertex: ShapeHandle): ShapeHandle {
        return wrap("loftWithVertices", () => {
            const vec = this.#makeVectorU32(wires);
            try { return handle(this.#raw.loftWithVertices(vec, isSolid, startVertex, endVertex)); }
            finally { vec.delete(); }
        });
    }

    sweep(wire: ShapeHandle, spine: ShapeHandle, transitionMode: TransitionMode = TransitionMode.Transformed): ShapeHandle {
        return wrap("sweep", () => handle(this.#raw.sweep(wire, spine, transitionMode)));
    }

    sweepPipeShell(profile: ShapeHandle, spine: ShapeHandle, freenet = false, smooth = true): ShapeHandle {
        return wrap("sweepPipeShell", () => handle(this.#raw.sweepPipeShell(profile, spine, freenet, smooth)));
    }

    draftPrism(shape: ShapeHandle, dx: number, dy: number, dz: number, angleDeg: number): ShapeHandle {
        return wrap("draftPrism", () => handle(this.#raw.draftPrism(shape, dx, dy, dz, angleDeg)));
    }

    // =======================================================================
    // Construction
    // =======================================================================

    makeVertex(x: number, y: number, z: number): ShapeHandle {
        return wrap("makeVertex", () => handle(this.#raw.makeVertex(x, y, z)));
    }

    makeEdge(v1: ShapeHandle, v2: ShapeHandle): ShapeHandle {
        return wrap("makeEdge", () => handle(this.#raw.makeEdge(v1, v2)));
    }

    makeLineEdge(start: Vec3, end: Vec3): ShapeHandle {
        return wrap("makeLineEdge", () =>
            handle(this.#raw.makeLineEdge(start.x, start.y, start.z, end.x, end.y, end.z)),
        );
    }

    makeCircleEdge(center: Vec3, normal: Vec3, radius: number): ShapeHandle {
        return wrap("makeCircleEdge", () =>
            handle(this.#raw.makeCircleEdge(
                center.x, center.y, center.z,
                normal.x, normal.y, normal.z,
                radius,
            )),
        );
    }

    makeCircleArc(center: Vec3, normal: Vec3, radius: number, startAngle: number, endAngle: number): ShapeHandle {
        return wrap("makeCircleArc", () =>
            handle(this.#raw.makeCircleArc(
                center.x, center.y, center.z,
                normal.x, normal.y, normal.z,
                radius, startAngle, endAngle,
            )),
        );
    }

    makeArcEdge(start: Vec3, mid: Vec3, end: Vec3): ShapeHandle {
        return wrap("makeArcEdge", () =>
            handle(this.#raw.makeArcEdge(
                start.x, start.y, start.z,
                mid.x, mid.y, mid.z,
                end.x, end.y, end.z,
            )),
        );
    }

    makeEllipseEdge(center: Vec3, normal: Vec3, majorRadius: number, minorRadius: number): ShapeHandle {
        return wrap("makeEllipseEdge", () =>
            handle(this.#raw.makeEllipseEdge(
                center.x, center.y, center.z,
                normal.x, normal.y, normal.z,
                majorRadius, minorRadius,
            )),
        );
    }

    makeEllipseArc(center: Vec3, normal: Vec3, majorRadius: number, minorRadius: number, startAngle: number, endAngle: number): ShapeHandle {
        return wrap("makeEllipseArc", () =>
            handle(this.#raw.makeEllipseArc(
                center.x, center.y, center.z,
                normal.x, normal.y, normal.z,
                majorRadius, minorRadius,
                startAngle, endAngle,
            )),
        );
    }

    makeBezierEdge(controlPoints: Vec3[]): ShapeHandle {
        return wrap("makeBezierEdge", () => {
            const flat = this.#flattenPoints(controlPoints);
            try { return handle(this.#raw.makeBezierEdge(flat)); }
            finally { flat.delete(); }
        });
    }

    makeTangentArc(start: Vec3, tangent: Vec3, end: Vec3): ShapeHandle {
        return wrap("makeTangentArc", () =>
            handle(this.#raw.makeTangentArc(
                start.x, start.y, start.z,
                tangent.x, tangent.y, tangent.z,
                end.x, end.y, end.z,
            )),
        );
    }

    makeHelixWire(origin: Vec3, axis: Vec3, pitch: number, height: number, radius: number): ShapeHandle {
        return wrap("makeHelixWire", () =>
            handle(this.#raw.makeHelixWire(
                origin.x, origin.y, origin.z,
                axis.x, axis.y, axis.z,
                pitch, height, radius,
            )),
        );
    }

    makeWire(edges: ShapeHandle[]): ShapeHandle {
        return wrap("makeWire", () => {
            const vec = this.#makeVectorU32(edges);
            try { return handle(this.#raw.makeWire(vec)); }
            finally { vec.delete(); }
        });
    }

    makeFace(wire: ShapeHandle): ShapeHandle {
        return wrap("makeFace", () => handle(this.#raw.makeFace(wire)));
    }

    makeNonPlanarFace(wire: ShapeHandle): ShapeHandle {
        return wrap("makeNonPlanarFace", () => handle(this.#raw.makeNonPlanarFace(wire)));
    }

    addHolesInFace(face: ShapeHandle, holeWires: ShapeHandle[]): ShapeHandle {
        return wrap("addHolesInFace", () => {
            const vec = this.#makeVectorU32(holeWires);
            try { return handle(this.#raw.addHolesInFace(face, vec)); }
            finally { vec.delete(); }
        });
    }

    removeHolesFromFace(face: ShapeHandle, holeIndices: number[]): ShapeHandle {
        return wrap("removeHolesFromFace", () => {
            const vec = this.#makeVectorI32(holeIndices);
            try { return handle(this.#raw.removeHolesFromFace(face, vec)); }
            finally { vec.delete(); }
        });
    }

    makeSolid(shell: ShapeHandle): ShapeHandle {
        return wrap("makeSolid", () => handle(this.#raw.makeSolid(shell)));
    }

    sew(shapes: ShapeHandle[], tolerance = 1e-6): ShapeHandle {
        return wrap("sew", () => {
            const vec = this.#makeVectorU32(shapes);
            try { return handle(this.#raw.sew(vec, tolerance)); }
            finally { vec.delete(); }
        });
    }

    sewAndSolidify(faces: ShapeHandle[], tolerance = 1e-6): ShapeHandle {
        return wrap("sewAndSolidify", () => {
            const vec = this.#makeVectorU32(faces);
            try { return handle(this.#raw.sewAndSolidify(vec, tolerance)); }
            finally { vec.delete(); }
        });
    }

    buildSolidFromFaces(faces: ShapeHandle[], tolerance = 1e-6): ShapeHandle {
        return wrap("buildSolidFromFaces", () => {
            const vec = this.#makeVectorU32(faces);
            try { return handle(this.#raw.buildSolidFromFaces(vec, tolerance)); }
            finally { vec.delete(); }
        });
    }

    makeCompound(shapes: ShapeHandle[]): ShapeHandle {
        return wrap("makeCompound", () => {
            const vec = this.#makeVectorU32(shapes);
            try { return handle(this.#raw.makeCompound(vec)); }
            finally { vec.delete(); }
        });
    }

    buildTriFace(a: Vec3, b: Vec3, c: Vec3): ShapeHandle {
        return wrap("buildTriFace", () =>
            handle(this.#raw.buildTriFace(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)),
        );
    }

    makeFaceOnSurface(face: ShapeHandle, wire: ShapeHandle): ShapeHandle {
        return wrap("makeFaceOnSurface", () => handle(this.#raw.makeFaceOnSurface(face, wire)));
    }

    makeNullShape(): ShapeHandle {
        return wrap("makeNullShape", () => handle(this.#raw.makeNullShape()));
    }

    // =======================================================================
    // Transforms
    // =======================================================================

    translate(shape: ShapeHandle, dx: number, dy: number, dz: number): ShapeHandle {
        return wrap("translate", () => handle(this.#raw.translate(shape, dx, dy, dz)));
    }

    rotate(
        shape: ShapeHandle,
        axis: { point: Vec3; direction: Vec3 },
        angleRad: number,
    ): ShapeHandle {
        return wrap("rotate", () =>
            handle(this.#raw.rotate(
                shape,
                axis.point.x, axis.point.y, axis.point.z,
                axis.direction.x, axis.direction.y, axis.direction.z,
                angleRad,
            )),
        );
    }

    scale(shape: ShapeHandle, center: Vec3, factor: number): ShapeHandle {
        return wrap("scale", () =>
            handle(this.#raw.scale(shape, center.x, center.y, center.z, factor)),
        );
    }

    mirror(shape: ShapeHandle, point: Vec3, normal: Vec3): ShapeHandle {
        return wrap("mirror", () =>
            handle(this.#raw.mirror(shape, point.x, point.y, point.z, normal.x, normal.y, normal.z)),
        );
    }

    copy(shape: ShapeHandle): ShapeHandle {
        return wrap("copy", () => handle(this.#raw.copy(shape)));
    }

    /** Apply a 3x4 row-major affine transformation matrix (12 doubles: [r00,r01,r02,tx, r10,r11,r12,ty, r20,r21,r22,tz]). */
    transform(shape: ShapeHandle, matrix: number[]): ShapeHandle {
        return wrap("transform", () => {
            const vec = this.#makeVectorF64(matrix);
            try { return handle(this.#raw.transform(shape, vec)); }
            finally { vec.delete(); }
        });
    }

    /** Apply a general (possibly non-affine) 3x4 row-major transformation matrix (12 doubles). */
    generalTransform(shape: ShapeHandle, matrix: number[]): ShapeHandle {
        return wrap("generalTransform", () => {
            const vec = this.#makeVectorF64(matrix);
            try { return handle(this.#raw.generalTransform(shape, vec)); }
            finally { vec.delete(); }
        });
    }

    linearPattern(shape: ShapeHandle, direction: Vec3, spacing: number, count: number): ShapeHandle {
        return wrap("linearPattern", () =>
            handle(this.#raw.linearPattern(shape, direction.x, direction.y, direction.z, spacing, count)),
        );
    }

    circularPattern(shape: ShapeHandle, center: Vec3, axis: Vec3, angle: number, count: number): ShapeHandle {
        return wrap("circularPattern", () =>
            handle(this.#raw.circularPattern(
                shape,
                center.x, center.y, center.z,
                axis.x, axis.y, axis.z,
                angle, count,
            )),
        );
    }

    /** Compose two 3x4 row-major transformation matrices. Returns a 12-element array. */
    composeTransform(m1: number[], m2: number[]): number[] {
        return wrap("composeTransform", () => {
            const v1 = this.#makeVectorF64(m1);
            const v2 = this.#makeVectorF64(m2);
            try {
                const result = this.#raw.composeTransform(v1, v2);
                const out = vecToNumbers(result);
                result.delete();
                return out;
            } finally {
                v1.delete();
                v2.delete();
            }
        });
    }

    // =======================================================================
    // Batch Operations
    // =======================================================================

    /** Translate multiple shapes by their respective offsets in a single WASM call. */
    translateBatch(shapes: ShapeHandle[], offsets: number[]): ShapeHandle[] {
        return wrap("translateBatch", () => {
            const ids = this.#makeVectorU32(shapes);
            const off = this.#makeVectorF64(offsets);
            try {
                const result = this.#raw.translateBatch(ids, off);
                return vecToHandles(result);
            } finally {
                ids.delete();
                off.delete();
            }
        });
    }

    /** Chain boolean operations in a single WASM call. */
    booleanPipeline(base: ShapeHandle, opCodes: BooleanOp[], tools: ShapeHandle[]): ShapeHandle {
        return wrap("booleanPipeline", () => {
            const ops = this.#makeVectorI32(opCodes);
            const ids = this.#makeVectorU32(tools);
            try { return handle(this.#raw.booleanPipeline(base, ops, ids)); }
            finally { ops.delete(); ids.delete(); }
        });
    }

    // =======================================================================
    // Topology
    // =======================================================================

    getShapeType(shape: ShapeHandle): ShapeType {
        return wrap("getShapeType", () => this.#raw.getShapeType(shape) as ShapeType);
    }

    /** True if the shape is a compound. */
    isCompound(shape: ShapeHandle): boolean { return this.getShapeType(shape) === "compound"; }

    /** True if the shape is a comp-solid. */
    isCompSolid(shape: ShapeHandle): boolean { return this.getShapeType(shape) === "compsolid"; }

    /** True if the shape is a solid. */
    isSolid(shape: ShapeHandle): boolean { return this.getShapeType(shape) === "solid"; }

    /** True if the shape is a shell. */
    isShell(shape: ShapeHandle): boolean { return this.getShapeType(shape) === "shell"; }

    /** True if the shape is a face. */
    isFace(shape: ShapeHandle): boolean { return this.getShapeType(shape) === "face"; }

    /** True if the shape is a wire. */
    isWire(shape: ShapeHandle): boolean { return this.getShapeType(shape) === "wire"; }

    /** True if the shape is an edge. */
    isEdge(shape: ShapeHandle): boolean { return this.getShapeType(shape) === "edge"; }

    /** True if the shape is a vertex. */
    isVertex(shape: ShapeHandle): boolean { return this.getShapeType(shape) === "vertex"; }

    getSubShapes(shape: ShapeHandle, type: "vertex" | "edge" | "wire" | "face" | "shell" | "solid"): ShapeHandle[] {
        return wrap("getSubShapes", () => vecToHandles(this.#raw.getSubShapes(shape, type)));
    }

    downcast(shape: ShapeHandle, targetType: "vertex" | "edge" | "wire" | "face" | "shell" | "solid"): ShapeHandle {
        return wrap("downcast", () => handle(this.#raw.downcast(shape, targetType)));
    }

    distanceBetween(a: ShapeHandle, b: ShapeHandle): number {
        return wrap("distanceBetween", () => this.#raw.distanceBetween(a, b));
    }

    isSame(a: ShapeHandle, b: ShapeHandle): boolean {
        return wrap("isSame", () => this.#raw.isSame(a, b));
    }

    isEqual(a: ShapeHandle, b: ShapeHandle): boolean {
        return wrap("isEqual", () => this.#raw.isEqual(a, b));
    }

    isNull(shape: ShapeHandle): boolean {
        return wrap("isNull", () => this.#raw.isNull(shape));
    }

    hashCode(shape: ShapeHandle, upperBound: number): number {
        return wrap("hashCode", () => this.#raw.hashCode(shape, upperBound));
    }

    shapeOrientation(shape: ShapeHandle): ShapeOrientation {
        return wrap("shapeOrientation", () => this.#raw.shapeOrientation(shape) as ShapeOrientation);
    }

    sharedEdges(faceA: ShapeHandle, faceB: ShapeHandle): ShapeHandle[] {
        return wrap("sharedEdges", () => vecToHandles(this.#raw.sharedEdges(faceA, faceB)));
    }

    adjacentFaces(shape: ShapeHandle, face: ShapeHandle): ShapeHandle[] {
        return wrap("adjacentFaces", () => vecToHandles(this.#raw.adjacentFaces(shape, face)));
    }

    iterShapes(shape: ShapeHandle): ShapeHandle[] {
        return wrap("iterShapes", () => vecToHandles(this.#raw.iterShapes(shape)));
    }

    /** Returns a flat array mapping edge hashes to face hashes. */
    edgeToFaceMap(shape: ShapeHandle, hashUpperBound: number): number[] {
        return wrap("edgeToFaceMap", () => {
            const vec = this.#raw.edgeToFaceMap(shape, hashUpperBound);
            const result = vecToNumbers(vec);
            vec.delete();
            return result;
        });
    }

    // =======================================================================
    // Tessellation
    // =======================================================================

    /** Tessellate a shape into a triangle mesh. Returns copied data (safe to keep). */
    tessellate(shape: ShapeHandle, options?: TessellateOptions): Mesh {
        return wrap("tessellate", () => {
            const linDefl = options?.linearDeflection ?? 0.1;
            const angDefl = options?.angularDeflection ?? 0.5;
            return this.#extractMesh(this.#raw.tessellate(shape, linDefl, angDefl));
        });
    }

    /** Sample edges as polylines for wireframe rendering. */
    wireframe(shape: ShapeHandle, deflection = 0.1): EdgeData {
        return wrap("wireframe", () => {
            const raw = this.#raw.wireframe(shape, deflection);
            try {
                const points = new Float32Array(
                    this.#module.HEAPF32.buffer.slice(
                        raw.getPointsPtr(),
                        raw.getPointsPtr() + raw.pointCount * 4,
                    ),
                );
                const edgeCount = raw.edgeGroupCount / 3;
                const edgeGroups = new Int32Array(
                    this.#module.HEAP32.buffer.slice(
                        raw.getEdgeGroupsPtr(),
                        raw.getEdgeGroupsPtr() + raw.edgeGroupCount * 4,
                    ),
                );
                return { points, edgeGroups, pointCount: raw.pointCount, edgeCount };
            } finally {
                raw.delete();
            }
        });
    }

    hasTriangulation(shape: ShapeHandle): boolean {
        return wrap("hasTriangulation", () => this.#raw.hasTriangulation(shape));
    }

    /** Tessellate with face group data (per-face triangle ranges + hashes). */
    meshShape(shape: ShapeHandle, options?: TessellateOptions): Mesh {
        return wrap("meshShape", () => {
            const linDefl = options?.linearDeflection ?? 0.1;
            const angDefl = options?.angularDeflection ?? 0.5;
            return this.#extractMeshWithFaceGroups(this.#raw.meshShape(shape, linDefl, angDefl));
        });
    }

    /** Tessellate multiple shapes in a single WASM call. */
    meshBatch(shapes: ShapeHandle[], options?: TessellateOptions): MeshBatchData {
        return wrap("meshBatch", () => {
            const ids = this.#makeVectorU32(shapes);
            const linDefl = options?.linearDeflection ?? 0.1;
            const angDefl = options?.angularDeflection ?? 0.5;
            try {
                const raw = this.#raw.meshBatch(ids, linDefl, angDefl);
                try {
                    const positions = new Float32Array(
                        this.#module.HEAPF32.buffer.slice(
                            raw.getPositionsPtr(),
                            raw.getPositionsPtr() + raw.positionCount * 4,
                        ),
                    );
                    const normals = new Float32Array(
                        this.#module.HEAPF32.buffer.slice(
                            raw.getNormalsPtr(),
                            raw.getNormalsPtr() + raw.normalCount * 4,
                        ),
                    );
                    const indices = new Uint32Array(
                        this.#module.HEAPU32.buffer.slice(
                            raw.getIndicesPtr(),
                            raw.getIndicesPtr() + raw.indexCount * 4,
                        ),
                    );
                    const shapeOffsets = new Int32Array(
                        this.#module.HEAP32.buffer.slice(
                            raw.getShapeOffsetsPtr(),
                            raw.getShapeOffsetsPtr() + raw.shapeCount * 4 * 4,
                        ),
                    );
                    return {
                        positions,
                        normals,
                        indices,
                        shapeOffsets,
                        shapeCount: raw.shapeCount,
                        vertexCount: raw.positionCount / 3,
                        triangleCount: raw.indexCount / 3,
                    };
                } finally {
                    raw.delete();
                }
            } finally {
                ids.delete();
            }
        });
    }

    // =======================================================================
    // I/O
    // =======================================================================

    importStep(data: string | ArrayBuffer): ShapeHandle {
        return wrap("importStep", () => {
            const str = typeof data === "string" ? data : new TextDecoder().decode(data);
            return handle(this.#raw.importStep(str));
        });
    }

    exportStep(shape: ShapeHandle): string {
        return wrap("exportStep", () => this.#raw.exportStep(shape));
    }

    importStl(data: string | ArrayBuffer): ShapeHandle {
        return wrap("importStl", () => {
            const str = typeof data === "string" ? data : new TextDecoder().decode(data);
            return handle(this.#raw.importStl(str));
        });
    }

    exportStl(shape: ShapeHandle, linearDeflection = 0.1, ascii = false): string {
        return wrap("exportStl", () => this.#raw.exportStl(shape, linearDeflection, ascii));
    }

    toBREP(shape: ShapeHandle): string {
        return wrap("toBREP", () => this.#raw.toBREP(shape));
    }

    fromBREP(data: string): ShapeHandle {
        return wrap("fromBREP", () => handle(this.#raw.fromBREP(data)));
    }

    // =======================================================================
    // Query / Measure
    // =======================================================================

    getBoundingBox(shape: ShapeHandle): BoundingBox {
        return wrap("getBoundingBox", () => this.#raw.getBoundingBox(shape));
    }

    getVolume(shape: ShapeHandle): number {
        return wrap("getVolume", () => this.#raw.getVolume(shape));
    }

    getSurfaceArea(shape: ShapeHandle): number {
        return wrap("getSurfaceArea", () => this.#raw.getSurfaceArea(shape));
    }

    getLength(shape: ShapeHandle): number {
        return wrap("getLength", () => this.#raw.getLength(shape));
    }

    getCenterOfMass(shape: ShapeHandle): Vec3 {
        return wrap("getCenterOfMass", () => {
            const v = this.#raw.getCenterOfMass(shape);
            return this.#vec3FromEmbind(v);
        });
    }

    getLinearCenterOfMass(shape: ShapeHandle): Vec3 {
        return wrap("getLinearCenterOfMass", () => {
            const v = this.#raw.getLinearCenterOfMass(shape);
            return this.#vec3FromEmbind(v);
        });
    }

    surfaceCurvature(face: ShapeHandle, u: number, v: number): CurvatureData {
        return wrap("surfaceCurvature", () =>
            this.#curvatureDataFromEmbind(this.#raw.surfaceCurvature(face, u, v)),
        );
    }

    // =======================================================================
    // Surfaces
    // =======================================================================

    vertexPosition(vertex: ShapeHandle): Vec3 {
        return wrap("vertexPosition", () => {
            const v = this.#raw.vertexPosition(vertex);
            return this.#vec3FromEmbind(v);
        });
    }

    surfaceType(face: ShapeHandle): SurfaceKind {
        return wrap("surfaceType", () => this.#raw.surfaceType(face) as SurfaceKind);
    }

    surfaceNormal(face: ShapeHandle, u: number, v: number): Vec3 {
        return wrap("surfaceNormal", () => {
            const vec = this.#raw.surfaceNormal(face, u, v);
            return this.#vec3FromEmbind(vec);
        });
    }

    pointOnSurface(face: ShapeHandle, u: number, v: number): Vec3 {
        return wrap("pointOnSurface", () => {
            const vec = this.#raw.pointOnSurface(face, u, v);
            return this.#vec3FromEmbind(vec);
        });
    }

    outerWire(face: ShapeHandle): ShapeHandle {
        return wrap("outerWire", () => handle(this.#raw.outerWire(face)));
    }

    uvBounds(face: ShapeHandle): UVBounds {
        return wrap("uvBounds", () =>
            this.#uvBoundsFromEmbind(this.#raw.uvBounds(face)),
        );
    }

    /** Project a 3D point onto a face, returning [u, v]. */
    uvFromPoint(face: ShapeHandle, point: Vec3): { u: number; v: number } {
        return wrap("uvFromPoint", () =>
            this.#vec2FromEmbind(this.#raw.uvFromPoint(face, point.x, point.y, point.z)),
        );
    }

    /** Project a 3D point onto a face, returning the closest point as Vec3. */
    projectPointOnFace(face: ShapeHandle, point: Vec3): Vec3 {
        return wrap("projectPointOnFace", () => {
            const vec = this.#raw.projectPointOnFace(face, point.x, point.y, point.z);
            return this.#vec3FromEmbind(vec);
        });
    }

    /** Classify a UV point relative to a face boundary. */
    classifyPointOnFace(face: ShapeHandle, u: number, v: number): PointClassification {
        return wrap("classifyPointOnFace", () => this.#raw.classifyPointOnFace(face, u, v) as PointClassification);
    }

    /** Create a BSpline surface from a grid of control points. */
    bsplineSurface(controlPoints: Vec3[], rows: number, cols: number): ShapeHandle {
        return wrap("bsplineSurface", () => {
            const flat = this.#flattenPoints(controlPoints);
            try { return handle(this.#raw.bsplineSurface(flat, rows, cols)); }
            finally { flat.delete(); }
        });
    }

    // =======================================================================
    // Curves
    // =======================================================================

    curveType(edge: ShapeHandle): CurveKind {
        return wrap("curveType", () => this.#raw.curveType(edge) as CurveKind);
    }

    curvePointAtParam(edge: ShapeHandle, param: number): Vec3 {
        return wrap("curvePointAtParam", () => {
            const vec = this.#raw.curvePointAtParam(edge, param);
            return this.#vec3FromEmbind(vec);
        });
    }

    curveTangent(edge: ShapeHandle, param: number): Vec3 {
        return wrap("curveTangent", () => {
            const vec = this.#raw.curveTangent(edge, param);
            return this.#vec3FromEmbind(vec);
        });
    }

    /** Returns [firstParam, lastParam]. */
    curveParameters(edge: ShapeHandle): { first: number; last: number } {
        return wrap("curveParameters", () => {
            const { u: first, v: last } = this.#vec2FromEmbind(this.#raw.curveParameters(edge));
            return { first, last };
        });
    }

    curveIsClosed(edge: ShapeHandle): boolean {
        return wrap("curveIsClosed", () => this.#raw.curveIsClosed(edge));
    }

    curveIsPeriodic(edge: ShapeHandle): boolean {
        return wrap("curveIsPeriodic", () => this.#raw.curveIsPeriodic(edge));
    }

    curveLength(edge: ShapeHandle): number {
        return wrap("curveLength", () => this.#raw.curveLength(edge));
    }

    interpolatePoints(points: Vec3[], periodic = false): ShapeHandle {
        return wrap("interpolatePoints", () => {
            const flat = this.#flattenPoints(points);
            try { return handle(this.#raw.interpolatePoints(flat, periodic)); }
            finally { flat.delete(); }
        });
    }

    approximatePoints(points: Vec3[], tolerance = 1e-3): ShapeHandle {
        return wrap("approximatePoints", () => {
            const flat = this.#flattenPoints(points);
            try { return handle(this.#raw.approximatePoints(flat, tolerance)); }
            finally { flat.delete(); }
        });
    }

    getNurbsCurveData(edge: ShapeHandle): NurbsCurveData {
        return wrap("getNurbsCurveData", () => {
            const raw = this.#raw.getNurbsCurveData(edge);
            const result: NurbsCurveData = {
                degree: raw.degree,
                rational: raw.rational,
                periodic: raw.periodic,
                knots: extractFromVector(raw.knots, raw.knots.size()),
                multiplicities: extractFromVector(raw.multiplicities, raw.multiplicities.size()),
                poles: extractFromVector(raw.poles, raw.poles.size()),
                weights: extractFromVector(raw.weights, raw.weights.size()),
            };
            return result;
        });
    }

    liftCurve2dToPlane(
        points2d: Array<{ x: number; y: number }>,
        planeOrigin: Vec3,
        planeZ: Vec3,
        planeX: Vec3,
    ): ShapeHandle {
        return wrap("liftCurve2dToPlane", () => {
            const flat = new this.#module.VectorDouble();
            for (const p of points2d) {
                flat.push_back(p.x);
                flat.push_back(p.y);
            }
            try {
                return handle(this.#raw.liftCurve2dToPlane(
                    flat,
                    planeOrigin.x, planeOrigin.y, planeOrigin.z,
                    planeZ.x, planeZ.y, planeZ.z,
                    planeX.x, planeX.y, planeX.z,
                ));
            } finally {
                flat.delete();
            }
        });
    }

    // =======================================================================
    // Projection (HLR)
    // =======================================================================

    projectEdges(
        shape: ShapeHandle,
        viewOrigin: Vec3,
        viewDirection: Vec3,
        xAxis?: Vec3,
    ): ProjectionData {
        return wrap("projectEdges", () => {
            const hasXAxis = xAxis !== undefined;
            const xx = xAxis?.x ?? 0;
            const xy = xAxis?.y ?? 0;
            const xz = xAxis?.z ?? 0;
            const raw = this.#raw.projectEdges(
                shape,
                viewOrigin.x, viewOrigin.y, viewOrigin.z,
                viewDirection.x, viewDirection.y, viewDirection.z,
                xx, xy, xz,
                hasXAxis,
            );
            return {
                visibleOutline: handle(raw.visibleOutline),
                visibleSmooth: handle(raw.visibleSmooth),
                visibleSharp: handle(raw.visibleSharp),
                hiddenOutline: handle(raw.hiddenOutline),
                hiddenSmooth: handle(raw.hiddenSmooth),
                hiddenSharp: handle(raw.hiddenSharp),
            };
        });
    }

    // =======================================================================
    // Modifiers
    // =======================================================================

    thicken(shape: ShapeHandle, thickness: number): ShapeHandle {
        return wrap("thicken", () => handle(this.#raw.thicken(shape, thickness)));
    }

    defeature(shape: ShapeHandle, faces: ShapeHandle[]): ShapeHandle {
        return wrap("defeature", () => {
            const vec = this.#makeVectorU32(faces);
            try { return handle(this.#raw.defeature(shape, vec)); }
            finally { vec.delete(); }
        });
    }

    reverseShape(shape: ShapeHandle): ShapeHandle {
        return wrap("reverseShape", () => handle(this.#raw.reverseShape(shape)));
    }

    simplify(shape: ShapeHandle): ShapeHandle {
        return wrap("simplify", () => handle(this.#raw.simplify(shape)));
    }

    filletVariable(solid: ShapeHandle, edge: ShapeHandle, startRadius: number, endRadius: number): ShapeHandle {
        return wrap("filletVariable", () => handle(this.#raw.filletVariable(solid, edge, startRadius, endRadius)));
    }

    /** Offset a 2D wire. */
    offsetWire2D(wire: ShapeHandle, offset: number, joinType: JoinType = JoinType.Arc): ShapeHandle {
        return wrap("offsetWire2D", () => handle(this.#raw.offsetWire2D(wire, offset, joinType)));
    }

    // =======================================================================
    // Evolution (operations with shape history)
    // =======================================================================

    translateWithHistory(shape: ShapeHandle, dx: number, dy: number, dz: number, inputFaceHashes: number[], hashUpperBound: number): EvolutionData {
        return wrap("translateWithHistory", () => {
            const hashes = this.#makeVectorI32(inputFaceHashes);
            try { return this.#extractEvolution(this.#raw.translateWithHistory(shape, dx, dy, dz, hashes, hashUpperBound)); }
            finally { hashes.delete(); }
        });
    }

    fuseWithHistory(a: ShapeHandle, b: ShapeHandle, inputFaceHashes: number[], hashUpperBound: number): EvolutionData {
        return wrap("fuseWithHistory", () => {
            const hashes = this.#makeVectorI32(inputFaceHashes);
            try { return this.#extractEvolution(this.#raw.fuseWithHistory(a, b, hashes, hashUpperBound)); }
            finally { hashes.delete(); }
        });
    }

    cutWithHistory(a: ShapeHandle, b: ShapeHandle, inputFaceHashes: number[], hashUpperBound: number): EvolutionData {
        return wrap("cutWithHistory", () => {
            const hashes = this.#makeVectorI32(inputFaceHashes);
            try { return this.#extractEvolution(this.#raw.cutWithHistory(a, b, hashes, hashUpperBound)); }
            finally { hashes.delete(); }
        });
    }

    filletWithHistory(solid: ShapeHandle, edges: ShapeHandle[], radius: number, inputFaceHashes: number[], hashUpperBound: number): EvolutionData {
        return wrap("filletWithHistory", () => {
            const edgeVec = this.#makeVectorU32(edges);
            const hashes = this.#makeVectorI32(inputFaceHashes);
            try { return this.#extractEvolution(this.#raw.filletWithHistory(solid, edgeVec, radius, hashes, hashUpperBound)); }
            finally { edgeVec.delete(); hashes.delete(); }
        });
    }

    rotateWithHistory(
        shape: ShapeHandle,
        axis: { point: Vec3; direction: Vec3 },
        angleRad: number,
        inputFaceHashes: number[],
        hashUpperBound: number,
    ): EvolutionData {
        return wrap("rotateWithHistory", () => {
            const hashes = this.#makeVectorI32(inputFaceHashes);
            try {
                return this.#extractEvolution(this.#raw.rotateWithHistory(
                    shape,
                    axis.point.x, axis.point.y, axis.point.z,
                    axis.direction.x, axis.direction.y, axis.direction.z,
                    angleRad, hashes, hashUpperBound,
                ));
            } finally { hashes.delete(); }
        });
    }

    mirrorWithHistory(shape: ShapeHandle, point: Vec3, normal: Vec3, inputFaceHashes: number[], hashUpperBound: number): EvolutionData {
        return wrap("mirrorWithHistory", () => {
            const hashes = this.#makeVectorI32(inputFaceHashes);
            try {
                return this.#extractEvolution(this.#raw.mirrorWithHistory(
                    shape, point.x, point.y, point.z, normal.x, normal.y, normal.z,
                    hashes, hashUpperBound,
                ));
            } finally { hashes.delete(); }
        });
    }

    scaleWithHistory(shape: ShapeHandle, center: Vec3, factor: number, inputFaceHashes: number[], hashUpperBound: number): EvolutionData {
        return wrap("scaleWithHistory", () => {
            const hashes = this.#makeVectorI32(inputFaceHashes);
            try {
                return this.#extractEvolution(this.#raw.scaleWithHistory(
                    shape, center.x, center.y, center.z, factor, hashes, hashUpperBound,
                ));
            } finally { hashes.delete(); }
        });
    }

    intersectWithHistory(a: ShapeHandle, b: ShapeHandle, inputFaceHashes: number[], hashUpperBound: number): EvolutionData {
        return wrap("intersectWithHistory", () => {
            const hashes = this.#makeVectorI32(inputFaceHashes);
            try { return this.#extractEvolution(this.#raw.intersectWithHistory(a, b, hashes, hashUpperBound)); }
            finally { hashes.delete(); }
        });
    }

    chamferWithHistory(solid: ShapeHandle, edges: ShapeHandle[], distance: number, inputFaceHashes: number[], hashUpperBound: number): EvolutionData {
        return wrap("chamferWithHistory", () => {
            const edgeVec = this.#makeVectorU32(edges);
            const hashes = this.#makeVectorI32(inputFaceHashes);
            try { return this.#extractEvolution(this.#raw.chamferWithHistory(solid, edgeVec, distance, hashes, hashUpperBound)); }
            finally { edgeVec.delete(); hashes.delete(); }
        });
    }

    shellWithHistory(solid: ShapeHandle, faces: ShapeHandle[], thickness: number, inputFaceHashes: number[], hashUpperBound: number): EvolutionData {
        return wrap("shellWithHistory", () => {
            const faceVec = this.#makeVectorU32(faces);
            const hashes = this.#makeVectorI32(inputFaceHashes);
            try { return this.#extractEvolution(this.#raw.shellWithHistory(solid, faceVec, thickness, hashes, hashUpperBound)); }
            finally { faceVec.delete(); hashes.delete(); }
        });
    }

    offsetWithHistory(solid: ShapeHandle, distance: number, inputFaceHashes: number[], hashUpperBound: number): EvolutionData {
        return wrap("offsetWithHistory", () => {
            const hashes = this.#makeVectorI32(inputFaceHashes);
            try { return this.#extractEvolution(this.#raw.offsetWithHistory(solid, distance, hashes, hashUpperBound)); }
            finally { hashes.delete(); }
        });
    }

    thickenWithHistory(shape: ShapeHandle, thickness: number, inputFaceHashes: number[], hashUpperBound: number): EvolutionData {
        return wrap("thickenWithHistory", () => {
            const hashes = this.#makeVectorI32(inputFaceHashes);
            try { return this.#extractEvolution(this.#raw.thickenWithHistory(shape, thickness, hashes, hashUpperBound)); }
            finally { hashes.delete(); }
        });
    }

    // =======================================================================
    // Extrusion Law
    // =======================================================================

    buildExtrusionLaw(profile: string, length: number, endFactor: number): ShapeHandle {
        return wrap("buildExtrusionLaw", () => handle(this.#raw.buildExtrusionLaw(profile, length, endFactor)));
    }

    trimLaw(law: ShapeHandle, first: number, last: number): ShapeHandle {
        return wrap("trimLaw", () => handle(this.#raw.trimLaw(law, first, last)));
    }

    sweepWithLaw(profile: ShapeHandle, spine: ShapeHandle, law: ShapeHandle): ShapeHandle {
        return wrap("sweepWithLaw", () => handle(this.#raw.sweepWithLaw(profile, spine, law)));
    }

    // =======================================================================
    // Healing / Repair
    // =======================================================================

    fixShape(shape: ShapeHandle): ShapeHandle {
        return wrap("fixShape", () => handle(this.#raw.fixShape(shape)));
    }

    unifySameDomain(shape: ShapeHandle): ShapeHandle {
        return wrap("unifySameDomain", () => handle(this.#raw.unifySameDomain(shape)));
    }

    isValid(shape: ShapeHandle): boolean {
        return wrap("isValid", () => this.#raw.isValid(shape));
    }

    healSolid(shape: ShapeHandle, tolerance = 1e-6): ShapeHandle {
        return wrap("healSolid", () => handle(this.#raw.healSolid(shape, tolerance)));
    }

    healFace(shape: ShapeHandle, tolerance = 1e-6): ShapeHandle {
        return wrap("healFace", () => handle(this.#raw.healFace(shape, tolerance)));
    }

    healWire(shape: ShapeHandle, tolerance = 1e-6): ShapeHandle {
        return wrap("healWire", () => handle(this.#raw.healWire(shape, tolerance)));
    }

    fixFaceOrientations(shape: ShapeHandle): ShapeHandle {
        return wrap("fixFaceOrientations", () => handle(this.#raw.fixFaceOrientations(shape)));
    }

    removeDegenerateEdges(shape: ShapeHandle): ShapeHandle {
        return wrap("removeDegenerateEdges", () => handle(this.#raw.removeDegenerateEdges(shape)));
    }

    buildCurves3d(wire: ShapeHandle): void {
        wrap("buildCurves3d", () => this.#raw.buildCurves3d(wire));
    }

    fixWireOnFace(wire: ShapeHandle, face: ShapeHandle, tolerance = 1e-6): ShapeHandle {
        return wrap("fixWireOnFace", () => handle(this.#raw.fixWireOnFace(wire, face, tolerance)));
    }

    // =======================================================================
    // XCAF Document Factories
    // =======================================================================

    /**
     * Create a new XCAF document with the Emscripten FS pre-injected.
     * This allows `doc.exportGLTF()` to work without passing FS explicitly.
     */
    createXCAFDocument(): XCAFDocumentImpl {
        return XCAFDocumentImpl.create(this.#raw, this.#module.FS);
    }

    /**
     * Import a STEP file into a new XCAF document with the Emscripten FS pre-injected.
     * Preserves colors, names, and assembly structure from the STEP file.
     */
    importXCAFFromSTEP(stepData: string): XCAFDocumentImpl {
        return XCAFDocumentImpl.fromSTEP(this.#raw, stepData, this.#module.FS);
    }

    // =======================================================================
    // Memory
    // =======================================================================

    release(shape: ShapeHandle): void {
        this.#raw.release(shape);
    }

    releaseAll(): void {
        this.#raw.releaseAll();
    }

    get shapeCount(): number {
        return this.#raw.getShapeCount();
    }

    // =======================================================================
    // Debugging
    // =======================================================================

    /** Return a human-readable summary of a shape for debugging. */
    describe(shape: ShapeHandle): string {
        const type = this.getShapeType(shape);
        const bbox = this.getBoundingBox(shape);
        const dims = `[${(bbox.xmax - bbox.xmin).toFixed(2)} x ${(bbox.ymax - bbox.ymin).toFixed(2)} x ${(bbox.zmax - bbox.zmin).toFixed(2)}]`;
        const parts: string[] = [`${type} ${dims}`];

        if (type === "solid" || type === "compound" || type === "compsolid") {
            parts.push(`vol=${this.getVolume(shape).toFixed(3)}`);
            parts.push(`area=${this.getSurfaceArea(shape).toFixed(3)}`);
        }

        const faces = this.getSubShapes(shape, "face");
        const edges = this.getSubShapes(shape, "edge");
        const verts = this.getSubShapes(shape, "vertex");
        parts.push(`F:${faces.length} E:${edges.length} V:${verts.length}`);

        return parts.join(" | ");
    }

    [Symbol.dispose](): void {
        kernelRegistry.unregister(this);
        this.#raw.releaseAll();
        this.#raw.delete();
    }

    // =======================================================================
    // Private helpers
    // =======================================================================

    #makeVector<T extends { push_back(v: number): void }>(
        ctor: new () => T,
        values: number[] | ShapeHandle[],
    ): T {
        const vec = new ctor();
        for (const v of values) {
            vec.push_back(v);
        }
        return vec;
    }

    #makeVectorU32(ids: ShapeHandle[] | number[]): EmbindVectorU32 {
        return this.#makeVector(this.#module.VectorUint32, ids);
    }

    #makeVectorF64(values: number[]): EmbindVectorF64 {
        return this.#makeVector(this.#module.VectorDouble, values);
    }

    #makeVectorI32(values: number[]): EmbindVectorI32 {
        return this.#makeVector(this.#module.VectorInt, values);
    }

    #flattenPoints(points: Vec3[]): EmbindVectorF64 {
        const vec = new this.#module.VectorDouble();
        for (const p of points) {
            vec.push_back(p.x);
            vec.push_back(p.y);
            vec.push_back(p.z);
        }
        return vec;
    }

    #vec2FromEmbind(vec: EmbindVectorF64): { u: number; v: number } {
        const u = vec.get(0);
        const v = vec.get(1);
        vec.delete();
        return { u, v };
    }

    #uvBoundsFromEmbind(vec: EmbindVectorF64): UVBounds {
        const result: UVBounds = {
            uMin: vec.get(0),
            uMax: vec.get(1),
            vMin: vec.get(2),
            vMax: vec.get(3),
        };
        vec.delete();
        return result;
    }

    #curvatureDataFromEmbind(vec: EmbindVectorF64): CurvatureData {
        const result: CurvatureData = {
            min: vec.get(0),
            max: vec.get(1),
            gaussian: vec.get(2),
            mean: vec.get(3),
        };
        vec.delete();
        return result;
    }

    #vec3FromEmbind(vec: EmbindVectorF64): Vec3 {
        const x = vec.get(0);
        const y = vec.get(1);
        const z = vec.get(2);
        vec.delete();
        return { x, y, z };
    }

    #extractMesh(raw: RawMeshData): Mesh {
        try {
            return this.#extractMeshFromRaw(raw);
        } finally {
            raw.delete();
        }
    }

    #extractMeshFromRaw(raw: RawMeshData): Mesh {
        const vertexCount = raw.positionCount / 3;
        const triangleCount = raw.indexCount / 3;
        const positions = new Float32Array(
            this.#module.HEAPF32.buffer.slice(
                raw.getPositionsPtr(),
                raw.getPositionsPtr() + raw.positionCount * 4,
            ),
        );
        const normals = new Float32Array(
            this.#module.HEAPF32.buffer.slice(
                raw.getNormalsPtr(),
                raw.getNormalsPtr() + raw.normalCount * 4,
            ),
        );
        const indices = new Uint32Array(
            this.#module.HEAPU32.buffer.slice(
                raw.getIndicesPtr(),
                raw.getIndicesPtr() + raw.indexCount * 4,
            ),
        );
        return { positions, normals, indices, vertexCount, triangleCount };
    }

    #extractMeshWithFaceGroups(raw: RawMeshData): Mesh {
        try {
            const mesh = this.#extractMeshFromRaw(raw);
            if (raw.faceGroupCount > 0) {
                mesh.faceGroups = new Int32Array(
                    this.#module.HEAP32.buffer.slice(
                        raw.getFaceGroupsPtr(),
                        raw.getFaceGroupsPtr() + raw.faceGroupCount * 4,
                    ),
                );
                mesh.faceCount = raw.faceGroupCount / 3;
            }
            return mesh;
        } finally {
            raw.delete();
        }
    }

    #extractEvolution(raw: RawEvolutionData): EvolutionData {
        const modified = vecToNumbers(raw.modified);
        raw.modified.delete();
        const generated = vecToNumbers(raw.generated);
        raw.generated.delete();
        const deleted = vecToNumbers(raw.deleted);
        raw.deleted.delete();
        return {
            result: handle(raw.resultId),
            modified,
            generated,
            deleted,
        };
    }
}
