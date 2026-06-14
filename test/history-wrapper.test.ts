/**
 * Wrapper-level coverage for the shape-evolution (*WithHistory) family and the
 * XCAF document factory methods. api-coverage.test.ts exercises the raw Embind
 * kernel; these drive the public OcctKernel wrapper, which returns plain
 * EvolutionData ({ result, modified[], generated[], deleted[] }) and live
 * XCAFDocument instances — neither covered elsewhere.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let kernel: any;
const BOUND = 1_000_000;

beforeAll(async () => {
    const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
    const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");
    const createModule = (await import(jsPath)).default;
    const Module = await createModule({
        locateFile: (p: string) => (p.endsWith(".wasm") ? wasmPath : p),
    });
    const mod = await import(resolve(__dirname, "../ts/src/index.ts"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kernel = new (mod.OcctKernel as any)(Module);
}, 30_000);

afterEach(() => kernel.releaseAll());
afterAll(() => kernel[Symbol.dispose]());

/** Face-hash list the *WithHistory methods take as their input-tracking key. */
function faceHashes(shape: number): number[] {
    return kernel.getSubShapes(shape, "face").map((f: number) => kernel.hashCode(f, BOUND));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function expectEvolution(evo: any): void {
    expect(evo.result).toBeGreaterThan(0);
    expect(kernel.isValid(evo.result)).toBe(true);
    expect(Array.isArray(evo.modified)).toBe(true);
    expect(Array.isArray(evo.generated)).toBe(true);
    expect(Array.isArray(evo.deleted)).toBe(true);
}

describe("*WithHistory wrapper coverage", () => {
    it("translateWithHistory tracks faces through a translation", () => {
        const box = kernel.makeBox(10, 10, 10);
        expectEvolution(kernel.translateWithHistory(box, 5, 0, 0, faceHashes(box), BOUND));
    });

    it("rotateWithHistory", () => {
        const box = kernel.makeBox(10, 10, 10);
        const axis = { point: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 } };
        expectEvolution(kernel.rotateWithHistory(box, axis, Math.PI / 4, faceHashes(box), BOUND));
    });

    it("scaleWithHistory", () => {
        const box = kernel.makeBox(10, 10, 10);
        expectEvolution(kernel.scaleWithHistory(box, { x: 0, y: 0, z: 0 }, 2, faceHashes(box), BOUND));
    });

    it("mirrorWithHistory", () => {
        const box = kernel.makeBox(10, 10, 10);
        expectEvolution(
            kernel.mirrorWithHistory(box, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, faceHashes(box), BOUND),
        );
    });

    it("fuseWithHistory", () => {
        const a = kernel.makeBox(10, 10, 10);
        const b = kernel.translate(kernel.makeBox(10, 10, 10), 5, 5, 5);
        expectEvolution(kernel.fuseWithHistory(a, b, faceHashes(a), BOUND));
    });

    it("cutWithHistory", () => {
        const a = kernel.makeBox(10, 10, 10);
        const b = kernel.translate(kernel.makeBox(6, 6, 6), 5, 5, 5);
        expectEvolution(kernel.cutWithHistory(a, b, faceHashes(a), BOUND));
    });

    it("intersectWithHistory", () => {
        const a = kernel.makeBox(10, 10, 10);
        const b = kernel.translate(kernel.makeBox(10, 10, 10), 5, 5, 5);
        expectEvolution(kernel.intersectWithHistory(a, b, faceHashes(a), BOUND));
    });

    it("filletWithHistory", () => {
        const box = kernel.makeBox(10, 10, 10);
        const edges = kernel.getSubShapes(box, "edge");
        expectEvolution(kernel.filletWithHistory(box, edges.slice(0, 1), 1, faceHashes(box), BOUND));
    });

    it("chamferWithHistory", () => {
        const box = kernel.makeBox(10, 10, 10);
        const edges = kernel.getSubShapes(box, "edge");
        expectEvolution(kernel.chamferWithHistory(box, edges.slice(0, 1), 1, faceHashes(box), BOUND));
    });

    it("offsetWithHistory", () => {
        const box = kernel.makeBox(10, 10, 10);
        expectEvolution(kernel.offsetWithHistory(box, 2, 1e-6, faceHashes(box), BOUND));
    });

    it("shellWithHistory", () => {
        const box = kernel.makeBox(10, 10, 10);
        const faces = kernel.getSubShapes(box, "face");
        expectEvolution(kernel.shellWithHistory(box, faces.slice(0, 1), 1, 1e-6, faceHashes(box), BOUND));
    });

    it("thickenWithHistory thickens an open face into a solid", () => {
        const box = kernel.makeBox(10, 10, 10);
        const face = kernel.getSubShapes(box, "face")[0];
        // Track the face itself, not the parent box's faces, so the input-hash
        // set actually corresponds to the input shape.
        expectEvolution(kernel.thickenWithHistory(face, 2, 1e-6, [kernel.hashCode(face, BOUND)], BOUND));
    });
});

describe("XCAF wrapper factory coverage", () => {
    it("createXCAFDocument builds, exports STEP, and round-trips via importXCAFFromSTEP", () => {
        const doc = kernel.createXCAFDocument();
        const box = kernel.makeBox(10, 10, 10);
        const root = doc.addShape(box, { name: "part", color: [0.8, 0.2, 0.1] });
        expect(root).toBeGreaterThan(0);

        const step = doc.exportSTEP();
        expect(step.length).toBeGreaterThan(100);
        doc.close();

        const reimported = kernel.importXCAFFromSTEP(step);
        expect(reimported.getRoots().length).toBeGreaterThan(0);
        reimported.close();
    });
});
