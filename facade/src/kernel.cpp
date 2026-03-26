#include "occt_kernel.h"

#include <OSD.hxx>
#include <cstdlib>
#include <stdexcept>

// --- MeshData implementation ---

MeshData::~MeshData() {
    std::free(positions);
    std::free(normals);
    std::free(indices);
}

MeshData::MeshData(const MeshData& other)
    : positions(other.positions), normals(other.normals), indices(other.indices),
      positionCount(other.positionCount), normalCount(other.normalCount),
      indexCount(other.indexCount) {
    // Ownership transfer (Embind copy ctor requirement)
    auto& mut = const_cast<MeshData&>(other);
    mut.positions = nullptr;
    mut.normals = nullptr;
    mut.indices = nullptr;
}

int MeshData::getPositionsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(positions));
}

int MeshData::getNormalsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(normals));
}

int MeshData::getIndicesPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(indices));
}

// --- OcctKernel implementation ---

OcctKernel::OcctKernel() {
    OSD::SetSignal(false);
}

OcctKernel::~OcctKernel() {
    releaseAll();
}

uint32_t OcctKernel::store(const TopoDS_Shape& shape) {
    uint32_t id = nextId_++;
    arena_.emplace(id, shape);
    return id;
}

const TopoDS_Shape& OcctKernel::get(uint32_t id) const {
    auto it = arena_.find(id);
    if (it == arena_.end()) {
        throw std::runtime_error("Invalid shape ID: " + std::to_string(id));
    }
    return it->second;
}

void OcctKernel::release(uint32_t id) {
    arena_.erase(id);
}

void OcctKernel::releaseAll() {
    arena_.clear();
    nextId_ = 1;
}

uint32_t OcctKernel::getShapeCount() const {
    return static_cast<uint32_t>(arena_.size());
}

// --- EdgeData implementation ---

EdgeData::~EdgeData() {
    std::free(points);
}

EdgeData::EdgeData(const EdgeData& other) : points(other.points), pointCount(other.pointCount) {
    auto& mut = const_cast<EdgeData&>(other);
    mut.points = nullptr;
}

int EdgeData::getPointsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(points));
}
