#include "occt_kernel.h"

#include <BRepBuilderAPI_GTransform.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCone.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepPrimAPI_MakeSphere.hxx>
#include <BRepPrimAPI_MakeTorus.hxx>
#include <Standard_Failure.hxx>
#include <gp_GTrsf.hxx>
#include <gp_Pnt.hxx>

#include <algorithm>
#include <cmath>
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

uint32_t OcctKernel::makeBoxFromCorners(double x1, double y1, double z1, double x2, double y2,
                                        double z2) {
    try {
        BRepPrimAPI_MakeBox maker(gp_Pnt(x1, y1, z1), gp_Pnt(x2, y2, z2));
        maker.Build();
        if (!maker.IsDone()) {
            throw std::runtime_error("makeBoxFromCorners: construction failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeBoxFromCorners: ") + e.what());
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
        BRepPrimAPI_MakeCone maker(r1, r2, height);
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

uint32_t OcctKernel::makeEllipsoid(double rx, double ry, double rz) {
    try {
        double maxR = std::max({rx, ry, rz});
        BRepPrimAPI_MakeSphere maker(maxR);
        maker.Build();
        if (!maker.IsDone()) {
            throw std::runtime_error("makeEllipsoid: sphere construction failed");
        }
        // Scale non-uniformly to get ellipsoid
        gp_GTrsf gt;
        gt.SetValue(1, 1, rx / maxR);
        gt.SetValue(2, 2, ry / maxR);
        gt.SetValue(3, 3, rz / maxR);
        BRepBuilderAPI_GTransform xform(maker.Shape(), gt, true);
        if (!xform.IsDone()) {
            throw std::runtime_error("makeEllipsoid: transform failed");
        }
        return store(xform.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeEllipsoid: ") + e.what());
    }
}

uint32_t OcctKernel::makeRectangle(double width, double height) {
    try {
        gp_Pnt p0(0, 0, 0), p1(width, 0, 0), p2(width, height, 0), p3(0, height, 0);
        BRepBuilderAPI_MakeWire wireMaker;
        wireMaker.Add(BRepBuilderAPI_MakeEdge(p0, p1).Edge());
        wireMaker.Add(BRepBuilderAPI_MakeEdge(p1, p2).Edge());
        wireMaker.Add(BRepBuilderAPI_MakeEdge(p2, p3).Edge());
        wireMaker.Add(BRepBuilderAPI_MakeEdge(p3, p0).Edge());
        if (!wireMaker.IsDone()) {
            throw std::runtime_error("makeRectangle: wire construction failed");
        }
        BRepBuilderAPI_MakeFace faceMaker(wireMaker.Wire());
        if (!faceMaker.IsDone()) {
            throw std::runtime_error("makeRectangle: face construction failed");
        }
        return store(faceMaker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeRectangle: ") + e.what());
    }
}
