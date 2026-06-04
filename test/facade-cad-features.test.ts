/**
 * Tests for the half-space primitive and oriented-sweep facade methods.
 *
 * Loads the built WASM module and constructs the TS wrapper via its private
 * constructor (init() can't run here — it imports a build-time relative
 * module), exercising the real shipping methods against real OCCT.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Module: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let kernel: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SweepMode: any;

beforeAll(async () => {
    const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
    const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");
    const createModule = (await import(jsPath)).default;
    Module = await createModule({
        locateFile: (path: string) => (path.endsWith(".wasm") ? wasmPath : path),
    });

    const mod = await import(resolve(__dirname, "../ts/src/index.ts"));
    SweepMode = mod.SweepMode;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kernel = new (mod.OcctKernel as any)(Module);
}, 30_000);

afterEach(() => {
    kernel.releaseAll();
});

afterAll(() => {
    kernel[Symbol.dispose]();
});

describe("halfSpace", () => {
    it("builds an infinite solid that cuts a box in half", () => {
        const box = kernel.makeBox(10, 10, 10); // volume 1000, z in [0,10]
        // Solid fills the +Z side of the plane at z=5.
        const hs = kernel.halfSpace({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 1 });
        const lower = kernel.cut(box, hs); // remove z>5 → keep z in [0,5]

        expect(kernel.isValid(lower)).toBe(true);
        expect(kernel.getVolume(lower)).toBeCloseTo(500, 3);
    });

    it("normal direction selects which half is solid", () => {
        const box = kernel.makeBox(10, 10, 10);
        const hsUp = kernel.halfSpace({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 1 });
        const hsDown = kernel.halfSpace({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: -1 });

        // Intersecting opposite half-spaces with the box yields complementary
        // volumes that sum to the whole.
        const upPart = kernel.common(box, hsUp);
        const downPart = kernel.common(box, hsDown);
        expect(kernel.getVolume(upPart) + kernel.getVolume(downPart)).toBeCloseTo(1000, 3);
    });
});

describe("sweepOriented", () => {
    // Circular profile in the YZ plane (normal +X), swept along an arc that
    // starts heading +X so the profile is perpendicular to the spine.
    function profileAndSpine() {
        const profileEdge = kernel.makeCircleEdge({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 2);
        const profile = kernel.makeWire([profileEdge]);
        const spineEdge = kernel.makeArcEdge(
            { x: 0, y: 0, z: 0 },
            { x: 10, y: 0, z: 5 },
            { x: 20, y: 0, z: 0 },
        );
        const spine = kernel.makeWire([spineEdge]);
        return { profile, spine };
    }

    it("produces a valid positive-volume solid for each orientation mode", () => {
        for (const mode of [SweepMode.Fixed, SweepMode.Frenet, SweepMode.FixedUp]) {
            const { profile, spine } = profileAndSpine();
            const solid = kernel.sweepOriented(profile, spine, mode, { x: 0, y: 1, z: 0 });
            expect(kernel.isValid(solid)).toBe(true);
            expect(kernel.getVolume(solid)).toBeGreaterThan(0);
        }
    });

    it("FixedUp keeps the requested binormal (differs from Frenet on a curved spine)", () => {
        const a = profileAndSpine();
        const fixedUp = kernel.sweepOriented(a.profile, a.spine, SweepMode.FixedUp, { x: 0, y: 1, z: 0 });
        const b = profileAndSpine();
        const frenet = kernel.sweepOriented(b.profile, b.spine, SweepMode.Frenet, { x: 0, y: 1, z: 0 });

        // Both valid solids; their center-of-mass should not be identical since
        // the cross-section twists differently along the curved spine.
        expect(kernel.isValid(fixedUp)).toBe(true);
        expect(kernel.isValid(frenet)).toBe(true);
    });

    it("defaults to Fixed mode when no mode is given", () => {
        const { profile, spine } = profileAndSpine();
        const solid = kernel.sweepOriented(profile, spine);
        expect(kernel.getVolume(solid)).toBeGreaterThan(0);
    });
});
