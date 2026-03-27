#!/usr/bin/env bash
# Publish @occt-wasm/core to npm from a local release build.
# Usage: ./scripts/publish.sh [--dry-run]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Verify we're on a clean, tagged commit
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: working tree is dirty. Commit or stash changes first." >&2
  exit 1
fi

TAG=$(git describe --tags --exact-match 2>/dev/null || true)
if [ -z "$TAG" ]; then
  echo "Error: HEAD is not tagged. Merge a release-please PR first." >&2
  exit 1
fi

VERSION="${TAG#v}"
PKG_VERSION=$(node -p "require('./ts/package.json').version")
if [ "$VERSION" != "$PKG_VERSION" ]; then
  echo "Error: tag $TAG does not match ts/package.json version $PKG_VERSION" >&2
  exit 1
fi

echo "Publishing @occt-wasm/core@$VERSION from tag $TAG"

# Build
echo "Building WASM (release)..."
cargo xtask build --release

echo "Building TypeScript..."
cd ts
npm run build
cp ../dist/occt-wasm.js ../dist/occt-wasm.wasm dist/

echo "Running tests..."
npx vitest run

# Publish
if [ "${1:-}" = "--dry-run" ]; then
  echo "Dry run — skipping publish."
  npm publish --dry-run --access public
else
  npm publish --access public
  echo "Published @occt-wasm/core@$VERSION"
fi
