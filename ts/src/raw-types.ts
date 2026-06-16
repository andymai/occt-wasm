/**
 * Raw Embind type surface beneath the public `OcctKernel`.
 *
 * Extracted from index.ts; see the banner below. Exposed via
 * `OcctKernel.getRawModule()` / `getRawKernel()` for integrators (e.g. brepjs).
 */

import type { BoundingBox } from "./types.js";
import type { EmscriptenFS } from "./xcaf-document.js";

// ---------------------------------------------------------------------------
// Raw Embind types
//
// These describe the WASM-level surface that sits beneath the public
// `OcctKernel` class. They're exposed (via `getRawModule()` / `getRawKernel()`)
// so that integrators — most notably brepjs's `OcctWasmAdapter` — can pair
// the public class with adapters that take the raw module + Embind kernel
// directly, without losing TypeScript types or bypassing `OcctKernel.init()`.
// ---------------------------------------------------------------------------

/**
 * The Emscripten module exposed by `occt-wasm.js`. Provides Embind class
 * constructors, std::vector wrappers, and typed-array views into WASM
 * linear memory.
 *
 * Returned by {@link OcctKernel.getRawModule}. Structurally compatible with
 * brepjs's `OcctWasmModule` interface.
 */
export interface OcctWasmModule {
    OcctKernel: new () => OcctRawKernel;
    VectorUint32: new () => EmbindVectorU32;
    VectorDouble: new () => EmbindVectorF64;
    VectorInt: new () => EmbindVectorI32;
    HEAPF32: Float32Array;
    HEAPU32: Uint32Array;
    HEAP32: Int32Array;
    FS: EmscriptenFS;
}

export interface RawMeshData {
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

export interface RawMeshBatchData {
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

export interface RawEdgeData {
    pointCount: number;
    edgeGroupCount: number;
    getPointsPtr(): number;
    getEdgeGroupsPtr(): number;
    delete(): void;
}

export interface RawEvolutionData {
    resultId: number;
    modified: EmbindVectorI32;
    generated: EmbindVectorI32;
    deleted: EmbindVectorI32;
}

export interface RawProjectionData {
    visibleOutline: number;
    visibleSmooth: number;
    visibleSharp: number;
    hiddenOutline: number;
    hiddenSmooth: number;
    hiddenSharp: number;
}

export interface RawNurbsCurveData {
    degree: number;
    rational: boolean;
    periodic: boolean;
    knots: EmbindVectorF64;
    multiplicities: EmbindVectorI32;
    poles: EmbindVectorF64;
    weights: EmbindVectorF64;
}

export interface EmbindVectorU32 {
    push_back(v: number): void;
    get(i: number): number;
    size(): number;
    dataPtr(): number;
    delete(): void;
}

export interface EmbindVectorF64 {
    push_back(v: number): void;
    get(i: number): number;
    size(): number;
    dataPtr(): number;
    delete(): void;
}

export interface EmbindVectorI32 {
    push_back(v: number): void;
    get(i: number): number;
    size(): number;
    dataPtr(): number;
    delete(): void;
}

/**
 * The raw Embind kernel — direct mirror of the C++ `OcctKernel` class
 * compiled to WASM. Operates on `u32` arena handles instead of branded
 * {@link ShapeHandle} values.
 *
 * Returned by {@link OcctKernel.getRawKernel}. Structurally compatible with
 * brepjs's `OcctKernelWasm` interface. Prefer the public `OcctKernel` class
 * unless you specifically need to hand the raw kernel to a third-party
 * adapter — calling raw methods bypasses `OcctError` wrapping and the branded
 * handle types.
 */
export interface OcctRawKernel {
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
    halfSpace(ox: number, oy: number, oz: number, nx: number, ny: number, nz: number): number;
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
    intersectionCells(shapeIds: EmbindVectorU32): number;

    // Modeling
    extrude(id: number, dx: number, dy: number, dz: number): number;
    revolve(id: number, px: number, py: number, pz: number, dx: number, dy: number, dz: number, angle: number): number;
    fillet(solidId: number, edgeIds: EmbindVectorU32, radius: number): number;
    chamfer(solidId: number, edgeIds: EmbindVectorU32, distance: number): number;
    chamferDistAngle(solidId: number, edgeIds: EmbindVectorU32, distance: number, angleDeg: number): number;
    shell(solidId: number, faceIds: EmbindVectorU32, thickness: number, tolerance: number): number;
    offset(solidId: number, distance: number, tolerance: number): number;
    draft(shapeId: number, faceId: number, angle: number, dx: number, dy: number, dz: number): number;

    // Sweeps
    pipe(profileId: number, spineId: number): number;
    simplePipe(profileId: number, spineId: number): number;
    loft(wireIds: EmbindVectorU32, isSolid: boolean, ruled: boolean): number;
    loftWithVertices(wireIds: EmbindVectorU32, isSolid: boolean, ruled: boolean, startVertexId: number, endVertexId: number): number;
    sweep(wireId: number, spineId: number, transitionMode: number): number;
    sweepPipeShell(profileId: number, spineId: number, freenet: boolean, smooth: boolean): number;
    sweepOriented(profileId: number, spineId: number, mode: number, upX: number, upY: number, upZ: number, auxSpineId: number): number;
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
    makeBSplineEdge(poles: EmbindVectorF64, weights: EmbindVectorF64, knots: EmbindVectorF64, multiplicities: EmbindVectorI32, degree: number, periodic: boolean): number;
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
    queryBatch(ids: EmbindVectorU32): EmbindVectorF64;
    filletBatch(solidIds: EmbindVectorU32, edgeCounts: EmbindVectorI32, flatEdgeIds: EmbindVectorU32, radii: EmbindVectorF64): EmbindVectorU32;
    transformBatch(ids: EmbindVectorU32, matrices: EmbindVectorF64): EmbindVectorU32;
    rotateBatch(ids: EmbindVectorU32, params: EmbindVectorF64): EmbindVectorU32;
    scaleBatch(ids: EmbindVectorU32, params: EmbindVectorF64): EmbindVectorU32;
    mirrorBatch(ids: EmbindVectorU32, params: EmbindVectorF64): EmbindVectorU32;

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
    tessellateRelative(id: number, linDefl: number, angDefl: number): RawMeshData;
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
    exportBrepBinary(id: number): string;
    importBrepBinary(path: string): number;

    // Query
    getBoundingBox(id: number, useTriangulation: boolean): BoundingBox;
    getVolume(id: number): number;
    getSurfaceArea(id: number): number;
    getLength(id: number): number;
    getCenterOfMass(id: number): EmbindVectorF64;
    getInertia(id: number): EmbindVectorF64;
    containsPoint(id: number, x: number, y: number, z: number, tolerance: number): boolean;
    getSurfaceCenterOfMass(faceId: number): EmbindVectorF64;
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
    getFaceCylinderData(faceId: number): EmbindVectorF64;
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
    interpolatePointsWithTangents(flatPoints: EmbindVectorF64, startTanX: number, startTanY: number, startTanZ: number, endTanX: number, endTanY: number, endTanZ: number): number;
    projectPointOnEdge(edgeId: number, x: number, y: number, z: number): EmbindVectorF64;
    approximatePoints(flatPoints: EmbindVectorF64, tolerance: number): number;
    getNurbsCurveData(edgeId: number): RawNurbsCurveData;
    curveDegreeElevate(edgeId: number, elevateBy: number): number;
    curveKnotInsert(edgeId: number, knot: number, times: number): number;
    curveKnotRemove(edgeId: number, knot: number, tolerance: number): number;
    curveSplit(edgeId: number, param: number): EmbindVectorU32;
    liftCurve2dToPlane(flatPoints2d: EmbindVectorF64, planeOx: number, planeOy: number, planeOz: number, planeZx: number, planeZy: number, planeZz: number, planeXx: number, planeXy: number, planeXz: number): number;

    // Projection
    projectEdges(shapeId: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, xx: number, xy: number, xz: number, hasXAxis: boolean): RawProjectionData;

    // Modifiers
    thicken(shapeId: number, thickness: number, tolerance: number): number;
    defeature(shapeId: number, faceIds: EmbindVectorU32, tolerance: number): number;
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
    shellWithHistory(solidId: number, faceIds: EmbindVectorU32, thickness: number, tolerance: number, inputFaceHashes: EmbindVectorI32, hashUpperBound: number): RawEvolutionData;
    offsetWithHistory(solidId: number, distance: number, tolerance: number, inputFaceHashes: EmbindVectorI32, hashUpperBound: number): RawEvolutionData;
    thickenWithHistory(shapeId: number, thickness: number, tolerance: number, inputFaceHashes: EmbindVectorI32, hashUpperBound: number): RawEvolutionData;

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

    // Bulk array marshalling — move large arrays in one HEAP copy instead of
    // N per-element push_back() boundary crossings.
    allocBytes(byteCount: number): number;
    freeBytes(ptr: number): void;
    vectorF64FromHeap(ptr: number, count: number): EmbindVectorF64;
    vectorU32FromHeap(ptr: number, count: number): EmbindVectorU32;
    vectorI32FromHeap(ptr: number, count: number): EmbindVectorI32;

    delete(): void;
}
