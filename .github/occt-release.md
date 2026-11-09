Open-Cascade-SAS/OCCT released `{{ release }}`, and the `occt` submodule commit `{{ commit }}` in {{ fork }} does not contain it.

- [ ] Read the `{{ release }}` release notes: https://github.com/Open-Cascade-SAS/OCCT/releases/tag/{{ release }}
- [ ] Decide whether to move to `{{ release }}`. A move puts the WASM patches from {{ fork }} on top of `{{ release }}`, points the `occt` submodule at the result, and rebuilds and pushes the builder image, since CI links against its prebuilt OCCT libs.
- [ ] Close this issue with the decision and links to any resulting pull requests.
