/**
 * Off-main-thread OCCT kernel via Web Workers.
 *
 * @example
 * ```ts
 * import { OcctWorker } from 'occt-wasm/worker';
 *
 * const worker = await OcctWorker.spawn({ wasm: '/occt-wasm.wasm' });
 * const box = await worker.makeBox(10, 20, 30);
 * const mesh = await worker.tessellate(box);
 * console.log(mesh.triangleCount);
 * worker.terminate();
 * ```
 *
 * @module
 */

import * as Comlink from "comlink";
import type { InitOptions, ShapeHandle, Mesh, BoundingBox, Vec3, TessellateOptions, ShapeType, EdgeData, MeshBatchData, ProjectionData, NurbsCurveData, CurvatureData, UVBounds, ShapeOrientation, PointClassification, SurfaceKind, CurveKind, ShapeQueryResult } from "./types.js";
import type { BooleanOp, TransitionMode } from "./types.js";

/**
 * Async proxy to an OcctKernel running in a Web Worker.
 * Every method returns a `Promise` wrapping the original return type.
 */
export interface OcctWorkerProxy {
    // Primitives
    makeBox(dx: number, dy: number, dz: number): Promise<ShapeHandle>;
    makeBoxFromCorners(corner1: Vec3, corner2: Vec3): Promise<ShapeHandle>;
    makeCylinder(radius: number, height: number): Promise<ShapeHandle>;
    makeSphere(radius: number): Promise<ShapeHandle>;
    makeCone(r1: number, r2: number, height: number): Promise<ShapeHandle>;
    makeTorus(majorRadius: number, minorRadius: number): Promise<ShapeHandle>;
    makeEllipsoid(rx: number, ry: number, rz: number): Promise<ShapeHandle>;
    makeRectangle(width: number, height: number): Promise<ShapeHandle>;

    // Booleans
    fuse(a: ShapeHandle, b: ShapeHandle): Promise<ShapeHandle>;
    cut(a: ShapeHandle, b: ShapeHandle): Promise<ShapeHandle>;
    common(a: ShapeHandle, b: ShapeHandle): Promise<ShapeHandle>;
    intersect(a: ShapeHandle, b: ShapeHandle): Promise<ShapeHandle>;
    section(a: ShapeHandle, b: ShapeHandle): Promise<ShapeHandle>;
    fuseAll(shapes: ShapeHandle[]): Promise<ShapeHandle>;
    cutAll(shape: ShapeHandle, tools: ShapeHandle[]): Promise<ShapeHandle>;
    split(shape: ShapeHandle, tools: ShapeHandle[]): Promise<ShapeHandle>;

    // Modeling
    extrude(shape: ShapeHandle, dx: number, dy: number, dz: number): Promise<ShapeHandle>;
    revolve(shape: ShapeHandle, axis: { point: Vec3; direction: Vec3 }, angleRad: number): Promise<ShapeHandle>;
    fillet(solid: ShapeHandle, edges: ShapeHandle[], radius: number): Promise<ShapeHandle>;
    chamfer(solid: ShapeHandle, edges: ShapeHandle[], distance: number): Promise<ShapeHandle>;
    shell(solid: ShapeHandle, facesToRemove: ShapeHandle[], thickness: number): Promise<ShapeHandle>;
    offset(solid: ShapeHandle, distance: number): Promise<ShapeHandle>;
    draft(shape: ShapeHandle, face: ShapeHandle, angleRad: number, direction: Vec3): Promise<ShapeHandle>;

    // Sweeps
    pipe(profile: ShapeHandle, spine: ShapeHandle): Promise<ShapeHandle>;
    loft(wires: ShapeHandle[], isSolid: boolean): Promise<ShapeHandle>;
    sweep(wire: ShapeHandle, spine: ShapeHandle, transitionMode?: TransitionMode): Promise<ShapeHandle>;
    draftPrism(shape: ShapeHandle, dx: number, dy: number, dz: number, angleDeg: number): Promise<ShapeHandle>;

    // Construction
    makeVertex(x: number, y: number, z: number): Promise<ShapeHandle>;
    makeEdge(v1: ShapeHandle, v2: ShapeHandle): Promise<ShapeHandle>;
    makeLineEdge(start: Vec3, end: Vec3): Promise<ShapeHandle>;
    makeCircleEdge(center: Vec3, normal: Vec3, radius: number): Promise<ShapeHandle>;
    makeArcEdge(start: Vec3, mid: Vec3, end: Vec3): Promise<ShapeHandle>;
    makeWire(edges: ShapeHandle[]): Promise<ShapeHandle>;
    makeFace(wire: ShapeHandle): Promise<ShapeHandle>;
    makeSolid(shell: ShapeHandle): Promise<ShapeHandle>;
    makeCompound(shapes: ShapeHandle[]): Promise<ShapeHandle>;

    // Transforms
    translate(shape: ShapeHandle, dx: number, dy: number, dz: number): Promise<ShapeHandle>;
    rotate(shape: ShapeHandle, axis: { point: Vec3; direction: Vec3 }, angleRad: number): Promise<ShapeHandle>;
    scale(shape: ShapeHandle, center: Vec3, factor: number): Promise<ShapeHandle>;
    mirror(shape: ShapeHandle, point: Vec3, normal: Vec3): Promise<ShapeHandle>;
    copy(shape: ShapeHandle): Promise<ShapeHandle>;
    transform(shape: ShapeHandle, matrix: number[]): Promise<ShapeHandle>;
    linearPattern(shape: ShapeHandle, direction: Vec3, spacing: number, count: number): Promise<ShapeHandle>;
    circularPattern(shape: ShapeHandle, center: Vec3, axis: Vec3, angle: number, count: number): Promise<ShapeHandle>;

    // Topology
    getShapeType(shape: ShapeHandle): Promise<ShapeType>;
    isCompound(shape: ShapeHandle): Promise<boolean>;
    isSolid(shape: ShapeHandle): Promise<boolean>;
    isFace(shape: ShapeHandle): Promise<boolean>;
    isEdge(shape: ShapeHandle): Promise<boolean>;
    isWire(shape: ShapeHandle): Promise<boolean>;
    isVertex(shape: ShapeHandle): Promise<boolean>;
    isShell(shape: ShapeHandle): Promise<boolean>;
    getSubShapes(shape: ShapeHandle, type: "vertex" | "edge" | "wire" | "face" | "shell" | "solid"): Promise<ShapeHandle[]>;
    distanceBetween(a: ShapeHandle, b: ShapeHandle): Promise<number>;
    isSame(a: ShapeHandle, b: ShapeHandle): Promise<boolean>;
    isNull(shape: ShapeHandle): Promise<boolean>;
    shapeOrientation(shape: ShapeHandle): Promise<ShapeOrientation>;

    // Tessellation
    tessellate(shape: ShapeHandle, options?: TessellateOptions): Promise<Mesh>;
    wireframe(shape: ShapeHandle, deflection?: number): Promise<EdgeData>;
    meshShape(shape: ShapeHandle, options?: TessellateOptions): Promise<Mesh>;
    meshBatch(shapes: ShapeHandle[], options?: TessellateOptions): Promise<MeshBatchData>;

    // I/O
    importStep(data: string | ArrayBuffer): Promise<ShapeHandle>;
    exportStep(shape: ShapeHandle): Promise<string>;
    importStl(data: string | ArrayBuffer): Promise<ShapeHandle>;
    exportStl(shape: ShapeHandle, linearDeflection?: number, ascii?: boolean): Promise<string>;
    toBREP(shape: ShapeHandle): Promise<string>;
    fromBREP(data: string): Promise<ShapeHandle>;
    cacheStep(data: string | ArrayBuffer): Promise<string>;
    loadCached(brep: string): Promise<ShapeHandle>;

    // Query
    getBoundingBox(shape: ShapeHandle): Promise<BoundingBox>;
    getVolume(shape: ShapeHandle): Promise<number>;
    getSurfaceArea(shape: ShapeHandle): Promise<number>;
    getLength(shape: ShapeHandle): Promise<number>;
    getCenterOfMass(shape: ShapeHandle): Promise<Vec3>;
    surfaceCurvature(face: ShapeHandle, u: number, v: number): Promise<CurvatureData>;

    // Surfaces
    surfaceType(face: ShapeHandle): Promise<SurfaceKind>;
    surfaceNormal(face: ShapeHandle, u: number, v: number): Promise<Vec3>;
    uvBounds(face: ShapeHandle): Promise<UVBounds>;
    classifyPointOnFace(face: ShapeHandle, u: number, v: number): Promise<PointClassification>;

    // Curves
    curveType(edge: ShapeHandle): Promise<CurveKind>;
    curveLength(edge: ShapeHandle): Promise<number>;
    getNurbsCurveData(edge: ShapeHandle): Promise<NurbsCurveData>;

    // Projection
    projectEdges(shape: ShapeHandle, viewOrigin: Vec3, viewDirection: Vec3, xAxis?: Vec3): Promise<ProjectionData>;

    // Healing
    fixShape(shape: ShapeHandle): Promise<ShapeHandle>;
    unifySameDomain(shape: ShapeHandle): Promise<ShapeHandle>;
    isValid(shape: ShapeHandle): Promise<boolean>;

    // Batch
    translateBatch(shapes: ShapeHandle[], offsets: number[]): Promise<ShapeHandle[]>;
    booleanPipeline(base: ShapeHandle, opCodes: BooleanOp[], tools: ShapeHandle[]): Promise<ShapeHandle>;
    queryBatch(shapes: ShapeHandle[]): Promise<ShapeQueryResult[]>;
    filletBatch(ops: Array<{ solid: ShapeHandle; edges: ShapeHandle[]; radius: number }>): Promise<ShapeHandle[]>;
    transformBatch(shapes: ShapeHandle[], matrices: number[]): Promise<ShapeHandle[]>;
    rotateBatch(shapes: ShapeHandle[], params: number[]): Promise<ShapeHandle[]>;
    scaleBatch(shapes: ShapeHandle[], params: number[]): Promise<ShapeHandle[]>;
    mirrorBatch(shapes: ShapeHandle[], params: number[]): Promise<ShapeHandle[]>;

    // Memory
    release(shape: ShapeHandle): Promise<void>;
    releaseAll(): Promise<void>;
    readonly shapeCount: Promise<number>;

    // Debugging
    describe(shape: ShapeHandle): Promise<string>;
}

/**
 * Web Worker wrapper for OcctKernel. Provides the same API surface
 * but every operation runs off the main thread.
 */
export class OcctWorker {
    readonly #worker: Worker;
    readonly #proxy: OcctWorkerProxy;

    private constructor(worker: Worker, proxy: OcctWorkerProxy) {
        this.#worker = worker;
        this.#proxy = proxy;
    }

    /**
     * Spawn a new Web Worker running an OcctKernel instance.
     *
     * @param options.wasm - URL or path to the .wasm file (passed to `OcctKernel.init`)
     * @param options.worker - Optional pre-created Worker instance. If omitted,
     *   a new Worker is created from the built-in worker entry point.
     *
     * @example
     * ```ts
     * const worker = await OcctWorker.spawn({ wasm: '/occt-wasm.wasm' });
     * const box = await worker.makeBox(10, 20, 30);
     * worker.terminate();
     * ```
     */
    static async spawn(options?: InitOptions & { worker?: Worker }): Promise<OcctWorker> {
        const worker = options?.worker ?? new Worker(
            new URL("./worker-entry.js", import.meta.url),
            { type: "module" },
        );

        const remote = Comlink.wrap<{
            init(options?: InitOptions): Promise<void>;
            kernel: OcctWorkerProxy;
        }>(worker);

        // Initialize the kernel inside the worker
        await remote.init(options ? { wasm: options.wasm, wasmUrl: options.wasmUrl, wasmPath: options.wasmPath } : undefined);

        const proxy = await remote.kernel;
        return new OcctWorker(worker, proxy);
    }

    /** Access the proxied kernel methods. */
    get kernel(): OcctWorkerProxy {
        return this.#proxy;
    }

    // Delegate commonly used methods directly for convenience
    makeBox(dx: number, dy: number, dz: number) { return this.#proxy.makeBox(dx, dy, dz); }
    makeCylinder(radius: number, height: number) { return this.#proxy.makeCylinder(radius, height); }
    makeSphere(radius: number) { return this.#proxy.makeSphere(radius); }
    fuse(a: ShapeHandle, b: ShapeHandle) { return this.#proxy.fuse(a, b); }
    cut(a: ShapeHandle, b: ShapeHandle) { return this.#proxy.cut(a, b); }
    common(a: ShapeHandle, b: ShapeHandle) { return this.#proxy.common(a, b); }
    extrude(shape: ShapeHandle, dx: number, dy: number, dz: number) { return this.#proxy.extrude(shape, dx, dy, dz); }
    fillet(solid: ShapeHandle, edges: ShapeHandle[], radius: number) { return this.#proxy.fillet(solid, edges, radius); }
    tessellate(shape: ShapeHandle, options?: TessellateOptions) { return this.#proxy.tessellate(shape, options); }
    meshShape(shape: ShapeHandle, options?: TessellateOptions) { return this.#proxy.meshShape(shape, options); }
    meshBatch(shapes: ShapeHandle[], options?: TessellateOptions) { return this.#proxy.meshBatch(shapes, options); }
    wireframe(shape: ShapeHandle, deflection?: number) { return this.#proxy.wireframe(shape, deflection); }
    translate(shape: ShapeHandle, dx: number, dy: number, dz: number) { return this.#proxy.translate(shape, dx, dy, dz); }
    rotate(shape: ShapeHandle, axis: { point: Vec3; direction: Vec3 }, angleRad: number) { return this.#proxy.rotate(shape, axis, angleRad); }
    importStep(data: string | ArrayBuffer) { return this.#proxy.importStep(data); }
    exportStep(shape: ShapeHandle) { return this.#proxy.exportStep(shape); }
    cacheStep(data: string | ArrayBuffer) { return this.#proxy.cacheStep(data); }
    loadCached(brep: string) { return this.#proxy.loadCached(brep); }
    getBoundingBox(shape: ShapeHandle) { return this.#proxy.getBoundingBox(shape); }
    getVolume(shape: ShapeHandle) { return this.#proxy.getVolume(shape); }
    getSurfaceArea(shape: ShapeHandle) { return this.#proxy.getSurfaceArea(shape); }
    getShapeType(shape: ShapeHandle) { return this.#proxy.getShapeType(shape); }
    release(shape: ShapeHandle) { return this.#proxy.release(shape); }
    releaseAll() { return this.#proxy.releaseAll(); }
    queryBatch(shapes: ShapeHandle[]) { return this.#proxy.queryBatch(shapes); }
    filletBatch(ops: Array<{ solid: ShapeHandle; edges: ShapeHandle[]; radius: number }>) { return this.#proxy.filletBatch(ops); }
    transformBatch(shapes: ShapeHandle[], matrices: number[]) { return this.#proxy.transformBatch(shapes, matrices); }
    rotateBatch(shapes: ShapeHandle[], params: number[]) { return this.#proxy.rotateBatch(shapes, params); }
    scaleBatch(shapes: ShapeHandle[], params: number[]) { return this.#proxy.scaleBatch(shapes, params); }
    mirrorBatch(shapes: ShapeHandle[], params: number[]) { return this.#proxy.mirrorBatch(shapes, params); }

    /** Terminate the underlying Web Worker. */
    terminate(): void {
        this.#worker.terminate();
    }
}
