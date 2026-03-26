#include "occt_kernel.h"

#include <BRepOffsetAPI_MakePipe.hxx>
#include <BRepOffsetAPI_ThruSections.hxx>
#include <Standard_Failure.hxx>
#include <TopoDS.hxx>

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
