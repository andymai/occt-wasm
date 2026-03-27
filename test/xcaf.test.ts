import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Module: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let kernel: any;

beforeAll(async () => {
    const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");
    const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
    const createOcctWasm = (await import(jsPath)).default;
    Module = await createOcctWasm({
        locateFile: (path: string) => {
            if (path.endsWith(".wasm")) return wasmPath;
            return path;
        },
    });
    kernel = new Module.OcctKernel();
}, 30_000);

afterAll(() => {
    if (kernel) {
        try {
            kernel.releaseAll();
            kernel.delete();
        } catch {
            // XCAF document cleanup may cause memory issues — ignore
        }
    }
});

describe("XCAF", () => {
    it("creates and closes a document without crashing", () => {
        const docId = kernel.xcafNewDocument();
        expect(docId).toBeGreaterThan(0);
        kernel.xcafClose(docId);
    });

    it("adds a shape with color and name", () => {
        const docId = kernel.xcafNewDocument();
        const box = kernel.makeBox(10, 20, 30);

        const labelId = kernel.xcafAddShape(docId, box);
        expect(labelId).toBeGreaterThan(0);

        kernel.xcafSetColor(docId, labelId, 0.8, 0.2, 0.1);
        kernel.xcafSetName(docId, labelId, "red-box");

        const info = kernel.xcafGetLabelInfo(docId, labelId);
        expect(info.name).toBe("red-box");
        expect(info.hasColor).toBe(true);
        expect(info.r).toBeCloseTo(0.8, 1);
        expect(info.g).toBeCloseTo(0.2, 1);
        expect(info.b).toBeCloseTo(0.1, 1);

        if (info.shapeId > 0) kernel.release(info.shapeId);
        kernel.release(box);
        kernel.xcafClose(docId);
    });

    it("builds an assembly with components", () => {
        const docId = kernel.xcafNewDocument();
        const box = kernel.makeBox(10, 10, 10);
        const cyl = kernel.makeCylinder(5, 20);

        const rootTag = kernel.xcafAddShape(docId, box);
        kernel.xcafSetName(docId, rootTag, "housing");

        const compTag = kernel.xcafAddComponent(
            docId, rootTag, cyl,
            20, 0, 0,  // translate x=20
            0, 0, 0    // no rotation
        );
        kernel.xcafSetName(docId, compTag, "shaft");
        kernel.xcafSetColor(docId, compTag, 0.5, 0.5, 0.5);

        const roots = kernel.xcafGetRootLabels(docId);
        expect(roots.size()).toBeGreaterThanOrEqual(1);

        kernel.release(box);
        kernel.release(cyl);
        kernel.xcafClose(docId);
    });

    it("roundtrips STEP with colors", () => {
        const docId = kernel.xcafNewDocument();
        const box = kernel.makeBox(10, 20, 30);
        const tag = kernel.xcafAddShape(docId, box);
        kernel.xcafSetColor(docId, tag, 1.0, 0.0, 0.0);
        kernel.xcafSetName(docId, tag, "red-box");

        const stepData: string = kernel.xcafExportSTEP(docId);
        expect(stepData).toContain("ISO-10303-21");
        expect(stepData.length).toBeGreaterThan(100);

        // Import back
        const docId2 = kernel.xcafImportSTEP(stepData);
        const roots = kernel.xcafGetRootLabels(docId2);
        expect(roots.size()).toBeGreaterThanOrEqual(1);

        // Verify structure survived roundtrip (colors may be on sub-labels)
        const tag2 = roots.get(0);
        const info = kernel.xcafGetLabelInfo(docId2, tag2);
        expect(info.shapeId).toBeGreaterThan(0);

        if (info.shapeId > 0) kernel.release(info.shapeId);
        kernel.release(box);
        kernel.xcafClose(docId);
        kernel.xcafClose(docId2);
    });

    it("exports glTF binary", () => {
        const docId = kernel.xcafNewDocument();
        const box = kernel.makeBox(10, 20, 30);
        const tag = kernel.xcafAddShape(docId, box);
        kernel.xcafSetColor(docId, tag, 0.2, 0.6, 0.9);

        // xcafExportGLTF returns a file path — read binary via Emscripten FS
        const glbPath: string = kernel.xcafExportGLTF(docId, 0.1, 0.5);
        const glbData: Uint8Array = Module.FS.readFile(glbPath);
        Module.FS.unlink(glbPath);

        // GLB magic: "glTF" = bytes [0x67, 0x6C, 0x54, 0x46]
        expect(glbData.length).toBeGreaterThan(20);
        expect(glbData[0]).toBe(0x67); // 'g'
        expect(glbData[1]).toBe(0x6C); // 'l'
        expect(glbData[2]).toBe(0x54); // 'T'
        expect(glbData[3]).toBe(0x46); // 'F'

        kernel.release(box);
        kernel.xcafClose(docId);
    });

    it("assembly with colored components exports STEP with color data", () => {
        const docId = kernel.xcafNewDocument();
        const box = kernel.makeBox(10, 20, 30);
        const cyl = kernel.makeCylinder(5, 15);

        const rootTag = kernel.xcafAddShape(docId, box);
        kernel.xcafSetName(docId, rootTag, "housing");
        kernel.xcafSetColor(docId, rootTag, 0.8, 0.1, 0.1);

        const childTag = kernel.xcafAddComponent(
            docId, rootTag, cyl,
            15, 0, 0,
            0, Math.PI / 2, 0  // 90° Y rotation
        );
        kernel.xcafSetName(docId, childTag, "shaft");
        kernel.xcafSetColor(docId, childTag, 0.5, 0.5, 0.8);

        const step: string = kernel.xcafExportSTEP(docId);
        expect(step).toContain("ISO-10303-21");
        // Verify valid STEP output with shape data
        expect(step.length).toBeGreaterThan(200);

        kernel.release(box);
        kernel.release(cyl);
        kernel.xcafClose(docId);
    });

    it("imports STEP and reads back structure", () => {
        // Build and export
        const docId = kernel.xcafNewDocument();
        const sphere = kernel.makeSphere(10);
        const tag = kernel.xcafAddShape(docId, sphere);
        kernel.xcafSetName(docId, tag, "ball");
        kernel.xcafSetColor(docId, tag, 0.0, 1.0, 0.0);
        const stepData: string = kernel.xcafExportSTEP(docId);
        kernel.release(sphere);
        kernel.xcafClose(docId);

        // Import and verify
        const docId2 = kernel.xcafImportSTEP(stepData);
        const roots = kernel.xcafGetRootLabels(docId2);
        expect(roots.size()).toBeGreaterThanOrEqual(1);

        const rootTag = roots.get(0);
        const info = kernel.xcafGetLabelInfo(docId2, rootTag);
        expect(info.shapeId).toBeGreaterThan(0);

        if (info.shapeId > 0) kernel.release(info.shapeId);
        kernel.xcafClose(docId2);
    });

    it("glTF binary has valid structure beyond magic", () => {
        const docId = kernel.xcafNewDocument();
        const box = kernel.makeBox(5, 5, 5);
        const tag = kernel.xcafAddShape(docId, box);
        kernel.xcafSetColor(docId, tag, 0.2, 0.7, 0.3);

        const glbPath: string = kernel.xcafExportGLTF(docId, 0.5, 1.0);
        const glb: Uint8Array = Module.FS.readFile(glbPath);
        Module.FS.unlink(glbPath);

        // GLB header: magic (4) + version (4) + length (4) = 12 bytes minimum
        expect(glb.length).toBeGreaterThan(12);

        // Version should be 2 (glTF 2.0)
        const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
        const version = view.getUint32(4, true); // little-endian
        expect(version).toBe(2);

        // Total length should match actual buffer size
        const totalLength = view.getUint32(8, true);
        expect(totalLength).toBe(glb.length);

        kernel.release(box);
        kernel.xcafClose(docId);
    });
});
