#include "occt_kernel.h"

#include <BRepBndLib.hxx>
#include <BRepGProp.hxx>
#include <Bnd_Box.hxx>
#include <GProp_GProps.hxx>
#include <Standard_Failure.hxx>

#include <stdexcept>
#include <string>

BBoxData OcctKernel::getBoundingBox(uint32_t id) {
    try {
        const auto& shape = get(id);
        Bnd_Box box;
        BRepBndLib::Add(shape, box);
        if (box.IsVoid()) {
            throw std::runtime_error("getBoundingBox: shape has no geometry");
        }
        BBoxData result{};
        box.Get(result.xmin, result.ymin, result.zmin, result.xmax, result.ymax, result.zmax);
        return result;
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("getBoundingBox: ") + e.what());
    }
}

double OcctKernel::getVolume(uint32_t id) {
    try {
        const auto& shape = get(id);
        GProp_GProps props;
        BRepGProp::VolumeProperties(shape, props);
        return props.Mass();
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("getVolume: ") + e.what());
    }
}

double OcctKernel::getSurfaceArea(uint32_t id) {
    try {
        const auto& shape = get(id);
        GProp_GProps props;
        BRepGProp::SurfaceProperties(shape, props);
        return props.Mass();
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("getSurfaceArea: ") + e.what());
    }
}
