# syntax=docker/dockerfile:1
# Pre-built OCCT static libs for CI. Push to ghcr.io/andymai/occt-wasm-builder.
# Rebuild only when OCCT submodule, emsdk version, or cmake flags change.

FROM emscripten/emsdk:5.0.3

RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake ninja-build \
    && rm -rf /var/lib/apt/lists/*

# Rust (needed for xtask)
COPY rust-toolchain.toml /tmp/rust-toolchain.toml
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
    sh -s -- -y --default-toolchain "$(grep channel /tmp/rust-toolchain.toml | cut -d'"' -f2)" \
    && rm /tmp/rust-toolchain.toml
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /workspace

# RapidJSON headers
COPY scripts/fetch-rapidjson.sh scripts/
RUN bash scripts/fetch-rapidjson.sh

# OCCT source + build (~50 min, cached in image layer)
COPY occt/ occt/
RUN mkdir -p occt/build && cd occt/build \
    && emcmake cmake .. \
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
        -DUSE_RAPIDJSON=ON \
        -D3RDPARTY_RAPIDJSON_INCLUDE_DIR=/workspace/3rdparty/rapidjson \
        "-DCMAKE_C_FLAGS=-fwasm-exceptions -O3 -msimd128 -mrelaxed-simd -DIGNORE_NO_ATOMICS=1 -DOCCT_NO_PLUGINS" \
        "-DCMAKE_CXX_FLAGS=-fwasm-exceptions -O3 -msimd128 -mrelaxed-simd -DIGNORE_NO_ATOMICS=1 -DOCCT_NO_PLUGINS" \
        -Wno-dev \
    && cmake --build . --parallel \
    && echo "OCCT: $(ls -1 lin32/clang/lib/*.a 2>/dev/null | wc -l) static libs"
