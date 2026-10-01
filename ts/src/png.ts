/**
 * Multiview PNG rendering for OCCT shapes.
 *
 * The same drawing as `svg.ts` -- hidden-line removal per view, one shared
 * scale, a per-view gnomon and labels -- rasterised here instead of written as
 * vector markup. Both take their geometry and layout from `views.ts`, so a PNG
 * and an SVG of the same shape show the same picture.
 *
 * Everything is done here: an antialiased line rasteriser, a small bitmap font
 * for the labels, and a PNG encoder over the platform's CompressionStream.
 * That keeps the renderer free of native modules and of a font file,
 * which matters because callers embed this in single-file binaries. The cost
 * is that text is a fixed 5x7 bitmap face rather than the caller's font.
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
import { FONT_5X7, GLYPH_H, GLYPH_W } from "./font5x7.js";

/** The subset of the kernel API the PNG renderer depends on. */
export type PngKernel = ViewKernel;

export interface PngViewOptions extends ViewOptions {
    /**
     * Supersampling factor (default 2). The scene is rasterised this many
     * times larger and box-filtered down, which is what keeps a 1 px line
     * legible. 1 disables it; above 3 the file grows for no visible gain.
     */
    scale?: number;
}

export interface MultiviewPngOptions extends MultiviewOptions, PngViewOptions {}

// --- canvas -----------------------------------------------------------------

interface Rgb {
    r: number;
    g: number;
    b: number;
}

/** Parse "#rgb" or "#rrggbb". Anything else is treated as black, which shows
 *  up as a visible mistake rather than a silent one. */
function parseColor(css: string): Rgb {
    const h = css.trim().replace(/^#/, "");
    if (h.length === 3) {
        return {
            r: parseInt(h[0]! + h[0]!, 16),
            g: parseInt(h[1]! + h[1]!, 16),
            b: parseInt(h[2]! + h[2]!, 16),
        };
    }
    if (h.length === 6) {
        return {
            r: parseInt(h.slice(0, 2), 16),
            g: parseInt(h.slice(2, 4), 16),
            b: parseInt(h.slice(4, 6), 16),
        };
    }
    return { r: 0, g: 0, b: 0 };
}

/** An RGB canvas with alpha-blended drawing. No alpha channel is kept: the
 *  output is opaque, so blending happens against what is already there. */
class Canvas {
    readonly w: number;
    readonly h: number;
    readonly px: Uint8Array; // RGB, row-major

    constructor(w: number, h: number, bg: Rgb) {
        this.w = w;
        this.h = h;
        this.px = new Uint8Array(w * h * 3);
        for (let i = 0; i < this.px.length; i += 3) {
            this.px[i] = bg.r;
            this.px[i + 1] = bg.g;
            this.px[i + 2] = bg.b;
        }
    }

    blend(x: number, y: number, c: Rgb, a: number): void {
        if (a <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
        const i = (y * this.w + x) * 3;
        const k = a > 1 ? 1 : a;
        this.px[i] = this.px[i]! + (c.r - this.px[i]!) * k;
        this.px[i + 1] = this.px[i + 1]! + (c.g - this.px[i + 1]!) * k;
        this.px[i + 2] = this.px[i + 2]! + (c.b - this.px[i + 2]!) * k;
    }

    fillRect(x0: number, y0: number, x1: number, y1: number, c: Rgb): void {
        const xa = Math.max(0, Math.round(x0));
        const ya = Math.max(0, Math.round(y0));
        const xb = Math.min(this.w, Math.round(x1));
        const yb = Math.min(this.h, Math.round(y1));
        for (let y = ya; y < yb; y++) {
            for (let x = xa; x < xb; x++) this.blend(x, y, c, 1);
        }
    }

    /**
     * Antialiased thick line, drawn as a distance field over the segment's
     * bounding box. Wu's algorithm only does hairlines; strokeWidth here is a
     * caller-visible option, and a box of a few hundred pixels is cheap.
     */
    line(x0: number, y0: number, x1: number, y1: number, c: Rgb, width: number): void {
        const half = Math.max(width, 0.1) / 2;
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len2 = dx * dx + dy * dy;
        const pad = half + 1;
        const xa = Math.max(0, Math.floor(Math.min(x0, x1) - pad));
        const xb = Math.min(this.w - 1, Math.ceil(Math.max(x0, x1) + pad));
        const ya = Math.max(0, Math.floor(Math.min(y0, y1) - pad));
        const yb = Math.min(this.h - 1, Math.ceil(Math.max(y0, y1) + pad));
        for (let y = ya; y <= yb; y++) {
            for (let x = xa; x <= xb; x++) {
                // Distance from the pixel centre to the segment.
                const px = x + 0.5 - x0;
                const py = y + 0.5 - y0;
                let t = len2 > 0 ? (px * dx + py * dy) / len2 : 0;
                t = t < 0 ? 0 : t > 1 ? 1 : t;
                const ex = px - t * dx;
                const ey = py - t * dy;
                const d = Math.hypot(ex, ey);
                // One pixel of feather: fully inside up to half - 0.5, out at
                // half + 0.5.
                const a = half + 0.5 - d;
                if (a > 0) this.blend(x, y, c, a > 1 ? 1 : a);
            }
        }
    }

    /** Draw text with the built-in 5x7 face. `size` is the cell height in px;
     *  the glyphs are nearest-neighbour scaled, which stays crisp at integer
     *  multiples and is acceptable in between. */
    text(s: string, x: number, y: number, size: number, c: Rgb, anchor: "start" | "middle" = "start"): void {
        const px = Math.max(1, Math.round(size / GLYPH_H));
        const advance = (GLYPH_W + 1) * px;
        const totalW = s.length * advance;
        let cx = anchor === "middle" ? x - totalW / 2 : x;
        const top = y - (GLYPH_H * px) / 2;
        for (const ch of s) {
            const glyph = FONT_5X7[ch];
            if (glyph) {
                for (let row = 0; row < GLYPH_H; row++) {
                    const bits = glyph[row]!;
                    for (let col = 0; col < GLYPH_W; col++) {
                        if (!(bits & (1 << (GLYPH_W - 1 - col)))) continue;
                        this.fillRect(
                            cx + col * px,
                            top + row * px,
                            cx + (col + 1) * px,
                            top + (row + 1) * px,
                            c,
                        );
                    }
                }
            }
            cx += advance;
        }
    }

    /** Box-filter down by an integer factor. */
    downsample(factor: number): Canvas {
        if (factor <= 1) return this;
        const w = Math.floor(this.w / factor);
        const h = Math.floor(this.h / factor);
        const out = new Canvas(w, h, { r: 0, g: 0, b: 0 });
        const n = factor * factor;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let r = 0;
                let g = 0;
                let b = 0;
                for (let sy = 0; sy < factor; sy++) {
                    const row = (y * factor + sy) * this.w;
                    for (let sx = 0; sx < factor; sx++) {
                        const i = (row + x * factor + sx) * 3;
                        r += this.px[i]!;
                        g += this.px[i + 1]!;
                        b += this.px[i + 2]!;
                    }
                }
                const o = (y * w + x) * 3;
                out.px[o] = r / n;
                out.px[o + 1] = g / n;
                out.px[o + 2] = b / n;
            }
        }
        return out;
    }
}

// --- drawing ----------------------------------------------------------------

/** Walk a pixel polyline, emitting the on-segments of a 3-2 dash pattern. */
function dashed(
    canvas: Canvas,
    pts: number[],
    c: Rgb,
    width: number,
    on: number,
    off: number,
): void {
    let phase = 0;
    for (let i = 0; i + 3 < pts.length; i += 2) {
        const x0 = pts[i]!;
        const y0 = pts[i + 1]!;
        const x1 = pts[i + 2]!;
        const y1 = pts[i + 3]!;
        const len = Math.hypot(x1 - x0, y1 - y0);
        if (len === 0) continue;
        let travelled = 0;
        while (travelled < len) {
            const inOn = phase < on;
            const remain = inOn ? on - phase : on + off - phase;
            const step = Math.min(remain, len - travelled);
            if (inOn) {
                const ta = travelled / len;
                const tb = (travelled + step) / len;
                canvas.line(
                    x0 + (x1 - x0) * ta,
                    y0 + (y1 - y0) * ta,
                    x0 + (x1 - x0) * tb,
                    y0 + (y1 - y0) * tb,
                    c,
                    width,
                );
            }
            travelled += step;
            phase = (phase + step) % (on + off);
        }
    }
}

function strokePolylines(
    canvas: Canvas,
    lines: Polyline[],
    t: PanelTransform,
    ox: number,
    oy: number,
    s: number,
    c: Rgb,
    width: number,
    dash: boolean,
): void {
    for (const line of lines) {
        const px = toPixels(line, t);
        for (let i = 0; i < px.length; i += 2) {
            px[i] = (px[i]! + ox) * s;
            px[i + 1] = (px[i + 1]! + oy) * s;
        }
        if (dash) dashed(canvas, px, c, width * s, 3 * s, 2 * s);
        else {
            for (let i = 0; i + 3 < px.length; i += 2) {
                canvas.line(px[i]!, px[i + 1]!, px[i + 2]!, px[i + 3]!, c, width * s);
            }
        }
    }
}

function drawPanel(
    canvas: Canvas,
    edges: ViewEdges,
    basis: ViewBasis,
    t: PanelTransform,
    o: ReturnType<typeof resolved>,
    label: string | null,
    ox: number,
    oy: number,
    s: number,
): void {
    const border = parseColor("#e0e0e0");
    canvas.fillRect(ox * s, oy * s, (ox + t.panelW) * s, (oy + t.panelH) * s, parseColor(o.background));
    // Panel border, one device pixel per side at scale 1.
    canvas.line(ox * s, oy * s, (ox + t.panelW) * s, oy * s, border, s);
    canvas.line(ox * s, (oy + t.panelH) * s, (ox + t.panelW) * s, (oy + t.panelH) * s, border, s);
    canvas.line(ox * s, oy * s, ox * s, (oy + t.panelH) * s, border, s);
    canvas.line((ox + t.panelW) * s, oy * s, (ox + t.panelW) * s, (oy + t.panelH) * s, border, s);

    if (o.showHidden && edges.hidden.length > 0) {
        strokePolylines(canvas, edges.hidden, t, ox, oy, s, parseColor(o.hiddenColor), o.strokeWidth, true);
    }
    if (edges.visible.length > 0) {
        strokePolylines(canvas, edges.visible, t, ox, oy, s, parseColor(o.visibleColor), o.strokeWidth, false);
    }
    if (o.showGnomon) {
        for (const arm of gnomonArms(basis, t)) {
            const c = parseColor(arm.color);
            canvas.line((arm.x0 + ox) * s, (arm.y0 + oy) * s, (arm.x1 + ox) * s, (arm.y1 + oy) * s, c, 1.5 * s);
            canvas.text(arm.label, (arm.x1 + ox) * s, (arm.y1 + oy) * s, 9 * s, c, "middle");
        }
    }
    if (label !== null) {
        // SVG puts the baseline at pad + 4; the bitmap face centres on its
        // cell, so sit the cell where that baseline would be.
        canvas.text(label, (t.pad + ox) * s, (t.pad + oy) * s, 11 * s, parseColor("#333"));
    }
}

// --- PNG encoding -----------------------------------------------------------

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(bytes: Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
}

/**
 * Deflate through the platform's CompressionStream. "deflate" there means the
 * zlib wrapper of RFC 1950, which is exactly what a PNG IDAT holds; Node 18+,
 * Bun, Deno and browsers all provide it, so the renderer needs no zlib import
 * and stays usable outside Node.
 */
async function deflate(raw: Uint8Array): Promise<Uint8Array> {
    const CS = (globalThis as { CompressionStream?: unknown }).CompressionStream as
        | (new (format: string) => {
              readable: ReadableStream<Uint8Array>;
              writable: WritableStream<Uint8Array>;
          })
        | undefined;
    if (typeof CS !== "function") {
        throw new Error("PNG export needs CompressionStream (Node 18+, Bun, Deno or a browser)");
    }
    const cs = new CS("deflate");
    const writer = cs.writable.getWriter();
    void writer.write(raw);
    void writer.close();
    const parts: Uint8Array[] = [];
    const reader = cs.readable.getReader();
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) parts.push(value);
    }
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of parts) {
        out.set(p, at);
        at += p.length;
    }
    return out;
}

/** Encode an RGB canvas as a PNG (8-bit truecolour, no alpha). */
async function encodePng(canvas: Canvas): Promise<Uint8Array> {
    // Filter type 0 (None) on every row: the drawings are mostly flat colour,
    // so deflate does the work and the encoder stays short.
    const stride = canvas.w * 3;
    const raw = new Uint8Array((stride + 1) * canvas.h);
    for (let y = 0; y < canvas.h; y++) {
        raw[y * (stride + 1)] = 0;
        raw.set(canvas.px.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
    }
    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, canvas.w);
    dv.setUint32(4, canvas.h);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // colour type: truecolour
    const idat = await deflate(raw);
    const parts = [
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", idat),
        chunk("IEND", new Uint8Array(0)),
    ];
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of parts) {
        out.set(p, at);
        at += p.length;
    }
    return out;
}

// --- public API -------------------------------------------------------------

function superScale(options: PngViewOptions): number {
    const s = options.scale ?? 2;
    return Math.max(1, Math.min(4, Math.round(s)));
}

/**
 * Render a single named view of `shape` to PNG bytes.
 */
export async function renderShapePNG(
    kernel: PngKernel,
    shape: ShapeHandle,
    view: ViewName = "front",
    options: PngViewOptions = {},
): Promise<Uint8Array> {
    const o = resolved(options);
    const s = superScale(options);
    const basis = basisFor(view);
    const deflection = deflectionFor(kernel, shape, options);
    const edges = collectEdges(kernel, shape, basis, deflection);
    const t = singleLayout(extentOf([edges]), o);
    const canvas = new Canvas(o.width * s, o.height * s, parseColor(o.background));
    drawPanel(canvas, edges, basis, t, o, null, 0, 0, s);
    return encodePng(canvas.downsample(s));
}

/**
 * Render a multiview grid (default Front / Top / Right / Iso) of `shape` to
 * PNG bytes. Same layout as {@link renderMultiviewSVG}.
 */
export async function renderMultiviewPNG(
    kernel: PngKernel,
    shape: ShapeHandle,
    options: MultiviewPngOptions = {},
): Promise<Uint8Array> {
    const o = resolved(options);
    const s = superScale(options);
    const views = options.views ?? ["front", "top", "right", "iso"];
    const columns = options.columns ?? 2;
    const showLabels = options.showLabels ?? true;
    const showDimensions = options.showDimensions ?? true;
    const deflection = deflectionFor(kernel, shape, options);

    const bases = views.map(basisFor);
    const edges = bases.map((b) => collectEdges(kernel, shape, b, deflection));
    const layout = gridLayout(edges.map((e) => extentOf([e])), o, columns, showDimensions);

    const canvas = new Canvas(layout.totalW * s, layout.totalH * s, parseColor(o.background));
    for (let i = 0; i < views.length; i++) {
        const { px, py, t } = layout.panels[i]!;
        drawPanel(canvas, edges[i]!, bases[i]!, t, o, showLabels ? VIEW_LABEL[views[i]!] : null, px, py, s);
    }
    if (showDimensions) {
        const dims = dimensionsText(kernel, shape, (n) => Math.round(n * 100) / 100);
        canvas.text(
            dims,
            (layout.totalW / 2) * s,
            (layout.rows * o.height + 11) * s,
            11 * s,
            parseColor("#444"),
            "middle",
        );
    }
    return encodePng(canvas.downsample(s));
}
