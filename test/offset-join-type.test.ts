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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wrapper: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let JoinType: any;

// Raw facade codes, which order Intersection before Tangent (unlike JoinType).
const ARC = 0;
const INTERSECTION = 1;
const TANGENT = 2;

beforeAll(async () => {
  const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
  const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");
  const createModule = (await import(jsPath)).default;
  Module = await createModule({
    locateFile: (path: string) => (path.endsWith(".wasm") ? wasmPath : path),
  });
  kernel = new Module.OcctKernel();
  const mod = await import(resolve(__dirname, "../ts/src/index.ts"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wrapper = new (mod.OcctKernel as any)(Module);
  JoinType = mod.JoinType;
}, 30_000);

afterEach(() => {
  kernel.releaseAll();
  wrapper.releaseAll();
});

afterAll(() => {
  kernel.releaseAll();
  kernel.delete();
  wrapper[Symbol.dispose]();
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

describe("TS wrapper joinType", () => {
  function wrapperLPrism(): number {
    const a = wrapper.makeBox(20, 10, 10);
    const b = wrapper.makeBox(10, 20, 10);
    return wrapper.unifySameDomain(wrapper.fuse(a, b));
  }

  function wrapperSurfaceTypes(shape: number): string[] {
    return wrapper.getSubShapes(shape, "face").map((f: number) => wrapper.surfaceType(f));
  }

  it("maps JoinType.Intersection onto the facade's raw code", () => {
    const sharpOffset = wrapper.offset(wrapperLPrism(), -2, 1e-6, JoinType.Intersection);
    expect(wrapperSurfaceTypes(sharpOffset).every((type) => type === "plane")).toBe(true);

    const solid = wrapperLPrism();
    const top = wrapper
      .getSubShapes(solid, "face")
      .find((f: number) => {
        const bb = wrapper.getBoundingBox(f);
        return bb.zmin > 9.99 && bb.zmax < 10.01;
      });
    const sharpShell = wrapper.shell(solid, [top], 2, 1e-6, JoinType.Intersection);
    expect(wrapperSurfaceTypes(sharpShell).every((type) => type === "plane")).toBe(true);
  });

  it("defaults to Arc", () => {
    const rounded = wrapper.offset(wrapperLPrism(), -2, 1e-6);
    expect(wrapperSurfaceTypes(rounded)).toContain("cylinder");
  });

  /**
   * A flat triangle, base 20 and height 3, in the XY plane. Its acute corners
   * tell Intersection from Tangent: offset outward, Intersection gives a larger
   * sharp triangle, while raw Tangent (2) comes back without a single edge.
   */
  const triangle = [
    { x: 0, y: 0, z: 0 },
    { x: 20, y: 0, z: 0 },
    { x: 10, y: 3, z: 0 },
  ];
  const triangleArea = (20 * 3) / 2;
  const triangleInradius = triangleArea / ((20 + 2 * Math.hypot(10, 3)) / 2);

  function wrapperTriangleWire(): number {
    return wrapper.makeWire(triangle.map((start, i) => wrapper.makeLineEdge(start, triangle[(i + 1) % 3])));
  }

  function wrapperCurveTypes(shape: number): string[] {
    return wrapper.getSubShapes(shape, "edge").map((e: number) => wrapper.curveType(e));
  }

  it("maps JoinType.Intersection onto the facade's raw code in offsetWire2D", () => {
    // Offset outward by 2 with sharp corners, the triangle grows about its
    // incentre: every length scales by (r + 2) / r.
    const sharp = wrapper.offsetWire2D(wrapperTriangleWire(), 2, JoinType.Intersection);
    expect(wrapperCurveTypes(sharp)).toEqual(["line", "line", "line"]);
    const scale = (triangleInradius + 2) / triangleInradius;
    expect(wrapper.getSurfaceArea(wrapper.makeFace(sharp))).toBeCloseTo(triangleArea * scale * scale, 2);
  });

  it("keeps Arc as the default in offsetWire2D", () => {
    const rounded = wrapper.offsetWire2D(wrapperTriangleWire(), 2);
    expect(wrapperCurveTypes(rounded)).toContain("circle");
  });
});

describe("*WithHistory joinType", () => {
  const BOUND = 1_000_000;

  function wrapperLPrism(): number {
    const a = wrapper.makeBox(20, 10, 10);
    const b = wrapper.makeBox(10, 20, 10);
    return wrapper.unifySameDomain(wrapper.fuse(a, b));
  }

  function wrapperSurfaceTypes(shape: number): string[] {
    return wrapper.getSubShapes(shape, "face").map((f: number) => wrapper.surfaceType(f));
  }

  function faceHashes(shape: number): number[] {
    return wrapper.getSubShapes(shape, "face").map((f: number) => wrapper.hashCode(f, BOUND));
  }

  function wrapperTopFace(shape: number): number {
    return wrapper.getSubShapes(shape, "face").find((f: number) => {
      const bb = wrapper.getBoundingBox(f);
      return bb.zmin > 9.99 && bb.zmax < 10.01;
    });
  }

  it("offsetWithHistory keeps the concave edge sharp and tracks faces", () => {
    const solid = wrapperLPrism();
    const evo = wrapper.offsetWithHistory(solid, -2, 1e-6, faceHashes(solid), BOUND, JoinType.Intersection);
    expect(wrapperSurfaceTypes(evo.result).every((type) => type === "plane")).toBe(true);
    // BRepOffsetAPI_MakeOffsetShape reports offset faces as Generated, whatever the join.
    expect(evo.generated.length).toBeGreaterThan(0);

    const plain = wrapper.offset(wrapperLPrism(), -2, 1e-6, JoinType.Intersection);
    expect(wrapper.getVolume(evo.result)).toBeCloseTo(wrapper.getVolume(plain), 6);
  });

  it("shellWithHistory keeps the inner concave wall sharp and tracks faces", () => {
    const solid = wrapperLPrism();
    const top = wrapperTopFace(solid);
    const evo = wrapper.shellWithHistory(solid, [top], 2, 1e-6, faceHashes(solid), BOUND, JoinType.Intersection);
    expect(wrapper.isValid(evo.result)).toBe(true);
    expect(wrapperSurfaceTypes(evo.result).every((type) => type === "plane")).toBe(true);
    expect(evo.modified.length).toBeGreaterThan(0);

    const plain = wrapper.shell(solid, [top], 2, 1e-6, JoinType.Intersection);
    expect(wrapper.getVolume(evo.result)).toBeCloseTo(wrapper.getVolume(plain), 6);
  });

  it("defaults to Arc", () => {
    const solid = wrapperLPrism();
    const evo = wrapper.offsetWithHistory(solid, -2, 1e-6, faceHashes(solid), BOUND);
    expect(wrapperSurfaceTypes(evo.result)).toContain("cylinder");
  });

  it("raw variants match the plain history methods for Arc and reject Tangent", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resultOf = (evo: any): number => {
      evo.modified.delete();
      evo.generated.delete();
      evo.deleted.delete();
      return evo.resultId;
    };
    const solid = lPrism();
    const hashes = new Module.VectorInt();
    const removed = new Module.VectorUint32();
    removed.push_back(topFace(solid, 10));

    const plainShell = resultOf(kernel.shellWithHistory(solid, removed, 2, 1e-6, hashes, BOUND));
    const arcShell = resultOf(kernel.shellWithHistoryAndJoin(solid, removed, 2, 1e-6, hashes, BOUND, ARC));
    expect(kernel.getVolume(arcShell)).toBeCloseTo(kernel.getVolume(plainShell), 6);

    const plainOffset = resultOf(kernel.offsetWithHistory(solid, -2, 1e-6, hashes, BOUND));
    const arcOffset = resultOf(kernel.offsetWithHistoryAndJoin(solid, -2, 1e-6, hashes, BOUND, ARC));
    expect(kernel.getVolume(arcOffset)).toBeCloseTo(kernel.getVolume(plainOffset), 6);

    expect(() => kernel.shellWithHistoryAndJoin(solid, removed, 2, 1e-6, hashes, BOUND, TANGENT)).toThrow();
    expect(() => kernel.offsetWithHistoryAndJoin(solid, -2, 1e-6, hashes, BOUND, TANGENT)).toThrow();

    removed.delete();
    hashes.delete();
  });
});
