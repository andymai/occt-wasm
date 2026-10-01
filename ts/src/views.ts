/**
 * View geometry shared by every renderer: projection, panel layout, and the
 * drawing primitives a backend has to put on the page.
 *
 * `svg.ts` and `png.ts` both consume this. Keeping it separate is what makes
 * the two outputs agree by construction rather than by two copies of the same
 * arithmetic: a panel is laid out once, and each backend only decides how to
 * put a polyline, a label and a background on its own canvas.
 *
 * @module
 */

import type { BoundingBox, ProjectionData, ShapeHandle, Vec3 } from "./types.js";

/** The subset of the kernel API the renderers depend on. */
export interface ViewKernel {
    getBoundingBox(shape: ShapeHandle, options?: { precise?: boolean; useTriangulation?: boolean }): BoundingBox;
    projectEdges(
        shape: ShapeHandle,
        viewOrigin: Vec3,
        viewDirection: Vec3,
        xAxis?: Vec3,
    ): ProjectionData;
    wireframe(shape: ShapeHandle, deflection?: number): {
        points: Float32Array;
        edgeGroups: Int32Array;
    };
    release(shape: ShapeHandle): void;
}

/** A named orthographic or isometric viewpoint. */
export type ViewName = "front" | "back" | "top" | "bottom" | "left" | "right" | "iso";

/** Options shared by single-view and multiview rendering. */
export interface ViewOptions {
    /** Panel width in px (default 240). */
    width?: number;
    /** Panel height in px (default 240). */
    height?: number;
    /** Inner padding in px (default 14). */
    padding?: number;
    /**
     * Wireframe sampling deflection in model units. Defaults to ~0.2% of the
     * bounding-box diagonal so output is scale-independent.
     */
    deflection?: number;
    /** Draw hidden (occluded) edges dashed (default true). */
    showHidden?: boolean;
    /** Draw a small XYZ axis gnomon in each panel (default true). */
    showGnomon?: boolean;
    /** Stroke width for visible edges in px (default 1). */
    strokeWidth?: number;
    /** Panel background fill (default "#ffffff"). */
    background?: string;
    /** Visible-edge stroke color (default "#111111"). */
    visibleColor?: string;
    /** Hidden-edge stroke color (default "#9aa0a6"). */
    hiddenColor?: string;
}

/** Options for the multiview grid. */
export interface MultiviewOptions extends ViewOptions {
    /** Views to render, in order (default front, top, right, iso). */
    views?: ViewName[];
    /** Panels per row (default 2). */
    columns?: number;
    /** Draw the per-view name label (default true). */
    showLabels?: boolean;
    /** Annotate overall X×Y×Z size in a footer (default true). */
    showDimensions?: boolean;
}

export interface ViewBasis {
    /** Projection direction (camera looks along this). */
    dir: Vec3;
    /** Screen-horizontal axis (points right). */
    sx: Vec3;
    /** Screen-vertical axis (points up). */
    sy: Vec3;
}

const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

function basis(dir: Vec3, sx: Vec3): ViewBasis {
    return { dir, sx, sy: cross(neg(dir), sx) };
}

export function basisFor(view: ViewName): ViewBasis {
    switch (view) {
        case "front":
            return basis(v(0, 1, 0), v(1, 0, 0));
        case "back":
            return basis(v(0, -1, 0), v(-1, 0, 0));
        case "top":
            return basis(v(0, 0, -1), v(1, 0, 0));
        case "bottom":
            return basis(v(0, 0, 1), v(1, 0, 0));
        case "right":
            return basis(v(-1, 0, 0), v(0, 1, 0));
        case "left":
            return basis(v(1, 0, 0), v(0, -1, 0));
        case "iso":
            // Camera in the +X+Y+Z octant looking at the origin with +Z up, so
            // +X runs to the lower left and +Y to the lower right.
            return basis(normalize(v(-1, -1, -1)), normalize(v(-1, 1, 0)));
    }
}

export const VIEW_LABEL: Record<ViewName, string> = {
    front: "Front",
    back: "Back",
    top: "Top",
    bottom: "Bottom",
    left: "Left",
    right: "Right",
    iso: "Iso",
};

// --- vector helpers ---------------------------------------------------------

function v(x: number, y: number, z: number): Vec3 {
    return { x, y, z };
}
function dot(a: Vec3, b: Vec3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(a: Vec3, b: Vec3): Vec3 {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    };
}
function neg(a: Vec3): Vec3 {
    return { x: -a.x, y: -a.y, z: -a.z };
}
function normalize(a: Vec3): Vec3 {
    const len = Math.hypot(a.x, a.y, a.z) || 1;
    return { x: a.x / len, y: a.y / len, z: a.z / len };
}

// --- projection / discretization -------------------------------------------

/** A 2D polyline in view (u right, v up) coordinates. */
export type Polyline = number[]; // [u0, v0, u1, v1, ...]

export interface ViewEdges {
    visible: Polyline[];
    hidden: Polyline[];
}

const PROJECTION_FIELDS: Array<keyof ProjectionData> = [
    "visibleOutline",
    "visibleSmooth",
    "visibleSharp",
    "hiddenOutline",
    "hiddenSmooth",
    "hiddenSharp",
];

export function collectEdges(
    kernel: ViewKernel,
    shape: ShapeHandle,
    viewBasis: ViewBasis,
    deflection: number,
): ViewEdges {
    // projectEdges returns the HLR result in the view plane: x along the xAxis
    // we pass, y along gp_Ax2's own vertical, z always 0. The in-plane
    // coordinates are the screen coordinates as they stand.
    const proj = kernel.projectEdges(shape, ORIGIN, neg(viewBasis.dir), viewBasis.sx);
    try {
        const toLines = (h: ShapeHandle): Polyline[] => {
            if (Number(h) === 0) return [];
            const { points, edgeGroups } = kernel.wireframe(h, deflection);
            const lines: Polyline[] = [];
            for (let g = 0; g < edgeGroups.length; g += 3) {
                const start = edgeGroups[g]!;
                const count = edgeGroups[g + 1]!;
                const line: Polyline = [];
                for (let i = 0; i < count; i += 3) {
                    line.push(points[start + i]!, points[start + i + 1]!);
                }
                if (line.length >= 4) lines.push(line);
            }
            return lines;
        };
        return {
            visible: [
                ...toLines(proj.visibleOutline),
                ...toLines(proj.visibleSmooth),
                ...toLines(proj.visibleSharp),
            ],
            hidden: [
                ...toLines(proj.hiddenOutline),
                ...toLines(proj.hiddenSmooth),
                ...toLines(proj.hiddenSharp),
            ],
        };
    } finally {
        for (const field of PROJECTION_FIELDS) {
            const h = proj[field] as ShapeHandle;
            if (Number(h) !== 0) kernel.release(h);
        }
    }
}

// --- layout -----------------------------------------------------------------

/** 2D extent of a set of polylines in view coords. */
export interface Extent {
    minU: number;
    maxU: number;
    minV: number;
    maxV: number;
}

export function extentOf(views: ViewEdges[]): Extent {
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const view of views) {
        for (const line of [...view.visible, ...view.hidden]) {
            for (let i = 0; i < line.length; i += 2) {
                const u = line[i]!;
                const vv = line[i + 1]!;
                if (u < minU) minU = u;
                if (u > maxU) maxU = u;
                if (vv < minV) minV = vv;
                if (vv > maxV) maxV = vv;
            }
        }
    }
    if (!Number.isFinite(minU)) return { minU: 0, maxU: 0, minV: 0, maxV: 0 };
    return { minU, maxU, minV, maxV };
}

export interface PanelTransform {
    scale: number;
    offsetX: number;
    offsetY: number;
    inner: number;
    panelW: number;
    panelH: number;
    pad: number;
}

/**
 * Build a view→pixel mapping for one panel. All panels share `scale` (so the
 * part is the same size everywhere) but center on their own projected midpoint.
 */
export function panelTransform(
    ext: Extent,
    scale: number,
    panelW: number,
    panelH: number,
    pad: number,
): PanelTransform {
    const midU = (ext.minU + ext.maxU) / 2;
    const midV = (ext.minV + ext.maxV) / 2;
    // Screen y is inverted (v-up → y-down); center within the panel.
    const offsetX = panelW / 2 - midU * scale;
    const offsetY = panelH / 2 + midV * scale;
    return { scale, offsetX, offsetY, inner: Math.min(panelW, panelH) - 2 * pad, panelW, panelH, pad };
}

/** Map a polyline from view coords into panel pixels: [x0, y0, x1, y1, ...]. */
export function toPixels(line: Polyline, t: PanelTransform): number[] {
    const out: number[] = [];
    for (let i = 0; i < line.length; i += 2) {
        out.push(line[i]! * t.scale + t.offsetX, -line[i + 1]! * t.scale + t.offsetY);
    }
    return out;
}

export function resolved(options: ViewOptions) {
    return {
        width: options.width ?? 240,
        height: options.height ?? 240,
        padding: options.padding ?? 14,
        showHidden: options.showHidden ?? true,
        showGnomon: options.showGnomon ?? true,
        strokeWidth: options.strokeWidth ?? 1,
        background: options.background ?? "#ffffff",
        visibleColor: options.visibleColor ?? "#111111",
        hiddenColor: options.hiddenColor ?? "#9aa0a6",
    };
}

export function deflectionFor(
    kernel: ViewKernel,
    shape: ShapeHandle,
    options: ViewOptions,
): number {
    if (options.deflection !== undefined) return options.deflection;
    const bb = kernel.getBoundingBox(shape);
    const diag = Math.hypot(bb.xmax - bb.xmin, bb.ymax - bb.ymin, bb.zmax - bb.zmin);
    return Math.max(diag * 0.002, 1e-4);
}

/** One arm of the XYZ gnomon, already in panel pixels. */
export interface GnomonArm {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    color: string;
    label: string;
}

/** The gnomon arms for a view, or an empty list when every axis points into
 *  the screen. Axes within 0.05 of the view direction are dropped. */
export function gnomonArms(viewBasis: ViewBasis, t: PanelTransform): GnomonArm[] {
    const len = 18;
    const ox = t.pad + len + 4;
    const oy = t.panelH - t.pad - len - 4;
    const axes: Array<[Vec3, string, string]> = [
        [v(1, 0, 0), "#d33", "X"],
        [v(0, 1, 0), "#3a3", "Y"],
        [v(0, 0, 1), "#36c", "Z"],
    ];
    const arms: GnomonArm[] = [];
    for (const [axis, color, label] of axes) {
        const dx = dot(axis, viewBasis.sx);
        const dy = -dot(axis, viewBasis.sy);
        if (Math.hypot(dx, dy) < 0.05) continue; // axis points into the screen
        arms.push({ x0: ox, y0: oy, x1: ox + dx * len, y1: oy + dy * len, color, label });
    }
    return arms;
}

/** Panel origins and the shared scale for a grid of views. */
export interface GridLayout {
    columns: number;
    rows: number;
    totalW: number;
    totalH: number;
    footerH: number;
    scale: number;
    /** Per-view: panel origin in the grid and its own centering transform. */
    panels: Array<{ px: number; py: number; t: PanelTransform }>;
}

export function gridLayout(
    extents: Extent[],
    o: ReturnType<typeof resolved>,
    columns: number,
    showDimensions: boolean,
): GridLayout {
    // One global scale so the part is sized consistently across all panels.
    const inner = Math.min(o.width, o.height) - 2 * o.padding;
    let maxRange = 1e-9;
    for (const ext of extents) {
        maxRange = Math.max(maxRange, ext.maxU - ext.minU, ext.maxV - ext.minV);
    }
    const scale = inner / maxRange;
    const rows = Math.ceil(extents.length / columns);
    const footerH = showDimensions ? 22 : 0;
    const panels = extents.map((ext, i) => ({
        px: (i % columns) * o.width,
        py: Math.floor(i / columns) * o.height,
        t: panelTransform(ext, scale, o.width, o.height, o.padding),
    }));
    return {
        columns,
        rows,
        totalW: columns * o.width,
        totalH: rows * o.height + footerH,
        footerH,
        scale,
        panels,
    };
}

/** The single-panel equivalent of gridLayout. */
export function singleLayout(ext: Extent, o: ReturnType<typeof resolved>): PanelTransform {
    const inner = Math.min(o.width, o.height) - 2 * o.padding;
    const range = Math.max(ext.maxU - ext.minU, ext.maxV - ext.minV, 1e-9);
    return panelTransform(ext, inner / range, o.width, o.height, o.padding);
}

/** The "100 × 60 × 40 (X×Y×Z)" footer text. */
export function dimensionsText(
    kernel: ViewKernel,
    shape: ShapeHandle,
    round: (n: number) => number,
): string {
    const bb = kernel.getBoundingBox(shape);
    return `${round(bb.xmax - bb.xmin)} × ${round(bb.ymax - bb.ymin)} × ${round(bb.zmax - bb.zmin)} (X×Y×Z)`;
}
