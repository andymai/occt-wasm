# syntax=docker/dockerfile:1
FROM emscripten/emsdk:5.0.3

# --- Layer 1: System packages (rarely changes) ---
RUN apt-get update && apt-get install -y --no-install-recommends \
    libclang-dev \
    cmake \
    ninja-build \
    ccache \
    && rm -rf /var/lib/apt/lists/*

# Enable ccache for C++ compilation
ENV CCACHE_DIR=/cache/ccache
ENV CC="ccache gcc"
ENV CXX="ccache g++"

# --- Layer 2: Rust toolchain (changes only on toolchain bump) ---
COPY rust-toolchain.toml /tmp/rust-toolchain.toml
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
    sh -s -- -y --default-toolchain "$(grep channel /tmp/rust-toolchain.toml | cut -d'"' -f2)" \
    && rm /tmp/rust-toolchain.toml
ENV PATH="/root/.cargo/bin:${PATH}"

# --- Layer 3: Rust dependency cache (changes only when Cargo.toml changes) ---
WORKDIR /workspace
COPY .cargo/ .cargo/
COPY Cargo.toml Cargo.lock* ./
COPY xtask/Cargo.toml xtask/
RUN mkdir -p xtask/src && echo 'fn main() {}' > xtask/src/main.rs \
    && cargo build --release 2>/dev/null || true \
    && rm -rf xtask/src

# --- Layer 4: Node dependency cache (changes only when package.json changes) ---
COPY package.json package-lock.json* ./
COPY ts/package.json ts/package-lock.json* ts/
RUN npm ci --ignore-scripts 2>/dev/null || npm install --ignore-scripts \
    && cd ts && (npm ci 2>/dev/null || npm install)

# --- Layer 5: RapidJSON fetch + patch (rarely changes) ---
COPY scripts/fetch-rapidjson.sh scripts/
RUN bash scripts/fetch-rapidjson.sh

# --- Layer 6: OCCT source + cmake build (THE EXPENSIVE LAYER ~60 min) ---
# Only invalidates when OCCT submodule source changes (rare).
# Uses emcmake cmake directly instead of xtask to avoid coupling
# this layer to Rust source changes.
# BuildKit cache mount persists ccache across builds.
COPY occt/ occt/
RUN --mount=type=cache,target=/cache/ccache \
    mkdir -p occt/build && cd occt/build \
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
        -DCMAKE_C_FLAGS="-fwasm-exceptions -O2 -DIGNORE_NO_ATOMICS=1 -DOCCT_NO_PLUGINS" \
        -DCMAKE_CXX_FLAGS="-fwasm-exceptions -O2 -DIGNORE_NO_ATOMICS=1 -DOCCT_NO_PLUGINS" \
        -Wno-dev \
    && cmake --build . --parallel \
    && echo "OCCT build complete: $(ls -1 lin32/clang/lib/*.a 2>/dev/null | wc -l) static libs"

# --- Layer 7: xtask source (changes when build logic changes) ---
COPY xtask/ xtask/
RUN cargo build --release -p xtask

# --- Layer 8: Facade + scripts + TS (changes frequently) ---
COPY facade/ facade/
COPY scripts/ scripts/
COPY ts/src/ ts/src/
COPY ts/tsconfig.json ts/eslint.config.js ts/vitest.config.ts ts/
COPY test/ test/
COPY .clang-format commitlint.config.js ./

# Build: facade → link → wasm-opt → TypeScript
RUN --mount=type=cache,target=/cache/ccache \
    cargo xtask build --release \
    && echo "WASM size: $(du -h dist/occt-wasm.wasm | cut -f1)"

# Test
RUN cd ts && npx vitest run

# Output is in dist/
