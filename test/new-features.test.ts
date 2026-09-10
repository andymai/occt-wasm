/**
 * Tests for features added in the architecture review PRs:
 * - OcctErrorCode enum + classifyError logic
 * - Type predicate methods (isSolid, isFace, etc.)
 * - Named enums (TransitionMode, JoinType, BooleanOp)
 * - InitOptions.wasm (ArrayBuffer / Uint8Array support)
 * - XCAF factory methods (createXCAFDocument, importXCAFFromSTEP)
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { resolve, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { OcctKernel as OcctKernelType, ShapeHandle } from "../ts/src/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

let Module: any;
let kernel: any;
let OcctError: any;
let OcctErrorCode: any;
let TransitionMode: any;
let JoinType: any;
let BooleanOp: any;
const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");

beforeAll(async () => {
    const createModule = (await import(jsPath)).default;
    Module = await createModule({
        locateFile: (path: string) =>
            path.endsWith(".wasm") ? wasmPath : path,
    });
    kernel = new Module.OcctKernel();

    const types = await import(resolve(__dirname, "../ts/src/types.ts"));
    OcctError = types.OcctError;
    OcctErrorCode = types.OcctErrorCode;
    TransitionMode = types.TransitionMode;
    JoinType = types.JoinType;
    BooleanOp = types.BooleanOp;

    // OcctKernel.init() can't be tested directly (imports ./occt-wasm.js
    // relative to source). WASM loading is tested via raw Emscripten API.
}, 30_000);

afterEach(() => {
    kernel.releaseAll();
});

afterAll(() => {
    kernel.releaseAll();
    kernel.delete();
});

// ============================================================================
// OcctErrorCode + classifyError
// ============================================================================

describe("OcctErrorCode classification", () => {
    it("auto-classifies 'construction failed' as ConstructionFailed", () => {
        const err = new OcctError("makeBox", "makeBox: construction failed");
        expect(err.code).toBe(OcctErrorCode.ConstructionFailed);
    });

    it("auto-classifies MakePipeShell guide statuses as ConstructionFailed", () => {
        const notIntersect = new OcctError(
            "sweepOriented",
            "sweepOriented: a section plane does not intersect the guide wire. The guide must span the whole spine and stay close enough to meet every section.",
        );
        expect(notIntersect.code).toBe(OcctErrorCode.ConstructionFailed);
        const noContact = new OcctError(
            "sweepOriented",
            "sweepOriented: cannot keep the section in contact with the guide wire. The guide must be close enough to the spine to intersect every section.",
        );
        expect(noContact.code).toBe(OcctErrorCode.ConstructionFailed);
    });

    it("auto-classifies 'boolean operation failed' as BooleanFailed", () => {
        const err = new OcctError("fuse", "fuse: boolean operation failed");
        expect(err.code).toBe(OcctErrorCode.BooleanFailed);
    });

    it("auto-classifies 'Invalid shape ID' as InvalidShapeId", () => {
        const err = new OcctError("translate", "Invalid shape ID: 99999");
        expect(err.code).toBe(OcctErrorCode.InvalidShapeId);
    });

    it("auto-classifies 'invalid label ID' as InvalidLabelId", () => {
        const err = new OcctError("xcafGetLabelInfo", "invalid label ID: 42");
        expect(err.code).toBe(OcctErrorCode.InvalidLabelId);
    });

    it("auto-classifies 'Document is closed' as DocumentClosed", () => {
        const err = new OcctError("XCAFDocument", "Document is closed");
        expect(err.code).toBe(OcctErrorCode.DocumentClosed);
    });

    it("auto-classifies 'operation failed' as ConstructionFailed", () => {
        const err = new OcctError("fillet", "fillet: operation failed");
        expect(err.code).toBe(OcctErrorCode.ConstructionFailed);
    });

    // Operation-category fallback (when message doesn't match known patterns)
    it("falls back to BooleanFailed for boolean operations with unknown messages", () => {
        const err = new OcctError("fuseAll", "some OCCT internal error");
        expect(err.code).toBe(OcctErrorCode.BooleanFailed);
    });

    it("falls back to TessellationFailed for tessellation operations", () => {
        const err = new OcctError("tessellate", "unexpected error");
        expect(err.code).toBe(OcctErrorCode.TessellationFailed);
    });

    it("falls back to ImportExportFailed for I/O operations", () => {
        const err = new OcctError("importStep", "parse error");
        expect(err.code).toBe(OcctErrorCode.ImportExportFailed);
    });

    it("falls back to HealingFailed for healing operations", () => {
        const err = new OcctError("fixShape", "internal error");
        expect(err.code).toBe(OcctErrorCode.HealingFailed);
    });

    it("falls back to KernelError for known operations with unrecognized messages", () => {
        const err = new OcctError("makeVertex", "Standard_DomainError: some OCCT error");
        expect(err.code).toBe(OcctErrorCode.KernelError);
    });

    it("uses Unknown for empty operation name", () => {
        const err = new OcctError("", "something");
        expect(err.code).toBe(OcctErrorCode.Unknown);
    });

    it("allows explicit code override via 3rd argument", () => {
        const err = new OcctError("custom", "msg", OcctErrorCode.DocumentClosed);
        expect(err.code).toBe(OcctErrorCode.DocumentClosed);
    });

    it("preserves the inner code when wrap re-tags an OcctError", async () => {
        // A passthrough method (e.g. loadCached) wraps an already-wrapped inner
        // call (fromBREP -> ImportExportFailed). Re-wrapping under an operation
        // name that isn't in IO_OPS must not downgrade the code to KernelError.
        const { wrap } = await import(resolve(__dirname, "../ts/src/types.ts"));
        const thrown = (() => {
            try {
                wrap("loadCached", () => {
                    throw new OcctError("fromBREP", "bad data");
                });
            } catch (e) {
                return e as InstanceType<typeof OcctError>;
            }
            return undefined;
        })();
        expect(thrown).toBeInstanceOf(OcctError);
        expect(thrown.operation).toBe("loadCached");
        expect(thrown.code).toBe(OcctErrorCode.ImportExportFailed);
    });

    it("preserves Error inheritance", () => {
        const err = new OcctError("op", "msg");
        expect(err instanceof Error).toBe(true);
        expect(err.name).toBe("OcctError");
        expect(err.message).toBe("op: msg");
        expect(err.operation).toBe("op");
    });

    // Message-match priority: message patterns should win over category
    it("message pattern takes priority over operation category", () => {
        // 'fuse' is a boolean op, but 'construction failed' message should win
        const err = new OcctError("fuse", "fuse: construction failed");
        expect(err.code).toBe(OcctErrorCode.ConstructionFailed);
    });
});

// ============================================================================
// WebAssembly.Exception decoding
//
// Under -fwasm-exceptions a C++ throw reaches JS as a WebAssembly.Exception,
// which is not an Error — stringifying it yields "[object WebAssembly.Exception]"
// and the OCCT diagnostic is lost. Each kernel registers its module's
// Emscripten getExceptionMessage helper so wrap() can recover what().
// ============================================================================

describe("wrap decodes WebAssembly.Exception", () => {
    let wrap: any;
    let addExceptionDecoder: any;
    let otherModule: any;
    let release: Array<() => void> = [];

    const register = (decoder: any) => {
        const off = addExceptionDecoder(decoder);
        release.push(off);
        return off;
    };

    beforeAll(async () => {
        const types = await import(resolve(__dirname, "../ts/src/types.ts"));
        wrap = types.wrap;
        addExceptionDecoder = types.addExceptionDecoder;

        const createModule = (await import(jsPath)).default;
        otherModule = await createModule({
            locateFile: (path: string) => (path.endsWith(".wasm") ? wasmPath : path),
        });
    }, 60_000);

    afterEach(() => {
        release.forEach((off) => off());
        release = [];
    });

    const catchWrapped = (op: string, fn: () => unknown) => {
        try {
            wrap(op, fn);
        } catch (e) {
            return e as InstanceType<typeof OcctError>;
        }
        return undefined;
    };

    // releaseAll() frees arena shapes but not Embind vectors, so delete those here.
    const catchFilletCompound = () => {
        // A boolean result is a TopoDS_Compound; fillet's TopoDS::Solid cast
        // rejects it with Standard_TypeMismatch.
        const fused = kernel.fuse(kernel.makeBox(20, 20, 20), kernel.makeCylinder(8, 30));
        const edges = kernel.getSubShapes(fused, "edge");
        const edgeVec = new Module.VectorUint32();
        edgeVec.push_back(edges.get(0));
        try {
            return catchWrapped("fillet", () => kernel.fillet(fused, edgeVec, 1.0));
        } finally {
            edgeVec.delete();
            edges.delete();
        }
    };

    it("recovers the OCCT message when a decoder is registered", () => {
        register((e: unknown) => Module.getExceptionMessage(e));
        const err = catchFilletCompound();
        expect(err).toBeInstanceOf(OcctError);
        expect(err.message).not.toContain("[object WebAssembly.Exception]");
        expect(err.message).toContain("TopoDS::Solid");
        expect(err.operation).toBe("fillet");
    });

    it("does not repeat the operation name already prefixed by the facade", () => {
        register((e: unknown) => Module.getExceptionMessage(e));
        const err = catchFilletCompound();
        expect(err.message.startsWith("fillet: fillet:")).toBe(false);
        expect(err.message).toBe("fillet: TopoDS::Solid");
    });

    it("still produces an OcctError when no decoder is registered", () => {
        const err = catchFilletCompound();
        expect(err).toBeInstanceOf(OcctError);
        expect(err.code).toBe(OcctErrorCode.KernelError);
    });

    it("survives a decoder that throws", () => {
        register(() => {
            throw new Error("decoder blew up");
        });
        const err = catchFilletCompound();
        expect(err).toBeInstanceOf(OcctError);
        expect(err.message).not.toContain("decoder blew up");
    });

    it("leaves plain Error messages untouched", () => {
        register(() => ["std::runtime_error", "should not be used"]);
        const err = catchWrapped("makeBox", () => {
            throw new Error("makeBox: construction failed");
        });
        expect(err.message).toBe("makeBox: construction failed");
    });

    // The headline effect: classifyError matches on the message, so without
    // decoding every message-pattern branch was unreachable through wrap() and
    // real kernel errors only ever got the operation-category fallback.
    it("restores message-based error codes", () => {
        const undecoded = catchWrapped("getVolume", () => kernel.getVolume(99999));
        expect(undecoded.code).toBe(OcctErrorCode.KernelError);

        register((e: unknown) => Module.getExceptionMessage(e));
        const decoded = catchWrapped("getVolume", () => kernel.getVolume(99999));
        expect(decoded.message).toContain("Invalid shape ID");
        expect(decoded.code).toBe(OcctErrorCode.InvalidShapeId);
    });

    it("stops decoding once its registration is released", () => {
        const off = register((e: unknown) => Module.getExceptionMessage(e));
        expect(catchFilletCompound().message).toBe("fillet: TopoDS::Solid");
        off();
        expect(catchFilletCompound().message).toContain(
            "[object WebAssembly.Exception]",
        );
    });

    // A second kernel must not blind the first: each registers its own
    // module-bound decoder, and a foreign module's getArg rejects the tag.
    it("still decodes when another module's decoder is registered first", () => {
        expect(otherModule).not.toBe(Module);

        register((e: unknown) => otherModule.getExceptionMessage(e));
        register((e: unknown) => Module.getExceptionMessage(e));

        const err = catchFilletCompound();
        expect(err.message).toBe("fillet: TopoDS::Solid");
    });

    it("still decodes when another module's decoder is registered last", () => {
        register((e: unknown) => Module.getExceptionMessage(e));
        register((e: unknown) => otherModule.getExceptionMessage(e));

        const err = catchFilletCompound();
        expect(err.message).toBe("fillet: TopoDS::Solid");
    });
});

// ============================================================================
// OcctKernel lifecycle wiring
//
// The block above drives wrap()/addExceptionDecoder directly. These build the
// real wrapper, so they cover what the constructor and Symbol.dispose actually
// wire up — and the one-argument getBoundingBox call from issue #223.
// ============================================================================

// ============================================================================
// Binary STL (#305): bytes must not take the UTF-8 string path
// ============================================================================

describe("binary STL through the wrapper", () => {
    let kernel3: OcctKernelType;

    beforeAll(async () => {
        const { OcctKernel } = await import("../ts/src/index.ts");
        const createModule = (await import(jsPath)).default;
        const m = await createModule({
            locateFile: (path: string) => (path.endsWith(".wasm") ? wasmPath : path),
        });
        kernel3 = new (OcctKernel as unknown as new (m: unknown) => OcctKernelType)(m);
    }, 60_000);

    const expectBoxBounds = (shape: ShapeHandle) => {
        const bbox = kernel3.getBoundingBox(shape);
        expect(bbox.xmax).toBeCloseTo(10, 3);
        expect(bbox.ymax).toBeCloseTo(20, 3);
        expect(bbox.zmax).toBeCloseTo(30, 3);
    };

    it("exportStl returns exact binary bytes by default", () => {
        const box = kernel3.makeBox(10, 20, 30);
        const bytes: Uint8Array = kernel3.exportStl(box, 0.1);
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        expect(bytes.length).toBe(84 + dv.getUint32(80, true) * 50);
        expect(Math.abs(dv.getFloat32(84, true))).toBe(1);
        expect(bytes.includes(0xfd)).toBe(false);
    });

    it("exportStl with ascii: true still returns text", () => {
        const box = kernel3.makeBox(10, 20, 30);
        const text: string = kernel3.exportStl(box, 0.1, true);
        expect(text.startsWith("solid")).toBe(true);
        expectBoxBounds(kernel3.importStl(text));
    });

    it("importStl reads its own binary output from a Uint8Array or ArrayBuffer", () => {
        const box = kernel3.makeBox(10, 20, 30);
        const bytes = kernel3.exportStl(box, 0.1);
        expectBoxBounds(kernel3.importStl(bytes));
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        expectBoxBounds(kernel3.importStl(buffer));
    });

    it("importStl reads binary STL written by another tool", () => {
        // A 10x20x30 box as 12 hand-written facets: what a slicer or mesh
        // tool would produce. Every float carries bytes >= 0x80.
        const corners: [number, number, number][] = [
            [0, 0, 0], [10, 0, 0], [10, 20, 0], [0, 20, 0],
            [0, 0, 30], [10, 0, 30], [10, 20, 30], [0, 20, 30],
        ];
        const faces: [number, number, number, number, [number, number, number]][] = [
            [0, 3, 2, 1, [0, 0, -1]], [4, 5, 6, 7, [0, 0, 1]],
            [0, 1, 5, 4, [0, -1, 0]], [2, 3, 7, 6, [0, 1, 0]],
            [1, 2, 6, 5, [1, 0, 0]], [3, 0, 4, 7, [-1, 0, 0]],
        ];
        const bytes = new Uint8Array(84 + 12 * 50);
        const dv = new DataView(bytes.buffer);
        dv.setUint32(80, 12, true);
        let offset = 84;
        for (const [a, b, c, d, n] of faces) {
            for (const tri of [[a, b, c], [a, c, d]]) {
                n.forEach((v, i) => dv.setFloat32(offset + i * 4, v, true));
                tri.forEach((ci, vi) =>
                    corners[ci].forEach((v, i) => dv.setFloat32(offset + 12 + vi * 12 + i * 4, v, true)),
                );
                offset += 50;
            }
        }
        expectBoxBounds(kernel3.importStl(bytes));
    });
});

describe("OcctKernel wires decoding into its lifecycle", () => {
    let ownModule: any;
    // Typed, unlike the `any` kernels elsewhere in this file, so the
    // single-argument getBoundingBox call below is checked at compile time too
    // — that arity is the literal defect in #223.
    let kernel2: OcctKernelType;

    beforeAll(async () => {
        const { OcctKernel } = await import("../ts/src/index.ts");
        const createModule = (await import(jsPath)).default;
        ownModule = await createModule({
            locateFile: (path: string) => (path.endsWith(".wasm") ? wasmPath : path),
        });
        // The constructor is TS-private only; erased at runtime.
        kernel2 = new (OcctKernel as unknown as new (m: unknown) => OcctKernelType)(ownModule);
    }, 60_000);

    it("decodes without any manual decoder registration", () => {
        let thrown: any;
        try {
            kernel2.getVolume(99999 as unknown as ShapeHandle);
        } catch (e) {
            thrown = e;
        }
        expect(thrown).toBeInstanceOf(OcctError);
        expect(thrown.message).toContain("Invalid shape ID");
        expect(thrown.code).toBe(OcctErrorCode.InvalidShapeId);
    });

    it("accepts a single-argument getBoundingBox — issue #223", () => {
        const box = kernel2.makeBox(10, 20, 30);
        const bbox = kernel2.getBoundingBox(box);
        expect(bbox.xmax).toBeCloseTo(10);
        expect(bbox.ymax).toBeCloseTo(20);
        expect(bbox.zmax).toBeCloseTo(30);
        expect(bbox).toEqual(kernel2.getBoundingBox(box, false));
    });

    it("releases its decoder on dispose", async () => {
        const { wrap } = await import(resolve(__dirname, "../ts/src/types.ts"));
        const raw = new ownModule.OcctKernel();
        let thrown: any;
        try {
            raw.getVolume(99999);
        } catch (e) {
            thrown = e;
        }
        const rethrow = () => wrap("getVolume", () => {
            throw thrown;
        });

        expect(() => rethrow()).toThrow(/Invalid shape ID/);
        kernel2[Symbol.dispose]();
        expect(() => rethrow()).toThrow(/\[object WebAssembly.Exception\]/);
        raw.delete();
    });
});

// ============================================================================
// Type predicate methods
// ============================================================================

describe("Type predicate methods", () => {
    it("getShapeType returns 'solid' for a box", () => {
        const box = kernel.makeBox(10, 10, 10);
        expect(kernel.getShapeType(box)).toBe("solid");
    });

    it("getShapeType returns 'face' for extracted faces", () => {
        const box = kernel.makeBox(10, 10, 10);
        const faces = kernel.getSubShapes(box, "face");
        expect(faces.size()).toBeGreaterThan(0);
        expect(kernel.getShapeType(faces.get(0))).toBe("face");
        faces.delete();
    });

    it("getShapeType returns 'edge' for extracted edges", () => {
        const box = kernel.makeBox(10, 10, 10);
        const edges = kernel.getSubShapes(box, "edge");
        expect(edges.size()).toBeGreaterThan(0);
        expect(kernel.getShapeType(edges.get(0))).toBe("edge");
        edges.delete();
    });

    it("getShapeType returns 'vertex' for extracted vertices", () => {
        const box = kernel.makeBox(10, 10, 10);
        const verts = kernel.getSubShapes(box, "vertex");
        expect(verts.size()).toBeGreaterThan(0);
        expect(kernel.getShapeType(verts.get(0))).toBe("vertex");
        verts.delete();
    });

    it("getShapeType returns 'wire' for extracted wires", () => {
        const box = kernel.makeBox(10, 10, 10);
        const wires = kernel.getSubShapes(box, "wire");
        expect(wires.size()).toBeGreaterThan(0);
        expect(kernel.getShapeType(wires.get(0))).toBe("wire");
        wires.delete();
    });

    it("getShapeType returns 'shell' for extracted shells", () => {
        const box = kernel.makeBox(10, 10, 10);
        const shells = kernel.getSubShapes(box, "shell");
        expect(shells.size()).toBeGreaterThan(0);
        expect(kernel.getShapeType(shells.get(0))).toBe("shell");
        shells.delete();
    });

    it("getShapeType returns 'compound' for makeCompound result", () => {
        const a = kernel.makeBox(10, 10, 10);
        const b = kernel.makeSphere(5);
        const ids = new Module.VectorUint32();
        ids.push_back(a);
        ids.push_back(b);
        const compound = kernel.makeCompound(ids);
        ids.delete();
        expect(kernel.getShapeType(compound)).toBe("compound");
    });
});

// ============================================================================
// Named enums
// ============================================================================

describe("Named enums", () => {
    describe("TransitionMode", () => {
        it("has correct numeric values", () => {
            expect(TransitionMode.Transformed).toBe(0);
            expect(TransitionMode.RightCorner).toBe(1);
            expect(TransitionMode.RoundCorner).toBe(2);
        });

        it("works in sweep API call", () => {
            // Create a spine wire from a circle edge
            const circleEdge = kernel.makeCircleEdge(0, 0, 0, 0, 0, 1, 20);
            const spineEdges = new Module.VectorUint32();
            spineEdges.push_back(circleEdge);
            const spine = kernel.makeWire(spineEdges);
            spineEdges.delete();

            // Create a small square profile wire
            const e1 = kernel.makeLineEdge(18, -2, 0, 22, -2, 0);
            const e2 = kernel.makeLineEdge(22, -2, 0, 22, 2, 0);
            const e3 = kernel.makeLineEdge(22, 2, 0, 18, 2, 0);
            const e4 = kernel.makeLineEdge(18, 2, 0, 18, -2, 0);
            const wireEdges = new Module.VectorUint32();
            wireEdges.push_back(e1);
            wireEdges.push_back(e2);
            wireEdges.push_back(e3);
            wireEdges.push_back(e4);
            const profile = kernel.makeWire(wireEdges);
            wireEdges.delete();

            // Use the named enum value
            const result = kernel.sweep(profile, spine, TransitionMode.Transformed);
            expect(result).toBeGreaterThan(0);
        });
    });

    describe("JoinType", () => {
        it("has correct numeric values", () => {
            expect(JoinType.Arc).toBe(0);
            expect(JoinType.Tangent).toBe(1);
            expect(JoinType.Intersection).toBe(2);
        });

        it("works in offsetWire2D API call", () => {
            // Create a square wire on XY plane
            const e1 = kernel.makeLineEdge(0, 0, 0, 10, 0, 0);
            const e2 = kernel.makeLineEdge(10, 0, 0, 10, 10, 0);
            const e3 = kernel.makeLineEdge(10, 10, 0, 0, 10, 0);
            const e4 = kernel.makeLineEdge(0, 10, 0, 0, 0, 0);
            const edges = new Module.VectorUint32();
            edges.push_back(e1);
            edges.push_back(e2);
            edges.push_back(e3);
            edges.push_back(e4);
            const wire = kernel.makeWire(edges);
            edges.delete();

            const offset = kernel.offsetWire2D(wire, 2.0, JoinType.Arc);
            expect(offset).toBeGreaterThan(0);
        });
    });

    describe("BooleanOp", () => {
        it("has correct numeric values", () => {
            expect(BooleanOp.Fuse).toBe(0);
            expect(BooleanOp.Cut).toBe(1);
            expect(BooleanOp.Common).toBe(2);
        });

        it("works in booleanPipeline API call", () => {
            const box = kernel.makeBox(10, 10, 10);
            const cyl = kernel.makeCylinder(3, 20);

            const ops = new Module.VectorInt();
            ops.push_back(BooleanOp.Cut);
            const tools = new Module.VectorUint32();
            tools.push_back(cyl);

            try {
                const result = kernel.booleanPipeline(box, ops, tools);
                expect(result).toBeGreaterThan(0);

                // Volume should be less than box (cylinder subtracted)
                const vol = kernel.getVolume(result);
                expect(vol).toBeLessThan(10 * 10 * 10);
                expect(vol).toBeGreaterThan(0);
            } finally {
                ops.delete();
                tools.delete();
            }
        });
    });

    it("numeric values are backwards-compatible", () => {
        // Users who pass raw numbers should still work
        const box = kernel.makeBox(10, 10, 10);
        const cyl = kernel.makeCylinder(3, 20);

        const ops = new Module.VectorInt();
        ops.push_back(1); // BooleanOp.Cut as raw number
        const tools = new Module.VectorUint32();
        tools.push_back(cyl);

        try {
            const result = kernel.booleanPipeline(box, ops, tools);
            expect(result).toBeGreaterThan(0);
        } finally {
            ops.delete();
            tools.delete();
        }
    });
});

// ============================================================================
// InitOptions.wasm — ArrayBuffer / Uint8Array support
// ============================================================================
// Note: OcctKernel.init() can't be called directly in vitest because it
// does `import("./occt-wasm.js")` relative to ts/src/. These tests verify
// the WASM loading paths via the raw Emscripten createModule API, which is
// what init() delegates to.

describe("WASM binary loading (Emscripten wasmBinary option)", () => {
    it("loads from locateFile callback (string path)", async () => {
        const createModule = (await import(jsPath)).default;
        const mod = await createModule({
            locateFile: (path: string) =>
                path.endsWith(".wasm") ? wasmPath : path,
        });
        const k = new mod.OcctKernel();
        const box = k.makeBox(5, 5, 5);
        expect(k.getVolume(box)).toBeCloseTo(125, 0);
        k.releaseAll();
        k.delete();
    });

    it("loads from wasmBinary (ArrayBuffer)", async () => {
        const binary = readFileSync(wasmPath);
        const arrayBuffer = binary.buffer.slice(
            binary.byteOffset,
            binary.byteOffset + binary.byteLength,
        );

        const createModule = (await import(jsPath)).default;
        const mod = await createModule({ wasmBinary: arrayBuffer });
        const k = new mod.OcctKernel();
        const box = k.makeBox(3, 4, 5);
        expect(k.getVolume(box)).toBeCloseTo(60, 0);
        k.releaseAll();
        k.delete();
    });

    it("loads from wasmBinary (Uint8Array sliced correctly)", async () => {
        // Create a Uint8Array with non-zero byteOffset to test the slice fix
        const binary = readFileSync(wasmPath);
        const padded = new ArrayBuffer(binary.byteLength + 16);
        const paddedView = new Uint8Array(padded);
        paddedView.set(binary, 16);
        const slice = new Uint8Array(padded, 16, binary.byteLength);

        // Verify it has a non-zero byteOffset
        expect(slice.byteOffset).toBe(16);

        // Slice correctly (matching our init() implementation)
        const correctSlice = slice.buffer.slice(
            slice.byteOffset,
            slice.byteOffset + slice.byteLength,
        );

        const createModule = (await import(jsPath)).default;
        const mod = await createModule({ wasmBinary: correctSlice });
        const k = new mod.OcctKernel();
        const box = k.makeBox(1, 1, 1);
        expect(k.getVolume(box)).toBeCloseTo(1, 0);
        k.releaseAll();
        k.delete();
    });
});

// ============================================================================
// OcctErrorCode enum values
// ============================================================================

describe("OcctErrorCode enum values", () => {
    it("has all expected string values", () => {
        expect(OcctErrorCode.ConstructionFailed).toBe("CONSTRUCTION_FAILED");
        expect(OcctErrorCode.BooleanFailed).toBe("BOOLEAN_FAILED");
        expect(OcctErrorCode.InvalidShapeId).toBe("INVALID_SHAPE_ID");
        expect(OcctErrorCode.InvalidLabelId).toBe("INVALID_LABEL_ID");
        expect(OcctErrorCode.TessellationFailed).toBe("TESSELLATION_FAILED");
        expect(OcctErrorCode.ImportExportFailed).toBe("IMPORT_EXPORT_FAILED");
        expect(OcctErrorCode.HealingFailed).toBe("HEALING_FAILED");
        expect(OcctErrorCode.DocumentClosed).toBe("DOCUMENT_CLOSED");
        expect(OcctErrorCode.KernelError).toBe("KERNEL_ERROR");
        expect(OcctErrorCode.Unknown).toBe("UNKNOWN");
    });
});

// ============================================================================
// filletVariable
// ============================================================================

describe("filletVariable", () => {
    it("rounds an edge with start/end radii", () => {
        const box = kernel.makeBox(20, 20, 20);
        const edges = kernel.getSubShapes(box, "edge");
        const result = kernel.filletVariable(box, edges.get(0), 1.0, 3.0);
        expect(result).toBeGreaterThan(0);
        expect(kernel.isValid(result)).toBe(true);
        expect(kernel.getVolume(result)).toBeLessThan(kernel.getVolume(box));
        edges.delete();
    });

    // A variable-radius fillet needs ~75 KB of stack; on Emscripten's 64 KB
    // default it overran into static data and every later BREP/STEP write in
    // the session faulted, on shapes created before the call included (#306).
    it("leaves BREP and STEP serialization working afterwards", () => {
        const box = kernel.makeBox(20, 20, 30);
        const edges = kernel.getSubShapes(box, "edge");
        expect(kernel.toBREP(box).length).toBeGreaterThan(0);

        const result = kernel.filletVariable(box, edges.get(0), 1.0, 3.0);
        edges.delete();

        const roundTrip = (id: number) => kernel.getVolume(kernel.fromBREP(kernel.toBREP(id)));
        expect(roundTrip(box)).toBeCloseTo(20 * 20 * 30, 6);
        expect(roundTrip(result)).toBeCloseTo(kernel.getVolume(result), 6);
        expect(roundTrip(kernel.makeBox(5, 5, 5))).toBeCloseTo(125, 6);
        expect(kernel.exportStep(box)).toContain("ISO-10303-21");
    });
});
