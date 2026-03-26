#include "occt_kernel.h"

#include <BRepAdaptor_Curve.hxx>
#include <BRepLib_ToolTriangulatedShape.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRep_Tool.hxx>
#include <GCPnts_TangentialDeflection.hxx>
#include <NCollection_Vec3.hxx>
#include <Poly_Triangulation.hxx>
#include <Standard_Failure.hxx>
#include <TopAbs_Orientation.hxx>
#include <TopExp_Explorer.hxx>
#include <TopLoc_Location.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Face.hxx>

#include <cstdlib>
#include <stdexcept>
#include <string>

MeshData OcctKernel::tessellate(uint32_t id, double linearDeflection, double angularDeflection) {
    try {
        const auto& shape = get(id);

        BRepMesh_IncrementalMesh mesher(shape, linearDeflection, false, angularDeflection, false);
        if (!mesher.IsDone()) {
            throw std::runtime_error("tessellate: meshing failed");
        }

        // Count totals
        int totalNodes = 0;
        int totalTris = 0;
        for (TopExp_Explorer ex(shape, TopAbs_FACE); ex.More(); ex.Next()) {
            TopLoc_Location loc;
            auto tri = BRep_Tool::Triangulation(TopoDS::Face(ex.Current()), loc);
            if (tri.IsNull())
                continue;
            totalNodes += tri->NbNodes();
            totalTris += tri->NbTriangles();
        }

        MeshData result;
        result.positionCount = totalNodes * 3;
        result.normalCount = totalNodes * 3;
        result.indexCount = totalTris * 3;

        result.positions = static_cast<float*>(std::malloc(result.positionCount * sizeof(float)));
        result.normals = static_cast<float*>(std::malloc(result.normalCount * sizeof(float)));
        result.indices = static_cast<uint32_t*>(std::malloc(result.indexCount * sizeof(uint32_t)));

        if ((!result.positions && result.positionCount > 0) ||
            (!result.normals && result.normalCount > 0) ||
            (!result.indices && result.indexCount > 0)) {
            throw std::runtime_error("tessellate: memory allocation failed");
        }

        int vertexOffset = 0;
        int triOffset = 0;

        for (TopExp_Explorer ex(shape, TopAbs_FACE); ex.More(); ex.Next()) {
            const auto& face = TopoDS::Face(ex.Current());
            TopLoc_Location loc;
            auto tri = BRep_Tool::Triangulation(face, loc);
            if (tri.IsNull())
                continue;

            const auto& trsf = loc.Transformation();
            int nbNodes = tri->NbNodes();
            int nbTri = tri->NbTriangles();

            // Positions
            for (int i = 1; i <= nbNodes; i++) {
                gp_Pnt p = tri->Node(i).Transformed(trsf);
                int base = (vertexOffset + i - 1) * 3;
                result.positions[base + 0] = static_cast<float>(p.X());
                result.positions[base + 1] = static_cast<float>(p.Y());
                result.positions[base + 2] = static_cast<float>(p.Z());
            }

            // Normals
            if (!tri->HasNormals()) {
                BRepLib_ToolTriangulatedShape::ComputeNormals(face, tri);
            }
            for (int i = 1; i <= nbNodes; i++) {
                gp_Dir d(0, 0, 1);
                if (tri->HasNormals()) {
                    NCollection_Vec3<float> nv;
                    tri->Normal(i, nv);
                    if (nv.x() != 0.0f || nv.y() != 0.0f || nv.z() != 0.0f) {
                        d = gp_Dir(nv.x(), nv.y(), nv.z());
                    }
                }
                d = d.Transformed(trsf);
                int base = (vertexOffset + i - 1) * 3;
                result.normals[base + 0] = static_cast<float>(d.X());
                result.normals[base + 1] = static_cast<float>(d.Y());
                result.normals[base + 2] = static_cast<float>(d.Z());
            }

            // Triangles (with winding correction for reversed faces)
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

            vertexOffset += nbNodes;
        }

        return result;
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("tessellate: ") + e.what());
    }
}

EdgeData OcctKernel::wireframe(uint32_t id, double deflection) {
    try {
        const auto& shape = get(id);

        // First pass: count points via GCPnts_TangentialDeflection per edge
        std::vector<std::vector<gp_Pnt>> edgePoints;
        int totalPoints = 0;

        for (TopExp_Explorer ex(shape, TopAbs_EDGE); ex.More(); ex.Next()) {
            BRepAdaptor_Curve curve(TopoDS::Edge(ex.Current()));
            GCPnts_TangentialDeflection sampler(curve, deflection, 0.5);
            std::vector<gp_Pnt> pts;
            for (int i = 1; i <= sampler.NbPoints(); i++) {
                pts.push_back(sampler.Value(i));
            }
            totalPoints += static_cast<int>(pts.size());
            edgePoints.push_back(std::move(pts));
        }

        EdgeData result;
        result.pointCount = totalPoints * 3;
        result.points = static_cast<float*>(std::malloc(result.pointCount * sizeof(float)));
        if (!result.points && result.pointCount > 0) {
            throw std::runtime_error("wireframe: allocation failed");
        }

        int offset = 0;
        for (const auto& pts : edgePoints) {
            for (const auto& p : pts) {
                result.points[offset + 0] = static_cast<float>(p.X());
                result.points[offset + 1] = static_cast<float>(p.Y());
                result.points[offset + 2] = static_cast<float>(p.Z());
                offset += 3;
            }
        }

        return result;
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("wireframe: ") + e.what());
    }
}
