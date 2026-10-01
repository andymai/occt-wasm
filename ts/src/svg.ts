/**
 * Multiview SVG rendering for OCCT shapes.
 *
 * Renders a shape to compact, deterministic SVG by running OCCT hidden-line
 * removal (`projectEdges`) per view, discretizing the projected edges
 * (`wireframe`), and mapping the flattened 3D points into 2D screen space.
 *
 * The default output is a 4-up Front / Top / Right / Isometric grid with
 * visible edges drawn solid and hidden edges dashed, a per-view XYZ gnomon,
 * and an overall bounding-box annotation — a layout aimed at letting an
 * automated agent reason about geometry it cannot otherwise see.
 *
 * The projection and layout live in `views.ts`, shared with the PNG renderer
 * so the two outputs cannot drift apart.
 *
 * @module
 */

import type { ShapeHandle } from "./types.js";
import {
    basisFor,
    collectEdges,
    deflectionFor,
    dimensionsText,
    extentOf,
    gnomonArms,
    gridLayout,
    resolved,
    singleLayout,
    toPixels,
    VIEW_LABEL,
} from "./views.js";
import type {
    MultiviewOptions,
    PanelTransform,
    Polyline,
    ViewBasis,
    ViewEdges,
    ViewKernel,
    ViewName,
    ViewOptions,
} from "./views.js";

/** The subset of the kernel API the SVG renderer depends on. */
export type SvgKernel = ViewKernel;
export type { ViewName };
/** Options shared by single-view and multiview rendering. */
export type SvgViewOptions = ViewOptions;
/** Options for the multiview grid. */
export type MultiviewSvgOptions = MultiviewOptions;

// --- SVG assembly -----------------------------------------------------------

function round(n: number): number {
    return Math.round(n * 100) / 100;
}

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function pathData(lines: Polyline[], t: PanelTransform): string {
    let d = "";
    for (const line of lines) {
        const px = toPixels(line, t);
        for (let i = 0; i < px.length; i += 2) {
            d += `${i === 0 ? "M" : "L"}${round(px[i]!)} ${round(px[i + 1]!)}`;
        }
    }
    return d;
}

function gnomon(basis: ViewBasis, t: PanelTransform): string {
    let s = "";
    for (const arm of gnomonArms(basis, t)) {
        const ex = round(arm.x1);
        const ey = round(arm.y1);
        s += `<line x1="${round(arm.x0)}" y1="${round(arm.y0)}" x2="${ex}" y2="${ey}" stroke="${arm.color}" stroke-width="1.5"/>`;
        s += `<text x="${ex}" y="${ey}" font-size="9" fill="${arm.color}" text-anchor="middle" dominant-baseline="middle">${arm.label}</text>`;
    }
    return s;
}

function panelSvg(
    edges: ViewEdges,
    basis: ViewBasis,
    t: PanelTransform,
    o: ReturnType<typeof resolved>,
    label: string | null,
): string {
    let body = `<rect x="0.5" y="0.5" width="${t.panelW - 1}" height="${t.panelH - 1}" fill="${o.background}" stroke="#e0e0e0"/>`;
    if (o.showHidden && edges.hidden.length > 0) {
        const d = pathData(edges.hidden, t);
        if (d)
            body += `<path d="${d}" fill="none" stroke="${o.hiddenColor}" stroke-width="${o.strokeWidth}" stroke-dasharray="3 2"/>`;
    }
    if (edges.visible.length > 0) {
        const d = pathData(edges.visible, t);
        if (d)
            body += `<path d="${d}" fill="none" stroke="${o.visibleColor}" stroke-width="${o.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    if (o.showGnomon) body += gnomon(basis, t);
    if (label !== null)
        body += `<text x="${t.pad}" y="${t.pad + 4}" font-size="11" fill="#333" font-family="sans-serif">${esc(label)}</text>`;
    return body;
}

/**
 * Render a single named view of `shape` to a standalone SVG string.
 */
export function renderShapeSVG(
    kernel: SvgKernel,
    shape: ShapeHandle,
    view: ViewName = "front",
    options: SvgViewOptions = {},
): string {
    const o = resolved(options);
    const basis = basisFor(view);
    const deflection = deflectionFor(kernel, shape, options);
    const edges = collectEdges(kernel, shape, basis, deflection);
    const t = singleLayout(extentOf([edges]), o);
    const body = panelSvg(edges, basis, t, o, null);
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}" ` +
        `viewBox="0 0 ${o.width} ${o.height}">${body}</svg>`
    );
}

/**
 * Render a multiview grid (default Front / Top / Right / Iso) of `shape` to a
 * single SVG string. All orthographic panels share one scale; an optional
 * footer annotates the overall X×Y×Z size.
 */
export function renderMultiviewSVG(
    kernel: SvgKernel,
    shape: ShapeHandle,
    options: MultiviewSvgOptions = {},
): string {
    const o = resolved(options);
    const views = options.views ?? ["front", "top", "right", "iso"];
    const columns = options.columns ?? 2;
    const showLabels = options.showLabels ?? true;
    const showDimensions = options.showDimensions ?? true;
    const deflection = deflectionFor(kernel, shape, options);

    const bases = views.map(basisFor);
    const edges = bases.map((b) => collectEdges(kernel, shape, b, deflection));
    const layout = gridLayout(edges.map((e) => extentOf([e])), o, columns, showDimensions);

    let panels = "";
    for (let i = 0; i < views.length; i++) {
        const { px, py, t } = layout.panels[i]!;
        const label = showLabels ? VIEW_LABEL[views[i]!] : null;
        panels += `<g transform="translate(${px} ${py})">${panelSvg(edges[i]!, bases[i]!, t, o, label)}</g>`;
    }

    let footer = "";
    if (showDimensions) {
        const dims = dimensionsText(kernel, shape, round);
        footer =
            `<text x="${layout.totalW / 2}" y="${layout.rows * o.height + 15}" font-size="11" fill="#444" ` +
            `font-family="sans-serif" text-anchor="middle">${esc(dims)}</text>`;
    }

    return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.totalW}" height="${layout.totalH}" ` +
        `viewBox="0 0 ${layout.totalW} ${layout.totalH}">` +
        `<rect width="${layout.totalW}" height="${layout.totalH}" fill="${o.background}"/>` +
        `${panels}${footer}</svg>`
    );
}
