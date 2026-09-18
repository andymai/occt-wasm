#!/usr/bin/env bash
# Re-embed the CI-built crate/src/occt-wasm.wasm.br for a facade/codegen PR.
#
# Any change under facade/ or xtask/src/ that alters the compiled output makes
# the committed standalone WASI blob stale, and the "Build WASI" job fails the
# PR until it is refreshed. A local rebuild does NOT byte-match CI (toolchain /
# baked-lib / build-path differences), so the only blob that clears the check is
# the one CI built: the `occt-wasm.wasm.br-fresh` artifact that the failing run
# uploads. This automates fetching it and committing it.
#
# It never rebuilds and never pushes a token into a build of PR code, so it is
# safe to run on a contributor's fork PR once you have reviewed it (it uses your
# own local git push access, incl. "allow edits from maintainers").
#
# Usage:
#   scripts/reembed-wasmbr.sh                # re-embed for the current branch
#   scripts/reembed-wasmbr.sh 338            # check out PR #338, then re-embed
#   scripts/reembed-wasmbr.sh 338 --push     # ...and push to the PR branch
#   scripts/reembed-wasmbr.sh --push         # current branch, then push
#
# Requires: gh (authenticated), git, brotli.
set -euo pipefail

BLOB="crate/src/occt-wasm.wasm.br"
WORKFLOW="build-wasi.yml"
ARTIFACT="occt-wasm.wasm.br-fresh"

die() {
    echo "error: $*" >&2
    exit 1
}

pr=""
push=0
for arg in "$@"; do
    case "$arg" in
        --push) push=1 ;;
        --help | -h)
            sed -n '2,21p' "$0"
            exit 0
            ;;
        [0-9]*) pr="$arg" ;;
        *) die "unrecognized argument: $arg (expected a PR number and/or --push)" ;;
    esac
done

command -v gh >/dev/null || die "gh is not installed"
command -v brotli >/dev/null || die "brotli is not installed"

root=$(git rev-parse --show-toplevel 2>/dev/null) || die "not inside a git repository"
cd "$root"

# A re-embed must be the only change in its commit, so refuse to run over a dirty
# tree (a PR checkout would also refuse, but this covers the current-branch path).
if ! git diff --quiet || ! git diff --cached --quiet; then
    die "working tree has uncommitted changes; commit or stash them first"
fi

if [[ -n "$pr" ]]; then
    echo "Checking out PR #$pr ..."
    gh pr checkout "$pr" || die "gh pr checkout $pr failed"
fi

branch=$(git rev-parse --abbrev-ref HEAD)
head=$(git rev-parse HEAD)
echo "Branch $branch is at $head"

# Find the newest Build WASI run for exactly this commit. Matching the SHA (not
# just the branch) guarantees the artifact was built from the sources at HEAD,
# not an earlier push whose blob would land stale again.
run_json=$(gh run list --workflow "$WORKFLOW" -L 40 \
    --json databaseId,headSha,status,conclusion,createdAt 2>/dev/null) \
    || die "could not list $WORKFLOW runs"

read -r run_id status conclusion < <(
    echo "$run_json" | jq -r --arg sha "$head" '
        [.[] | select(.headSha == $sha)]
        | sort_by(.createdAt) | reverse | .[0]
        | if . == null then "" else "\(.databaseId) \(.status) \(.conclusion)" end'
)

[[ -n "$run_id" ]] || die "no $WORKFLOW run found for $head. Push the branch and let CI run first."

if [[ "$status" != "completed" ]]; then
    die "the Build WASI run ($run_id) for $head is '$status'; wait for it to finish, then re-run."
fi
if [[ "$conclusion" == "success" ]]; then
    echo "Build WASI already passed for $head — the committed blob is fresh. Nothing to re-embed."
    exit 0
fi

echo "Build WASI run $run_id is stale ($conclusion); fetching CI's fresh blob ..."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
gh run download "$run_id" -n "$ARTIFACT" -D "$tmp" \
    || die "could not download the $ARTIFACT artifact from run $run_id (it may have expired; re-run CI)"

fresh="$tmp/occt-wasm.wasm.br"
[[ -f "$fresh" ]] || die "artifact did not contain occt-wasm.wasm.br"

# Validate before trusting it: a valid brotli stream, wrapping a real WASM
# module, of a plausible size. Mirrors the publish-crate.yml sanity checks so a
# truncated or placeholder blob never reaches a commit.
brotli -t "$fresh" 2>/dev/null || die "downloaded blob is not valid brotli"
size=$(stat -c%s "$fresh")
((size > 1000000)) || die "blob is suspiciously small ($size bytes) — likely a placeholder"
# Check the WASM magic on the decompressed bytes. Decompress to a file rather
# than piping brotli into `head`, which closes the pipe after 4 bytes and would
# SIGPIPE brotli mid-stream — fatal under `set -o pipefail`.
brotli -dc "$fresh" >"$tmp/decompressed" 2>/dev/null || die "blob failed to decompress"
magic=$(head -c 4 "$tmp/decompressed" | od -An -tx1 | tr -d ' \n')
rm -f "$tmp/decompressed"
[[ "$magic" == "0061736d" ]] || die "decompressed blob is not a WASM module (magic: $magic)"

if [[ -f "$BLOB" ]] && cmp -s "$fresh" "$BLOB"; then
    echo "Committed blob already matches CI's fresh build ($size bytes). Nothing to do."
    exit 0
fi

cp "$fresh" "$BLOB"
git add "$BLOB"
git commit -q -m "build(crate): re-embed occt-wasm.wasm.br

Refreshes the standalone WASI blob to match this branch's facade change,
using the artifact from Build WASI run $run_id. A local rebuild is not
byte-identical to CI, so this is CI's own output. No source change."
echo "Committed re-embedded $BLOB ($size bytes)."

if [[ "$push" == 1 ]]; then
    echo "Pushing to $branch ..."
    git push
else
    echo "Run 'git push' to update the PR branch (or re-run with --push)."
fi
