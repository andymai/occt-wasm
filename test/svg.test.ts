/**
 * Tests for the multiview SVG renderer and bounding-box align helpers
 * (ts/src/svg.ts + the toSVG/toMultiviewSVG/alignX|Y|Z wrapper methods).
 *
 * init() can't run here (it imports ./occt-wasm.js relative to source), so we
 * load the built WASM module and construct the wrapper via its private
 * constructor — exercising the real shipping methods against real OCCT HLR.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Module: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let kernel: any;

beforeAll(async () => {
    const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
    const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");
    const createModule = (await import(jsPath)).default;
    Module = await createModule({
        locateFile: (path: string) => (path.endsWith(".wasm") ? wasmPath : path),
    });

    const { OcctKernel } = await import(resolve(__dirname, "../ts/src/index.ts"));
    // Bypass init() (which imports a build-time relative module) via the
    // private constructor — gives a real wrapper over the loaded module.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kernel = new (OcctKernel as any)(Module);
}, 30_000);

afterEach(() => {
    kernel.releaseAll();
});

afterAll(() => {
    kernel[Symbol.dispose]();
});

describe("toMultiviewSVG", () => {
    it("renders a 4-up grid with labels, dimensions, and visible edges", () => {
        const box = kernel.makeBox(10, 20, 30);
        const svg = kernel.toMultiviewSVG(box);

        expect(svg.startsWith("<svg")).toBe(true);
        expect(svg).toContain("</svg>");
        // Four labeled panels.
        for (const label of ["Front", "Top", "Right", "Iso"]) {
            expect(svg).toContain(`>${label}</text>`);
        }
        // Overall size annotation (X×Y×Z) from the bounding box.
        expect(svg).toContain("10 × 20 × 30 (X×Y×Z)");
        // At least one visible-edge path was drawn.
        expect(svg).toMatch(/<path d="M[^"]+" fill="none" stroke="#111111"/);
        // Per-view gnomon axes present.
        expect(svg).toContain(">X</text>");
        expect(svg).toContain(">Z</text>");
    });

    it("draws hidden edges dashed by default and omits them when disabled", () => {
        const box = kernel.makeBox(10, 10, 10);
        const withHidden = kernel.toMultiviewSVG(box);
        const withoutHidden = kernel.toMultiviewSVG(box, { showHidden: false });

        expect(withHidden).toContain('stroke-dasharray="3 2"');
        expect(withoutHidden).not.toContain('stroke-dasharray="3 2"');
    });

    it("honors a custom view list and column count", () => {
        const box = kernel.makeBox(5, 5, 5);
        const svg = kernel.toMultiviewSVG(box, { views: ["front", "iso"], columns: 2 });

        expect(svg).toContain(">Front</text>");
        expect(svg).toContain(">Iso</text>");
        expect(svg).not.toContain(">Top</text>");
    });

    it("produces well-formed, finite coordinates (no NaN)", () => {
        const cyl = kernel.makeCylinder(5, 12);
        const svg = kernel.toMultiviewSVG(cyl);
        expect(svg).not.toContain("NaN");
        expect(svg).not.toContain("Infinity");
    });
});

describe("toSVG", () => {
    it("renders a single standalone view", () => {
        const box = kernel.makeBox(8, 8, 8);
        const svg = kernel.toSVG(box, "front");
        expect(svg.startsWith("<svg")).toBe(true);
        expect(svg).toMatch(/<path d="M[^"]+" fill="none" stroke="#111111"/);
        // Single view carries no panel label.
        expect(svg).not.toContain(">Front</text>");
    });
});

describe("align helpers", () => {
    it("alignX centers the bounding box on the origin by default", () => {
        const box = kernel.makeBox(10, 4, 4); // spans x: [0,10]
        const aligned = kernel.alignX(box);
        const bb = kernel.getBoundingBox(aligned, false);
        expect(bb.xmin).toBeCloseTo(-5, 6);
        expect(bb.xmax).toBeCloseTo(5, 6);
    });

    it("alignZ min anchor seats the shape on a target plane", () => {
        const box = kernel.makeBox(4, 4, 7); // spans z: [0,7]
        const aligned = kernel.alignZ(box, 100, "min");
        const bb = kernel.getBoundingBox(aligned, false);
        expect(bb.zmin).toBeCloseTo(100, 6);
        expect(bb.zmax).toBeCloseTo(107, 6);
    });

    it("alignY max anchor pins the far face to the target", () => {
        const box = kernel.makeBox(4, 6, 4); // spans y: [0,6]
        const aligned = kernel.alignY(box, 0, "max");
        const bb = kernel.getBoundingBox(aligned, false);
        expect(bb.ymax).toBeCloseTo(0, 6);
        expect(bb.ymin).toBeCloseTo(-6, 6);
    });
});
