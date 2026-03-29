/**
 * Fluent XCAF document builder for assemblies with colors and names.
 *
 * @example
 * ```ts
 * const doc = XCAFDocument.create(rawKernel);
 * const root = doc.addShape(box, { name: 'housing', color: [0.8, 0.2, 0.1] });
 * doc.addChild(root, gear, {
 *   name: 'gear-1',
 *   location: { tx: 10, ty: 0, tz: 5 },
 *   color: [0.5, 0.5, 0.5],
 * });
 * const step = doc.exportSTEP();
 * const glb = doc.exportGLTF(Module);
 * doc.close();
 * ```
 */

import type {
    ShapeHandle,
    Color3,
    LabelTag,
    LabelInfo,
    AddShapeOptions,
    AddChildOptions,
    GLTFExportOptions,
} from "./types.js";
import { OcctError, OcctErrorCode } from "./types.js";

/** Raw XCAF methods on the Embind kernel (internal). */
export interface RawXCAFKernel {
    xcafNewDocument(): number;
    xcafClose(docId: number): void;
    xcafAddShape(docId: number, shapeId: number): number;
    xcafAddComponent(
        docId: number,
        parentTag: number,
        shapeId: number,
        tx: number,
        ty: number,
        tz: number,
        rx: number,
        ry: number,
        rz: number,
    ): number;
    xcafSetColor(docId: number, tag: number, r: number, g: number, b: number): void;
    xcafSetName(docId: number, tag: number, name: string): void;
    xcafGetLabelInfo(
        docId: number,
        tag: number,
    ): {
        labelId: number;
        name: string;
        hasColor: boolean;
        r: number;
        g: number;
        b: number;
        isAssembly: boolean;
        isComponent: boolean;
        shapeId: number;
    };
    xcafGetChildLabels(
        docId: number,
        parentTag: number,
    ): { size(): number; get(i: number): number; delete(): void };
    xcafGetRootLabels(docId: number): { size(): number; get(i: number): number; delete(): void };
    xcafExportSTEP(docId: number): string;
    xcafImportSTEP(stepData: string): number;
    xcafExportGLTF(docId: number, linDefl: number, angDefl: number): string;
}

/** Emscripten FS interface needed for binary glTF export. */
export interface EmscriptenFS {
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
}

function tag(n: number): LabelTag {
    return n as LabelTag;
}

function wrap<T>(op: string, fn: () => T): T {
    try {
        return fn();
    } catch (e: unknown) {
        throw e instanceof Error ? new OcctError(op, e.message) : new OcctError(op, String(e));
    }
}

export class XCAFDocument {
    readonly #raw: RawXCAFKernel;
    readonly #docId: number;
    readonly #fs: EmscriptenFS | undefined;
    #closed = false;

    private constructor(raw: RawXCAFKernel, docId: number, fs?: EmscriptenFS) {
        this.#raw = raw;
        this.#docId = docId;
        this.#fs = fs;
    }

    /** Create a new empty XCAF document. */
    static create(raw: RawXCAFKernel, fs?: EmscriptenFS): XCAFDocument {
        const docId = wrap("xcafNewDocument", () => raw.xcafNewDocument());
        return new XCAFDocument(raw, docId, fs);
    }

    /** Import a STEP file into a new XCAF document (preserves colors/names/assemblies). */
    static fromSTEP(raw: RawXCAFKernel, stepData: string, fs?: EmscriptenFS): XCAFDocument {
        const docId = wrap("xcafImportSTEP", () => raw.xcafImportSTEP(stepData));
        return new XCAFDocument(raw, docId, fs);
    }

    /** Add a shape as a root label. */
    addShape(shape: ShapeHandle, options?: AddShapeOptions): LabelTag {
        this.#ensureOpen();
        const t = wrap("xcafAddShape", () => this.#raw.xcafAddShape(this.#docId, shape));
        this.#applyOptions(t, options);
        return tag(t);
    }

    /** Add a shape as a child component of a parent label. */
    addChild(parent: LabelTag, shape: ShapeHandle, options?: AddChildOptions): LabelTag {
        this.#ensureOpen();
        const loc = options?.location ?? {};
        const t = wrap("xcafAddComponent", () =>
            this.#raw.xcafAddComponent(
                this.#docId,
                parent,
                shape,
                loc.tx ?? 0,
                loc.ty ?? 0,
                loc.tz ?? 0,
                loc.rx ?? 0,
                loc.ry ?? 0,
                loc.rz ?? 0,
            ),
        );
        this.#applyOptions(t, options);
        return tag(t);
    }

    /** Set color on an existing label. */
    setColor(label: LabelTag, color: Color3): void {
        this.#ensureOpen();
        const [r, g, b] = color;
        wrap("xcafSetColor", () => this.#raw.xcafSetColor(this.#docId, label, r, g, b));
    }

    /** Set name on an existing label. */
    setName(label: LabelTag, name: string): void {
        this.#ensureOpen();
        wrap("xcafSetName", () => this.#raw.xcafSetName(this.#docId, label, name));
    }

    /**
     * Get info about a label.
     * If `shapeHandle` is non-null, the caller owns it and must release it.
     */
    getLabelInfo(label: LabelTag): LabelInfo {
        this.#ensureOpen();
        const raw = wrap("xcafGetLabelInfo", () =>
            this.#raw.xcafGetLabelInfo(this.#docId, label),
        );
        return {
            labelId: raw.labelId,
            name: raw.name,
            hasColor: raw.hasColor,
            color: [raw.r, raw.g, raw.b],
            isAssembly: raw.isAssembly,
            isComponent: raw.isComponent,
            shapeHandle: raw.shapeId > 0 ? (raw.shapeId as ShapeHandle) : null,
        };
    }

    /** Get child label tags of a parent. */
    getChildren(parent: LabelTag): LabelTag[] {
        this.#ensureOpen();
        return this.#vecToTags(
            wrap("xcafGetChildLabels", () => this.#raw.xcafGetChildLabels(this.#docId, parent)),
        );
    }

    /** Get root (free) shape label tags. */
    getRoots(): LabelTag[] {
        this.#ensureOpen();
        return this.#vecToTags(
            wrap("xcafGetRootLabels", () => this.#raw.xcafGetRootLabels(this.#docId)),
        );
    }

    /** Export as STEP with colors and names preserved. */
    exportSTEP(): string {
        this.#ensureOpen();
        return wrap("xcafExportSTEP", () => this.#raw.xcafExportSTEP(this.#docId));
    }

    /**
     * Export as glTF binary (.glb). Returns raw bytes as Uint8Array.
     *
     * When the document was created via `OcctKernel.createXCAFDocument()`,
     * the Emscripten FS is injected automatically. Otherwise, pass it
     * explicitly or via the options object.
     */
    exportGLTF(options?: GLTFExportOptions & { fs?: EmscriptenFS }): Uint8Array;
    /** @deprecated Pass `fs` via options instead: `exportGLTF({ fs })` */
    exportGLTF(fs: EmscriptenFS, options?: GLTFExportOptions): Uint8Array;
    exportGLTF(
        fsOrOptions?: EmscriptenFS | (GLTFExportOptions & { fs?: EmscriptenFS }),
        maybeOptions?: GLTFExportOptions,
    ): Uint8Array {
        this.#ensureOpen();

        // Resolve overloads: exportGLTF(fs, opts) vs exportGLTF(opts)
        let fs: EmscriptenFS | undefined;
        let options: GLTFExportOptions | undefined;
        if (fsOrOptions && typeof fsOrOptions === "object" && "readFile" in fsOrOptions) {
            // Legacy: exportGLTF(fs, options?)
            fs = fsOrOptions as EmscriptenFS;
            options = maybeOptions;
        } else {
            // New: exportGLTF(options?)
            const opts = fsOrOptions as (GLTFExportOptions & { fs?: EmscriptenFS }) | undefined;
            fs = opts?.fs;
            options = opts;
        }

        fs ??= this.#fs;
        if (!fs) {
            throw new OcctError(
                "xcafExportGLTF",
                "No Emscripten FS available. Either create the document via OcctKernel.createXCAFDocument(), or pass { fs } in options.",
            );
        }

        const linDefl = options?.linearDeflection ?? 0.1;
        const angDefl = options?.angularDeflection ?? 0.5;
        const glbPath = wrap("xcafExportGLTF", () =>
            this.#raw.xcafExportGLTF(this.#docId, linDefl, angDefl),
        );
        const data = fs.readFile(glbPath);
        fs.unlink(glbPath);
        return data;
    }

    /** Close the document and free OCCT resources. */
    close(): void {
        if (!this.#closed) {
            this.#raw.xcafClose(this.#docId);
            this.#closed = true;
        }
    }

    [Symbol.dispose](): void {
        this.close();
    }

    #applyOptions(labelId: number, options?: AddShapeOptions): void {
        if (options?.name) {
            wrap("xcafSetName", () => this.#raw.xcafSetName(this.#docId, labelId, options.name!));
        }
        if (options?.color) {
            const [r, g, b] = options.color;
            wrap("xcafSetColor", () => this.#raw.xcafSetColor(this.#docId, labelId, r, g, b));
        }
    }

    #vecToTags(vec: { size(): number; get(i: number): number; delete(): void }): LabelTag[] {
        try {
            const result: LabelTag[] = [];
            for (let i = 0; i < vec.size(); i++) {
                result.push(tag(vec.get(i)));
            }
            return result;
        } finally {
            vec.delete();
        }
    }

    #ensureOpen(): void {
        if (this.#closed) {
            throw new OcctError("XCAFDocument", "Document is closed", OcctErrorCode.DocumentClosed);
        }
    }
}
