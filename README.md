# occt-wasm

[OpenCascade](https://www.opencascade.com/) V8 compiled to WebAssembly with a clean TypeScript API. Smaller bundles, branded types, arena-based memory, and modern tooling.

> **Looking for a higher-level CAD library?** [brepjs](https://github.com/nicholasgasior/brepjs) builds on occt-wasm with a friendlier API for parametric modeling, sketching, and production CAD applications. Use occt-wasm directly when you need full control over OCCT operations.

## Highlights

- **~4 MB brotli** -- roughly 2x smaller than opencascade.js
- **Comprehensive API** -- primitives, booleans, sweeps, XCAF assemblies, curves, surfaces, STEP/STL/glTF/BREP I/O, topology, shape evolution tracking
- **Arena-based API** -- u32 shape handles, no manual `.delete()`, `Symbol.dispose` support
- **TypeScript-first** -- branded `ShapeHandle`, union types for shapes/surfaces/curves, structured returns
- **Structured error handling** -- `OcctErrorCode` enum for programmatic `switch/case` instead of string parsing
- **Web Worker support** -- `OcctWorker` class for off-main-thread CAD operations via [Comlink](https://github.com/GoogleChromeLabs/comlink)
- **Modern browser targets** -- WASM SIMD, relaxed-SIMD, tail calls, wasm-exceptions

## Install

```bash
npm install occt-wasm
```

## Quick Start

```typescript
import { OcctKernel } from 'occt-wasm';

// Recommended: deterministic cleanup via Symbol.dispose
{
  using kernel = await OcctKernel.init();

  // Primitives
  const box = kernel.makeBox(20, 20, 20);
  const cyl = kernel.makeCylinder(8, 30);

  // Booleans
  const fused = kernel.fuse(box, cyl);

  // Modeling
  const edges = kernel.getSubShapes(fused, 'edge');
  const filleted = kernel.fillet(fused, edges.slice(0, 4), 2.0);

  // Tessellation -> Three.js / Babylon.js
  const mesh = kernel.tessellate(filleted);
  // mesh.positions (Float32Array), mesh.normals, mesh.indices

  // STEP I/O
  const step = kernel.exportStep(filleted);
  const reimported = kernel.importStep(step);

  // Query
  const vol = kernel.getVolume(filleted);
  const bbox = kernel.getBoundingBox(filleted);
  const com = kernel.getCenterOfMass(filleted);

  // kernel is disposed at end of block
}
```

## Initialization

By default, `OcctKernel.init()` auto-locates the `.wasm` file next to the JS module. You can also provide explicit paths or pre-loaded binaries:

```typescript
// Auto-detect (browser, Node.js, or Worker):
const kernel = await OcctKernel.init();

// Explicit URL or path:
const kernel = await OcctKernel.init({ wasm: '/assets/occt-wasm.wasm' });

// Pre-fetched binary (skip the fetch):
const binary = await fetch('/occt-wasm.wasm').then(r => r.arrayBuffer());
const kernel = await OcctKernel.init({ wasm: binary });

// Uint8Array also accepted:
const kernel = await OcctKernel.init({ wasm: new Uint8Array(binary) });
```

## Error Handling

All errors are instances of `OcctError` with a structured `code` field for programmatic handling:

```typescript
import { OcctError, OcctErrorCode } from 'occt-wasm';

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

Available error codes:

| Code | When |
|------|------|
| `ConstructionFailed` | `Build()`/`IsDone()` returned false |
| `BooleanFailed` | Boolean operation (fuse/cut/common/etc.) failed |
| `InvalidShapeId` | Shape ID not found in the arena |
| `InvalidLabelId` | XCAF label ID not found |
| `TessellationFailed` | Meshing operation failed |
| `ImportExportFailed` | STEP/STL/BREP I/O error |
| `HealingFailed` | Shape repair failed |
| `DocumentClosed` | Operation on a closed XCAF document |
| `KernelError` | OCCT `Standard_Failure` (unclassified) |
| `Unknown` | Error from outside the kernel |

## Named Enums

Sweep, offset, and boolean operations use self-documenting enums instead of opaque numbers:

```typescript
import { TransitionMode, JoinType, BooleanOp } from 'occt-wasm';

// Sweep with round-corner transitions
kernel.sweep(profile, spine, TransitionMode.RoundCorner);

// Offset wire with arc joins
kernel.offsetWire2D(wire, 2.0, JoinType.Arc);

// Boolean pipeline
kernel.booleanPipeline(base, [BooleanOp.Cut, BooleanOp.Fuse], [tool1, tool2]);
```

Numeric values (0, 1, 2) are still accepted for backwards compatibility.

## Type Predicates

Convenience methods for checking shape topology:

```typescript
if (kernel.isSolid(shape))    { /* ... */ }
if (kernel.isFace(shape))     { /* ... */ }
if (kernel.isEdge(shape))     { /* ... */ }
if (kernel.isWire(shape))     { /* ... */ }
if (kernel.isVertex(shape))   { /* ... */ }
if (kernel.isShell(shape))    { /* ... */ }
if (kernel.isCompound(shape)) { /* ... */ }
```

## Web Workers

For browser apps, heavy CAD operations can block the main thread. `OcctWorker` runs a full kernel in a Web Worker with the same API:

```typescript
import { OcctWorker } from 'occt-wasm/worker';

// Spawn a worker with its own kernel
const worker = await OcctWorker.spawn({ wasm: '/occt-wasm.wasm' });

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

The worker helper uses [Comlink](https://github.com/GoogleChromeLabs/comlink) (~1.2 KB gzipped) for transparent RPC. Each worker has its own WASM instance and arena -- shape handles are local to the worker.

## XCAF Assemblies

Create assembly documents with colors, names, and component hierarchies:

```typescript
// Factory method auto-injects Emscripten FS for glTF export
const doc = kernel.createXCAFDocument();

const housing = doc.addShape(box, { name: 'housing', color: [0.8, 0.2, 0.1] });
doc.addChild(housing, gear, {
  name: 'gear-1',
  location: { tx: 10, tz: 5 },
  color: [0.5, 0.5, 0.5],
});

// Export
const step = doc.exportSTEP();              // preserves colors/names
const glb = doc.exportGLTF();               // no need to pass FS manually
doc.close();

// Import with preserved metadata
const imported = kernel.importXCAFFromSTEP(stepData);
```

## Bundler Configuration

### Vite

```typescript
// vite.config.ts
export default defineConfig({
  optimizeDeps: {
    exclude: ['occt-wasm'] // Don't pre-bundle WASM
  },
  build: {
    target: 'esnext' // Required for WASM features
  }
});
```

### Webpack 5

```javascript
// webpack.config.js
module.exports = {
  experiments: { asyncWebAssembly: true },
  module: {
    rules: [{ test: /\.wasm$/, type: 'asset/resource' }]
  }
};
```

### Node.js

```typescript
// Works out of the box with Node.js 18+
import { OcctKernel } from 'occt-wasm';
const kernel = await OcctKernel.init();
```

## API Reference

Generate full docs locally: `cd ts && npm run docs` (TypeDoc output).

| Category | What's covered |
|----------|---------------|
| **Primitives** | Box, cylinder, sphere, cone, torus, ellipsoid, rectangle |
| **Booleans** | Fuse, cut, common, intersect, section + multi-shape variants |
| **Modeling** | Extrude, revolve, fillet, chamfer, shell, offset, draft |
| **Sweeps** | Pipe, loft, sweep, draft prism, extrusion laws |
| **Construction** | Vertices, edges (line/arc/circle/ellipse/bezier/helix), wires, faces, solids, compounds, sewing |
| **Transforms** | Translate, rotate, scale, mirror, 3x4 matrix, linear/circular patterns |
| **Topology** | Shape type queries, type predicates, sub-shape extraction, adjacency, hash codes |
| **Tessellation** | Triangle meshes, wireframe polylines, per-face groups, batched multi-shape meshing |
| **I/O** | STEP, STL, BREP import/export |
| **Query** | Bounding box, volume, surface area, length, center of mass, curvature |
| **Surfaces** | Type, normal, UV bounds, point classification, B-spline construction |
| **Curves** | Type, point/tangent evaluation, parameters, NURBS data extraction, interpolation |
| **Projection** | Hidden line removal (HLR) |
| **Modifiers** | Thicken, defeature, reverse, simplify, variable fillet, 2D wire offset |
| **Evolution** | Face-tracking history for translate, fuse, cut, fillet, rotate, mirror, scale, chamfer, shell, offset, thicken |
| **XCAF** | Assembly documents with colors, names, component hierarchies, STEP/glTF export |
| **Healing** | Fix shape, unify domain, heal solid/face/wire, fix orientations, remove degenerate edges |
| **Batch** | Multi-shape translate, chained boolean pipeline |

## Architecture

```
OCCT V8.0.0-rc4 C++ (git submodule)
    -> emcmake cmake (48 static libs)
    -> C++ facade (OcctKernel class, arena-based u32 IDs)
    -> Embind bindings
    -> emcc link (-O3, -flto, -fwasm-exceptions, SIMD) -> .wasm
    -> wasm-opt -O4 --converge --gufa -> dist/ (20.3 MB)
```

Built with Rust xtask (`cargo xtask build`), tested with Vitest.

## Size & Performance

Compared against other OCCT-to-WASM builds (all include STEP, XCAF, glTF):

| Build | brotli |
|-------|--------|
| **occt-wasm** | ~4 MB |
| opencascade.js | ~9 MB |
| brepjs-opencascade | ~5 MB |

Run benchmarks locally: `npx tsx test/benchmark.ts`

## Building from Source

```bash
# Prerequisites: Rust 1.85+, emsdk 5.0.3
git clone --recurse-submodules https://github.com/andymai/occt-wasm
cd occt-wasm
npm install && cd ts && npm install && cd ..

cargo xtask build       # Build OCCT + facade -> WASM
cargo xtask test        # Run tests

# View the Three.js example
npx serve .
# Open http://localhost:3000/examples/three-js/
```

### Docker Build

No local emsdk or Rust needed -- everything runs in the container.

```bash
npm run docker:build    # Build image (OCCT layer cached after first run)
npm run docker:dist     # Build + copy dist/ artifacts to host
```

## Browser Compatibility

occt-wasm requires modern browsers with WASM SIMD, relaxed-SIMD, tail calls, and exception handling:

| Browser | Minimum Version | Notes |
|---------|----------------|-------|
| Chrome | 114+ | Relaxed-SIMD (114), tail calls (112) |
| Edge | 114+ | Same engine as Chrome |
| Safari | 17.2+ | Relaxed-SIMD (17.2), tail calls (15) |
| Firefox | Not supported | No tail call support as of Firefox 130 |

Node.js 22+ is recommended (tail calls via V8). Node.js 18+ works if your V8 version supports the required WASM features.

## Known Limitations

These are upstream OCCT V8.0.0-rc4 issues, not occt-wasm bugs:

- **IGES** -- TKDEIGES excluded from link; no IGES import/export
- **Zero-length extrusion** -- WASM exception escapes JS catch boundary (1 test skip)
- **Single WASM thread** -- each kernel instance is single-threaded; use `OcctWorker` (see above) to move work off the main thread
- **Firefox** -- not supported due to missing WASM tail call support

These will be addressed as OCCT V8.0.0 final is released and browser support improves.

## License

**Build tooling** (xtask, scripts, TypeScript wrapper): MIT OR Apache-2.0

**Compiled WASM output**: LGPL-2.1-only (inherits from [OCCT](https://dev.opencascade.org/resources/download))

The LGPL requires that end users can replace the LGPL component. For web applications, this is satisfied by loading the `.wasm` file from a URL (which users can override via `OcctKernel.init({ wasm: '...' })`). If you ship a desktop app with the WASM embedded, consult the [LGPL FAQ](https://www.gnu.org/licenses/lgpl-3.0.en.html).
