# Changelog

## [0.1.9](https://github.com/andymai/occt-wasm/compare/v0.1.8...v0.1.9) (2026-03-28)


### Features

* **ts:** v1.0 prep — full TS wrapper, API audit, tests, docs, codegen ([#48](https://github.com/andymai/occt-wasm/issues/48)) ([8577f12](https://github.com/andymai/occt-wasm/commit/8577f126e3278c73c02ad48bc4f194918106ef63))


### Bug Fixes

* **docs:** correct README inconsistencies with actual source ([#46](https://github.com/andymai/occt-wasm/issues/46)) ([980567f](https://github.com/andymai/occt-wasm/commit/980567fa1a7803b31290ab6f93bca6dc32c16157))

## [0.1.8](https://github.com/andymai/occt-wasm/compare/v0.1.7...v0.1.8) (2026-03-28)


### Features

* **ci:** add benchmark baseline and regression gate ([#44](https://github.com/andymai/occt-wasm/issues/44)) ([9dbb531](https://github.com/andymai/occt-wasm/commit/9dbb531d2b086d9f8f9166074159257fc989bac3))

## [0.1.7](https://github.com/andymai/occt-wasm/compare/v0.1.6...v0.1.7) (2026-03-28)


### Features

* **codegen:** add SetupShape pattern, generate transforms ([#40](https://github.com/andymai/occt-wasm/issues/40)) ([8d966f3](https://github.com/andymai/occt-wasm/commit/8d966f37b59f7b94f091315ad2389e98a016a6f2))
* **docker:** full build pipeline with optimal layer caching ([#36](https://github.com/andymai/occt-wasm/issues/36)) ([c7322a8](https://github.com/andymai/occt-wasm/commit/c7322a897abc56ebc587092fe673b25e1e681503))
* **facade:** add importStl for STL file import ([#41](https://github.com/andymai/occt-wasm/issues/41)) ([ff31112](https://github.com/andymai/occt-wasm/commit/ff311125983b89baef36c11970849ccb5fafd4e5))
* **facade:** add meshBatch and CI benchmark tooling ([#43](https://github.com/andymai/occt-wasm/issues/43)) ([244ec0e](https://github.com/andymai/occt-wasm/commit/244ec0e4bc3250c8c97dffa5d492ba2258ca5bde))
* **facade:** integrate codegen output into build pipeline ([#38](https://github.com/andymai/occt-wasm/issues/38)) ([8ecce04](https://github.com/andymai/occt-wasm/commit/8ecce043eee6d3c72678295d31c57a4fcbaf0f7f))
* **perf:** SIMD, -O3, batch methods, and benchmark suite ([#42](https://github.com/andymai/occt-wasm/issues/42)) ([4fe229e](https://github.com/andymai/occt-wasm/commit/4fe229ef84d6fdda4dec52df80441a0be75bcc7a))
* **ts:** add FinalizationRegistry safety net for leaked kernels ([#33](https://github.com/andymai/occt-wasm/issues/33)) ([cde2654](https://github.com/andymai/occt-wasm/commit/cde2654baf8b58cf6de28000590f657086a94d81))
* **xtask:** auto-run codegen when generated facade is missing ([#39](https://github.com/andymai/occt-wasm/issues/39)) ([7d0cb3f](https://github.com/andymai/occt-wasm/commit/7d0cb3f93490626034cc74d5f664663af0d9e440))
* **xtask:** facade code generator v0.1.1 ([#37](https://github.com/andymai/occt-wasm/issues/37)) ([7bee33a](https://github.com/andymai/occt-wasm/commit/7bee33a8764f335f57929167b4150f332abedf79))

## [0.1.6](https://github.com/andymai/occt-wasm/compare/v0.1.5...v0.1.6) (2026-03-27)


### Features

* **ci:** switch to local publishing, simplify release workflow ([b23821c](https://github.com/andymai/occt-wasm/commit/b23821c9be4e0018099ec6a1b643604b5343b5ae))
* v0.2 WASM size optimization — drop IGES, filter unused libs ([7dade20](https://github.com/andymai/occt-wasm/commit/7dade20c6754273b7353480e1c9719792c8599f0))

## [0.1.5](https://github.com/andymai/occt-wasm/compare/v0.1.4...v0.1.5) (2026-03-27)


### Bug Fixes

* **xtask:** find wasm-opt via EMSDK env var in CI ([e572bf1](https://github.com/andymai/occt-wasm/commit/e572bf160f95f3dc32dba0cf4e5ce95346ca0002))

## [0.1.4](https://github.com/andymai/occt-wasm/compare/v0.1.3...v0.1.4) (2026-03-27)


### Features

* **ci:** add WASM build + test job with OCCT caching ([0e80e5e](https://github.com/andymai/occt-wasm/commit/0e80e5e2626aa6064bc79c7705f7a2460bfacb3c))
* **ci:** cache OCCT static libs across CI runs ([720c34d](https://github.com/andymai/occt-wasm/commit/720c34d20b658cf24065ab992fe4e4628fb89aeb))


### Bug Fixes

* **ci:** patch RapidJSON const-member assignment bug in CI ([b278fe7](https://github.com/andymai/occt-wasm/commit/b278fe7a3f8325834c70bd6213d3ec5c8fec0933))

## [0.1.3](https://github.com/andymai/occt-wasm/compare/v0.1.2...v0.1.3) (2026-03-27)


### Features

* **docs:** add Three.js browser example ([#12](https://github.com/andymai/occt-wasm/issues/12)) ([50d9f05](https://github.com/andymai/occt-wasm/commit/50d9f056dc458efcee1547da916c4bc90389ff7f))
* **facade:** add ascii flag to exportStl ([51ec698](https://github.com/andymai/occt-wasm/commit/51ec698c4cfa85c589e5c15a19c0d8152f0ef7a5))
* **facade:** add bsplineSurface for grid-to-surface construction ([55df233](https://github.com/andymai/occt-wasm/commit/55df233b8396ae0d740a28aa6817068773d6bde0))
* **facade:** add buildCurves3d and fixWireOnFace ([e297a7f](https://github.com/andymai/occt-wasm/commit/e297a7f72cbc20462c9aa3c3c023d5b62754502b))
* **facade:** add edge groups to wireframe data ([#23](https://github.com/andymai/occt-wasm/issues/23)) ([74aa357](https://github.com/andymai/occt-wasm/commit/74aa3576d1dff09c2162ce53b1b640a9c1efe837))
* **facade:** add face groups to mesh + export HEAP32 ([#22](https://github.com/andymai/occt-wasm/issues/22)) ([2a3d33c](https://github.com/andymai/occt-wasm/commit/2a3d33c902a07d38ec747acac3bf0426073632f7))
* **facade:** add IGES I/O, iterShapes, edgeToFaceMap — 148 methods ([#20](https://github.com/andymai/occt-wasm/issues/20)) ([c32174d](https://github.com/andymai/occt-wasm/commit/c32174d2e893c586b039ff122dfcf0707f852380))
* **facade:** add loftWithVertices (BRepOffsetAPI_ThruSections::AddVertex) ([6308027](https://github.com/andymai/occt-wasm/commit/63080276288b27dbffdebafd1b5498c4d01909d6))
* **facade:** add makeFaceOnSurface (face from surface + wire) ([b331635](https://github.com/andymai/occt-wasm/commit/b3316354208252f088fce9c42d6d8251c64a48af))
* **facade:** add makeTangentArc (GC_MakeArcOfCircle with tangent) ([8555942](https://github.com/andymai/occt-wasm/commit/85559421ffc4c99ace558b476f1d3037894bffb8))
* **facade:** add projectEdges, getNurbsCurveData, liftCurve2dToPlane ([9f3214e](https://github.com/andymai/occt-wasm/commit/9f3214e8d0387559abedccb0eab4740b7d1c16d4))
* **facade:** add XCAF document support (createXCAFDocument, writeXCAFToSTEP) ([4d8d831](https://github.com/andymai/occt-wasm/commit/4d8d8318ec0e9955d7dc992efe2ff2ccd85037b1))
* **facade:** expand to 40 methods — modeling, sweeps, construction, transforms ([#7](https://github.com/andymai/occt-wasm/issues/7)) ([8048576](https://github.com/andymai/occt-wasm/commit/8048576edec235acad8bec5d54365b2023aaa18d))
* **facade:** fix thicken for faces, add makeNullShape, export exception helpers ([ae95c89](https://github.com/andymai/occt-wasm/commit/ae95c89707486629487e95d5a9d7603bac86ed21))
* **facade:** hand-written C++ facade with arena-based API ([#3](https://github.com/andymai/occt-wasm/issues/3)) ([98d50c4](https://github.com/andymai/occt-wasm/commit/98d50c426b5b5ddf96beb6d27069094ff6754fc2))
* **facade:** massive expansion to 142 methods (75% coverage) ([#19](https://github.com/andymai/occt-wasm/issues/19)) ([3020d07](https://github.com/andymai/occt-wasm/commit/3020d07971f0d758d30d3112d10176b9018fd968))
* **facade:** Phase 1 — core gaps for brepjs KernelAdapter ([#14](https://github.com/andymai/occt-wasm/issues/14)) ([ef79391](https://github.com/andymai/occt-wasm/commit/ef79391398cd1a2a5c9e57767b0e9d0fdd163b17))
* **facade:** phase 2 — builder + topology expansion ([#15](https://github.com/andymai/occt-wasm/issues/15)) ([9bf19b4](https://github.com/andymai/occt-wasm/commit/9bf19b457771560b3bd7f1233fbb1816c4b202ab))
* **facade:** phase 3 — sweep, modifier, transform expansion ([#16](https://github.com/andymai/occt-wasm/issues/16)) ([8246ad4](https://github.com/andymai/occt-wasm/commit/8246ad4f0992e362180dff545e5ae7b305a43d1e))
* **facade:** phase 4 — evolution tracking (shape history) ([#17](https://github.com/andymai/occt-wasm/issues/17)) ([b818eb2](https://github.com/andymai/occt-wasm/commit/b818eb2af9a0d7537da4afa5fdfe430f673f5b54))
* **facade:** phase 5 — remaining evolution + curve ops ([#18](https://github.com/andymai/occt-wasm/issues/18)) ([5a3ec07](https://github.com/andymai/occt-wasm/commit/5a3ec078a43d1972ae665e4d73a9306b7a9022ec))
* **facade:** return full curvature data (mean, gaussian, max, min) ([c173e8c](https://github.com/andymai/occt-wasm/commit/c173e8c6b585ef7b0b47358767a69e9366d58ce4))
* initial repo scaffold ([3271923](https://github.com/andymai/occt-wasm/commit/32719238a843e836a60697d0bf7977c8504fb012))
* npm publish pipeline with OIDC trusted publishing ([#25](https://github.com/andymai/occt-wasm/issues/25)) ([f292d64](https://github.com/andymai/occt-wasm/commit/f292d6422cb00ef679fe41dd15b2c830cf2d2e96))
* **ts:** implement OcctKernel TypeScript wrapper ([#6](https://github.com/andymai/occt-wasm/issues/6)) ([2fbe646](https://github.com/andymai/occt-wasm/commit/2fbe646ba780f28a2c4431a6c8838a95aab9771b))
* **ts:** update wrapper + add 21 tests for expanded facade ([#8](https://github.com/andymai/occt-wasm/issues/8)) ([375412a](https://github.com/andymai/occt-wasm/commit/375412ad50b1e5b1364abb1c0eb0ef47f3b7fddc))
* XCAF document API with assembly, color, and glTF export ([#24](https://github.com/andymai/occt-wasm/issues/24)) ([2b19c15](https://github.com/andymai/occt-wasm/commit/2b19c1549a8b5b0e018bcb53c248a9b81563ada7))
* **xtask:** implement full build pipeline ([#4](https://github.com/andymai/occt-wasm/issues/4)) ([5636d27](https://github.com/andymai/occt-wasm/commit/5636d277bda5df22aac1d64930f841128ff4da1f))


### Bug Fixes

* **ci:** fetch RapidJSON headers in release workflow ([9a8ac25](https://github.com/andymai/occt-wasm/commit/9a8ac253a9fa15722b2c894b14fd01ab17e55999))
* **ci:** include .github in release-please commit tracking ([2728d41](https://github.com/andymai/occt-wasm/commit/2728d41d79909c36de545de84296d17fbc01f306))
* **ci:** use correct dtolnay/rust-toolchain action syntax ([#11](https://github.com/andymai/occt-wasm/issues/11)) ([97e61f2](https://github.com/andymai/occt-wasm/commit/97e61f2b5a40e4c8f9b13f452300d9fdcf88adfb))
* **facade:** add ShapeFix fallback for makeWire gap closing ([d7327cb](https://github.com/andymai/occt-wasm/commit/d7327cb224684df3d59f1cc16cd10318531f6a85))
* **facade:** curveIsClosed handles wires via BRep_Tool::IsClosed ([3e73a82](https://github.com/andymai/occt-wasm/commit/3e73a8209dee7211e5de71fb1b8cc23a5a4d4f18))
* **facade:** deduplicate getSubShapes using IndexedMap ([#21](https://github.com/andymai/occt-wasm/issues/21)) ([aa1c780](https://github.com/andymai/occt-wasm/commit/aa1c780ab3fcb97c6c2c84bd9294d8e62a8ea4e4))
* **facade:** deduplicate wireframe edges + add edge hash ([9ebf199](https://github.com/andymai/occt-wasm/commit/9ebf199b26b7a691c8a0ea88c54da2c4a3f6b812))
* **facade:** fix makeCone argument order (R1, R2, H not R1, H, R2) ([07dea3d](https://github.com/andymai/occt-wasm/commit/07dea3d3e40a142ea0daf369783ed95cb7f97b1b))
* **facade:** makeSolid handles compounds and solids gracefully ([f815b75](https://github.com/andymai/occt-wasm/commit/f815b75752cf2643cc73067a06b4b5a966bdfc62))
* **facade:** surfaceNormal respects face orientation (flip for REVERSED) ([6be2bfe](https://github.com/andymai/occt-wasm/commit/6be2bfe743dc7da2ce3544d4698523fb768795ce))
* **facade:** thickenWithHistory face/shell fix, revert getSubShapes ([1b760eb](https://github.com/andymai/occt-wasm/commit/1b760ebbddb500e116fd3045d100a07fa2512e31))
* **facade:** thickenWithHistory uses BRepOffset_MakeOffset for faces ([89e7b11](https://github.com/andymai/occt-wasm/commit/89e7b11ba945645795e3790285d3b9d05c387996))
* **facade:** wire-aware curveParameters, curvePointAtParam, curveTangent ([ec94c9c](https://github.com/andymai/occt-wasm/commit/ec94c9ce8960fa3a673a30a601b90ad1e712e95f))
* **facade:** wire-aware curveType, curveLength, curveIsPeriodic ([1618fea](https://github.com/andymai/occt-wasm/commit/1618fea11b28b4b9719a5080667642a28e34e850))

## [0.1.2](https://github.com/andymai/occt-wasm/compare/v0.1.1...v0.1.2) (2026-03-27)


### Features

* **docs:** add Three.js browser example ([#12](https://github.com/andymai/occt-wasm/issues/12)) ([50d9f05](https://github.com/andymai/occt-wasm/commit/50d9f056dc458efcee1547da916c4bc90389ff7f))
* **facade:** add ascii flag to exportStl ([51ec698](https://github.com/andymai/occt-wasm/commit/51ec698c4cfa85c589e5c15a19c0d8152f0ef7a5))
* **facade:** add bsplineSurface for grid-to-surface construction ([55df233](https://github.com/andymai/occt-wasm/commit/55df233b8396ae0d740a28aa6817068773d6bde0))
* **facade:** add buildCurves3d and fixWireOnFace ([e297a7f](https://github.com/andymai/occt-wasm/commit/e297a7f72cbc20462c9aa3c3c023d5b62754502b))
* **facade:** add edge groups to wireframe data ([#23](https://github.com/andymai/occt-wasm/issues/23)) ([74aa357](https://github.com/andymai/occt-wasm/commit/74aa3576d1dff09c2162ce53b1b640a9c1efe837))
* **facade:** add face groups to mesh + export HEAP32 ([#22](https://github.com/andymai/occt-wasm/issues/22)) ([2a3d33c](https://github.com/andymai/occt-wasm/commit/2a3d33c902a07d38ec747acac3bf0426073632f7))
* **facade:** add IGES I/O, iterShapes, edgeToFaceMap — 148 methods ([#20](https://github.com/andymai/occt-wasm/issues/20)) ([c32174d](https://github.com/andymai/occt-wasm/commit/c32174d2e893c586b039ff122dfcf0707f852380))
* **facade:** add loftWithVertices (BRepOffsetAPI_ThruSections::AddVertex) ([6308027](https://github.com/andymai/occt-wasm/commit/63080276288b27dbffdebafd1b5498c4d01909d6))
* **facade:** add makeFaceOnSurface (face from surface + wire) ([b331635](https://github.com/andymai/occt-wasm/commit/b3316354208252f088fce9c42d6d8251c64a48af))
* **facade:** add makeTangentArc (GC_MakeArcOfCircle with tangent) ([8555942](https://github.com/andymai/occt-wasm/commit/85559421ffc4c99ace558b476f1d3037894bffb8))
* **facade:** add projectEdges, getNurbsCurveData, liftCurve2dToPlane ([9f3214e](https://github.com/andymai/occt-wasm/commit/9f3214e8d0387559abedccb0eab4740b7d1c16d4))
* **facade:** add XCAF document support (createXCAFDocument, writeXCAFToSTEP) ([4d8d831](https://github.com/andymai/occt-wasm/commit/4d8d8318ec0e9955d7dc992efe2ff2ccd85037b1))
* **facade:** expand to 40 methods — modeling, sweeps, construction, transforms ([#7](https://github.com/andymai/occt-wasm/issues/7)) ([8048576](https://github.com/andymai/occt-wasm/commit/8048576edec235acad8bec5d54365b2023aaa18d))
* **facade:** fix thicken for faces, add makeNullShape, export exception helpers ([ae95c89](https://github.com/andymai/occt-wasm/commit/ae95c89707486629487e95d5a9d7603bac86ed21))
* **facade:** hand-written C++ facade with arena-based API ([#3](https://github.com/andymai/occt-wasm/issues/3)) ([98d50c4](https://github.com/andymai/occt-wasm/commit/98d50c426b5b5ddf96beb6d27069094ff6754fc2))
* **facade:** massive expansion to 142 methods (75% coverage) ([#19](https://github.com/andymai/occt-wasm/issues/19)) ([3020d07](https://github.com/andymai/occt-wasm/commit/3020d07971f0d758d30d3112d10176b9018fd968))
* **facade:** Phase 1 — core gaps for brepjs KernelAdapter ([#14](https://github.com/andymai/occt-wasm/issues/14)) ([ef79391](https://github.com/andymai/occt-wasm/commit/ef79391398cd1a2a5c9e57767b0e9d0fdd163b17))
* **facade:** phase 2 — builder + topology expansion ([#15](https://github.com/andymai/occt-wasm/issues/15)) ([9bf19b4](https://github.com/andymai/occt-wasm/commit/9bf19b457771560b3bd7f1233fbb1816c4b202ab))
* **facade:** phase 3 — sweep, modifier, transform expansion ([#16](https://github.com/andymai/occt-wasm/issues/16)) ([8246ad4](https://github.com/andymai/occt-wasm/commit/8246ad4f0992e362180dff545e5ae7b305a43d1e))
* **facade:** phase 4 — evolution tracking (shape history) ([#17](https://github.com/andymai/occt-wasm/issues/17)) ([b818eb2](https://github.com/andymai/occt-wasm/commit/b818eb2af9a0d7537da4afa5fdfe430f673f5b54))
* **facade:** phase 5 — remaining evolution + curve ops ([#18](https://github.com/andymai/occt-wasm/issues/18)) ([5a3ec07](https://github.com/andymai/occt-wasm/commit/5a3ec078a43d1972ae665e4d73a9306b7a9022ec))
* **facade:** return full curvature data (mean, gaussian, max, min) ([c173e8c](https://github.com/andymai/occt-wasm/commit/c173e8c6b585ef7b0b47358767a69e9366d58ce4))
* initial repo scaffold ([3271923](https://github.com/andymai/occt-wasm/commit/32719238a843e836a60697d0bf7977c8504fb012))
* npm publish pipeline with OIDC trusted publishing ([#25](https://github.com/andymai/occt-wasm/issues/25)) ([f292d64](https://github.com/andymai/occt-wasm/commit/f292d6422cb00ef679fe41dd15b2c830cf2d2e96))
* **ts:** implement OcctKernel TypeScript wrapper ([#6](https://github.com/andymai/occt-wasm/issues/6)) ([2fbe646](https://github.com/andymai/occt-wasm/commit/2fbe646ba780f28a2c4431a6c8838a95aab9771b))
* **ts:** update wrapper + add 21 tests for expanded facade ([#8](https://github.com/andymai/occt-wasm/issues/8)) ([375412a](https://github.com/andymai/occt-wasm/commit/375412ad50b1e5b1364abb1c0eb0ef47f3b7fddc))
* XCAF document API with assembly, color, and glTF export ([#24](https://github.com/andymai/occt-wasm/issues/24)) ([2b19c15](https://github.com/andymai/occt-wasm/commit/2b19c1549a8b5b0e018bcb53c248a9b81563ada7))
* **xtask:** implement full build pipeline ([#4](https://github.com/andymai/occt-wasm/issues/4)) ([5636d27](https://github.com/andymai/occt-wasm/commit/5636d277bda5df22aac1d64930f841128ff4da1f))


### Bug Fixes

* **ci:** use correct dtolnay/rust-toolchain action syntax ([#11](https://github.com/andymai/occt-wasm/issues/11)) ([97e61f2](https://github.com/andymai/occt-wasm/commit/97e61f2b5a40e4c8f9b13f452300d9fdcf88adfb))
* **facade:** add ShapeFix fallback for makeWire gap closing ([d7327cb](https://github.com/andymai/occt-wasm/commit/d7327cb224684df3d59f1cc16cd10318531f6a85))
* **facade:** curveIsClosed handles wires via BRep_Tool::IsClosed ([3e73a82](https://github.com/andymai/occt-wasm/commit/3e73a8209dee7211e5de71fb1b8cc23a5a4d4f18))
* **facade:** deduplicate getSubShapes using IndexedMap ([#21](https://github.com/andymai/occt-wasm/issues/21)) ([aa1c780](https://github.com/andymai/occt-wasm/commit/aa1c780ab3fcb97c6c2c84bd9294d8e62a8ea4e4))
* **facade:** deduplicate wireframe edges + add edge hash ([9ebf199](https://github.com/andymai/occt-wasm/commit/9ebf199b26b7a691c8a0ea88c54da2c4a3f6b812))
* **facade:** fix makeCone argument order (R1, R2, H not R1, H, R2) ([07dea3d](https://github.com/andymai/occt-wasm/commit/07dea3d3e40a142ea0daf369783ed95cb7f97b1b))
* **facade:** makeSolid handles compounds and solids gracefully ([f815b75](https://github.com/andymai/occt-wasm/commit/f815b75752cf2643cc73067a06b4b5a966bdfc62))
* **facade:** surfaceNormal respects face orientation (flip for REVERSED) ([6be2bfe](https://github.com/andymai/occt-wasm/commit/6be2bfe743dc7da2ce3544d4698523fb768795ce))
* **facade:** thickenWithHistory face/shell fix, revert getSubShapes ([1b760eb](https://github.com/andymai/occt-wasm/commit/1b760ebbddb500e116fd3045d100a07fa2512e31))
* **facade:** thickenWithHistory uses BRepOffset_MakeOffset for faces ([89e7b11](https://github.com/andymai/occt-wasm/commit/89e7b11ba945645795e3790285d3b9d05c387996))
* **facade:** wire-aware curveParameters, curvePointAtParam, curveTangent ([ec94c9c](https://github.com/andymai/occt-wasm/commit/ec94c9ce8960fa3a673a30a601b90ad1e712e95f))
* **facade:** wire-aware curveType, curveLength, curveIsPeriodic ([1618fea](https://github.com/andymai/occt-wasm/commit/1618fea11b28b4b9719a5080667642a28e34e850))

## [0.1.1](https://github.com/andymai/occt-wasm/compare/v0.1.0...v0.1.1) (2026-03-26)


### Features

* **facade:** expand to 40 methods — modeling, sweeps, construction, transforms ([#7](https://github.com/andymai/occt-wasm/issues/7)) ([8048576](https://github.com/andymai/occt-wasm/commit/8048576edec235acad8bec5d54365b2023aaa18d))
* **facade:** hand-written C++ facade with arena-based API ([#3](https://github.com/andymai/occt-wasm/issues/3)) ([98d50c4](https://github.com/andymai/occt-wasm/commit/98d50c426b5b5ddf96beb6d27069094ff6754fc2))
* initial repo scaffold ([3271923](https://github.com/andymai/occt-wasm/commit/32719238a843e836a60697d0bf7977c8504fb012))
* **ts:** implement OcctKernel TypeScript wrapper ([#6](https://github.com/andymai/occt-wasm/issues/6)) ([2fbe646](https://github.com/andymai/occt-wasm/commit/2fbe646ba780f28a2c4431a6c8838a95aab9771b))
* **ts:** update wrapper + add 21 tests for expanded facade ([#8](https://github.com/andymai/occt-wasm/issues/8)) ([375412a](https://github.com/andymai/occt-wasm/commit/375412ad50b1e5b1364abb1c0eb0ef47f3b7fddc))
* **xtask:** implement full build pipeline ([#4](https://github.com/andymai/occt-wasm/issues/4)) ([5636d27](https://github.com/andymai/occt-wasm/commit/5636d277bda5df22aac1d64930f841128ff4da1f))


### Bug Fixes

* **ci:** use correct dtolnay/rust-toolchain action syntax ([#11](https://github.com/andymai/occt-wasm/issues/11)) ([97e61f2](https://github.com/andymai/occt-wasm/commit/97e61f2b5a40e4c8f9b13f452300d9fdcf88adfb))
