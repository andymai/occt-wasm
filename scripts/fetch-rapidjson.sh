#!/usr/bin/env bash
# Fetch RapidJSON 1.1.0 headers and patch the const-member assignment bug.
set -euo pipefail

mkdir -p 3rdparty/rapidjson
curl -sL https://github.com/Tencent/rapidjson/archive/refs/tags/v1.1.0.tar.gz | \
  tar xz --strip-components=2 -C 3rdparty/rapidjson rapidjson-1.1.0/include

# Patch: RapidJSON 1.1.0 has a const-member assignment operator that fails
# with modern Clang. Replace direct assignment with placement-new.
DOCFILE=3rdparty/rapidjson/rapidjson/document.h
sed -i 's|GenericStringRef& operator=(const GenericStringRef& rhs) { s = rhs.s; length = rhs.length; }|GenericStringRef\& operator=(const GenericStringRef\& rhs) { this->~GenericStringRef(); new (this) GenericStringRef(rhs); return *this; }|' "$DOCFILE"

echo "RapidJSON 1.1.0 fetched and patched."
