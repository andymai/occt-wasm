#!/usr/bin/env bash
# Build and push the occt-wasm-builder Docker image to GHCR.
# This image contains pre-built OCCT static libs so CI skips the ~50 min compile.
#
# Usage:
#   ./scripts/builder-image.sh          # Build and push
#   ./scripts/builder-image.sh --build  # Build only (no push)
#
# Rebuild when: OCCT submodule, Dockerfile.builder, cmake flags, or emsdk version change.
set -euo pipefail

IMAGE="ghcr.io/andymai/occt-wasm-builder"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Detect if running inside distrobox
DOCKER="docker"
if command -v distrobox-host-exec &>/dev/null && [ -f /run/.containerenv ]; then
    DOCKER="distrobox-host-exec docker"
fi

# Tag with OCCT submodule short rev
OCCT_REV=$(git rev-parse --short HEAD:occt)
TAG="${OCCT_REV}"

# The tag names the committed submodule pointer, but Dockerfile.builder bakes
# whatever `occt/` currently holds. If those disagree the image ships one OCCT
# under another one's name, and `:latest` carries it to every CI run.
OCCT_PINNED=$(git rev-parse HEAD:occt)
OCCT_CHECKED_OUT=$(git -C occt rev-parse HEAD)
if [[ "${OCCT_PINNED}" != "${OCCT_CHECKED_OUT}" ]]; then
    echo "error: occt/ is checked out at ${OCCT_CHECKED_OUT}," >&2
    echo "       but the tag would say ${OCCT_REV} (${OCCT_PINNED})." >&2
    echo "       Run: git -C occt checkout ${OCCT_REV}   (or commit the bump first)" >&2
    exit 1
fi
if [[ -n "$(git -C occt status --porcelain)" ]]; then
    echo "error: occt/ has uncommitted changes, which would be baked in under ${OCCT_REV}." >&2
    echo "       Commit them to the fork and bump the submodule first." >&2
    exit 1
fi

echo "Building ${IMAGE}:${TAG}"
echo "  OCCT rev: ${OCCT_REV}"
echo "  Docker:   ${DOCKER}"
echo ""

$DOCKER build \
    -f Dockerfile.builder \
    --progress=plain \
    --label "org.opencontainers.image.revision=${OCCT_REV}" \
    -t "${IMAGE}:${TAG}" \
    -t "${IMAGE}:latest" \
    .

echo ""
echo "Built: ${IMAGE}:${TAG}"
echo "Built: ${IMAGE}:latest"

if [[ "${1:-}" == "--build" ]]; then
    echo "Skipping push (--build flag)."
    exit 0
fi

# Login to GHCR via gh CLI token
echo "Logging into GHCR via gh CLI..."
gh auth token | $DOCKER login ghcr.io -u andymai --password-stdin

$DOCKER push "${IMAGE}:${TAG}"
$DOCKER push "${IMAGE}:latest"

echo ""
echo "Pushed: ${IMAGE}:${TAG}"
echo "Pushed: ${IMAGE}:latest"
echo ""
echo "CI will now use this image. No OCCT recompilation needed."
