/**
 * Tests for the multiview PNG renderer (ts/src/png.ts + the
 * toPNG/toMultiviewPNG wrapper methods).
 *
 * The PNG is the SVG's drawing rasterised: both take their projection and
 * layout from ts/src/views.ts, so these check the container, the canvas size
 * against the SVG's, and that ink lands where the vector output puts it.
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kernel = new (OcctKernel as any)(Module);
}, 30_000);

afterEach(() => {
    kernel.releaseAll();
});

afterAll(() => {
    kernel[Symbol.dispose]();
});

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Read the IHDR fields a caller would rely on. */
function header(png: Uint8Array) {
    const dv = new DataView(png.buffer, png.byteOffset);
    return {
        width: dv.getUint32(16),
        height: dv.getUint32(20),
        bitDepth: png[24],
        colorType: png[25],
    };
}

/** Chunk types in order, so a reader's expectations are pinned. */
function chunkTypes(png: Uint8Array): string[] {
    const dv = new DataView(png.buffer, png.byteOffset);
    const types: string[] = [];
    let at = 8;
    while (at + 8 <= png.length) {
        const len = dv.getUint32(at);
        types.push(String.fromCharCode(...png.subarray(at + 4, at + 8)));
        at += 12 + len;
    }
    return types;
}

/** Decode to raw RGB rows. Only the shapes this encoder writes: 8-bit
 *  truecolour, filter 0 on every row. */
async function decode(png: Uint8Array): Promise<{ w: number; h: number; px: Uint8Array }> {
    const { width: w, height: h } = header(png);
    const dv = new DataView(png.buffer, png.byteOffset);
    const idat: Uint8Array[] = [];
    let at = 8;
    while (at + 8 <= png.length) {
        const len = dv.getUint32(at);
        const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
        if (type === "IDAT") idat.push(png.subarray(at + 8, at + 8 + len));
        at += 12 + len;
    }
    const joined = new Uint8Array(idat.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of idat) {
        joined.set(p, o);
        o += p.length;
    }
    const ds = new DecompressionStream("deflate");
    const writer = ds.writable.getWriter();
    void writer.write(joined);
    void writer.close();
    const parts: Uint8Array[] = [];
    const reader = ds.readable.getReader();
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) parts.push(value);
    }
    const raw = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let ro = 0;
    for (const p of parts) {
        raw.set(p, ro);
        ro += p.length;
    }
    const stride = w * 3;
    const px = new Uint8Array(stride * h);
    for (let y = 0; y < h; y++) {
        expect(raw[y * (stride + 1)]).toBe(0); // filter: None
        px.set(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride), y * stride);
    }
    return { w, h, px };
}

/** Bounding box of every pixel darker than white, and how many there are. */
function inkBox(img: { w: number; h: number; px: Uint8Array }) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let count = 0;
    for (let y = 0; y < img.h; y++) {
        for (let x = 0; x < img.w; x++) {
            const i = (y * img.w + x) * 3;
            if (img.px[i]! > 230 && img.px[i + 1]! > 230 && img.px[i + 2]! > 230) continue;
            count++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    return { minX, minY, maxX, maxY, count };
}

describe("toPNG", () => {
    it("writes a well-formed truecolour PNG", async () => {
        const png = await kernel.toPNG(kernel.makeBox(100, 60, 40), "front");
        expect([...png.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
        expect(chunkTypes(png)).toEqual(["IHDR", "IDAT", "IEND"]);
        const h = header(png);
        expect(h).toMatchObject({ width: 240, height: 240, bitDepth: 8, colorType: 2 });
    });

    it("honours the requested panel size", async () => {
        const png = await kernel.toPNG(kernel.makeBox(10, 10, 10), "iso", {
            width: 320,
            height: 200,
        });
        expect(header(png)).toMatchObject({ width: 320, height: 200 });
    });

    it("draws something, and inside the panel", async () => {
        const img = await decode(await kernel.toPNG(kernel.makeBox(100, 60, 40), "front"));
        const ink = inkBox(img);
        expect(ink.count).toBeGreaterThan(200);
        expect(ink.minX).toBeGreaterThanOrEqual(0);
        expect(ink.maxX).toBeLessThan(img.w);
        expect(ink.maxY).toBeLessThan(img.h);
    });

    it("front shows width x height in the drawn extent", async () => {
        // The box is 100 x 40 seen from the front, so the edges span the panel
        // horizontally and about 40% of that vertically. Labels are off so the
        // measurement is of geometry alone.
        const img = await decode(
            await kernel.toPNG(kernel.makeBox(100, 60, 40), "front", { showGnomon: false }),
        );
        const ink = inkBox(img);
        const w = ink.maxX - ink.minX;
        const h = ink.maxY - ink.minY;
        expect(w / h).toBeCloseTo(100 / 40, 0);
    });
});

describe("toMultiviewPNG", () => {
    it("matches the SVG canvas size", async () => {
        const box = kernel.makeBox(100, 60, 40);
        const png = await kernel.toMultiviewPNG(box);
        const svg = kernel.toMultiviewSVG(box);
        const m = /width="(\d+)" height="(\d+)"/.exec(svg)!;
        expect(header(png)).toMatchObject({
            width: Number(m[1]),
            height: Number(m[2]),
        });
    });

    it("follows the grid the caller asks for", async () => {
        const png = await kernel.toMultiviewPNG(kernel.makeBox(10, 10, 10), {
            views: ["front", "top", "right"],
            columns: 3,
            showDimensions: false,
        });
        expect(header(png)).toMatchObject({ width: 3 * 240, height: 240 });
    });

    it("puts ink in every panel", async () => {
        const png = await kernel.toMultiviewPNG(kernel.makeBox(100, 60, 40));
        const img = await decode(png);
        // Four 240x240 panels in a 2x2 grid: each quadrant has to carry edges,
        // which is what a panel that failed to project would not.
        for (const [qx, qy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
            let count = 0;
            for (let y = qy * 240 + 30; y < qy * 240 + 210; y++) {
                for (let x = qx * 240 + 30; x < qx * 240 + 210; x++) {
                    const i = (y * img.w + x) * 3;
                    if (img.px[i]! < 200) count++;
                }
            }
            expect(count).toBeGreaterThan(50);
        }
    });

    it("scale changes sampling, not the image size", async () => {
        const box = kernel.makeBox(100, 60, 40);
        const a = header(await kernel.toMultiviewPNG(box, { scale: 1 }));
        const b = header(await kernel.toMultiviewPNG(box, { scale: 3 }));
        expect(b).toEqual(a);
    });

    it("hidden edges add ink that --no-hidden leaves out", async () => {
        const box = kernel.makeBox(100, 60, 40);
        const withHidden = inkBox(await decode(await kernel.toMultiviewPNG(box))).count;
        const without = inkBox(
            await decode(await kernel.toMultiviewPNG(box, { showHidden: false })),
        ).count;
        expect(withHidden).toBeGreaterThan(without);
    });
});
