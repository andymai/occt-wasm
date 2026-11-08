import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { OcctKernel, type OcctModuleFactory, type ShapeHandle } from "../ts/src/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");

let kernel: OcctKernel;

beforeAll(async () => {
    const createModule = ((await import(jsPath)) as { default: OcctModuleFactory }).default;
    kernel = await OcctKernel.init({ createModule, wasm: wasmPath });
}, 30_000);

afterAll(() => {
    kernel?.[Symbol.dispose]();
});

describe("closed lofts", () => {
    /** A square about the ring of radius 10 at `angle`, its corners listed from `start`, either way round. */
    function section(angle: number, start: number, flip: boolean): ShapeHandle {
        const corners = [0, 1, 2, 3].map((i) => {
            const a = Math.PI / 4 + (i * Math.PI) / 2;
            const u = 10 + 2 * Math.SQRT2 * Math.cos(a);
            return { x: u * Math.cos(angle), y: u * Math.sin(angle), z: 2 * Math.SQRT2 * Math.sin(a) };
        });
        if (flip) corners.reverse();
        const at = (i: number) => corners[(start + i) % 4]!;
        return kernel.makeWire([0, 1, 2, 3].map((i) => kernel.makeLineEdge(at(i), at(i + 1))));
    }

    const lofts: [string, (wires: ShapeHandle[]) => ShapeHandle][] = [
        ["loftWithHistory", (wires) => kernel.loftWithHistory(wires, true, true, [], 1 << 20).result],
        ["loft", (wires) => kernel.loft(wires, true, true)],
    ];

    it.each(lofts)("%s does not twist sections a quarter turn apart, wherever their wires start", (_, loft) => {
        for (const count of [3, 4, 5]) {
            const angles = Array.from({ length: count }, (_, i) => (i * 2 * Math.PI) / count);
            const looped = (wires: ShapeHandle[]) => kernel.getVolume(loft([...wires, wires[0]!]));
            const truth = looped(angles.map((a) => section(a, 0, false)));
            for (let trial = 0; trial < 8; trial++) {
                const wires = angles.map((a, i) => section(a, (trial + 3 * i) % 4, (trial + i) % 2 === 0));
                expect(looped(wires) / truth).toBeCloseTo(1, 6);
            }
        }
    });

    it("names every wall from the wires it was given", () => {
        const wires = [0, 1, 2, 3].map((i) => section((i * Math.PI) / 2, i, i % 2 === 1));
        const evolution = kernel.loftWithHistory([...wires, wires[0]!], true, true, [], 1 << 20);
        expect(evolution.edgeGenerated.length).toBeGreaterThan(0);
        expect(kernel.isValid(evolution.result)).toBe(true);
        expect(kernel.getSubShapes(evolution.result, "face")).toHaveLength(16);
    });
});
