/**
 * XCAF STEP export: sRGB colors and UTF-8 names.
 *
 * `#808080` is 128/255 = 0.50196 in sRGB. Taken as linear RGB it was written
 * as COLOUR_RGB 0.7366, and a name passed as UTF-8 was decoded byte by byte.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Module: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let raw: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let kernel: any;

beforeAll(async () => {
    const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
    const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");
    const createModule = (await import(jsPath)).default;
    Module = await createModule({
        locateFile: (path: string) => (path.endsWith(".wasm") ? wasmPath : path),
    });
    const mod = await import(resolve(__dirname, "../ts/src/index.ts"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kernel = new (mod.OcctKernel as any)(Module);
    raw = kernel.getRawKernel();
}, 30_000);

afterEach(() => kernel.releaseAll());
afterAll(() => kernel[Symbol.dispose]());

const GREY = 128 / 255;
const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Every COLOUR_RGB triple in a STEP file. */
function stepColors(step: string): number[][] {
    return [...step.matchAll(/COLOUR_RGB\('[^']*',\s*([-\d.E+]+),\s*([-\d.E+]+),\s*([-\d.E+]+)\)/g)].map((m) =>
        [m[1], m[2], m[3]].map(Number),
    );
}

/** Run `fn` with a document, closing it afterwards. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withDoc<T>(doc: any, fn: (doc: any) => T): T {
    try {
        return fn(doc);
    } finally {
        doc.close();
    }
}

/** Depth-first walk of every label reachable from the roots. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function allLabels(doc: any): number[] {
    const seen: number[] = [];
    const visit = (label: number) => {
        if (seen.includes(label)) return;
        seen.push(label);
        doc.getChildren(label).forEach(visit);
        doc.getSubShapes(label).forEach(visit);
        const referred = doc.getReferredLabel(label);
        if (referred !== undefined && referred !== null && referred > 0) visit(referred);
    };
    doc.getRoots().forEach(visit);
    return seen;
}

describe("XCAF colors are sRGB", () => {
    it("writes an sRGB color to COLOUR_RGB unchanged", () => {
        const step: string = withDoc(kernel.createXCAFDocument(), (doc) => {
            doc.addShape(kernel.makeBox(10, 10, 10), { name: "grey", color: [GREY, GREY, GREY] });
            return doc.exportSTEP();
        });
        const colors = stepColors(step);
        expect(colors.length).toBeGreaterThan(0);
        for (const rgb of colors) {
            for (const c of rgb) expect(c).toBeCloseTo(GREY, 4);
        }
    });

    it("reads the same sRGB color back after a STEP round trip", () => {
        const step: string = withDoc(kernel.createXCAFDocument(), (doc) => {
            const label = doc.addShape(kernel.makeBox(10, 10, 10), { color: [GREY, 0.25, 1] });
            // Quantity_Color keeps single-precision components.
            expect(doc.getLabelInfo(label).color[0]).toBeCloseTo(GREY, 6);
            return doc.exportSTEP();
        });
        const colored = withDoc(kernel.importXCAFFromSTEP(step), (imported) =>
            allLabels(imported)
                .map((l) => imported.getLabelInfo(l))
                .filter((info) => info.hasColor),
        );
        expect(colored.length).toBeGreaterThan(0);
        expect(colored[0].color[0]).toBeCloseTo(GREY, 4);
        expect(colored[0].color[1]).toBeCloseTo(0.25, 4);
        expect(colored[0].color[2]).toBeCloseTo(1, 4);
    });

    it("hands glTF the linear factor of the sRGB color", () => {
        const glb: Uint8Array = withDoc(kernel.createXCAFDocument(), (doc) => {
            doc.addShape(kernel.makeBox(10, 10, 10), { color: [GREY, GREY, GREY] });
            return doc.exportGLTF();
        });
        const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
        const jsonLength = view.getUint32(12, true);
        const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)));
        const factor = json.materials[0].pbrMetallicRoughness.baseColorFactor;
        expect(factor[0]).toBeCloseTo(srgbToLinear(GREY), 4);
    });
});

describe("XCAF names are UTF-8", () => {
    const NAME = "Größe ø10 – 部品";

    it("reads a non-ASCII name back as set", () => {
        withDoc(kernel.createXCAFDocument(), (doc) => {
            const label = doc.addShape(kernel.makeBox(10, 10, 10), { name: NAME });
            expect(doc.getLabelInfo(label).name).toBe(NAME);
        });
    });

    it("keeps a non-ASCII name through a STEP round trip", () => {
        const step: string = withDoc(kernel.createXCAFDocument(), (doc) => {
            doc.addShape(kernel.makeBox(10, 10, 10), { name: NAME });
            return doc.exportSTEP();
        });
        expect(step).not.toContain("GrÃ¶Ãe");
        const names = withDoc(kernel.importXCAFFromSTEP(step), (imported) =>
            allLabels(imported).map((l) => imported.getLabelInfo(l).name),
        );
        expect(names).toContain(NAME);
    });
});
