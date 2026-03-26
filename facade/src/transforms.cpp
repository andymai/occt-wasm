#include "occt_kernel.h"

#include <BRepBuilderAPI_Copy.hxx>
#include <BRepBuilderAPI_GTransform.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <Standard_Failure.hxx>
#include <gp_Ax1.hxx>
#include <gp_Ax2.hxx>
#include <gp_Dir.hxx>
#include <gp_Pnt.hxx>
#include <gp_Trsf.hxx>

#include <stdexcept>
#include <string>

uint32_t OcctKernel::translate(uint32_t id, double dx, double dy, double dz) {
    try {
        gp_Trsf trsf;
        trsf.SetTranslation(gp_Vec(dx, dy, dz));
        BRepBuilderAPI_Transform maker(get(id), trsf, true);
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("translate: ") + e.what());
    }
}

uint32_t OcctKernel::rotate(uint32_t id, double px, double py, double pz, double dx, double dy,
                            double dz, double angleRad) {
    try {
        gp_Trsf trsf;
        trsf.SetRotation(gp_Ax1(gp_Pnt(px, py, pz), gp_Dir(dx, dy, dz)), angleRad);
        BRepBuilderAPI_Transform maker(get(id), trsf, true);
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("rotate: ") + e.what());
    }
}

uint32_t OcctKernel::scale(uint32_t id, double px, double py, double pz, double factor) {
    try {
        gp_Trsf trsf;
        trsf.SetScale(gp_Pnt(px, py, pz), factor);
        BRepBuilderAPI_Transform maker(get(id), trsf, true);
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("scale: ") + e.what());
    }
}

uint32_t OcctKernel::mirror(uint32_t id, double px, double py, double pz, double nx, double ny,
                            double nz) {
    try {
        gp_Trsf trsf;
        trsf.SetMirror(gp_Ax2(gp_Pnt(px, py, pz), gp_Dir(nx, ny, nz)));
        BRepBuilderAPI_Transform maker(get(id), trsf, true);
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("mirror: ") + e.what());
    }
}

uint32_t OcctKernel::copy(uint32_t id) {
    try {
        BRepBuilderAPI_Copy maker(get(id));
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("copy: ") + e.what());
    }
}
