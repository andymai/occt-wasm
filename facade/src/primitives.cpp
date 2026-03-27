#include "occt_kernel.h"

#include <BRepBuilderAPI_GTransform.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepPrimAPI_MakeSphere.hxx>
#include <Standard_Failure.hxx>
#include <gp_GTrsf.hxx>
#include <gp_Pnt.hxx>

#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <string>

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
