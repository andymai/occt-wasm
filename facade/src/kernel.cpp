#include "occt_kernel.h"

#include <BRepLib_ToolTriangulatedShape.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRep_Tool.hxx>
#include <NCollection_Vec3.hxx>
#include <OSD.hxx>
#include <Poly_Triangulation.hxx>
#include <TopAbs_Orientation.hxx>
#include <TopExp_Explorer.hxx>
#include <TopLoc_Location.hxx>
#include <TopTools_ShapeMapHasher.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Face.hxx>
#include <XCAFApp_Application.hxx>
#include <cstdlib>
#include <gp_Dir.hxx>
#include <gp_Pnt.hxx>
#include <gp_Pnt2d.hxx>
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
    std::free(uvs);
    std::free(indices);
    std::free(faceGroups);
}

MeshData::MeshData(const MeshData& other)
    : positions(other.positions), normals(other.normals), uvs(other.uvs), indices(other.indices),
      faceGroups(other.faceGroups), positionCount(other.positionCount),
      normalCount(other.normalCount), uvCount(other.uvCount), indexCount(other.indexCount),
      faceGroupCount(other.faceGroupCount) {
    auto& mut = const_cast<MeshData&>(other);
    mut.positions = nullptr;
    mut.normals = nullptr;
    mut.uvs = nullptr;
    mut.indices = nullptr;
    mut.faceGroups = nullptr;
}

int MeshData::getPositionsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(positions));
}

int MeshData::getNormalsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(normals));
}

int MeshData::getUvsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(uvs));
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

// Shared mesh builder for tessellate() and tessellateRelative(). `relative`
// selects per-edge size-relative deflection vs. absolute.
MeshData OcctKernel::buildMeshData(const TopoDS_Shape& shape, double linearDeflection,
                                   double angularDeflection, bool relative) {
    BRepMesh_IncrementalMesh mesher(shape, linearDeflection, relative, angularDeflection, false);
    if (!mesher.IsDone()) {
        throw std::runtime_error("tessellate: meshing failed");
    }

    int totalNodes = 0;
    int totalTris = 0;
    int totalFaces = 0;
    for (TopExp_Explorer ex(shape, TopAbs_FACE); ex.More(); ex.Next()) {
        TopLoc_Location loc;
        auto tri = BRep_Tool::Triangulation(TopoDS::Face(ex.Current()), loc);
        if (tri.IsNull())
            continue;
        totalNodes += tri->NbNodes();
        totalTris += tri->NbTriangles();
        totalFaces++;
    }

    MeshData result;
    result.positionCount = totalNodes * 3;
    result.normalCount = totalNodes * 3;
    result.uvCount = totalNodes * 2;
    result.indexCount = totalTris * 3;

    result.positions = static_cast<float*>(std::malloc(result.positionCount * sizeof(float)));
    result.normals = static_cast<float*>(std::malloc(result.normalCount * sizeof(float)));
    result.uvs = static_cast<float*>(std::malloc(result.uvCount * sizeof(float)));
    result.indices = static_cast<uint32_t*>(std::malloc(result.indexCount * sizeof(uint32_t)));
    result.faceGroupCount = totalFaces * 3;
    result.faceGroups = static_cast<int32_t*>(std::malloc(result.faceGroupCount * sizeof(int32_t)));

    if ((!result.positions && result.positionCount > 0) ||
        (!result.normals && result.normalCount > 0) || (!result.uvs && result.uvCount > 0) ||
        (!result.indices && result.indexCount > 0) ||
        (!result.faceGroups && result.faceGroupCount > 0)) {
        throw std::runtime_error("tessellate: memory allocation failed");
    }

    int vertexOffset = 0;
    int triOffset = 0;
    int faceGroupIdx = 0;

    for (TopExp_Explorer ex(shape, TopAbs_FACE); ex.More(); ex.Next()) {
        const auto& face = TopoDS::Face(ex.Current());
        TopLoc_Location loc;
        auto tri = BRep_Tool::Triangulation(face, loc);
        if (tri.IsNull())
            continue;

        const auto& trsf = loc.Transformation();
        bool identityLoc = loc.IsIdentity();
        int nbNodes = tri->NbNodes();
        int nbTri = tri->NbTriangles();

        if (identityLoc) {
            for (int i = 1; i <= nbNodes; i++) {
                const gp_Pnt& p = tri->Node(i);
                int base = (vertexOffset + i - 1) * 3;
                result.positions[base + 0] = static_cast<float>(p.X());
                result.positions[base + 1] = static_cast<float>(p.Y());
                result.positions[base + 2] = static_cast<float>(p.Z());
            }
        } else {
            for (int i = 1; i <= nbNodes; i++) {
                gp_Pnt p = tri->Node(i).Transformed(trsf);
                int base = (vertexOffset + i - 1) * 3;
                result.positions[base + 0] = static_cast<float>(p.X());
                result.positions[base + 1] = static_cast<float>(p.Y());
                result.positions[base + 2] = static_cast<float>(p.Z());
            }
        }

        bool hasUV = tri->HasUVNodes();
        for (int i = 1; i <= nbNodes; i++) {
            int uvBase = (vertexOffset + i - 1) * 2;
            if (hasUV) {
                const gp_Pnt2d& uv = tri->UVNode(i);
                result.uvs[uvBase + 0] = static_cast<float>(uv.X());
                result.uvs[uvBase + 1] = static_cast<float>(uv.Y());
            } else {
                result.uvs[uvBase + 0] = 0.0f;
                result.uvs[uvBase + 1] = 0.0f;
            }
        }

        if (!tri->HasNormals()) {
            BRepLib_ToolTriangulatedShape::ComputeNormals(face, tri);
        }
        bool hasNormals = tri->HasNormals();
        for (int i = 1; i <= nbNodes; i++) {
            gp_Dir d(0, 0, 1);
            if (hasNormals) {
                NCollection_Vec3<float> nv;
                tri->Normal(i, nv);
                if (nv.x() != 0.0f || nv.y() != 0.0f || nv.z() != 0.0f) {
                    d = gp_Dir(nv.x(), nv.y(), nv.z());
                }
            }
            if (!identityLoc) {
                d = d.Transformed(trsf);
            }
            int base = (vertexOffset + i - 1) * 3;
            result.normals[base + 0] = static_cast<float>(d.X());
            result.normals[base + 1] = static_cast<float>(d.Y());
            result.normals[base + 2] = static_cast<float>(d.Z());
        }

        bool isReversed = (face.Orientation() != TopAbs_FORWARD);
        for (int t = 1; t <= nbTri; t++) {
            const auto& triangle = tri->Triangle(t);
            int n1 = triangle.Value(1);
            int n2 = triangle.Value(2);
            int n3 = triangle.Value(3);

            if (isReversed) {
                int tmp = n1;
                n1 = n2;
                n2 = tmp;
            }

            result.indices[triOffset + 0] = static_cast<uint32_t>(n1 - 1 + vertexOffset);
            result.indices[triOffset + 1] = static_cast<uint32_t>(n2 - 1 + vertexOffset);
            result.indices[triOffset + 2] = static_cast<uint32_t>(n3 - 1 + vertexOffset);
            triOffset += 3;
        }

        int faceTriStart = triOffset - nbTri * 3;
        int faceHash = static_cast<int>(TopTools_ShapeMapHasher{}(face) % 2147483647);
        result.faceGroups[faceGroupIdx + 0] = faceTriStart;
        result.faceGroups[faceGroupIdx + 1] = nbTri * 3;
        result.faceGroups[faceGroupIdx + 2] = faceHash;
        faceGroupIdx += 3;

        vertexOffset += nbNodes;
    }

    return result;
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
