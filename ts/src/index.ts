/**
 * @occt-wasm/core — OCCT compiled to WASM with clean TypeScript bindings.
 *
 * @example
 * ```ts
 * import { OcctKernel } from '@occt-wasm/core';
 *
 * const kernel = await OcctKernel.init();
 * const box = kernel.makeBox(10, 20, 30);
 * const mesh = kernel.tessellate(box);
 * console.log(`${mesh.triangleCount} triangles`);
 * kernel.release(box);
 * ```
 */

export {
    OcctError,
    type BoundingBox,
    type InitOptions,
    type Mesh,
    type ShapeHandle,
    type TessellateOptions,
    type Vec3,
} from "./types.js";

import type {
    BoundingBox,
    InitOptions,
    Mesh,
    ShapeHandle,
    TessellateOptions,
    Vec3,
} from "./types.js";
import { OcctError } from "./types.js";

/** Raw Embind module types (internal). */
interface EmscriptenModule {
    OcctKernel: new () => RawKernel;
    VectorUint32: new () => EmbindVector;
    HEAPF32: Float32Array;
    HEAPU32: Uint32Array;
}

interface RawMeshData {
    positionCount: number;
    normalCount: number;
    indexCount: number;
    getPositionsPtr(): number;
    getNormalsPtr(): number;
    getIndicesPtr(): number;
    delete(): void;
}

interface RawEdgeData {
    pointCount: number;
    getPointsPtr(): number;
    delete(): void;
}

interface EmbindVector {
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
    makeCylinder(radius: number, height: number): number;
    makeSphere(radius: number): number;
    makeCone(r1: number, r2: number, height: number): number;
    makeTorus(majorRadius: number, minorRadius: number): number;
    // Booleans
    fuse(a: number, b: number): number;
    cut(a: number, b: number): number;
    common(a: number, b: number): number;
    section(a: number, b: number): number;
    // Modeling
    extrude(id: number, dx: number, dy: number, dz: number): number;
    revolve(
        id: number,
        px: number, py: number, pz: number,
        dx: number, dy: number, dz: number,
        angle: number,
    ): number;
    fillet(solidId: number, edgeIds: EmbindVector, radius: number): number;
    chamfer(solidId: number, edgeIds: EmbindVector, distance: number): number;
    shell(solidId: number, faceIds: EmbindVector, thickness: number): number;
    offset(solidId: number, distance: number): number;
    draft(
        shapeId: number, faceId: number, angle: number,
        dx: number, dy: number, dz: number,
    ): number;
    // Sweeps
    pipe(profileId: number, spineId: number): number;
    loft(wireIds: EmbindVector, isSolid: boolean): number;
    // Construction
    makeVertex(x: number, y: number, z: number): number;
    makeEdge(v1: number, v2: number): number;
    makeWire(edgeIds: EmbindVector): number;
    makeFace(wireId: number): number;
    makeSolid(shellId: number): number;
    sew(shapeIds: EmbindVector, tolerance: number): number;
    makeCompound(shapeIds: EmbindVector): number;
    // Transforms
    translate(id: number, dx: number, dy: number, dz: number): number;
    rotate(
        id: number,
        px: number, py: number, pz: number,
        dx: number, dy: number, dz: number,
        angle: number,
    ): number;
    scale(id: number, px: number, py: number, pz: number, factor: number): number;
    mirror(
        id: number,
        px: number, py: number, pz: number,
        nx: number, ny: number, nz: number,
    ): number;
    copy(id: number): number;
    // Topology
    getShapeType(id: number): string;
    getSubShapes(id: number, shapeType: string): EmbindVector;
    distanceBetween(a: number, b: number): number;
    // Tessellation
    tessellate(id: number, linDefl: number, angDefl: number): RawMeshData;
    wireframe(id: number, deflection: number): RawEdgeData;
    // I/O
    importStep(data: string): number;
    exportStep(id: number): string;
    exportStl(id: number, linearDeflection: number): string;
    // Query
    getBoundingBox(id: number): BoundingBox;
    getVolume(id: number): number;
    getSurfaceArea(id: number): number;
    // Healing
    fixShape(id: number): number;
    unifySameDomain(id: number): number;

    delete(): void;
}

/** Cast a raw number to a branded ShapeHandle. */
function handle(id: number): ShapeHandle {
    return id as ShapeHandle;
}

/** Wrap an Embind call, catching errors and re-throwing as OcctError. */
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

/**
 * OCCT kernel compiled to WASM. Arena-based shape management
 * with branded handle types for type safety.
 *
 * Create via `OcctKernel.init()`. Dispose via `kernel[Symbol.dispose]()` or
 * the `using` keyword.
 */
export class OcctKernel {
    readonly #raw: RawKernel;
    readonly #module: EmscriptenModule;

    private constructor(module: EmscriptenModule) {
        this.#module = module;
        this.#raw = new module.OcctKernel();
    }

    /**
     * Initialize the WASM module and create a kernel instance.
     *
     * @example
     * ```ts
     * // Browser (auto-locates .wasm next to .js):
     * const kernel = await OcctKernel.init();
     *
     * // Node.js with explicit path:
     * const kernel = await OcctKernel.init({
     *   wasmPath: './node_modules/@occt-wasm/core/dist/occt-wasm.wasm'
     * });
     * ```
     */
    static async init(options?: InitOptions): Promise<OcctKernel> {
        // Dynamic import of the Emscripten-generated module.
        // @ts-expect-error -- dist/occt-wasm.js is generated at build time, no .d.ts
        const imported = await import(/* webpackIgnore: true */ "../../dist/occt-wasm.js");
        const createModule = imported.default as (
            opts: Record<string, unknown>,
        ) => Promise<EmscriptenModule>;

        const moduleOpts: Record<string, unknown> = {};

        if (options?.wasmUrl ?? options?.wasmPath) {
            const wasmLocation = options.wasmUrl ?? options.wasmPath;
            moduleOpts["locateFile"] = (path: string) => {
                if (path.endsWith(".wasm")) return wasmLocation;
                return path;
            };
        }

        const module = await createModule(moduleOpts);
        return new OcctKernel(module);
    }

    // --- Primitives ---

    makeBox(dx: number, dy: number, dz: number): ShapeHandle {
        return wrap("makeBox", () => handle(this.#raw.makeBox(dx, dy, dz)));
    }

    makeCylinder(radius: number, height: number): ShapeHandle {
        return wrap("makeCylinder", () =>
            handle(this.#raw.makeCylinder(radius, height)),
        );
    }

    makeSphere(radius: number): ShapeHandle {
        return wrap("makeSphere", () => handle(this.#raw.makeSphere(radius)));
    }

    makeCone(r1: number, r2: number, height: number): ShapeHandle {
        return wrap("makeCone", () =>
            handle(this.#raw.makeCone(r1, r2, height)),
        );
    }

    makeTorus(majorRadius: number, minorRadius: number): ShapeHandle {
        return wrap("makeTorus", () =>
            handle(this.#raw.makeTorus(majorRadius, minorRadius)),
        );
    }

    // --- Booleans ---

    fuse(a: ShapeHandle, b: ShapeHandle): ShapeHandle {
        return wrap("fuse", () => handle(this.#raw.fuse(a, b)));
    }

    cut(a: ShapeHandle, b: ShapeHandle): ShapeHandle {
        return wrap("cut", () => handle(this.#raw.cut(a, b)));
    }

    common(a: ShapeHandle, b: ShapeHandle): ShapeHandle {
        return wrap("common", () => handle(this.#raw.common(a, b)));
    }

    section(a: ShapeHandle, b: ShapeHandle): ShapeHandle {
        return wrap("section", () => handle(this.#raw.section(a, b)));
    }

    // --- Modeling ---

    extrude(shape: ShapeHandle, dx: number, dy: number, dz: number): ShapeHandle {
        return wrap("extrude", () => handle(this.#raw.extrude(shape, dx, dy, dz)));
    }

    revolve(
        shape: ShapeHandle,
        axis: { point: Vec3; direction: Vec3 },
        angleRad: number,
    ): ShapeHandle {
        return wrap("revolve", () =>
            handle(
                this.#raw.revolve(
                    shape,
                    axis.point.x, axis.point.y, axis.point.z,
                    axis.direction.x, axis.direction.y, axis.direction.z,
                    angleRad,
                ),
            ),
        );
    }

    fillet(solid: ShapeHandle, edges: ShapeHandle[], radius: number): ShapeHandle {
        return wrap("fillet", () => {
            const vec = this.#makeVector(edges);
            try {
                return handle(this.#raw.fillet(solid, vec, radius));
            } finally {
                vec.delete();
            }
        });
    }

    chamfer(solid: ShapeHandle, edges: ShapeHandle[], distance: number): ShapeHandle {
        return wrap("chamfer", () => {
            const vec = this.#makeVector(edges);
            try {
                return handle(this.#raw.chamfer(solid, vec, distance));
            } finally {
                vec.delete();
            }
        });
    }

    shell(solid: ShapeHandle, facesToRemove: ShapeHandle[], thickness: number): ShapeHandle {
        return wrap("shell", () => {
            const vec = this.#makeVector(facesToRemove);
            try {
                return handle(this.#raw.shell(solid, vec, thickness));
            } finally {
                vec.delete();
            }
        });
    }

    offset(solid: ShapeHandle, distance: number): ShapeHandle {
        return wrap("offset", () => handle(this.#raw.offset(solid, distance)));
    }

    // --- Sweeps ---

    pipe(profile: ShapeHandle, spine: ShapeHandle): ShapeHandle {
        return wrap("pipe", () => handle(this.#raw.pipe(profile, spine)));
    }

    loft(wires: ShapeHandle[], isSolid: boolean): ShapeHandle {
        return wrap("loft", () => {
            const vec = this.#makeVector(wires);
            try {
                return handle(this.#raw.loft(vec, isSolid));
            } finally {
                vec.delete();
            }
        });
    }

    // --- Construction ---

    makeVertex(x: number, y: number, z: number): ShapeHandle {
        return wrap("makeVertex", () => handle(this.#raw.makeVertex(x, y, z)));
    }

    makeEdge(v1: ShapeHandle, v2: ShapeHandle): ShapeHandle {
        return wrap("makeEdge", () => handle(this.#raw.makeEdge(v1, v2)));
    }

    makeWire(edges: ShapeHandle[]): ShapeHandle {
        return wrap("makeWire", () => {
            const vec = this.#makeVector(edges);
            try {
                return handle(this.#raw.makeWire(vec));
            } finally {
                vec.delete();
            }
        });
    }

    makeFace(wire: ShapeHandle): ShapeHandle {
        return wrap("makeFace", () => handle(this.#raw.makeFace(wire)));
    }

    makeCompound(shapes: ShapeHandle[]): ShapeHandle {
        return wrap("makeCompound", () => {
            const vec = this.#makeVector(shapes);
            try {
                return handle(this.#raw.makeCompound(vec));
            } finally {
                vec.delete();
            }
        });
    }

    // --- Transforms ---

    translate(shape: ShapeHandle, dx: number, dy: number, dz: number): ShapeHandle {
        return wrap("translate", () => handle(this.#raw.translate(shape, dx, dy, dz)));
    }

    rotate(
        shape: ShapeHandle,
        axis: { point: Vec3; direction: Vec3 },
        angleRad: number,
    ): ShapeHandle {
        return wrap("rotate", () =>
            handle(
                this.#raw.rotate(
                    shape,
                    axis.point.x, axis.point.y, axis.point.z,
                    axis.direction.x, axis.direction.y, axis.direction.z,
                    angleRad,
                ),
            ),
        );
    }

    scale(shape: ShapeHandle, center: Vec3, factor: number): ShapeHandle {
        return wrap("scale", () =>
            handle(this.#raw.scale(shape, center.x, center.y, center.z, factor)),
        );
    }

    mirror(shape: ShapeHandle, point: Vec3, normal: Vec3): ShapeHandle {
        return wrap("mirror", () =>
            handle(
                this.#raw.mirror(shape, point.x, point.y, point.z, normal.x, normal.y, normal.z),
            ),
        );
    }

    copy(shape: ShapeHandle): ShapeHandle {
        return wrap("copy", () => handle(this.#raw.copy(shape)));
    }

    // --- Topology ---

    getShapeType(shape: ShapeHandle): string {
        return this.#raw.getShapeType(shape);
    }

    getSubShapes(shape: ShapeHandle, type: "vertex" | "edge" | "wire" | "face" | "shell" | "solid"): ShapeHandle[] {
        return wrap("getSubShapes", () => {
            const vec = this.#raw.getSubShapes(shape, type);
            const result: ShapeHandle[] = [];
            for (let i = 0; i < vec.size(); i++) {
                result.push(handle(vec.get(i)));
            }
            vec.delete();
            return result;
        });
    }

    distanceBetween(a: ShapeHandle, b: ShapeHandle): number {
        return wrap("distanceBetween", () => this.#raw.distanceBetween(a, b));
    }

    // --- Tessellation ---

    /**
     * Tessellate a shape into a triangle mesh.
     * Returns copied Float32Array/Uint32Array data (safe to keep).
     */
    tessellate(shape: ShapeHandle, options?: TessellateOptions): Mesh {
        return wrap("tessellate", () => {
            const linearDeflection = options?.linearDeflection ?? 0.1;
            const angularDeflection = options?.angularDeflection ?? 0.5;

            const raw = this.#raw.tessellate(
                shape,
                linearDeflection,
                angularDeflection,
            );

            try {
                const vertexCount = raw.positionCount / 3;
                const triangleCount = raw.indexCount / 3;

                // Copy data out of WASM heap (safe — survives memory growth)
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

                return {
                    positions,
                    normals,
                    indices,
                    vertexCount,
                    triangleCount,
                };
            } finally {
                raw.delete();
            }
        });
    }

    // --- I/O ---

    importStep(data: string | ArrayBuffer): ShapeHandle {
        return wrap("importStep", () => {
            const str =
                typeof data === "string"
                    ? data
                    : new TextDecoder().decode(data);
            return handle(this.#raw.importStep(str));
        });
    }

    exportStep(shape: ShapeHandle): string {
        return wrap("exportStep", () => this.#raw.exportStep(shape));
    }

    exportStl(shape: ShapeHandle, linearDeflection = 0.1): string {
        return wrap("exportStl", () => this.#raw.exportStl(shape, linearDeflection));
    }

    // --- Healing ---

    fixShape(shape: ShapeHandle): ShapeHandle {
        return wrap("fixShape", () => handle(this.#raw.fixShape(shape)));
    }

    unifySameDomain(shape: ShapeHandle): ShapeHandle {
        return wrap("unifySameDomain", () => handle(this.#raw.unifySameDomain(shape)));
    }

    // --- Query ---

    getBoundingBox(shape: ShapeHandle): BoundingBox {
        return wrap("getBoundingBox", () => this.#raw.getBoundingBox(shape));
    }

    getVolume(shape: ShapeHandle): number {
        return wrap("getVolume", () => this.#raw.getVolume(shape));
    }

    getSurfaceArea(shape: ShapeHandle): number {
        return wrap("getSurfaceArea", () => this.#raw.getSurfaceArea(shape));
    }

    // --- Memory ---

    release(shape: ShapeHandle): void {
        this.#raw.release(shape);
    }

    releaseAll(): void {
        this.#raw.releaseAll();
    }

    get shapeCount(): number {
        return this.#raw.getShapeCount();
    }

    [Symbol.dispose](): void {
        this.#raw.releaseAll();
        this.#raw.delete();
    }

    /** Create an Embind VectorUint32 from a JS array of ShapeHandles. */
    #makeVector(ids: ShapeHandle[]): EmbindVector {
        const vec = new this.#module.VectorUint32();
        for (const id of ids) {
            vec.push_back(id);
        }
        return vec;
    }
}
