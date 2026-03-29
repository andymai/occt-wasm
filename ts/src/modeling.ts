/**
 * occt-wasm/modeling — convenience entry point for the modeling-only build.
 *
 * Equivalent to `OcctKernel.init({ profile: 'modeling' })` from the main entry.
 * Re-exports everything from the main package for seamless usage.
 *
 * @example
 * ```ts
 * import { OcctKernel } from 'occt-wasm/modeling';
 * const kernel = await OcctKernel.init({ profile: 'modeling' });
 * ```
 */

// Re-export everything — the user uses the same API, just a shorter import
export * from "./index.js";
