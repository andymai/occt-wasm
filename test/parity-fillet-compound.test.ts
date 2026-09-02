/**
 * Regression test for chained fillet/chamfer.
 *
 * `BRepFilletAPI_MakeFillet::Shape()` and `MakeChamfer::Shape()` return a
 * `TopoDS_Compound` even when the input was a single solid and the result is
 * a single solid. The facade stored that compound as-is, so the *next*
 * fillet/chamfer — which downcasts its input with `TopoDS::Solid(...)` —
 * failed with `Standard_TypeMismatch`, surfacing as a WASM trap
 * (`fillet: TopoDS::Solid`). Every fillet was therefore a one-shot: chaining
 * two of them, the ordinary way to break a sharp edge and then soften the
 * result, could not work at all.
 *
 * OCP's direct pybind11 binding has no facade in between, so the same OCCT
 * call chains there; the divergence was ours, not OCCT's.
 *
 * The facade now unwraps a compound holding exactly one solid before storing
 * it. A compound holding several solids is left alone, so nothing that
 * legitimately produces multiple solids is flattened.
 *
 * Note that this is about the *result* type. Passing a compound *in* — a
 * boolean result, say — is still rejected by the `TopoDS::Solid` downcast,
 * which is what the error-decoding tests in new-features.test.ts rely on.
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

/** Fillet or chamfer `solidId` on the first `count` edges. */
function edgeOp(op: "fillet" | "chamfer", solidId: number, count: number, value: number): number {
  const edges = kernel.getSubShapes(solidId, "edge");
  const vec = new Module.VectorUint32();
  for (let i = 0; i < count && i < edges.size(); i++) vec.push_back(edges.get(i));
  edges.delete();
  try {
    return kernel[op](solidId, vec, value);
  } finally {
    vec.delete();
  }
}

describe("fillet/chamfer results stay solids", () => {
  it("returns a solid, not the compound OCCT wraps it in", () => {
    const box = kernel.makeBox(20, 20, 20);
    expect(kernel.getShapeType(edgeOp("fillet", box, 1, 1))).toBe("solid");
    expect(kernel.getShapeType(edgeOp("chamfer", box, 1, 1))).toBe("solid");
  });

  it("chains fillet into fillet", () => {
    const box = kernel.makeBox(20, 20, 20);
    const once = edgeOp("fillet", box, 1, 1);
    const twice = edgeOp("fillet", once, 1, 0.5);

    expect(kernel.getShapeType(twice)).toBe("solid");
    // A rounded edge removes material, so each pass shrinks the volume.
    expect(kernel.getVolume(twice)).toBeLessThan(kernel.getVolume(once));
    expect(kernel.getVolume(once)).toBeLessThan(kernel.getVolume(box));
  });

  it("chains chamfer into fillet", () => {
    const box = kernel.makeBox(20, 20, 20);
    const chamfered = edgeOp("chamfer", box, 1, 1);
    const filleted = edgeOp("fillet", chamfered, 1, 0.5);

    expect(kernel.getShapeType(filleted)).toBe("solid");
    expect(kernel.getVolume(filleted)).toBeLessThan(kernel.getVolume(chamfered));
  });

  it("still rejects a compound passed in", () => {
    // A boolean result is a compound; the TopoDS::Solid downcast rejects it.
    // Unwrapping the result must not have loosened the input contract.
    const fused = kernel.fuse(kernel.makeBox(20, 20, 20), kernel.makeCylinder(8, 30));
    expect(kernel.getShapeType(fused)).toBe("compound");
    expect(() => edgeOp("fillet", fused, 1, 1)).toThrow();
  });
});
