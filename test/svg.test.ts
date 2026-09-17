/**
 * Tests for the multiview SVG renderer and bounding-box align helpers
 * (ts/src/svg.ts + the toSVG/toMultiviewSVG/alignX|Y|Z wrapper methods).
 *
 * init() can't run here (it imports ./occt-wasm.js relative to source), so we
 * load the built WASM module and construct the wrapper via its private
 * constructor — exercising the real shipping methods against real OCCT HLR.
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
    // Bypass init() (which imports a build-time relative module) via the
    // private constructor — gives a real wrapper over the loaded module.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kernel = new (OcctKernel as any)(Module);
}, 30_000);

afterEach(() => {
    kernel.releaseAll();
});

afterAll(() => {
    kernel[Symbol.dispose]();
});

describe("toMultiviewSVG", () => {
    it("renders a 4-up grid with labels, dimensions, and visible edges", () => {
        const box = kernel.makeBox(10, 20, 30);
        const svg = kernel.toMultiviewSVG(box);

        expect(svg.startsWith("<svg")).toBe(true);
        expect(svg).toContain("</svg>");
        // Four labeled panels.
        for (const label of ["Front", "Top", "Right", "Iso"]) {
            expect(svg).toContain(`>${label}</text>`);
        }
        // Overall size annotation (X×Y×Z) from the bounding box.
        expect(svg).toContain("10 × 20 × 30 (X×Y×Z)");
        // At least one visible-edge path was drawn.
        expect(svg).toMatch(/<path d="M[^"]+" fill="none" stroke="#111111"/);
        // Per-view gnomon axes present.
        expect(svg).toContain(">X</text>");
        expect(svg).toContain(">Z</text>");
    });

    it("draws hidden edges dashed by default and omits them when disabled", () => {
        const box = kernel.makeBox(10, 10, 10);
        const withHidden = kernel.toMultiviewSVG(box);
        const withoutHidden = kernel.toMultiviewSVG(box, { showHidden: false });

        expect(withHidden).toContain('stroke-dasharray="3 2"');
        expect(withoutHidden).not.toContain('stroke-dasharray="3 2"');
    });

    it("honors a custom view list and column count", () => {
        const box = kernel.makeBox(5, 5, 5);
        const svg = kernel.toMultiviewSVG(box, { views: ["front", "iso"], columns: 2 });

        expect(svg).toContain(">Front</text>");
        expect(svg).toContain(">Iso</text>");
        expect(svg).not.toContain(">Top</text>");
    });

    it("produces well-formed, finite coordinates (no NaN)", () => {
        const cyl = kernel.makeCylinder(5, 12);
        const svg = kernel.toMultiviewSVG(cyl);
        expect(svg).not.toContain("NaN");
        expect(svg).not.toContain("Infinity");
    });
});

describe("view geometry", () => {
    type Pt = [x: number, y: number];
    interface Drawn {
        visible: Pt[];
        hidden: Pt[];
    }

    // Every vertex of every <path>, split by stroke style: hidden edges carry
    // a dasharray.
    const drawn = (svg: string): Drawn => {
        const out: Drawn = { visible: [], hidden: [] };
        for (const tag of svg.matchAll(/<path d="([^"]+)"[^>]*>/g)) {
            const bucket = tag[0].includes("stroke-dasharray") ? out.hidden : out.visible;
            for (const pt of tag[1]!.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)) {
                bucket.push([Number(pt[1]), Number(pt[2])]);
            }
        }
        return out;
    };

    const bbox = (pts: Pt[]) => ({
        minX: Math.min(...pts.map((p) => p[0])),
        maxX: Math.max(...pts.map((p) => p[0])),
        minY: Math.min(...pts.map((p) => p[1])),
        maxY: Math.max(...pts.map((p) => p[1])),
    });

    const centroid = (pts: Pt[]): Pt => [
        pts.reduce((sum, p) => sum + p[0], 0) / pts.length,
        pts.reduce((sum, p) => sum + p[1], 0) / pts.length,
    ];

    const VIEWS = ["front", "back", "top", "bottom", "left", "right", "iso"] as const;
    type View = (typeof VIEWS)[number];

    for (const view of VIEWS) {
        it(`draws ${view} with extent on both axes`, () => {
            // Structure-only assertions (labels, dashes, no NaN) pass for a
            // panel that collapsed to a line, so measure the extents.
            const b = bbox(drawn(kernel.toSVG(kernel.makeBox(100, 60, 40), view)).visible);
            expect(b.maxX - b.minX).toBeGreaterThan(1);
            expect(b.maxY - b.minY).toBeGreaterThan(1);
        });
    }

    it("front shows width x height, top shows width x depth", () => {
        const box = kernel.makeBox(100, 60, 40);
        // One panel, one scale: the ratio of the drawn extents is the ratio of
        // the modelled ones. 100x40 for front, 100x60 for top.
        const f = bbox(drawn(kernel.toSVG(box, "front")).visible);
        expect((f.maxX - f.minX) / (f.maxY - f.minY)).toBeCloseTo(100 / 40, 1);
        const t = bbox(drawn(kernel.toSVG(box, "top")).visible);
        expect((t.maxX - t.minX) / (t.maxY - t.minY)).toBeCloseTo(100 / 60, 1);
    });

    // Where each world axis points on screen, as [dx, dy] with SVG y down, so
    // [0, -1] is up. This is what the gnomon draws; the geometry has to agree.
    // Axes into the screen are omitted.
    const AXES: Record<View, Partial<Record<"x" | "y" | "z", Pt>>> = {
        front: { x: [1, 0], z: [0, -1] },
        back: { x: [-1, 0], z: [0, -1] },
        top: { x: [1, 0], y: [0, -1] },
        bottom: { x: [1, 0], y: [0, 1] },
        right: { y: [1, 0], z: [0, -1] },
        left: { y: [-1, 0], z: [0, -1] },
        // Isometric: X and Y leave the origin 30 degrees below horizontal.
        iso: { x: [-Math.sqrt(3) / 2, 0.5], y: [Math.sqrt(3) / 2, 0.5], z: [0, -1] },
    };

    for (const view of VIEWS) {
        it(`${view}: world axes point where the gnomon says`, () => {
            for (const [axis, [dx, dy]] of Object.entries(AXES[view]) as Array<[string, Pt]>) {
                // A small box centred on the origin and a bigger one centred
                // 100 units along the axis: the bigger cluster has to sit in
                // the expected direction, and only in that direction.
                const at = { x: 0, y: 0, z: 0, [axis]: 100 };
                const shape = kernel.makeCompound([
                    kernel.translate(kernel.makeBox(4, 4, 4), -2, -2, -2),
                    kernel.translate(kernel.makeBox(12, 12, 12), at.x - 6, at.y - 6, at.z - 6),
                ]);
                const pts = drawn(kernel.toSVG(shape, view, { showGnomon: false })).visible;
                const along = pts.map((p) => p[0] * dx + p[1] * dy);
                const cut = (Math.min(...along) + Math.max(...along)) / 2;
                const near = pts.filter((_, i) => along[i]! < cut);
                const far = pts.filter((_, i) => along[i]! >= cut);
                const size = (c: Pt[]) => {
                    const b = bbox(c);
                    return Math.hypot(b.maxX - b.minX, b.maxY - b.minY);
                };
                expect(size(far), `${view} +${axis} should point along [${dx}, ${dy}]`).toBeGreaterThan(size(near));
                const [nx, ny] = centroid(near);
                const [fx, fy] = centroid(far);
                const parallel = (fx - nx) * dx + (fy - ny) * dy;
                const perpendicular = Math.abs((fx - nx) * -dy + (fy - ny) * dx);
                // Any sideways component would be shear or a mirror.
                expect(perpendicular, `${view} +${axis} is skewed`).toBeLessThan(parallel * 0.02);
            }
        });
    }

    // Which side the camera is on. A bump on the near face is drawn solid, one
    // on the far face dashed; both sit inside the body's silhouette at
    // different positions, so the interior vertices of each stroke style tell
    // them apart. Each row: near-face bump, far-face bump, screen axis, sign of
    // (solid minus dashed) along it.
    const body = () => kernel.makeBox(100, 60, 40);
    const bump = (x: number, y: number, z: number) => kernel.translate(kernel.makeBox(10, 10, 10), x, y, z);
    const SIDES: Array<[View, number[], number[], 0 | 1, 1 | -1]> = [
        ["front", [20, -10, 15], [60, 60, 15], 0, -1],
        ["back", [60, 60, 15], [20, -10, 15], 0, -1],
        ["right", [100, 40, 15], [-10, 10, 15], 0, 1],
        ["left", [-10, 10, 15], [100, 40, 15], 0, 1],
        ["top", [45, 40, 40], [45, 10, -10], 1, -1],
        ["bottom", [45, 10, -10], [45, 40, 40], 1, -1],
    ];
    for (const [view, near, far, axis, sign] of SIDES) {
        it(`${view}: the near face is solid and the far face dashed`, () => {
            const shape = kernel.fuseAll([body(), bump(near[0], near[1], near[2]), bump(far[0], far[1], far[2])]);
            const d = drawn(kernel.toSVG(shape, view, { showGnomon: false }));
            const b = bbox([...d.visible, ...d.hidden]);
            const inside = (p: Pt) =>
                p[0] > b.minX + 2 && p[0] < b.maxX - 2 && p[1] > b.minY + 2 && p[1] < b.maxY - 2;
            const solid = d.visible.filter(inside);
            const dashed = d.hidden.filter(inside);
            expect(solid.length).toBeGreaterThan(0);
            expect(dashed.length).toBeGreaterThan(0);
            expect(Math.sign(centroid(solid)[axis] - centroid(dashed)[axis])).toBe(sign);
        });
    }

    it("iso: the camera is above the part, on its +X+Y side", () => {
        const d = drawn(kernel.toSVG(kernel.makeBox(100, 60, 40), "iso", { showGnomon: false }));
        const ys = [...d.visible, ...d.hidden].map((p) => p[1]);
        const top = Math.min(...ys);
        const bottom = Math.max(...ys);
        // The three hidden edges meet at the far corner (0, 0, 0). One climbs
        // to (0, 0, 40), the topmost point of the hexagon; none reaches
        // (100, 60, 0), the bottommost, whose edges all face the camera.
        expect(d.hidden.some((p) => Math.abs(p[1] - top) < 0.5)).toBe(true);
        expect(d.hidden.some((p) => Math.abs(p[1] - bottom) < 0.5)).toBe(false);
    });
});

describe("toSVG", () => {
    it("renders a single standalone view", () => {
        const box = kernel.makeBox(8, 8, 8);
        const svg = kernel.toSVG(box, "front");
        expect(svg.startsWith("<svg")).toBe(true);
        expect(svg).toMatch(/<path d="M[^"]+" fill="none" stroke="#111111"/);
        // Single view carries no panel label.
        expect(svg).not.toContain(">Front</text>");
    });
});

describe("align helpers", () => {
    it("alignX centers the bounding box on the origin by default", () => {
        const box = kernel.makeBox(10, 4, 4); // spans x: [0,10]
        const aligned = kernel.alignX(box);
        const bb = kernel.getBoundingBox(aligned, false);
        expect(bb.xmin).toBeCloseTo(-5, 6);
        expect(bb.xmax).toBeCloseTo(5, 6);
    });

    it("alignZ min anchor seats the shape on a target plane", () => {
        const box = kernel.makeBox(4, 4, 7); // spans z: [0,7]
        const aligned = kernel.alignZ(box, 100, "min");
        const bb = kernel.getBoundingBox(aligned, false);
        expect(bb.zmin).toBeCloseTo(100, 6);
        expect(bb.zmax).toBeCloseTo(107, 6);
    });

    it("alignY max anchor pins the far face to the target", () => {
        const box = kernel.makeBox(4, 6, 4); // spans y: [0,6]
        const aligned = kernel.alignY(box, 0, "max");
        const bb = kernel.getBoundingBox(aligned, false);
        expect(bb.ymax).toBeCloseTo(0, 6);
        expect(bb.ymin).toBeCloseTo(-6, 6);
    });
});
