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
} from "./types.js";
import { OcctError } from "./types.js";

/** Raw Embind module types (internal). */
interface EmscriptenModule {
    OcctKernel: new () => RawKernel;
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

interface RawKernel {
    release(id: number): void;
    releaseAll(): void;
    getShapeCount(): number;
    makeBox(dx: number, dy: number, dz: number): number;
    makeCylinder(radius: number, height: number): number;
    makeSphere(radius: number): number;
    makeCone(r1: number, r2: number, height: number): number;
    makeTorus(majorRadius: number, minorRadius: number): number;
    fuse(a: number, b: number): number;
    cut(a: number, b: number): number;
    common(a: number, b: number): number;
    tessellate(
        id: number,
        linearDeflection: number,
        angularDeflection: number,
    ): RawMeshData;
    importStep(data: string): number;
    exportStep(id: number): string;
    getBoundingBox(id: number): BoundingBox;
    getVolume(id: number): number;
    getSurfaceArea(id: number): number;
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
}
