/**
 * occt-wasm/modeling — smaller WASM build excluding XCAF, glTF, and HLR.
 *
 * ~12 MB WASM (vs 20 MB full). Includes: primitives, booleans, modeling,
 * sweeps, construction, transforms, tessellation, STEP/STL/BREP I/O,
 * topology, query, curves, healing.
 *
 * Methods excluded: xcaf*, projectEdges. Calling them will throw at runtime.
 *
 * @example
 * ```ts
 * import { initModeling } from 'occt-wasm/modeling';
 *
 * const kernel = await initModeling();
 * const box = kernel.makeBox(10, 20, 30);
 * ```
 */

export {
    OcctError,
    OcctKernel,
    type BooleanOp,
    type BoundingBox,
    type CurveKind,
    type CurvatureData,
    type EdgeData,
    type EvolutionData,
    type InitOptions,
    type JoinType,
    type Mesh,
    type MeshBatchData,
    type NurbsCurveData,
    type ShapeHandle,
    type ShapeOrientation,
    type ShapeType,
    type SurfaceKind,
    type TessellateOptions,
    type TransitionMode,
    type UVBounds,
    type Vec3,
} from "./index.js";

import type { InitOptions } from "./types.js";
import { OcctKernel } from "./index.js";

/**
 * Initialize an OcctKernel using the modeling-only WASM build (~12 MB).
 * Excludes XCAF, glTF export, and HLR projection.
 */
export async function initModeling(options?: InitOptions): Promise<OcctKernel> {
    return OcctKernel._initFromModule("./occt-wasm-modeling.js", options);
}
