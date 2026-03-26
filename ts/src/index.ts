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

// OcctKernel class will be implemented after the WASM build is working.
// It will wrap the Embind-generated module with typed methods.
