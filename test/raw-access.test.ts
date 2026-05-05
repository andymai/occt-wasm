/**
 * Tests for getRawModule() / getRawKernel() — the escape hatch that lets
 * third-party adapters (e.g. brepjs.OcctWasmAdapter) pair with the public
 * OcctKernel class without bypassing OcctKernel.init().
 *
 * These tests import the *built* dist/index.js so that init()'s relative
 * `import('./occt-wasm.js')` resolves correctly.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let OcctKernel: typeof import("../ts/dist/index.js").OcctKernel;
let kernel: import("../ts/dist/index.js").OcctKernel;

beforeAll(async () => {
    const wasmPath = resolve(__dirname, "../ts/dist/occt-wasm.wasm");
    const wasmBinary = readFileSync(wasmPath);
    const mod = await import(resolve(__dirname, "../ts/dist/index.js"));
    OcctKernel = mod.OcctKernel;
    kernel = await OcctKernel.init({ wasm: wasmBinary });
}, 30_000);

afterAll(() => {
    kernel?.[Symbol.dispose]();
});

describe("OcctKernel raw access", () => {
    it("getRawModule() returns the Emscripten module with expected surface", () => {
        const module = kernel.getRawModule();
        expect(typeof module.OcctKernel).toBe("function");
        expect(typeof module.VectorUint32).toBe("function");
        expect(typeof module.VectorDouble).toBe("function");
        expect(typeof module.VectorInt).toBe("function");
        expect(module.HEAPF32).toBeInstanceOf(Float32Array);
        expect(module.HEAPU32).toBeInstanceOf(Uint32Array);
        expect(module.HEAP32).toBeInstanceOf(Int32Array);
    });

    it("getRawKernel() returns the same raw kernel that backs the wrapper", () => {
        const raw = kernel.getRawKernel();
        const boxId = raw.makeBox(10, 20, 30);
        try {
            // Wrapper-side observation of state mutated through the raw kernel.
            expect(kernel.shapeCount).toBeGreaterThan(0);
            expect(typeof boxId).toBe("number");
            expect(raw.getShapeType(boxId)).toBe("solid");
        } finally {
            raw.release(boxId);
        }
    });

    it("raw module + raw kernel are stable across calls (same identity)", () => {
        expect(kernel.getRawModule()).toBe(kernel.getRawModule());
        expect(kernel.getRawKernel()).toBe(kernel.getRawKernel());
    });

    it("dispose is idempotent if the raw kernel is deleted externally first", async () => {
        // An integrator following Embind teardown conventions might call
        // raw.delete() when tearing down their adapter. The wrapper's
        // [Symbol.dispose]() must not crash when it later runs releaseAll() /
        // delete() on the already-deleted Embind object.
        const wasmPath = resolve(__dirname, "../ts/dist/occt-wasm.wasm");
        const wasmBinary = readFileSync(wasmPath);
        const ephemeral = await OcctKernel.init({ wasm: wasmBinary });
        ephemeral.getRawKernel().delete();
        // Should not throw — the catch in [Symbol.dispose]() absorbs the
        // double-delete error from Embind.
        expect(() => ephemeral[Symbol.dispose]()).not.toThrow();
    });

    it("simulates a brepjs-style adapter handoff", () => {
        const module = kernel.getRawModule();
        const raw = kernel.getRawKernel();
        // brepjs.OcctWasmAdapter expects (module, kernel) — verify both are
        // typed and structurally compatible (no `as any` needed).
        const adapter = { module, kernel: raw };
        const id = adapter.kernel.makeSphere(5);
        try {
            expect(adapter.kernel.getVolume(id)).toBeGreaterThan(0);
        } finally {
            adapter.kernel.release(id);
        }
    });
});
