#include "occt_kernel.h"

#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCone.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepPrimAPI_MakeSphere.hxx>
#include <BRepPrimAPI_MakeTorus.hxx>
#include <Standard_Failure.hxx>

#include <stdexcept>
#include <string>

uint32_t OcctKernel::makeBox(double dx, double dy, double dz) {
    try {
        BRepPrimAPI_MakeBox maker(dx, dy, dz);
        maker.Build();
        if (!maker.IsDone()) {
            throw std::runtime_error("makeBox: construction failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeBox: ") + e.what());
    }
}

uint32_t OcctKernel::makeCylinder(double radius, double height) {
    try {
        BRepPrimAPI_MakeCylinder maker(radius, height);
        maker.Build();
        if (!maker.IsDone()) {
            throw std::runtime_error("makeCylinder: construction failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeCylinder: ") + e.what());
    }
}

uint32_t OcctKernel::makeSphere(double radius) {
    try {
        BRepPrimAPI_MakeSphere maker(radius);
        maker.Build();
        if (!maker.IsDone()) {
            throw std::runtime_error("makeSphere: construction failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeSphere: ") + e.what());
    }
}

uint32_t OcctKernel::makeCone(double r1, double r2, double height) {
    try {
        BRepPrimAPI_MakeCone maker(r1, height, r2);
        maker.Build();
        if (!maker.IsDone()) {
            throw std::runtime_error("makeCone: construction failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeCone: ") + e.what());
    }
}

uint32_t OcctKernel::makeTorus(double majorRadius, double minorRadius) {
    try {
        BRepPrimAPI_MakeTorus maker(majorRadius, minorRadius);
        maker.Build();
        if (!maker.IsDone()) {
            throw std::runtime_error("makeTorus: construction failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeTorus: ") + e.what());
    }
}
