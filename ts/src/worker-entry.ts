/**
 * Worker entry point — runs inside the Web Worker.
 * Initializes an OcctKernel and exposes it via Comlink.
 * @module
 */

import * as Comlink from "comlink";
import type { InitOptions } from "./types.js";
import { OcctKernel } from "./index.js";

let kernel: OcctKernel | null = null;

const api = {
    async init(options?: InitOptions) {
        if (kernel) {
            kernel.releaseAll();
        }
        kernel = await OcctKernel.init(options);
    },
    get kernel() {
        if (!kernel) throw new Error("OcctKernel not initialized — call init() first");
        return Comlink.proxy(kernel);
    },
};

Comlink.expose(api);
