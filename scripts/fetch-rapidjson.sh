#!/usr/bin/env bash
# Fetch RapidJSON 1.1.0 headers and patch the const-member assignment bug.
set -euo pipefail

mkdir -p 3rdparty/rapidjson

# -f: fail (non-zero) on an HTTP error instead of saving the error body, which
# would otherwise be piped to tar and produce a confusing failure. No pinned
# checksum: GitHub's auto-generated tag tarballs are recompressed over time, so a
# hash pin breaks legitimately; the content assertions below verify we got the
# expected source instead.
curl -fsSL https://github.com/Tencent/rapidjson/archive/refs/tags/v1.1.0.tar.gz | \
  tar xz --strip-components=2 -C 3rdparty/rapidjson rapidjson-1.1.0/include

DOCFILE=3rdparty/rapidjson/rapidjson/document.h
if [[ ! -f "$DOCFILE" ]]; then
  echo "error: $DOCFILE not found after extract — download or layout changed." >&2
  exit 1
fi

# Patch: RapidJSON 1.1.0 has a const-member assignment operator that fails
# with modern Clang. Replace direct assignment with placement-new.
OLD='GenericStringRef& operator=(const GenericStringRef& rhs) { s = rhs.s; length = rhs.length; }'
if ! grep -qF "$OLD" "$DOCFILE"; then
  echo "error: expected RapidJSON const-assign operator not found in $DOCFILE." >&2
  echo "       Upstream source changed; review and update the patch below." >&2
  exit 1
fi

sed -i 's|GenericStringRef& operator=(const GenericStringRef& rhs) { s = rhs.s; length = rhs.length; }|GenericStringRef\& operator=(const GenericStringRef\& rhs) { this->~GenericStringRef(); new (this) GenericStringRef(rhs); return *this; }|' "$DOCFILE"

if ! grep -qF 'new (this) GenericStringRef(rhs)' "$DOCFILE"; then
  echo "error: RapidJSON patch did not apply." >&2
  exit 1
fi

echo "RapidJSON 1.1.0 fetched and patched."
