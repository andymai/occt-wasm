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
 *
 * Prefer `kernel.createXCAFDocument()` over the static factories. Constructing
 * from a bare raw kernel works, but only a live {@link OcctKernel} registers the
 * module's exception decoder — without one, a failure here reports the
 * undecoded `[object WebAssembly.Exception]` and downgrades to `KERNEL_ERROR`.
 */

import type {
    ShapeHandle,
    Color3,
    LabelTag,
    LabelInfo,
    LabelOptions,
    AddShapeOptions,
    AddChildOptions,
    GLTFExportOptions,
} from "./types.js";
import { OcctError, OcctErrorCode, wrap } from "./types.js";

/** Raw XCAF methods on the Embind kernel (internal). */
export interface RawXCAFKernel {
    xcafNewDocument(): number;
    xcafClose(docId: number): void;
    xcafAddShape(docId: number, shapeId: number): number;
    xcafAddAssembly(docId: number, shapeId: number): number;
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
    xcafGetReferredLabel(docId: number, tag: number): number;
    xcafGetLabelLocation(
        docId: number,
        tag: number,
    ): { size(): number; get(i: number): number; delete(): void };
    xcafGetSubShapeLabels(
        docId: number,
        tag: number,
    ): { size(): number; get(i: number): number; delete(): void };
    xcafAddSubShape(docId: number, tag: number, shapeId: number): number;
    xcafExportSTEP(docId: number): string;
    xcafImportSTEP(stepData: string): number;
    xcafExportGLTF(docId: number, linDefl: number, angDefl: number): string;
}

/** Emscripten FS interface needed for binary glTF export. */
export interface EmscriptenFS {
    readFile(path: string): Uint8Array;
    writeFile(path: string, data: Uint8Array): void;
    unlink(path: string): void;
}

function tag(n: number): LabelTag {
    return n as LabelTag;
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

    /**
     * Add a shape as a root label.
     *
     * By default the shape becomes a single part, even when it is a compound.
     * With `{ assembly: true }` a compound becomes an assembly instead: one
     * component per top-level child, each a placed reference to a prototype
     * label holding that child's geometry. This is the structure STEP import
     * produces, and the only one `exportSTEP` writes as an assembly. Throws if
     * `assembly` is set and the shape is not a compound.
     */
    addShape(shape: ShapeHandle, options?: AddShapeOptions): LabelTag {
        this.#ensureOpen();
        const t = options?.assembly
            ? wrap("xcafAddAssembly", () => this.#raw.xcafAddAssembly(this.#docId, shape))
            : wrap("xcafAddShape", () => this.#raw.xcafAddShape(this.#docId, shape));
        this.#applyOptions(t, options);
        return tag(t);
    }

    /**
     * Add a shape as a child component of a parent label.
     *
     * `parent` may be an assembly or a part. A part becomes an assembly on
     * its first child: the geometry it held moves into a first component at
     * identity, carrying the part's name and color, so `getChildren(parent)`
     * then lists that component ahead of the new one and exports keep both.
     * A component label cannot take children; resolve it with
     * {@link getReferredLabel} first.
     */
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

    /**
     * Resolve a component label to the label it instantiates.
     *
     * In an XCAF assembly a component (`isComponent`) is a placed reference:
     * it carries a location and points at a prototype label, the part or
     * sub-assembly that owns the geometry, the sub-shapes and the children.
     * `getChildren` on the component itself is therefore empty; walk into the
     * referred label instead. Returns `null` when `label` is not a reference.
     */
    getReferredLabel(label: LabelTag): LabelTag | null {
        this.#ensureOpen();
        const t = wrap("xcafGetReferredLabel", () =>
            this.#raw.xcafGetReferredLabel(this.#docId, label),
        );
        return t > 0 ? tag(t) : null;
    }

    /**
     * The placement of a label relative to its parent, as a 3x4 row-major
     * affine matrix (`[r00,r01,r02,tx, r10,r11,r12,ty, r20,r21,r22,tz]`), the
     * layout `OcctKernel.transform` and `located` accept. Identity for labels
     * that are not components. Compose these down the tree to place a
     * prototype's geometry once per instance.
     */
    getLocation(label: LabelTag): number[] {
        this.#ensureOpen();
        return this.#vecToNumbers(
            wrap("xcafGetLabelLocation", () => this.#raw.xcafGetLabelLocation(this.#docId, label)),
        );
    }

    /**
     * Get the named sub-shape labels of a part (faces, edges or solids that
     * carry their own name or color). Pass the prototype label, not a
     * component: see {@link getReferredLabel}.
     */
    getSubShapes(label: LabelTag): LabelTag[] {
        this.#ensureOpen();
        return this.#vecToTags(
            wrap("xcafGetSubShapeLabels", () => this.#raw.xcafGetSubShapeLabels(this.#docId, label)),
        );
    }

    /**
     * Register a sub-shape of a part so it can carry its own name or color.
     * `label` must be a top-level part (one added with `addShape`, or the
     * prototype behind a component) and `shape` one of its sub-shapes, for
     * example a face from `kernel.getSubShapes`. Throws otherwise.
     */
    addSubShape(label: LabelTag, shape: ShapeHandle, options?: LabelOptions): LabelTag {
        this.#ensureOpen();
        const t = wrap("xcafAddSubShape", () => this.#raw.xcafAddSubShape(this.#docId, label, shape));
        this.#applyOptions(t, options);
        return tag(t);
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
        if (fsOrOptions && typeof fsOrOptions === "object" && "readFile" in fsOrOptions && "unlink" in fsOrOptions) {
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
        if (this.#closed) return;
        // Mark closed before the call so a failing close isn't retried by
        // Symbol.dispose, which would throw again during stack unwinding.
        this.#closed = true;
        wrap("xcafClose", () => this.#raw.xcafClose(this.#docId));
    }

    [Symbol.dispose](): void {
        this.close();
    }

    #applyOptions(labelId: number, options?: LabelOptions): void {
        if (options?.name) {
            wrap("xcafSetName", () => this.#raw.xcafSetName(this.#docId, labelId, options.name!));
        }
        if (options?.color) {
            const [r, g, b] = options.color;
            wrap("xcafSetColor", () => this.#raw.xcafSetColor(this.#docId, labelId, r, g, b));
        }
    }

    #vecToTags(vec: { size(): number; get(i: number): number; delete(): void }): LabelTag[] {
        return this.#vecToNumbers(vec).map(tag);
    }

    #vecToNumbers(vec: { size(): number; get(i: number): number; delete(): void }): number[] {
        try {
            const result: number[] = [];
            for (let i = 0; i < vec.size(); i++) {
                result.push(vec.get(i));
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
