/**
 * Regression test for the second class of parity bug fixed in 3.0.0:
 * `shell` and `shellWithHistory` passed the offset thickness to OCCT's
 * `MakeThickSolidByJoin` with the *positive* sign, which thickens the
 * solid *outward* (bounds grow by `thickness` on every direction with a
 * removed face) instead of hollowing inward.
 *
 * brepjs-occt's reference implementation has always passed `-thickness`
 * (matching the OCCT tutorial's `MakeThickSolidByJoin(body, faces,
 * -thickness/50, ...)`), so the two paths produced different geometry for
 * identical inputs. For Gridfinity's "1×1 flat no-lip" bin (the simplest
 * shell-only case) the divergence was +10.4% volume and a uniform ~1.2 mm
 * xMin shift versus the reference — see issue #90 in this repo.
 *
 * 3.0 negates internally (in the facade C++) so positive `thickness` from
 * the caller hollows inward. This test pins the convention down with two
 * checks:
 *   1. Outer bounds of the shelled solid match the input solid's bounds
 *      (no growth in any direction with a removed face).
 *   2. Volume is in the inward-hollow range, NOT the outward-thicken
 *      range — the upper bound is set deliberately below the buggy
 *      result so a regression to `+thickness` would fail loudly.
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
  kernel = new Module.OcctKernel();
}, 30_000);

afterEach(() => {
  kernel.releaseAll();
});

afterAll(() => {
  kernel.releaseAll();
  kernel.delete();
});

describe("shell hollows inward (sign convention)", () => {
  it("preserves outer bounds when hollowing a box from the top", () => {
    // Standard 1×1 Gridfinity bin dimensions.
    const w = 41.5;
    const d = 41.5;
    const h = 21;
    const t = 1.2;

    const box = kernel.makeBox(w, d, h);
    const faces = kernel.getSubShapes(box, "face");

    // Find the +Z (top) face by bounding box.
    let topFaceId = -1;
    for (let i = 0; i < faces.size(); i++) {
      const fid = faces.get(i);
      const fbb = kernel.getBoundingBox(fid, true);
      if (fbb.zmin > h - 0.01 && fbb.zmax < h + 0.01) {
        topFaceId = fid;
        break;
      }
    }
    faces.delete();
    expect(topFaceId).toBeGreaterThan(0);

    const removed = new Module.VectorUint32();
    removed.push_back(topFaceId);
    const shelled = kernel.shell(box, removed, t, 1e-6);
    removed.delete();

    // (1) Outer bounds preserved. Old `+thickness` path produced
    //     xmin ≈ −1.2, xmax ≈ 42.7, ymin ≈ −1.2, ymax ≈ 42.7,
    //     zmin ≈ −1.2 (from outward-thickened side faces),
    //     zmax = h (top removed so no offset surface there).
    const bb = kernel.getBoundingBox(shelled, true);
    expect(bb.xmin).toBeCloseTo(0, 3);
    expect(bb.ymin).toBeCloseTo(0, 3);
    expect(bb.zmin).toBeCloseTo(0, 3);
    expect(bb.xmax).toBeCloseTo(w, 3);
    expect(bb.ymax).toBeCloseTo(d, 3);
    expect(bb.zmax).toBeCloseTo(h, 3);

    // (2) Volume is the inward shell, not the outward skin.
    //     Inward:  41.5²·21 − 39.1²·19.8 ≈ 5910 mm³
    //     Outward: 43.9²·22.2 − 41.5²·21 ≈ 6620 mm³  (old buggy result)
    //     The 6300 ceiling is well below outward-buggy and well above
    //     inward-correct, so a sign regression flips the assertion.
    const vol = kernel.getVolume(shelled);
    expect(vol).toBeGreaterThan(5000);
    expect(vol).toBeLessThan(6300);
  });
});
