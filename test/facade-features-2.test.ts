/**
 * Tests for the second batch of facade additions: inertia tensor,
 * point-in-solid, binary BREP, clamped B-spline interpolation, project-point-
 * on-edge, relative tessellation, auxiliary-spine sweep, and intersection cells.
 *
 * Constructs the TS wrapper via its private constructor (init() can't run here)
 * to exercise the real shipping methods against real OCCT.
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SweepLaw: any;

beforeAll(async () => {
  const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
  const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");
  const createModule = (await import(jsPath)).default;
  Module = await createModule({
    locateFile: (path: string) => (path.endsWith(".wasm") ? wasmPath : path),
  });
  const mod = await import(resolve(__dirname, "../ts/src/index.ts"));
  SweepMode = mod.SweepMode;
  SweepLaw = mod.SweepLaw;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kernel = new (mod.OcctKernel as any)(Module);
}, 30_000);

afterEach(() => kernel.releaseAll());
afterAll(() => kernel[Symbol.dispose]());

describe("getInertia", () => {
  it("returns a symmetric 3x3 matrix with positive diagonal", () => {
    const box = kernel.makeBox(10, 20, 30);
    const m = kernel.getInertia(box);
    expect(m).toHaveLength(9);
    expect(m[1]).toBeCloseTo(m[3], 6); // symmetric
    expect(m[2]).toBeCloseTo(m[6], 6);
    expect(m[5]).toBeCloseTo(m[7], 6);
    expect(m[0]).toBeGreaterThan(0);
    expect(m[4]).toBeGreaterThan(0);
    expect(m[8]).toBeGreaterThan(0);
  });
});

describe("containsPoint", () => {
  it("classifies points inside vs outside a solid", () => {
    const box = kernel.makeBox(10, 10, 10); // [0,10]^3
    expect(kernel.containsPoint(box, { x: 5, y: 5, z: 5 })).toBe(true);
    expect(kernel.containsPoint(box, { x: 20, y: 5, z: 5 })).toBe(false);
    expect(kernel.containsPoint(box, { x: -1, y: 5, z: 5 })).toBe(false);
  });
});

describe("binary BREP I/O", () => {
  it("round-trips a shape through binary BREP", () => {
    const box = kernel.makeBox(12, 8, 6);
    const bytes = kernel.toBREPBinary(box);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);

    const restored = kernel.fromBREPBinary(bytes);
    expect(kernel.getVolume(restored)).toBeCloseTo(12 * 8 * 6, 3);
  });
});

describe("interpolatePointsWithTangents", () => {
  it("builds an edge through points with clamped end tangents", () => {
    const pts = [
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 5, z: 0 },
      { x: 10, y: 0, z: 0 },
    ];
    const edge = kernel.interpolatePointsWithTangents(
      pts,
      { x: 0, y: 1, z: 0 },
      { x: 0, y: -1, z: 0 },
    );
    expect(kernel.isEdge(edge)).toBe(true);
    expect(kernel.curveLength(edge)).toBeGreaterThan(10);
    // Start tangent should follow the requested +Y direction.
    const t = kernel.curveTangent(edge, kernel.curveParameters(edge).first);
    expect(t.y).toBeGreaterThan(0);
  });
});

describe("projectPointOnEdge", () => {
  it("finds the closest point, tangent, and parameter on a line edge", () => {
    const edge = kernel.makeLineEdge(
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
    );
    const r = kernel.projectPointOnEdge(edge, { x: 5, y: 4, z: 0 });
    expect(r.point.x).toBeCloseTo(5, 6);
    expect(r.point.y).toBeCloseTo(0, 6);
    expect(Math.abs(r.tangent.x)).toBeCloseTo(1, 6);
  });
});

describe("tessellate relative", () => {
  it("produces a valid mesh with scale-independent deflection", () => {
    const sphere = kernel.makeSphere(50);
    const mesh = kernel.tessellate(sphere, {
      linearDeflection: 0.01,
      relative: true,
    });
    expect(mesh.triangleCount).toBeGreaterThan(0);
    expect(mesh.positions.length).toBe(mesh.vertexCount * 3);
  });
});

describe("sweepOriented auxiliary spine", () => {
  it("sweeps with an auxiliary guide wire", () => {
    const profile = kernel.makeWire([
      kernel.makeCircleEdge({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 2),
    ]);
    const spine = kernel.makeWire([
      kernel.makeLineEdge({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 30 }),
    ]);
    const aux = kernel.makeWire([
      kernel.makeLineEdge({ x: 5, y: 0, z: 0 }, { x: 5, y: 0, z: 30 }),
    ]);
    const solid = kernel.sweepOriented(
      profile,
      spine,
      SweepMode.Auxiliary,
      { x: 0, y: 1, z: 0 },
      aux,
    );
    expect(kernel.isValid(solid)).toBe(true);
    expect(kernel.getVolume(solid)).toBeGreaterThan(0);
  });

  // A square swept along a straight spine with a guide parallel to it asks
  // for no rotation at all, so the answer is a prism with six planar faces
  // and an exact volume. Curvilinear equivalence used to be forced on, which
  // approximated two of those faces as B-splines; the error scaled with the
  // model until the sweep failed outright.
  const squarePrism = (f: number) => {
    const h = 2 * f;
    const l = 20 * f;
    const r = 5 * f;
    const corners = [
      { x: -h, y: -h, z: 0 },
      { x: h, y: -h, z: 0 },
      { x: h, y: h, z: 0 },
      { x: -h, y: h, z: 0 },
    ];
    return {
      profile: kernel.makeWire(
        corners.map((c: { x: number; y: number; z: number }, i: number) =>
          kernel.makeLineEdge(c, corners[(i + 1) % corners.length]),
        ),
      ),
      spine: kernel.makeWire([
        kernel.makeLineEdge({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: l }),
      ]),
      guide: kernel.makeWire([
        kernel.makeLineEdge({ x: r, y: 0, z: 0 }, { x: r, y: 0, z: l }),
      ]),
      volume: 2 * h * (2 * h) * l,
    };
  };

  it("keeps planar faces exact for a non-rotating guide", () => {
    const { profile, spine, guide, volume } = squarePrism(1);
    const solid = kernel.sweepOriented(
      profile,
      spine,
      SweepMode.Auxiliary,
      undefined,
      guide,
    );
    const surfaces = kernel
      .getSubShapes(solid, "face")
      .map((f: number) => kernel.surfaceType(f));
    expect(surfaces).toEqual([
      "plane",
      "plane",
      "plane",
      "plane",
      "plane",
      "plane",
    ]);
    expect(Math.abs(kernel.getVolume(solid))).toBeCloseTo(volume, 9);
  });

  it("stays exact as the model scales up", () => {
    for (const f of [2, 10, 100]) {
      const { profile, spine, guide, volume } = squarePrism(f);
      const solid = kernel.sweepOriented(
        profile,
        spine,
        SweepMode.Auxiliary,
        undefined,
        guide,
      );
      expect(Math.abs(kernel.getVolume(solid)) / volume).toBeCloseTo(1, 9);
    }
  });

  it("still offers curvilinear equivalence when asked for it", () => {
    const { profile, spine, guide } = squarePrism(1);
    const solid = kernel.sweepOriented(
      profile,
      spine,
      SweepMode.Auxiliary,
      undefined,
      guide,
      { curvilinearEquivalence: true },
    );
    expect(kernel.isValid(solid)).toBe(true);
    const surfaces = kernel
      .getSubShapes(solid, "face")
      .map((f: number) => kernel.surfaceType(f));
    expect(surfaces.filter((s: string) => s === "bspline").length).toBe(2);
  });

  // A guide that only covers part of the spine leaves some section planes
  // with nothing to intersect. Curvilinear equivalence papers over that and
  // returns a solid roughly half the true volume; the guide-plane path says
  // so instead.
  it("reports a guide that does not span the spine", () => {
    const { profile, spine } = squarePrism(1);
    const shortGuide = kernel.makeWire([
      kernel.makeLineEdge({ x: 5, y: 0, z: 6 }, { x: 5, y: 0, z: 14 }),
    ]);
    expect(() =>
      kernel.sweepOriented(
        profile,
        spine,
        SweepMode.Auxiliary,
        undefined,
        shortGuide,
      ),
    ).toThrow(/does not intersect the guide wire/);
  });

  it("tolerates a guide that overhangs both ends of the spine", () => {
    const { profile, spine, volume } = squarePrism(1);
    const longGuide = kernel.makeWire([
      kernel.makeLineEdge({ x: 5, y: 0, z: -10 }, { x: 5, y: 0, z: 30 }),
    ]);
    const solid = kernel.sweepOriented(
      profile,
      spine,
      SweepMode.Auxiliary,
      undefined,
      longGuide,
    );
    expect(Math.abs(kernel.getVolume(solid))).toBeCloseTo(volume, 9);
  });

  // The point of a guide is to drive rotation, and volume alone can't show
  // that — a square prism has the same volume however much it twists. Measure
  // the section's angular orientation at each end instead.
  it("applies the rotation the guide encodes", () => {
    type Point = { x: number; y: number; z: number };
    const sectionAngleAtZ = (solid: number, z: number) => {
      let best: Point | null = null;
      let bestRadius = -1;
      for (const vertex of kernel.getSubShapes(solid, "vertex")) {
        const p: Point = kernel.vertexPosition(vertex);
        if (Math.abs(p.z - z) > 1e-6) continue;
        const radius = Math.hypot(p.x, p.y);
        if (radius > bestRadius) {
          bestRadius = radius;
          best = p;
        }
      }
      if (!best) throw new Error(`no vertex at z=${z}`);
      return (Math.atan2(best.y, best.x) * 180) / Math.PI;
    };

    const length = 20;
    for (const degrees of [0, 15, 30, 45]) {
      const guidePoints: Point[] = [];
      for (let i = 0; i <= 64; i++) {
        const t = i / 64;
        const a = ((degrees * Math.PI) / 180) * t;
        guidePoints.push({
          x: 5 * Math.cos(a),
          y: 5 * Math.sin(a),
          z: length * t,
        });
      }
      const corners = [
        { x: -2, y: -2, z: 0 },
        { x: 2, y: -2, z: 0 },
        { x: 2, y: 2, z: 0 },
        { x: -2, y: 2, z: 0 },
      ];
      const solid = kernel.sweepOriented(
        kernel.makeWire(
          corners.map((c: Point, i: number) =>
            kernel.makeLineEdge(c, corners[(i + 1) % corners.length]),
          ),
        ),
        kernel.makeWire([
          kernel.makeLineEdge({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: length }),
        ]),
        SweepMode.Auxiliary,
        undefined,
        kernel.makeWire(
          guidePoints
            .slice(0, -1)
            .map((p: Point, i: number) =>
              kernel.makeLineEdge(p, guidePoints[i + 1]),
            ),
        ),
      );
      // The square's 4-fold symmetry means the furthest corner can be a
      // different one at each end, so fold the measurement into a quarter
      // turn. Every angle tested is under 45 degrees, so this is exact.
      let rotation = sectionAngleAtZ(solid, length) - sectionAngleAtZ(solid, 0);
      while (rotation > 45) rotation -= 90;
      while (rotation < -45) rotation += 90;
      expect(rotation).toBeCloseTo(degrees, 6);
      kernel.releaseAll();
    }
  });

  it("rejects an out-of-range contact mode", () => {
    const { profile, spine, guide } = squarePrism(1);
    expect(() =>
      kernel.sweepOriented(
        profile,
        spine,
        SweepMode.Auxiliary,
        undefined,
        guide,
        {
          contact: 7,
        },
      ),
    ).toThrow(/contact mode/);
  });
});

describe("sweepAdvanced profile placement", () => {
  // A circle of radius 2 centred 10 units off a straight Z spine.
  const straight = (options: Record<string, unknown>) => {
    const profile = kernel.makeWire([
      kernel.makeCircleEdge({ x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 2),
    ]);
    const spine = kernel.makeWire([
      kernel.makeLineEdge({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 20 }),
    ]);
    return kernel.sweepAdvanced(profile, spine, options);
  };

  // Translating a profile along a straight spine does not change the volume,
  // so volume cannot tell contact from no-contact — assert where the tube
  // actually sits instead.
  it("leaves the profile where the caller placed it by default", () => {
    const bb = kernel.getBoundingBox(straight({}), false);
    expect(bb.xmin).toBeCloseTo(8, 6);
    expect(bb.xmax).toBeCloseTo(12, 6);
  });

  it("withContact translates the profile until it touches the spine", () => {
    const bb = kernel.getBoundingBox(straight({ withContact: true }), false);
    // The circle moves in until its near edge meets the spine, so the centre
    // lands one radius out rather than on the axis.
    expect(bb.xmin).toBeCloseTo(0, 6);
    expect(bb.xmax).toBeCloseTo(4, 6);
  });

  const tilted = (options: Record<string, unknown>) => {
    const profile = kernel.makeWire([
      kernel.makeCircleEdge({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 2),
    ]);
    const spine = kernel.makeWire([
      kernel.makeLineEdge({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 20 }),
    ]);
    return kernel.sweepAdvanced(profile, spine, options);
  };

  // Correction rotates the section orthogonal to the spine tangent, turning
  // the swept cross-section back into a true circle. The volume then follows
  // the spine length instead of its Z extent.
  it("withCorrection reorients the section on a tilted spine", () => {
    expect(kernel.getVolume(tilted({}))).toBeCloseTo(Math.PI * 4 * 20, 3);
    expect(kernel.getVolume(tilted({ withCorrection: true }))).toBeCloseTo(
      Math.PI * 4 * Math.hypot(10, 20),
      3,
    );
  });

  it("accepts explicit tolerances", () => {
    const solid = straight({ tol3d: 1e-2, boundTol: 1e-2, tolAngular: 1e-1 });
    expect(kernel.isValid(solid)).toBe(true);
    expect(kernel.getVolume(solid)).toBeCloseTo(Math.PI * 4 * 20, 3);
  });
});

describe("sweepAdvanced parity with the narrower entry points", () => {
  const profile = () =>
    kernel.makeWire([kernel.makeCircleEdge({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 2)]);
  const spine = () =>
    kernel.makeWire([kernel.makeLineEdge({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 20 })]);

  // Defaults must reproduce sweepPipeShell(freenet=false, smooth=false), so
  // callers can migrate without the geometry shifting under them.
  it("matches sweepPipeShell at its defaults", () => {
    const viaOld = kernel.sweepPipeShell(profile(), spine(), false, false);
    const viaNew = kernel.sweepAdvanced(profile(), spine());
    expect(kernel.getVolume(viaNew)).toBeCloseTo(kernel.getVolume(viaOld), 9);
  });

  it("drives an auxiliary guide like sweepOriented", () => {
    const aux = () =>
      kernel.makeWire([kernel.makeLineEdge({ x: 5, y: 0, z: 0 }, { x: 5, y: 0, z: 20 })]);
    const viaOld = kernel.sweepOriented(
      profile(),
      spine(),
      SweepMode.Auxiliary,
      { x: 0, y: 1, z: 0 },
      aux(),
    );
    const viaNew = kernel.sweepAdvanced(profile(), spine(), {
      mode: SweepMode.Auxiliary,
      up: { x: 0, y: 1, z: 0 },
      auxSpine: aux(),
    });
    expect(kernel.getVolume(viaNew)).toBeCloseTo(kernel.getVolume(viaOld), 9);
  });

  it("rejects an out-of-range transition mode", () => {
    expect(() => kernel.sweepAdvanced(profile(), spine(), { transitionMode: 7 })).toThrow(
      /transition mode/,
    );
  });
});

describe("sweepFull", () => {
  const profile = () =>
    kernel.makeWire([kernel.makeCircleEdge({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 5)]);
  const spine = () =>
    kernel.makeWire([kernel.makeLineEdge({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 })]);

  // Defaults must reproduce sweepAdvanced's, so callers can migrate without
  // the geometry shifting under them.
  it("matches sweepAdvanced at its defaults", () => {
    const viaOld = kernel.sweepAdvanced(profile(), spine());
    const viaNew = kernel.sweepFull(profile(), spine());
    expect(kernel.getVolume(viaNew)).toBeCloseTo(kernel.getVolume(viaOld), 9);
  });

  // A scaling law is the whole reason this entry point exists: without it the
  // sweep is a plain prism whatever endFactor says. r=5 over length 10 gives
  // pi*25*10 unscaled; a linear law to 2 sweeps a cone frustum instead, whose
  // volume is pi*h*(r^2 + r*R + R^2)/3 with R = 2r.
  it("scales the section along a linear law", () => {
    const plain = kernel.getVolume(kernel.sweepFull(profile(), spine()));
    expect(plain).toBeCloseTo(Math.PI * 25 * 10, 3);

    const scaled = kernel.getVolume(
      kernel.sweepFull(profile(), spine(), {
        law: SweepLaw.Linear,
        lawLength: 10,
        lawEndFactor: 2,
      }),
    );
    expect(scaled).toBeCloseTo((Math.PI * 10 * (25 + 50 + 100)) / 3, 2);
  });

  it("shrinks the section when the law ends below 1", () => {
    const shrunk = kernel.getVolume(
      kernel.sweepFull(profile(), spine(), {
        law: SweepLaw.Linear,
        lawLength: 10,
        lawEndFactor: 0.5,
      }),
    );
    // Same frustum formula with R = r/2.
    expect(shrunk).toBeCloseTo((Math.PI * 10 * (25 + 12.5 + 6.25)) / 3, 2);
  });

  it("applies an s-curve law", () => {
    const s = kernel.getVolume(
      kernel.sweepFull(profile(), spine(), {
        law: SweepLaw.SCurve,
        lawLength: 10,
        lawEndFactor: 2,
      }),
    );
    // Zero end derivatives make the S law linger near both end radii rather
    // than sweeping evenly between them. Volume integrates r^2, which is
    // convex, so weighting the extremes sweeps MORE than the linear ramp to
    // the same end factor: (1+4)/2 > 1.5^2.
    const linear = (Math.PI * 10 * (25 + 50 + 100)) / 3;
    expect(s).toBeGreaterThan(linear);
    expect(s).toBeLessThan(Math.PI * 10 * 25 * 2.5);
  });

  it("honours the approximation budget", () => {
    const solid = kernel.sweepFull(profile(), spine(), { maxDegree: 3, maxSegments: 5 });
    expect(kernel.isValid(solid)).toBe(true);
    expect(kernel.getVolume(solid)).toBeCloseTo(Math.PI * 25 * 10, 3);
  });

  it("requires lawLength when a law is set", () => {
    expect(() => kernel.sweepFull(profile(), spine(), { law: SweepLaw.Linear })).toThrow(
      /lawLength/,
    );
  });

  // A planar support over a straight spine yields the same frame the default
  // mode already picks, so the swept volume is unchanged by design — this
  // asserts the support is accepted and drives a valid sweep, not that it
  // moves the geometry. A support only redirects the frame when the surface
  // curves away from it.
  it("accepts a spine support surface", () => {
    const corners = [
      { x: -5, y: 0, z: 0 },
      { x: 5, y: 0, z: 0 },
      { x: 5, y: 0, z: 10 },
      { x: -5, y: 0, z: 10 },
    ];
    const supportFace = kernel.makeFace(
      kernel.makeWire(
        corners.map((c: { x: number; y: number; z: number }, i: number) =>
          kernel.makeLineEdge(c, corners[(i + 1) % corners.length]),
        ),
      ),
    );
    const solid = kernel.sweepFull(profile(), spine(), { support: supportFace });
    expect(kernel.isValid(solid)).toBe(true);
    expect(kernel.getVolume(solid)).toBeCloseTo(Math.PI * 25 * 10, 3);
  });
});

describe("intersectionCells", () => {
  it("extracts the overlap region of two boxes", () => {
    const a = kernel.makeBox(10, 10, 10); // [0,10]^3
    const b = kernel.translate(kernel.makeBox(10, 10, 10), 5, 5, 5); // [5,15]^3
    const overlap = kernel.intersectionCells([a, b]);
    // Overlap is [5,10]^3 = 125.
    expect(kernel.getVolume(overlap)).toBeCloseTo(125, 2);
  });
});

describe("makeHelixWireHanded", () => {
  const ORIGIN = { x: 0, y: 0, z: 0 };
  const AXIS = { x: 0, y: 0, z: 1 };
  const PITCH = 5;
  const HEIGHT = 5; // exactly one turn
  const RADIUS = 3;

  // Fractional sampling of the wire: the pcurve is linear in the cylinder's
  // angle, so frac maps straight onto the turn (0.25 -> a quarter turn).
  function sample(wire: number, frac: number) {
    const { first, last } = kernel.curveParameters(wire);
    return kernel.curvePointAtParam(wire, first + (last - first) * frac);
  }

  function helix(leftHanded: boolean) {
    return kernel.makeHelixWireHanded(ORIGIN, AXIS, PITCH, HEIGHT, RADIUS, leftHanded);
  }

  it("winds the opposite way for left-handed", () => {
    // A quarter turn up a right-handed helix lands on +Y, a left-handed one
    // on -Y. Both have climbed a quarter of the pitch.
    const right = sample(helix(false), 0.25);
    const left = sample(helix(true), 0.25);
    expect(right.x).toBeCloseTo(0, 6);
    expect(right.y).toBeCloseTo(RADIUS, 6);
    expect(left.x).toBeCloseTo(0, 6);
    expect(left.y).toBeCloseTo(-RADIUS, 6);
    expect(left.z).toBeCloseTo(right.z, 6);
    expect(right.z).toBeCloseTo(PITCH / 4, 6);
  });

  it("mirrors across the axis plane without changing pitch, height or radius", () => {
    const right = helix(false);
    const left = helix(true);
    for (const frac of [0, 0.1, 0.375, 0.6, 0.9, 1]) {
      const r = sample(right, frac);
      const l = sample(left, frac);
      expect(l.x).toBeCloseTo(r.x, 6);
      expect(l.y).toBeCloseTo(-r.y, 6);
      expect(l.z).toBeCloseTo(r.z, 6);
    }
    expect(kernel.curveLength(left)).toBeCloseTo(kernel.curveLength(right), 6);
    // One turn of radius 3 over a pitch of 5.
    expect(kernel.curveLength(right)).toBeCloseTo(
      Math.hypot(2 * Math.PI * RADIUS, PITCH),
      3,
    );
  });

  it("matches makeHelixWire when right-handed", () => {
    const handed = helix(false);
    const plain = kernel.makeHelixWire(ORIGIN, AXIS, PITCH, HEIGHT, RADIUS);
    for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
      const h = sample(handed, frac);
      const p = sample(plain, frac);
      expect(h.x).toBeCloseTo(p.x, 9);
      expect(h.y).toBeCloseTo(p.y, 9);
      expect(h.z).toBeCloseTo(p.z, 9);
    }
  });

  it("sweeps a profile into a valid solid either way", () => {
    for (const leftHanded of [false, true]) {
      const spine = helix(leftHanded);
      const profile = kernel.makeWire([
        kernel.makeCircleEdge({ x: RADIUS, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 0.5),
      ]);
      const solid = kernel.sweepPipeShell(profile, spine, true, true);
      expect(kernel.isValid(solid)).toBe(true);
      expect(kernel.getVolume(solid)).toBeGreaterThan(0);
    }
  });

  // Both helices carry a 3D curve, not just the pcurve on the cylinder. A
  // spine without one drives every sweep into a bare failure.
  it("sweeps along the plain makeHelixWire too", () => {
    const spine = kernel.makeHelixWire(ORIGIN, AXIS, PITCH, HEIGHT, RADIUS);
    const profile = kernel.makeWire([
      kernel.makeCircleEdge({ x: RADIUS, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 0.5),
    ]);
    const solid = kernel.sweepPipeShell(profile, spine, true, true);
    expect(kernel.isValid(solid)).toBe(true);
    expect(kernel.getVolume(solid)).toBeGreaterThan(0);
  });
});
