#include "occt_kernel.h"

#include <BRepAlgoAPI_Section.hxx>
#include <BRepFilletAPI_MakeChamfer.hxx>
#include <BRepFilletAPI_MakeFillet.hxx>
#include <BRepOffsetAPI_DraftAngle.hxx>
#include <BRepOffsetAPI_MakeOffsetShape.hxx>
#include <BRepOffsetAPI_MakeThickSolid.hxx>
#include <BRepOffset_Mode.hxx>
#include <BRepPrimAPI_MakePrism.hxx>
#include <BRepPrimAPI_MakeRevol.hxx>
#include <NCollection_List.hxx>
#include <Standard_Failure.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <gp_Ax1.hxx>
#include <gp_Dir.hxx>
#include <gp_Pnt.hxx>
#include <gp_Vec.hxx>

#include <stdexcept>
#include <string>

uint32_t OcctKernel::section(uint32_t a, uint32_t b) {
    try {
        BRepAlgoAPI_Section op(get(a), get(b));
        op.Build();
        if (!op.IsDone() || op.HasErrors()) {
            throw std::runtime_error("section: operation failed");
        }
        return store(op.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("section: ") + e.what());
    }
}

uint32_t OcctKernel::extrude(uint32_t shapeId, double dx, double dy, double dz) {
    try {
        BRepPrimAPI_MakePrism maker(get(shapeId), gp_Vec(dx, dy, dz));
        maker.Build();
        if (!maker.IsDone()) {
            throw std::runtime_error("extrude: operation failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("extrude: ") + e.what());
    }
}

uint32_t OcctKernel::revolve(uint32_t shapeId, double px, double py, double pz, double dx,
                             double dy, double dz, double angleRad) {
    try {
        gp_Ax1 axis(gp_Pnt(px, py, pz), gp_Dir(dx, dy, dz));
        BRepPrimAPI_MakeRevol maker(get(shapeId), axis, angleRad);
        maker.Build();
        if (!maker.IsDone()) {
            throw std::runtime_error("revolve: operation failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("revolve: ") + e.what());
    }
}

uint32_t OcctKernel::fillet(uint32_t solidId, std::vector<uint32_t> edgeIds, double radius) {
    try {
        BRepFilletAPI_MakeFillet maker(TopoDS::Solid(get(solidId)));
        for (uint32_t eid : edgeIds) {
            maker.Add(radius, TopoDS::Edge(get(eid)));
        }
        maker.Build();
        if (!maker.IsDone()) {
            throw std::runtime_error("fillet: operation failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("fillet: ") + e.what());
    }
}

uint32_t OcctKernel::chamfer(uint32_t solidId, std::vector<uint32_t> edgeIds, double distance) {
    try {
        BRepFilletAPI_MakeChamfer maker(TopoDS::Solid(get(solidId)));
        for (uint32_t eid : edgeIds) {
            maker.Add(distance, TopoDS::Edge(get(eid)));
        }
        maker.Build();
        if (!maker.IsDone()) {
            throw std::runtime_error("chamfer: operation failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("chamfer: ") + e.what());
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
        // Thicken: offset a shell/face into a solid
        NCollection_List<TopoDS_Shape> emptyList;
        BRepOffsetAPI_MakeThickSolid maker;
        maker.MakeThickSolidByJoin(get(shapeId), emptyList, thickness, 1e-3);
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
