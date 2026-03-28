# occt-wasm

[OpenCascade](https://www.opencascade.com/) V8 compiled to WebAssembly with a clean TypeScript API. Smaller bundles, branded types, arena-based memory, and modern tooling.

> **Looking for a higher-level CAD library?** [brepjs](https://github.com/nicholasgasior/brepjs) builds on occt-wasm with a friendlier API for parametric modeling, sketching, and production CAD applications. Use occt-wasm directly when you need full control over OCCT operations.

## Highlights

- **20 MB WASM** (4.3 MB brotli) -- 2x smaller than opencascade.js
- **160+ typed methods** -- primitives, booleans, sweeps, XCAF assemblies, curves, surfaces, STEP/STL/glTF/BREP I/O, topology, shape evolution tracking
- **Arena-based API** -- u32 shape handles, no manual `.delete()`, `Symbol.dispose` support
- **TypeScript-first** -- branded `ShapeHandle`, union types for shapes/surfaces/curves, structured returns
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

Generate locally: `cd ts && npm run docs` (TypeDoc output in `ts/docs/`).

Full method table:

| Category | Count | Methods |
|----------|------:|---------|
| **Primitives** | 8 | makeBox, makeBoxFromCorners, makeCylinder, makeSphere, makeCone, makeTorus, makeEllipsoid, makeRectangle |
| **Booleans** | 8 | fuse, cut, common, intersect, section, fuseAll, cutAll, split |
| **Modeling** | 8 | extrude, revolve, fillet, chamfer, chamferDistAngle, shell, offset, draft |
| **Sweeps** | 7 | pipe, simplePipe, loft, loftWithVertices, sweep, sweepPipeShell, draftPrism |
| **Construction** | 22 | makeVertex, makeEdge, makeLineEdge, makeCircleEdge, makeCircleArc, makeArcEdge, makeEllipseEdge, makeEllipseArc, makeBezierEdge, makeTangentArc, makeHelixWire, makeWire, makeFace, makeNonPlanarFace, addHolesInFace, removeHolesFromFace, makeSolid, sew, sewAndSolidify, buildSolidFromFaces, makeCompound, buildTriFace, makeFaceOnSurface |
| **Transforms** | 10 | translate, rotate, scale, mirror, copy, transform, generalTransform, linearPattern, circularPattern, composeTransform |
| **Topology** | 13 | getShapeType, getSubShapes, downcast, distanceBetween, isSame, isEqual, isNull, hashCode, shapeOrientation, sharedEdges, adjacentFaces, iterShapes, edgeToFaceMap |
| **Tessellation** | 5 | tessellate, wireframe, hasTriangulation, meshShape, meshBatch |
| **I/O** | 6 | importStep, exportStep, importStl, exportStl, toBREP, fromBREP |
| **Query** | 7 | getBoundingBox, getVolume, getSurfaceArea, getLength, getCenterOfMass, getLinearCenterOfMass, surfaceCurvature |
| **Surfaces** | 10 | vertexPosition, surfaceType, surfaceNormal, pointOnSurface, outerWire, uvBounds, uvFromPoint, projectPointOnFace, classifyPointOnFace, bsplineSurface |
| **Curves** | 11 | curveType, curvePointAtParam, curveTangent, curveParameters, curveIsClosed, curveIsPeriodic, curveLength, interpolatePoints, approximatePoints, getNurbsCurveData, liftCurve2dToPlane |
| **Projection** | 1 | projectEdges (HLR hidden line removal) |
| **Modifiers** | 6 | thicken, defeature, reverseShape, simplify, filletVariable, offsetWire2D |
| **Evolution** | 12 | translateWithHistory, fuseWithHistory, cutWithHistory, filletWithHistory, rotateWithHistory, mirrorWithHistory, scaleWithHistory, intersectWithHistory, chamferWithHistory, shellWithHistory, offsetWithHistory, thickenWithHistory |
| **XCAF** | 12 | xcafNewDocument, xcafClose, xcafAddShape, xcafAddComponent, xcafSetColor, xcafSetName, xcafGetLabelInfo, xcafGetChildLabels, xcafGetRootLabels, xcafExportSTEP, xcafImportSTEP, xcafExportGLTF |
| **Healing** | 10 | buildCurves3d, fixWireOnFace, fixShape, unifySameDomain, isValid, healSolid, healFace, healWire, fixFaceOrientations, removeDegenerateEdges |
| **Batch** | 2 | translateBatch, booleanPipeline |
| **Arena** | 3 | release, releaseAll, shapeCount |

## Architecture

```
OCCT V8.0.0-rc4 C++ (git submodule)
    -> emcmake cmake (48 static libs)
    -> C++ facade (OcctKernel class, arena-based u32 IDs)
    -> Embind bindings
    -> emcc link (-O3, -flto, -fwasm-exceptions, SIMD) -> .wasm
    -> wasm-opt -O4 --converge --gufa -> dist/ (20.3 MB)
```

Built with Rust xtask (`cargo xtask build`), tested with Vitest (144 tests).

## Size & Performance

Compared against other OCCT-to-WASM builds (all include STEP, XCAF, glTF):

| Build | Raw | gzip | brotli |
|-------|-----|------|--------|
| **occt-wasm** (release) | 20.3 MB | 6.4 MB | 4.3 MB |
| opencascade.js 1.1.1 | 62.8 MB | 13.3 MB | 8.7 MB |
| brepjs-opencascade | 24.7 MB | 7.5 MB | 5.0 MB |

Node.js benchmarks (median of 10 runs):

| Operation | Time |
|-----------|------|
| WASM init | 37 ms |
| makeBox | <0.1 ms |
| fuse(box, cylinder) | 10.6 ms |
| cut(box, cylinder) | 8.1 ms |
| tessellate | 0.3 ms |

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

| Browser | Minimum Version |
|---------|----------------|
| Chrome | 94+ |
| Firefox | 89+ |
| Safari | 16.4+ |
| Edge | 94+ |

Node.js 18+ is supported.

## Known Limitations

These are upstream OCCT V8.0.0-rc4 issues, not occt-wasm bugs:

- **STL import** -- `StlAPI_Reader.Read` throws internally (3 test skips)
- **IGES** -- TKDEIGES excluded from link; no IGES import/export yet
- **Variable fillet [r1,r2]** -- memory OOB crash on some geometries (4 test skips)
- **Helical sweep** -- not yet implemented
- **Multi-section sweep** -- ThruSections produces zero-volume on some inputs (1 test skip)
- **Single WASM thread** -- no Web Worker parallelism; one kernel instance per page recommended

These will be addressed as OCCT V8.0.0 final is released.

## License

**Build tooling** (xtask, scripts, TypeScript wrapper): MIT OR Apache-2.0

**Compiled WASM output**: LGPL-2.1-only (inherits from [OCCT](https://dev.opencascade.org/resources/download))

The LGPL requires that end users can replace the LGPL component. For web applications, this is satisfied by loading the `.wasm` file from a URL (which users can intercept via `InitOptions.wasmUrl`). If you ship a desktop app with the WASM embedded, consult the [LGPL FAQ](https://www.gnu.org/licenses/lgpl-3.0.en.html).
