#include "occt_kernel.h"

#include <OSD.hxx>
#include <XCAFApp_Application.hxx>
#include <cstdlib>
#include <stdexcept>

// --- XCAF helpers (used by generated xcaf methods) ---

const Handle(TDocStd_Application) & getXCAFApp() {
    static Handle(TDocStd_Application) app;
    if (app.IsNull()) {
        app = XCAFApp_Application::GetApplication();
    }
    return app;
}

TDF_Label lookupLabel(const std::map<int, TDF_Label>& registry, int labelId) {
    auto it = registry.find(labelId);
    if (it == registry.end()) {
        throw std::runtime_error("invalid label ID: " + std::to_string(labelId));
    }
    return it->second;
}

// --- MeshData implementation ---

MeshData::~MeshData() {
    std::free(positions);
    std::free(normals);
    std::free(indices);
    std::free(faceGroups);
}

MeshData::MeshData(const MeshData& other)
    : positions(other.positions), normals(other.normals), indices(other.indices),
      faceGroups(other.faceGroups), positionCount(other.positionCount),
      normalCount(other.normalCount), indexCount(other.indexCount),
      faceGroupCount(other.faceGroupCount) {
    auto& mut = const_cast<MeshData&>(other);
    mut.positions = nullptr;
    mut.normals = nullptr;
    mut.indices = nullptr;
    mut.faceGroups = nullptr;
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

int MeshData::getFaceGroupsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(faceGroups));
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

// --- MeshBatchData implementation ---

MeshBatchData::~MeshBatchData() {
    std::free(positions);
    std::free(normals);
    std::free(indices);
    std::free(shapeOffsets);
}

MeshBatchData::MeshBatchData(const MeshBatchData& other)
    : positions(other.positions), normals(other.normals), indices(other.indices),
      shapeOffsets(other.shapeOffsets), positionCount(other.positionCount),
      normalCount(other.normalCount), indexCount(other.indexCount), shapeCount(other.shapeCount) {
    auto& mut = const_cast<MeshBatchData&>(other);
    mut.positions = nullptr;
    mut.normals = nullptr;
    mut.indices = nullptr;
    mut.shapeOffsets = nullptr;
}

int MeshBatchData::getPositionsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(positions));
}

int MeshBatchData::getNormalsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(normals));
}

int MeshBatchData::getIndicesPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(indices));
}

int MeshBatchData::getShapeOffsetsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(shapeOffsets));
}

// --- EdgeData implementation ---

EdgeData::~EdgeData() {
    std::free(points);
    std::free(edgeGroups);
}

EdgeData::EdgeData(const EdgeData& other)
    : points(other.points), edgeGroups(other.edgeGroups), pointCount(other.pointCount),
      edgeGroupCount(other.edgeGroupCount) {
    auto& mut = const_cast<EdgeData&>(other);
    mut.points = nullptr;
    mut.edgeGroups = nullptr;
}

int EdgeData::getPointsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(points));
}

int EdgeData::getEdgeGroupsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(edgeGroups));
}
