# Changelog

## [7.3.5](https://github.com/andymai/occt-wasm/compare/crate-v7.3.4...crate-v7.3.5) (2026-11-24)


### Bug Fixes

* **occt:** bump submodule to V8.0.2 ([#512](https://github.com/andymai/occt-wasm/issues/512)) ([b17eecb](https://github.com/andymai/occt-wasm/commit/b17eecbb0d760497287fdb251935dfaacb9d0d33))

## [7.3.4](https://github.com/andymai/occt-wasm/compare/crate-v7.3.3...crate-v7.3.4) (2026-11-24)


### Bug Fixes

* **occt:** refuse, not trap, when a fillet outgrows the short edges at its ends ([#509](https://github.com/andymai/occt-wasm/issues/509)) ([364f99d](https://github.com/andymai/occt-wasm/commit/364f99dd01a74e73f5ece612bfe046fc49cd6848))

## [7.3.3](https://github.com/andymai/occt-wasm/compare/crate-v7.3.2...crate-v7.3.3) (2026-11-23)


### Bug Fixes

* **occt:** end a fillet on a line edge where the edge ends ([#506](https://github.com/andymai/occt-wasm/issues/506)) ([85ab222](https://github.com/andymai/occt-wasm/commit/85ab222cf22821e3fae1921a90a3a312923138e8))

## [7.3.2](https://github.com/andymai/occt-wasm/compare/crate-v7.3.1...crate-v7.3.2) (2026-11-23)


### Performance

* **occt:** find the stick vertices of two faces from an index ([#501](https://github.com/andymai/occt-wasm/issues/501)) ([fcb03e7](https://github.com/andymai/occt-wasm/commit/fcb03e73557f8cee2944e6f2253024c911e998e0))

## [7.3.1](https://github.com/andymai/occt-wasm/compare/crate-v7.3.0...crate-v7.3.1) (2026-11-22)


### Performance

* **facade:** give a ruled loft's straight edges a line ([#496](https://github.com/andymai/occt-wasm/issues/496)) ([815ea58](https://github.com/andymai/occt-wasm/commit/815ea58bc2361dc2efb0f217cb86e980b1cb692c))
* **occt:** solve a line against a plane and coaxial quadrics exactly ([#499](https://github.com/andymai/occt-wasm/issues/499)) ([33c249b](https://github.com/andymai/occt-wasm/commit/33c249bcfe42eca94a916f97b15207fe8865a0e3))

## [7.3.0](https://github.com/andymai/occt-wasm/compare/crate-v7.2.2...crate-v7.3.0) (2026-11-21)


### Features

* **facade:** unifySameDomainWithin, a same-domain merge within given tolerances ([#491](https://github.com/andymai/occt-wasm/issues/491)) ([1b40f77](https://github.com/andymai/occt-wasm/commit/1b40f7742395ddaefd92474779d6b7a4698413a4))


### Bug Fixes

* **crate:** re-embed occt-wasm.wasm.br after [#491](https://github.com/andymai/occt-wasm/issues/491) and [#492](https://github.com/andymai/occt-wasm/issues/492) ([#495](https://github.com/andymai/occt-wasm/issues/495)) ([c79d757](https://github.com/andymai/occt-wasm/commit/c79d7574a3f0ecfa3f1971405262e0a266afe7a8))

## [7.2.2](https://github.com/andymai/occt-wasm/compare/crate-v7.2.1...crate-v7.2.2) (2026-11-14)


### Bug Fixes

* **facade:** integrate swept and offset faces on their BSpline form ([#483](https://github.com/andymai/occt-wasm/issues/483)) ([9c6ad10](https://github.com/andymai/occt-wasm/commit/9c6ad105747f3d300fc6500375da54a30484e556))

## [7.2.1](https://github.com/andymai/occt-wasm/compare/crate-v7.2.0...crate-v7.2.1) (2026-11-09)


### Bug Fixes

* **crate:** keep a split face's pieces on one surface when merging on a copy ([#473](https://github.com/andymai/occt-wasm/issues/473)) ([e6fbef0](https://github.com/andymai/occt-wasm/commit/e6fbef0b30a87ca4573114f48e9b677c15e28ef8))

## [7.2.0](https://github.com/andymai/occt-wasm/compare/crate-v7.1.0...crate-v7.2.0) (2026-11-09)


### Features

* **facade:** threadGroove, a thread's groove built from its known curves ([#461](https://github.com/andymai/occt-wasm/issues/461)) ([e699dfc](https://github.com/andymai/occt-wasm/commit/e699dfc91120935b795adf42452361d143a691f3))


### Bug Fixes

* **facade:** keep threadGroove valid on wide threads and bad input ([#467](https://github.com/andymai/occt-wasm/issues/467)) ([cc6abe0](https://github.com/andymai/occt-wasm/commit/cc6abe074ad1194ac594afe8a0965c65725d8dc1))
* **facade:** line up a closed loop's sections in every loft ([#466](https://github.com/andymai/occt-wasm/issues/466)) ([11f815d](https://github.com/andymai/occt-wasm/commit/11f815d93d1562c34319a08a10cdb4bda00b1e77))
* **facade:** merge same-domain faces on a copy, not in place ([#463](https://github.com/andymai/occt-wasm/issues/463)) ([90c0636](https://github.com/andymai/occt-wasm/commit/90c06360fe72123b5e20c5d29dc94bc8326144cb))
* **facade:** rebuild a fuse that lost an operand with a fuzzy value ([#464](https://github.com/andymai/occt-wasm/issues/464)) ([45cb7d6](https://github.com/andymai/occt-wasm/commit/45cb7d63384c4b6114946451c2e94f4de4df127b))
