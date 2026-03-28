# occt-wasm

A better OCCT-to-WASM compilation pipeline. Compiles [OpenCascade](https://www.opencascade.com/) V8 C++ to WebAssembly with smaller bundle size, cleaner TypeScript bindings, and a modern build system.

## Highlights

- **20MB WASM** (4.3MB brotli) — 2x smaller than opencascade.js gzipped
- **160+ typed methods** — primitives, booleans, sweeps, XCAF assemblies, curves, surfaces, STEP/STL/glTF/BREP I/O, topology introspection, shape evolution tracking
- **Arena-based API** — u32 shape handles, no manual `.delete()`, `Symbol.dispose` support
- **TypeScript-first** — branded `ShapeHandle` type, `OcctError` with operation context

## Install

```bash
npm install occt-wasm
```

## Quick Start

```typescript
import { OcctKernel } from 'occt-wasm';

const kernel = await OcctKernel.init();

// Create shapes
const box = kernel.makeBox(20, 20, 20);
const cyl = kernel.makeCylinder(8, 30);

// Boolean operations
const fused = kernel.fuse(box, cyl);

// Modeling
const filleted = kernel.fillet(fused, edgeIds, 2.0);
const extruded = kernel.extrude(face, 0, 0, 20);
const revolved = kernel.revolve(face, 0, 0, 0, 0, 0, 1, Math.PI);

// Transforms
const moved = kernel.translate(shape, 10, 0, 0);
const rotated = kernel.rotate(shape, 0, 0, 0, 0, 0, 1, Math.PI / 4);

// Tessellation → Three.js
const mesh = kernel.tessellate(shape, 0.1, 0.5);
// mesh.positions (Float32Array), mesh.normals, mesh.indices

// STEP I/O
const imported = kernel.importStep(stepString);
const exported = kernel.exportStep(shape);

// Query
const volume = kernel.getVolume(shape);
const bbox = kernel.getBoundingBox(shape);

// Memory management
kernel.release(shape);
kernel.releaseAll();

// Deterministic cleanup (recommended)
{
  using k = await OcctKernel.init();
  const box = k.makeBox(10, 10, 10);
  // k is disposed at end of block
}
```

## Building from Source

```bash
# Prerequisites: Rust 1.85+, emsdk 5.0.3
git clone --recurse-submodules https://github.com/andymai/occt-wasm
cd occt-wasm
npm install && cd ts && npm install && cd ..

cargo xtask build       # Build OCCT + facade → WASM
cargo xtask test        # Run tests

# View the Three.js example
npx serve .
# Open http://localhost:3000/examples/three-js/
```

### Docker Build

No local emsdk or Rust needed — everything runs in the container.

```bash
npm run docker:build    # Build image (OCCT layer cached after first run)
npm run docker:dist     # Build + copy dist/ artifacts to host
```

## All 164 Methods

| Category | Count | Methods |
|----------|------:|---------|
| **Primitives** | 8 | makeBox, makeBoxFromCorners, makeCylinder, makeSphere, makeCone, makeTorus, makeEllipsoid, makeRectangle |
| **Booleans** | 8 | fuse, cut, common, intersect, section, fuseAll, cutAll, split |
| **Modeling** | 8 | extrude, revolve, fillet, chamfer, chamferDistAngle, shell, offset, draft |
| **Sweeps** | 8 | pipe, simplePipe, loft, loftWithVertices, sweep, sweepPipeShell, draftPrism, revolveVec |
| **Construction** | 24 | makeVertex, makeEdge, makeLineEdge, makeCircleEdge, makeCircleArc, makeArcEdge, makeEllipseEdge, makeEllipseArc, makeBezierEdge, makeTangentArc, makeHelixWire, makeWire, makeFace, makeNonPlanarFace, addHolesInFace, removeHolesFromFace, solidFromShell, makeSolid, sew, sewAndSolidify, buildSolidFromFaces, makeCompound, buildTriFace, makeFaceOnSurface |
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
| **Arena** | 3 | release, releaseAll, getShapeCount |

## Architecture

```
OCCT V8.0.0-rc4 C++ (git submodule)
    → emcmake cmake (48 static libs)
    → C++ facade (OcctKernel class, arena-based u32 IDs)
    → Embind bindings
    → emcc link (30 of 48 libs, unused filtered) → .wasm
    → wasm-opt -O4 → dist/ (20.3 MB)
```

Built with Rust xtask (`cargo xtask build`), tested with Vitest.

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

## License

Build tooling: MIT OR Apache-2.0

Compiled WASM output: LGPL-2.1 (inherits from OCCT)
