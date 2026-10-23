/**
 * OcctKernel.init({ createModule }) for hosts where init()'s own relative
 * `import("./occt-wasm.js")` cannot resolve, such as a bundled Web Worker.
 * The kernel is imported from source here, where no glue sits next to
 * index.ts, so these tests only pass when the injected factory is used.
 */
import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { OcctKernel, type OcctModuleFactory } from "../ts/src/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");

async function glueFactory(): Promise<OcctModuleFactory> {
    return ((await import(jsPath)) as { default: OcctModuleFactory }).default;
}

describe("OcctKernel.init({ createModule })", () => {
    it("builds the kernel from the injected factory, locating the wasm by path", async () => {
        const factory = await glueFactory();
        const calls: Record<string, unknown>[] = [];
        const createModule: OcctModuleFactory = (options) => {
            calls.push(options);
            return factory(options);
        };

        const kernel = await OcctKernel.init({ createModule, wasm: wasmPath });
        try {
            expect(kernel.getVolume(kernel.makeBox(2, 3, 4))).toBeCloseTo(24, 6);
        } finally {
            kernel[Symbol.dispose]();
        }

        expect(calls).toHaveLength(1);
        const locateFile = calls[0]?.["locateFile"] as (path: string) => string;
        expect(locateFile("occt-wasm.wasm")).toBe(wasmPath);
    });

    it("hands a pre-fetched binary to the injected factory", async () => {
        const kernel = await OcctKernel.init({
            createModule: await glueFactory(),
            wasm: readFileSync(wasmPath),
        });
        try {
            expect(kernel.getVolume(kernel.makeBox(1, 2, 3))).toBeCloseTo(6, 6);
        } finally {
            kernel[Symbol.dispose]();
        }
    });
});
