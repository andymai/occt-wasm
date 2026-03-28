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

echo "Building ${IMAGE}:${TAG}"
echo "  OCCT rev: ${OCCT_REV}"
echo "  Docker:   ${DOCKER}"
echo ""

$DOCKER build \
    -f Dockerfile.builder \
    --progress=plain \
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
