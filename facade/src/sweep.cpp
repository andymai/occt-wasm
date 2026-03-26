#include "occt_kernel.h"

#include <BRepBuilderAPI_TransitionMode.hxx>
#include <BRepOffsetAPI_MakePipe.hxx>
#include <BRepOffsetAPI_MakePipeShell.hxx>
#include <BRepOffsetAPI_ThruSections.hxx>
#include <BRepPrimAPI_MakePrism.hxx>
#include <Standard_Failure.hxx>
#include <TopoDS.hxx>
#include <gp_Dir.hxx>
#include <gp_Vec.hxx>

#include <stdexcept>
#include <string>

uint32_t OcctKernel::pipe(uint32_t profileId, uint32_t spineId) {
    try {
        BRepOffsetAPI_MakePipe maker(TopoDS::Wire(get(spineId)), get(profileId));
        maker.Build();
        if (!maker.IsDone()) {
            throw std::runtime_error("pipe: operation failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("pipe: ") + e.what());
    }
}

uint32_t OcctKernel::loft(std::vector<uint32_t> wireIds, bool isSolid) {
    try {
        BRepOffsetAPI_ThruSections maker(isSolid);
        for (uint32_t wid : wireIds) {
            maker.AddWire(TopoDS::Wire(get(wid)));
        }
        maker.Build();
        if (!maker.IsDone()) {
            throw std::runtime_error("loft: operation failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("loft: ") + e.what());
    }
}

uint32_t OcctKernel::sweep(uint32_t wireId, uint32_t spineId, int transitionMode) {
    try {
        BRepOffsetAPI_MakePipeShell maker(TopoDS::Wire(get(spineId)));
        maker.SetTransitionMode(static_cast<BRepBuilderAPI_TransitionMode>(transitionMode));
        maker.Add(get(wireId));
        maker.Build();
        if (!maker.IsDone()) {
            throw std::runtime_error("sweep: operation failed");
        }
        if (maker.MakeSolid()) {
            return store(maker.Shape());
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("sweep: ") + e.what());
    }
}

uint32_t OcctKernel::sweepPipeShell(uint32_t profileId, uint32_t spineId, bool freenet,
                                    bool smooth) {
    try {
        BRepOffsetAPI_MakePipeShell maker(TopoDS::Wire(get(spineId)));
        if (freenet) {
            maker.SetMode(true); // FrenetBiNormal
        }
        if (smooth) {
            maker.SetTransitionMode(BRepBuilderAPI_RoundCorner);
        }
        maker.Add(get(profileId));
        maker.Build();
        if (!maker.IsDone()) {
            throw std::runtime_error("sweepPipeShell: operation failed");
        }
        maker.MakeSolid();
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("sweepPipeShell: ") + e.what());
    }
}

uint32_t OcctKernel::draftPrism(uint32_t shapeId, double dx, double dy, double dz,
                                double angleDeg) {
    try {
        double angleRad = angleDeg * M_PI / 180.0;
        gp_Vec dir(dx, dy, dz);
        double length = dir.Magnitude();
        if (length < 1e-10) {
            throw std::runtime_error("draftPrism: zero-length direction");
        }
        dir.Normalize();
        // Draft prism: extrude with taper angle
        // Use BRepPrimAPI_MakePrism with draft functionality via offset
        BRepPrimAPI_MakePrism maker(get(shapeId), gp_Vec(dx, dy, dz));
        maker.Build();
        if (!maker.IsDone()) {
            throw std::runtime_error("draftPrism: operation failed");
        }
        // Note: true draft angle requires BRepFeat_MakeDPrism which needs
        // a base face. For now, return the straight prism.
        // TODO: implement proper draft with BRepFeat_MakeDPrism
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("draftPrism: ") + e.what());
    }
}
