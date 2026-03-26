#!/usr/bin/env bash
set -euo pipefail

# Milestone 0: Compile OCCT to static libraries via Emscripten.
# Run inside Docker: docker run -it --rm -v $(pwd):/workspace occt-wasm-builder bash scripts/build.sh
# Or with cargo xtask build-occt (which calls emcmake cmake + cmake --build).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
OCCT_DIR="$ROOT_DIR/occt"
BUILD_DIR="$OCCT_DIR/build"

if [ ! -f "$OCCT_DIR/CMakeLists.txt" ]; then
  echo "Error: OCCT source not found at $OCCT_DIR"
  echo "Run: git submodule update --init"
  exit 1
fi

echo "=== Configuring OCCT with emcmake cmake ==="
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

emcmake cmake .. \
  -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_MODULE_FoundationClasses=TRUE \
  -DBUILD_MODULE_ModelingData=TRUE \
  -DBUILD_MODULE_ModelingAlgorithms=TRUE \
  -DBUILD_MODULE_DataExchange=TRUE \
  -DBUILD_MODULE_ApplicationFramework=TRUE \
  -DBUILD_MODULE_Visualization=FALSE \
  -DBUILD_MODULE_Draw=FALSE \
  -DBUILD_LIBRARY_TYPE=Static \
  -DUSE_FREETYPE=OFF \
  -DUSE_RAPIDJSON=OFF \
  -DCMAKE_C_FLAGS="-fwasm-exceptions -O2 -DIGNORE_NO_ATOMICS=1 -DOCCT_NO_PLUGINS" \
  -DCMAKE_CXX_FLAGS="-fwasm-exceptions -O2 -DIGNORE_NO_ATOMICS=1 -DOCCT_NO_PLUGINS" \
  -Wno-dev

echo "=== Building OCCT ==="
cmake --build . --parallel

echo "=== Verifying static libraries ==="
LIBS_FOUND=0
LIBS_MISSING=0
for lib in TKernel TKMath TKG2d TKG3d TKGeomBase TKBRep TKGeomAlgo TKTopAlgo TKPrim TKBool TKFillet TKOffset TKMesh TKShHealing TKBO TKXSBase TKDESTEP; do
  if find . -name "lib${lib}.a" | grep -q .; then
    LIBS_FOUND=$((LIBS_FOUND + 1))
  else
    echo "  MISSING: lib${lib}.a"
    LIBS_MISSING=$((LIBS_MISSING + 1))
  fi
done

echo "=== Results ==="
echo "  Found: $LIBS_FOUND static libraries"
echo "  Missing: $LIBS_MISSING static libraries"

if [ "$LIBS_MISSING" -gt 0 ]; then
  echo "Some libraries are missing. Check build logs above."
  exit 1
fi

echo "OCCT static libraries built successfully!"
