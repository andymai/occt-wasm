#!/usr/bin/env bash
# Copy WASM build artifacts into ts/dist/ before TypeScript compilation.
# Fails fast if the WASM build hasn't been run yet.
set -euo pipefail

SRC="../dist"
DST="dist"

mkdir -p "$DST"

missing=()
for f in occt-wasm.js occt-wasm.wasm; do
    if [[ ! -f "$SRC/$f" ]]; then
        missing+=("$f")
    fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
    echo "error: WASM artifacts not found in $SRC/: ${missing[*]}" >&2
    echo "       Run 'cargo xtask build' first to compile the WASM module." >&2
    exit 1
fi

for f in occt-wasm.js occt-wasm.wasm; do
    cp "$SRC/$f" "$DST/$f"
done

echo "prebuild: copied occt-wasm.{js,wasm} → $DST/"
