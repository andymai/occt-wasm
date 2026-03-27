#include "occt_kernel.h"

#include <BRepAlgoAPI_Section.hxx>
#include <BRepFilletAPI_MakeChamfer.hxx>
#include <BRepFilletAPI_MakeFillet.hxx>
#include <BRepOffsetAPI_DraftAngle.hxx>
#include <BRepOffsetAPI_MakeOffset.hxx>
#include <BRepOffsetAPI_MakeOffsetShape.hxx>
#include <BRepOffsetAPI_MakeThickSolid.hxx>
#include <BRepOffset_MakeOffset.hxx>
#include <BRepOffset_Mode.hxx>
#include <BRepPrimAPI_MakePrism.hxx>
#include <BRepPrimAPI_MakeRevol.hxx>
#include <BRep_Tool.hxx>
#include <GeomAbs_JoinType.hxx>
#include <NCollection_List.hxx>
#include <ShapeAnalysis.hxx>
#include <Standard_Failure.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <gp_Ax1.hxx>
#include <gp_Dir.hxx>
#include <gp_Pnt.hxx>
#include <gp_Vec.hxx>

#include <cmath>
#include <stdexcept>
#include <string>

uint32_t OcctKernel::chamferDistAngle(uint32_t solidId, std::vector<uint32_t> edgeIds,
                                      double distance, double angleDeg) {
    try {
        double angleRad = angleDeg * M_PI / 180.0;
        const auto& solid = get(solidId);
        BRepFilletAPI_MakeChamfer maker(TopoDS::Solid(solid));
        for (uint32_t eid : edgeIds) {
            const TopoDS_Edge& edge = TopoDS::Edge(get(eid));
            // Find an adjacent face for this edge
            TopoDS_Face adjFace;
            for (TopExp_Explorer ex(solid, TopAbs_FACE); ex.More(); ex.Next()) {
                const TopoDS_Face& f = TopoDS::Face(ex.Current());
                for (TopExp_Explorer ex2(f, TopAbs_EDGE); ex2.More(); ex2.Next()) {
                    if (ex2.Current().IsSame(edge)) {
                        adjFace = f;
                        break;
                    }
                }
                if (!adjFace.IsNull())
                    break;
            }
            if (adjFace.IsNull()) {
                throw std::runtime_error("chamferDistAngle: no adjacent face found for edge");
            }
            maker.AddDA(distance, angleRad, edge, adjFace);
        }
        maker.Build();
        if (!maker.IsDone()) {
            throw std::runtime_error("chamferDistAngle: operation failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("chamferDistAngle: ") + e.what());
    }
}

uint32_t OcctKernel::shell(uint32_t solidId, std::vector<uint32_t> faceIds, double thickness) {
    try {
        NCollection_List<TopoDS_Shape> facesToRemove;
        for (uint32_t fid : faceIds) {
            facesToRemove.Append(get(fid));
        }
        BRepOffsetAPI_MakeThickSolid maker;
        maker.MakeThickSolidByJoin(get(solidId), facesToRemove, thickness, 1e-3);
        maker.Build();
        if (!maker.IsDone()) {
            throw std::runtime_error("shell: operation failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("shell: ") + e.what());
    }
}

uint32_t OcctKernel::offset(uint32_t solidId, double distance) {
    try {
        BRepOffsetAPI_MakeOffsetShape maker;
        maker.PerformByJoin(get(solidId), distance, 1e-3);
        maker.Build();
        if (!maker.IsDone()) {
            throw std::runtime_error("offset: operation failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("offset: ") + e.what());
    }
}

uint32_t OcctKernel::draft(uint32_t shapeId, uint32_t faceId, double angleRad, double dx, double dy,
                           double dz) {
    try {
        gp_Dir pullDir(dx, dy, dz);
        BRepOffsetAPI_DraftAngle maker(get(shapeId));
        maker.Add(TopoDS::Face(get(faceId)), pullDir, angleRad, gp_Pln());
        maker.Build();
        if (!maker.IsDone()) {
            throw std::runtime_error("draft: operation failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("draft: ") + e.what());
    }
}

uint32_t OcctKernel::thicken(uint32_t shapeId, double thickness) {
    try {
        const auto& shape = get(shapeId);

        // For faces/shells: use BRepOffset_MakeOffset to produce a solid
        if (shape.ShapeType() == TopAbs_FACE || shape.ShapeType() == TopAbs_SHELL) {
            BRepOffset_MakeOffset offsetMaker;
            offsetMaker.Initialize(shape, thickness, 1e-3, BRepOffset_Skin, false, false,
                                   GeomAbs_Arc, true);
            offsetMaker.MakeOffsetShape();
            if (!offsetMaker.IsDone()) {
                throw std::runtime_error("thicken: offset operation failed");
            }
            return store(offsetMaker.Shape());
        }

        // For solids: use MakeThickSolid (hollow)
        NCollection_List<TopoDS_Shape> emptyList;
        BRepOffsetAPI_MakeThickSolid maker;
        maker.MakeThickSolidByJoin(shape, emptyList, thickness, 1e-3);
        maker.Build();
        if (!maker.IsDone()) {
            throw std::runtime_error("thicken: operation failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("thicken: ") + e.what());
    }
}

uint32_t OcctKernel::defeature(uint32_t shapeId, std::vector<uint32_t> faceIds) {
    try {
        // Defeature by removing faces and letting OCCT fill the gaps
        // Use BRepAlgoAPI_Defeaturing (available in OCCT 7.4+)
        // For now, use offset with zero distance on selected faces
        // TODO: use BRepAlgoAPI_Defeaturing when V8 header is confirmed
        NCollection_List<TopoDS_Shape> facesToRemove;
        for (uint32_t fid : faceIds) {
            facesToRemove.Append(get(fid));
        }
        BRepOffsetAPI_MakeThickSolid maker;
        maker.MakeThickSolidByJoin(get(shapeId), facesToRemove, 0.0, 1e-3);
        maker.Build();
        if (!maker.IsDone()) {
            throw std::runtime_error("defeature: operation failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("defeature: ") + e.what());
    }
}

uint32_t OcctKernel::reverseShape(uint32_t id) {
    try {
        TopoDS_Shape reversed = get(id).Reversed();
        return store(reversed);
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("reverseShape: ") + e.what());
    }
}

uint32_t OcctKernel::simplify(uint32_t id) {
    // Alias for unifySameDomain
    return unifySameDomain(id);
}

uint32_t OcctKernel::filletVariable(uint32_t solidId, uint32_t edgeId, double startRadius,
                                    double endRadius) {
    try {
        BRepFilletAPI_MakeFillet maker(TopoDS::Solid(get(solidId)));
        maker.Add(startRadius, endRadius, TopoDS::Edge(get(edgeId)));
        maker.Build();
        if (!maker.IsDone()) {
            throw std::runtime_error("filletVariable: operation failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("filletVariable: ") + e.what());
    }
}

uint32_t OcctKernel::offsetWire2D(uint32_t wireId, double offset, int joinType) {
    try {
        GeomAbs_JoinType jt;
        switch (joinType) {
        case 1:
            jt = GeomAbs_Intersection;
            break;
        case 2:
            jt = GeomAbs_Tangent;
            break;
        default:
            jt = GeomAbs_Arc;
            break;
        }
        BRepOffsetAPI_MakeOffset maker(TopoDS::Wire(get(wireId)), jt);
        maker.Perform(offset);
        if (!maker.IsDone()) {
            throw std::runtime_error("offsetWire2D: operation failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("offsetWire2D: ") + e.what());
    }
}
