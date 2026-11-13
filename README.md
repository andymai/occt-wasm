<div align="center">

# occt-wasm

[![npm](https://img.shields.io/npm/v/occt-wasm)](https://www.npmjs.com/package/occt-wasm)
[![Crates.io](https://img.shields.io/crates/v/occt-wasm.svg)](https://crates.io/crates/occt-wasm)
[![CI](https://github.com/andymai/occt-wasm/actions/workflows/ci.yml/badge.svg)](https://github.com/andymai/occt-wasm/actions/workflows/ci.yml)
[![Last release](https://img.shields.io/github/release-date/andymai/occt-wasm?label=last%20release)](https://github.com/andymai/occt-wasm/releases)
[![Commit activity](https://img.shields.io/github/commit-activity/m/andymai/occt-wasm?label=commits%2Fmonth)](https://github.com/andymai/occt-wasm/commits/main)
[![License](https://img.shields.io/badge/tooling-MIT%20OR%20Apache--2.0-blue.svg)](#license) [![WASM License](https://img.shields.io/badge/wasm%20output-LGPL--2.1--only-blue.svg)](#license)

[OpenCascade](https://github.com/Open-Cascade-SAS/OCCT) (OCCT) V8 compiled to WebAssembly, with a TypeScript API and Web Worker support.

The module is about 4.5 MB with brotli. The API uses branded types and arena-based memory.

</div>

> **Do you need a higher-level CAD library?** [brepjs](https://github.com/andymai/brepjs) builds on occt-wasm, its default kernel, and adds an API for parametric models, sketches, and production CAD applications. Use occt-wasm directly when you need full control over OCCT operations.

## Highlights

- **~4.5 MB brotli**: the module is about half the size of opencascade.js.
- **170+ methods**: the API covers primitives, booleans, sweeps, XCAF assemblies, curves, surfaces, STEP/STL/glTF/BREP I/O, topology, and shape evolution history.
- **Arena-based API**: shapes are u32 handles. You do not call `.delete()` by hand, and the API supports `Symbol.dispose`.
- **TypeScript types**: `ShapeHandle` is a branded type. Shapes, surfaces, and curves have union types, and methods return structured values.
- **Structured errors**: use the `OcctErrorCode` enum in a `switch/case`. You do not need to parse the error message.
- **Web Worker support**: the `OcctWorker` class runs CAD operations off the main thread through [Comlink](https://github.com/GoogleChromeLabs/comlink).
- **Browser targets**: the build uses WASM SIMD, tail calls, and wasm-exceptions.

## Scope

This library deliberately does not:

- **Provide a higher-level CAD modeling API.** Parametric sketches, constraints, and feature trees belong in [brepjs](https://github.com/andymai/brepjs), which wraps occt-wasm for that purpose.
- **Manage memory automatically beyond arena handles.** A shape stays in memory until you call `release()` or dispose of the kernel. There is no per-shape garbage collection.
- **Support browsers without WASM SIMD.** The build requires WASM SIMD (baseline `-msimd128`), tail calls, and wasm exceptions. Thus it needs a recent engine (see [Browser Compatibility](#browser-compatibility)). The build intentionally does not use relaxed SIMD. Some Safari and iOS WebKit builds fail to compile relaxed-SIMD modules, and relaxed SIMD made geometry non-reproducible across CPUs.
- **Include OCCT visualization or display modules.** The build excludes TKV3d, TKHLR (except the HLR facade), and the AIS interactive context. Bring your own renderer, for example Three.js or Babylon.js.
- **Support IGES import/export.** The build does not link TKDEIGES. Use STEP for interchange.

## Install

```bash
npm install occt-wasm
```

## Quick Start

```typescript check
import { OcctKernel } from "occt-wasm";

// Recommended: deterministic cleanup via Symbol.dispose
{
  using kernel = await OcctKernel.init();

  // Primitives
  const box = kernel.makeBox(20, 20, 20);
  const cyl = kernel.makeCylinder(8, 30);

  // Modeling -- fillet takes a solid, so round the box before combining
  const edges = kernel.getSubShapes(box, "edge");
  const filleted = kernel.fillet(box, edges.slice(0, 4), 2.0);

  // Booleans
  const fused = kernel.fuse(filleted, cyl);

  // Tessellation -> Three.js / Babylon.js
  const mesh = kernel.tessellate(fused);
  // mesh.positions (Float32Array), mesh.normals, mesh.indices

  // Edge overlay that shares vertices with that mesh (falls back to
  // curve sampling for edges that were never meshed)
  const outline = kernel.wireframe(fused, { source: "triangulation" });

  // STEP I/O
  const step = kernel.exportStep(fused);
  const reimported = kernel.importStep(step);

  // Query
  const vol = kernel.getVolume(fused);
  const bbox = kernel.getBoundingBox(fused);
  const com = kernel.getCenterOfMass(fused);

  // kernel is disposed at end of block
}
```

> **Boolean results are compounds.** OCCT's `BRepAlgoAPI` operations wrap their
> output in a `TopoDS_Compound`. A boolean can produce several disjoint solids.
> The operations that downcast to a solid (`fillet`, `chamfer`, `filletVariable`,
> `filletBatch`, `healSolid`) reject a compound, so unwrap it first:
>
> ```typescript check kernel,fused
> const [solid] = kernel.getSubShapes(fused, "solid");
> if (!solid) throw new Error("boolean produced no solid");
> ```
>
> **Not every edge is filletable.** Seam and degenerate edges are not filletable.
> On a shape that you did not build yourself, select edges by geometry, not by
> index. The `slice(0, 4)` above is safe only because all 12 edges of a plain box
> take a fillet. On the box-plus-cylinder fusion, only 13 of 20 edges do.

## Rust Crate

The same OCCT WASM is available as a [Rust crate](https://crates.io/crates/occt-wasm) for native targets (servers, CLIs, build scripts). It does not need a C++ toolchain:

```toml
[dependencies]
occt-wasm = "7"
```

```rust
use occt_wasm::OcctKernel;

let mut kernel = OcctKernel::new()?;
let box_shape = kernel.make_box(10.0, 20.0, 30.0)?;
let sphere = kernel.make_sphere(8.0)?;
let fused = kernel.fuse(box_shape, sphere)?;
let mesh = kernel.tessellate(fused, 0.1, 0.5)?;
let step = kernel.export_step(fused)?;
```

The crate embeds a brotli-compressed WASM binary (~4.7 MB) and runs it with [wasmtime](https://wasmtime.dev/). It has the same 170+ facade methods as the TypeScript API. See [`crate/README.md`](./crate/README.md) and [docs.rs/occt-wasm](https://docs.rs/occt-wasm) for full details.

## Initialization

By default, `OcctKernel.init()` finds the `.wasm` file next to the JS module. You can also give explicit paths or pre-loaded binaries:

```typescript check
import { OcctKernel } from "occt-wasm";

// Auto-detect (browser, Node.js, or Worker):
const kernel = await OcctKernel.init();

// ...or point at an explicit URL / path:
await OcctKernel.init({ wasm: "/assets/occt-wasm.wasm" });

// ...or hand over a pre-fetched binary, skipping the fetch:
const binary = await fetch("/occt-wasm.wasm").then((r) => r.arrayBuffer());
await OcctKernel.init({ wasm: binary });
await OcctKernel.init({ wasm: new Uint8Array(binary) });

// ...or pass the Emscripten glue you loaded yourself, for hosts where init()'s
// own import of ./occt-wasm.js cannot resolve (e.g. a bundled Web Worker):
const glueUrl: string = "/occt/occt-wasm.js";
const { default: createModule } = await import(/* webpackIgnore: true */ glueUrl);
await OcctKernel.init({ createModule, wasm: "/occt/occt-wasm.wasm" });
```

## Error Handling

Each error is an instance of `OcctError`, with a structured `code` field that your code can read:

```typescript check kernel,a,b
import { OcctError, OcctErrorCode } from "occt-wasm";

try {
  kernel.fuse(a, b);
} catch (e) {
  if (e instanceof OcctError) {
    switch (e.code) {
      case OcctErrorCode.BooleanFailed:
        // retry with simpler geometry
        break;
      case OcctErrorCode.InvalidShapeId:
        // shape was already released
        break;
      case OcctErrorCode.KernelError:
        // OCCT internal error (Standard_Failure)
        console.error(e.message);
        break;
    }
  }
}
```

The error codes are:

| Code                 | When                                            |
| -------------------- | ----------------------------------------------- |
| `ConstructionFailed` | `Build()`/`IsDone()` returned false             |
| `BooleanFailed`      | Boolean operation (fuse/cut/common/etc.) failed |
| `InvalidShapeId`     | Shape ID not found in the arena                 |
| `InvalidLabelId`     | XCAF label ID not found                         |
| `TessellationFailed` | Meshing operation failed                        |
| `ImportExportFailed` | STEP/STL/BREP I/O error                         |
| `HealingFailed`      | Shape repair failed                             |
| `DocumentClosed`     | Operation on a closed XCAF document             |
| `KernelError`        | OCCT `Standard_Failure` (unclassified)          |
| `Unknown`            | Error from outside the kernel                   |

When OCCT cannot build a fillet or chamfer, the error also has a `faultyEdges` field. It lists the edges, as you passed them in, whose contour failed. The raw message has the same list as a ` [faulty edges: 3,7]` suffix.

```typescript check kernel,a
import { OcctError } from "occt-wasm";

const edges = kernel.getSubShapes(a, "edge");
try {
  kernel.fillet(a, edges, 3);
} catch (e) {
  if (e instanceof OcctError && e.faultyEdges) {
    // retry without e.faultyEdges, or with a smaller radius on them
  }
}
```

> **`OcctWorker` is the exception.** Comlink serializes a thrown error down to
> `{ message, name, stack }`. Thus an error that crosses the worker boundary
> arrives as a plain `Error`. The message survives intact, but `code`,
> `operation`, and `instanceof OcctError` do not. Match on `e.message` there, or
> do the `switch (e.code)` inside the worker.

## Named Enums

Sweep, offset, and boolean operations use named enums instead of opaque numbers:

```typescript check kernel,profile,spine,wire,shape,face,base,tool1,tool2
import { TransitionMode, JoinType, BooleanOp, BooleanGlue } from "occt-wasm";

// Sweep with round-corner transitions
kernel.sweep(profile, spine, TransitionMode.RoundCorner);

// Offset wire with arc joins
kernel.offsetWire2D(wire, 2.0, JoinType.Arc);

// Hollow a solid through one face; Intersection keeps the inner corners
// at concave edges sharp where Arc would round them
kernel.shell(shape, [face], 2.0, 1e-6, JoinType.Intersection);

// Boolean pipeline
kernel.booleanPipeline(base, [BooleanOp.Cut, BooleanOp.Fuse], [tool1, tool2]);

// One boolean against several tools, glued where the operands share faces
kernel.booleanOp(BooleanOp.Fuse, [base], [tool1, tool2], { glue: BooleanGlue.Shift });
```

These operations still accept numeric values (0, 1, 2) for backwards compatibility.

## Type Predicates

These convenience methods tell you whether a shape is a solid, face, edge, wire, vertex, shell, or compound:

```typescript check kernel,shape
if (kernel.isSolid(shape)) {
  /* ... */
}
if (kernel.isFace(shape)) {
  /* ... */
}
if (kernel.isEdge(shape)) {
  /* ... */
}
if (kernel.isWire(shape)) {
  /* ... */
}
if (kernel.isVertex(shape)) {
  /* ... */
}
if (kernel.isShell(shape)) {
  /* ... */
}
if (kernel.isCompound(shape)) {
  /* ... */
}
```

## Web Workers

For browser apps, heavy CAD operations can block the main thread. `OcctWorker` runs a full kernel in a Web Worker with the same API:

```typescript check edge
import { OcctWorker } from "occt-wasm/worker";

// Spawn a worker with its own kernel
const worker = await OcctWorker.spawn({ wasm: "/occt-wasm.wasm" });

// Same API, every call returns a Promise
const box = await worker.makeBox(10, 20, 30);
const cyl = await worker.makeCylinder(5, 40);
const fused = await worker.fuse(box, cyl);
const mesh = await worker.tessellate(fused);
console.log(`${mesh.triangleCount} triangles`);

// Access the full kernel via .kernel for less common methods
const nurbs = await worker.kernel.getNurbsCurveData(edge);

// Clean up
worker.terminate();
```

The worker helper uses [Comlink](https://github.com/GoogleChromeLabs/comlink) (~1.2 KB gzipped) for transparent RPC. Each worker has its own WASM instance and arena, so shape handles are local to the worker.

## XCAF Assemblies

Create assembly documents with colors, names, and component hierarchies. Colors are sRGB components in [0, 1], as in CSS (`#808080` is `128 / 255`). Names can be any Unicode text:

```typescript check kernel,box,gear,stepData
// Factory method auto-injects Emscripten FS for glTF export
const doc = kernel.createXCAFDocument();

const housing = doc.addShape(box, { name: "housing", color: [0.8, 0.2, 0.1] });
doc.addChild(housing, gear, {
  name: "gear-1",
  location: { tx: 10, tz: 5 },
  color: [0.5, 0.5, 0.5],
});

// Export
const step = doc.exportSTEP(); // preserves colors/names
const stepInches = doc.exportSTEP({ unit: "inch" }); // same geometry, written in inches
const stepAp242 = doc.exportSTEP({ schema: "AP242" }); // AP203, AP214 (default) or AP242
const glb = doc.exportGLTF(); // binary glTF (.glb) bytes
doc.close();

// Import with preserved metadata
const imported = kernel.importXCAFFromSTEP(stepData);
```

In an imported assembly, each component is a placed reference to a prototype label (a part or sub-assembly). To walk the assembly, resolve each component with `getReferredLabel` to reach the name, named sub-shapes, and children of the prototype. To author the same structure, add a compound with `doc.addShape(compound, { assembly: true })`.

```typescript check doc
import type { LabelTag } from "occt-wasm";

function walk(label: LabelTag, depth = 0): void {
  const info = doc.getLabelInfo(label);
  console.log(`${"  ".repeat(depth)}${info.name}`);
  const proto = doc.getReferredLabel(label) ?? label;
  for (const sub of doc.getSubShapes(proto)) {
    console.log(`${"  ".repeat(depth + 1)}(${doc.getLabelInfo(sub).name})`);
  }
  for (const child of doc.getChildren(proto)) walk(child, depth + 1);
}
for (const root of doc.getRoots()) walk(root);
```

`getLocation(label)` returns the placement of a component as a 3x4 matrix, in the layout that `kernel.transform` accepts. Thus you can tessellate the geometry of a prototype once and instance it for each component.

## Bundler Configuration

### Vite

```typescript
// vite.config.ts
export default defineConfig({
  optimizeDeps: {
    exclude: ["occt-wasm"], // Don't pre-bundle WASM
  },
  build: {
    target: "esnext", // Required for WASM features
  },
});
```

### Webpack 5

```javascript
// webpack.config.js
module.exports = {
  experiments: { asyncWebAssembly: true },
  module: {
    rules: [{ test: /\.wasm$/, type: "asset/resource" }],
  },
};
```

Webpack bundles the Emscripten glue and emits `occt-wasm.wasm` as a hashed
asset. It also rewrites the URL that the glue loads the binary from. You do not
need a manual copy step, and `OcctKernel.init()` finds the binary without a
`wasm` option.

### Next.js

Next.js needs no configuration, with Turbopack or with webpack. Both emit the
`.wasm` into `_next/static` and rewrite the URL. Initialize the kernel from a
client component (`"use client"`), so that it loads in the browser and not
during SSR:

```javascript
"use client";
import { useEffect } from "react";

export default function Viewer() {
  useEffect(() => {
    (async () => {
      const { OcctKernel } = await import("occt-wasm");
      const kernel = await OcctKernel.init();
      // ...
    })();
  }, []);
}
```

### Node.js

```typescript check
// Works out of the box with Node.js 18+
import { OcctKernel } from "occt-wasm";
const kernel = await OcctKernel.init();
```

## API Reference

To generate the full docs locally, run `cd ts && npm run docs` (TypeDoc output).

| Category         | What's covered                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| **Primitives**   | Box, cylinder, sphere, cone, torus, ellipsoid, rectangle, half-space                                           |
| **Booleans**     | Fuse, cut, common, intersect, section (by shape or plane) + multi-shape variants, intersection cells           |
| **Modeling**     | Extrude, revolve, fillet and chamfer (per-edge radii/distances, tapered fillets), shell, offset, multi-face draft |
| **Sweeps**       | Pipe, loft, sweep, oriented sweep (fixed/Frenet/up-axis/auxiliary), draft prism, extrusion laws                |
| **Construction** | Vertices, edges (line/arc/circle/ellipse/bezier/helix), wires, faces, solids, compounds, sewing                |
| **Transforms**   | Translate, rotate, scale, mirror, align to bounding box, 3x4 matrix, linear/circular patterns                  |
| **Topology**     | Shape type queries, type predicates, sub-shape extraction, adjacency, hash codes                               |
| **Tessellation** | Triangle meshes (absolute or relative deflection), wireframe polylines (curve-sampled or mesh-aligned), per-face groups, batched meshing |
| **I/O**          | STEP (choice of length unit and AP203/AP214/AP242 protocol), STL (ASCII + binary), BREP (text + binary) import/export |
| **Query**        | Bounding box, volume, surface area, length, center of mass, inertia tensor, point-in-solid, curvature          |
| **Surfaces**     | Type, exact parameters, normal, UV bounds, point classification, B-spline construction                         |
| **Curves**       | Type, exact parameters, point/tangent eval, parameters, NURBS data, interpolation (incl. clamped tangents), project point |
| **Projection**   | Hidden line removal (HLR), multiview SVG render (Front/Top/Right/Iso)                                          |
| **Modifiers**    | Thicken, defeature, reverse, simplify, variable fillet, 2D wire offset                                         |
| **Evolution**    | Face and edge history for extrude, revolve, pipe, sweep, loft, fuse, cut, fillet, chamfer, draft, shell, offset, thicken, unify, and the transforms |
| **XCAF**         | Assembly documents with colors, names, component hierarchies, STEP/glTF export                                 |
| **Healing**      | Fix shape, unify domain, heal solid/face/wire, fix orientations, remove degenerate edges                       |
| **Batch**        | Multi-shape translate, chained boolean pipeline                                                                |

## Architecture

```
OCCT V8.0.1 C++ (git submodule)
    -> emcmake cmake (static libs)
    -> C++ facade (OcctKernel class, arena-based u32 IDs)
    -> Embind bindings
    -> emcc link (-O3, -flto, -fwasm-exceptions, SIMD) -> .wasm
    -> wasm-opt -O4 --converge --gufa -> dist/
```

A Rust xtask (`cargo xtask build`) builds the project, and Vitest runs the tests.

## Size & Performance

This table compares occt-wasm with other OCCT-to-WASM builds. All of them include STEP, XCAF, and glTF:

| Build              | brotli  |
| ------------------ | ------- |
| **occt-wasm**      | ~4.5 MB |
| opencascade.js     | ~9 MB   |
| brepjs-opencascade | ~5 MB   |

To run the benchmarks locally, use `npx tsx test/benchmark.ts`.

## Development

### Building from Source

```bash
# Prerequisites: Rust 1.95+, emsdk 5.0.3
git clone --recurse-submodules https://github.com/andymai/occt-wasm
cd occt-wasm
npm install && cd ts && npm install && cd ..

cargo xtask build       # Build OCCT + facade -> WASM
cargo xtask test        # Run tests

# View the Three.js example
node scripts/static-server.mjs
# Open http://localhost:3000/examples/three-js/
```

### Docker Build

You do not need a local emsdk or Rust. Everything runs in the container.

```bash
npm run docker:build    # Build image (OCCT layer cached after first run)
npm run docker:dist     # Build + copy dist/ artifacts to host
```

## Browser Compatibility

occt-wasm requires a browser with WASM SIMD, tail calls, and exception handling.
WASM **tail calls** are the newest of these requirements, so they set the minimum
versions in the table. The versions in the table are the lowest combinations
verified to load the kernel:

| Browser | Minimum (verified) | Notes                                       |
| ------- | ------------------ | ------------------------------------------- |
| Chrome  | 114+               | Tail calls landed in 112; 114 is verified   |
| Edge    | 114+               | Same engine as Chrome                       |
| Safari  | 17.2+              | Earliest WebKit verified to load the kernel |
| Firefox | 121+               | Tail calls shipped in 121; 146 is verified  |

The recommended Node.js version is 22+ (tail calls through V8). Node.js 18+ works if your V8 version supports the required WASM features.

## Known Limitations

These are upstream OCCT V8.0.1 issues, not occt-wasm bugs:

- **IGES**: the build does not link TKDEIGES, so there is no IGES import/export.
- **Zero-length extrusion**: a WASM exception escapes the JS catch boundary, so the test suite skips 1 test.
- **Single WASM thread**: each kernel instance is single-threaded. Use `OcctWorker` (see above) to move work off the main thread.

These limits depend on upstream OCCT and on browser support.

OCCT V8.0.1 (2026-07) includes these fixes for upstream hangs and crashes that
affected modeling here:

- An infinite-loop guard in the boolean section algorithm.
- Crash guards in chamfer construction (`ChFi3d_Builder`) and
  `BRep_Tool::CurveOnPlane`.
- Null-pcurve guards in `UnifySameDomain`.
- An infinite-loop guard in the STEP writer.

## Contributing

This project is open source. Bug reports and feature requests are welcome in GitHub Issues. Before you open a pull request, open an issue to discuss the change.

## License

**Build tooling** (xtask, scripts, TypeScript wrapper): MIT OR Apache-2.0

**Compiled WASM output**: LGPL-2.1-only (inherits from [OCCT](https://dev.opencascade.org/resources/download))

The LGPL requires that end users can replace the LGPL component. A web application meets this requirement when it loads the `.wasm` file from a URL. Users can override that URL with `OcctKernel.init({ wasm: '...' })`. If you ship a desktop app with the WASM embedded, read the [GNU licenses FAQ](https://www.gnu.org/licenses/gpl-faq.html), which covers the LGPL.
