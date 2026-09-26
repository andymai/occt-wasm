/**
 * `shellWithJoin` / `offsetWithJoin`: the join type decides what happens where
 * offset faces move apart. An L-shaped prism has one concave vertical edge;
 * offsetting inward pulls its two faces apart there.
 *   - Arc (OCCT's default, what `shell`/`offset` use) bridges the gap with a
 *     cylindrical face whose radius is the thickness.
 *   - Intersection extends the planes until they meet, so every face stays
 *     planar.
 * Seen in practice as "hollowing rounds my sharp edges" - FreeCAD exposes the
 * same OCCT switch as "Join type: Arc / Intersection".
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Module: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let kernel: any;

const ARC = 0;
const TANGENT = 1;
const INTERSECTION = 2;

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

/** L-shaped prism, 20 × 20 × 10, one concave vertical edge at (10, 10). */
function lPrism(): number {
  const a = kernel.makeBox(20, 10, 10);
  const b = kernel.makeBox(10, 20, 10);
  return kernel.unifySameDomain(kernel.fuse(a, b));
}

function surfaceTypes(shape: number): string[] {
  const faces = kernel.getSubShapes(shape, "face");
  const types: string[] = [];
  for (let i = 0; i < faces.size(); i++) types.push(kernel.surfaceType(faces.get(i)));
  faces.delete();
  return types;
}

function topFace(shape: number, z: number): number {
  const faces = kernel.getSubShapes(shape, "face");
  let found = -1;
  for (let i = 0; i < faces.size(); i++) {
    const bb = kernel.getBoundingBox(faces.get(i), true);
    if (bb.zmin > z - 0.01 && bb.zmax < z + 0.01) found = faces.get(i);
  }
  faces.delete();
  return found;
}

describe("offsetWithJoin", () => {
  it("rounds the concave edge with Arc and keeps it sharp with Intersection", () => {
    const arc = kernel.offsetWithJoin(lPrism(), -2, 1e-6, ARC);
    const sharp = kernel.offsetWithJoin(lPrism(), -2, 1e-6, INTERSECTION);

    expect(surfaceTypes(arc)).toContain("cylinder");
    expect(kernel.isValid(sharp)).toBe(true);
    expect(surfaceTypes(sharp).every((type) => type === "plane")).toBe(true);

    // At the concave edge the sharp result gives up a 2 × 2 square where the
    // arc gives up only a quarter circle of radius 2, over the 6 mm that
    // remain of the height.
    const missing = (2 * 2 - (Math.PI * 2 * 2) / 4) * 6;
    expect(kernel.getVolume(arc) - kernel.getVolume(sharp)).toBeCloseTo(missing, 2);
  });

  it("matches plain offset for Arc", () => {
    const plain = kernel.offset(lPrism(), -2, 1e-6);
    const arc = kernel.offsetWithJoin(lPrism(), -2, 1e-6, ARC);
    expect(kernel.getVolume(arc)).toBeCloseTo(kernel.getVolume(plain), 6);
  });

  it("rejects Tangent", () => {
    expect(() => kernel.offsetWithJoin(lPrism(), -2, 1e-6, TANGENT)).toThrow();
  });
});

describe("shellWithJoin", () => {
  it("keeps the inner concave wall edge sharp with Intersection", () => {
    const run = (joinType: number) => {
      const solid = lPrism();
      const removed = new Module.VectorUint32();
      removed.push_back(topFace(solid, 10));
      const shelled = kernel.shellWithJoin(solid, removed, 2, 1e-6, joinType);
      removed.delete();
      return shelled;
    };

    const arc = run(ARC);
    const sharp = run(INTERSECTION);

    expect(surfaceTypes(arc)).toContain("cylinder");
    expect(kernel.isValid(sharp)).toBe(true);
    expect(surfaceTypes(sharp).every((type) => type === "plane")).toBe(true);

    // The sharp cavity stops at a 2 × 2 square in the corner, the arc one at
    // a quarter circle - over the 8 mm cavity height that is extra wall.
    const extraWall = (2 * 2 - (Math.PI * 2 * 2) / 4) * 8;
    expect(kernel.getVolume(sharp) - kernel.getVolume(arc)).toBeCloseTo(extraWall, 2);

    // Same outer box either way - only the cavity's corner changes.
    const bb = kernel.getBoundingBox(sharp, true);
    expect(bb.xmax).toBeCloseTo(20, 3);
    expect(bb.ymax).toBeCloseTo(20, 3);
    expect(bb.zmax).toBeCloseTo(10, 3);
  });

  it("matches plain shell for Arc", () => {
    const solid = lPrism();
    const removed = new Module.VectorUint32();
    removed.push_back(topFace(solid, 10));
    const plain = kernel.shell(solid, removed, 2, 1e-6);
    const arc = kernel.shellWithJoin(solid, removed, 2, 1e-6, ARC);
    removed.delete();
    expect(kernel.getVolume(arc)).toBeCloseTo(kernel.getVolume(plain), 6);
  });
});
