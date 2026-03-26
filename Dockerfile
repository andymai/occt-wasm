FROM emscripten/emsdk:5.0.3

# Rust toolchain for xtask
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.85
ENV PATH="/root/.cargo/bin:${PATH}"

# libclang for codegen (match emsdk's LLVM version) + build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    libclang-dev \
    cmake \
    ninja-build \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
