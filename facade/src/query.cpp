#include "occt_kernel.h"

#include <BRepAdaptor_Surface.hxx>
#include <BRepBndLib.hxx>
#include <BRepGProp.hxx>
#include <BRep_Tool.hxx>
#include <Bnd_Box.hxx>
#include <GProp_GProps.hxx>
#include <GeomAbs_SurfaceType.hxx>
#include <ShapeAnalysis.hxx>
#include <Standard_Failure.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Wire.hxx>
#include <gp_Pnt.hxx>
#include <gp_Vec.hxx>

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

double OcctKernel::getLength(uint32_t id) {
    try {
        const auto& shape = get(id);
        GProp_GProps props;
        BRepGProp::LinearProperties(shape, props);
        return props.Mass();
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("getLength: ") + e.what());
    }
}

std::vector<double> OcctKernel::getCenterOfMass(uint32_t id) {
    try {
        const auto& shape = get(id);
        GProp_GProps props;
        BRepGProp::VolumeProperties(shape, props);
        gp_Pnt com = props.CentreOfMass();
        return {com.X(), com.Y(), com.Z()};
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("getCenterOfMass: ") + e.what());
    }
}

std::vector<double> OcctKernel::vertexPosition(uint32_t vertexId) {
    try {
        gp_Pnt p = BRep_Tool::Pnt(TopoDS::Vertex(get(vertexId)));
        return {p.X(), p.Y(), p.Z()};
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("vertexPosition: ") + e.what());
    }
}

std::string OcctKernel::surfaceType(uint32_t faceId) {
    try {
        BRepAdaptor_Surface surf(TopoDS::Face(get(faceId)));
        switch (surf.GetType()) {
        case GeomAbs_Plane:
            return "plane";
        case GeomAbs_Cylinder:
            return "cylinder";
        case GeomAbs_Cone:
            return "cone";
        case GeomAbs_Sphere:
            return "sphere";
        case GeomAbs_Torus:
            return "torus";
        case GeomAbs_BezierSurface:
            return "bezier";
        case GeomAbs_BSplineSurface:
            return "bspline";
        case GeomAbs_SurfaceOfRevolution:
            return "revolution";
        case GeomAbs_SurfaceOfExtrusion:
            return "extrusion";
        case GeomAbs_OffsetSurface:
            return "offset";
        default:
            return "other";
        }
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("surfaceType: ") + e.what());
    }
}

std::vector<double> OcctKernel::surfaceNormal(uint32_t faceId, double u, double v) {
    try {
        BRepAdaptor_Surface surf(TopoDS::Face(get(faceId)));
        gp_Pnt pt;
        gp_Vec d1u, d1v;
        surf.D1(u, v, pt, d1u, d1v);
        gp_Vec normal = d1u.Crossed(d1v);
        if (normal.Magnitude() > 1e-10) {
            normal.Normalize();
        }
        return {normal.X(), normal.Y(), normal.Z()};
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("surfaceNormal: ") + e.what());
    }
}

std::vector<double> OcctKernel::pointOnSurface(uint32_t faceId, double u, double v) {
    try {
        BRepAdaptor_Surface surf(TopoDS::Face(get(faceId)));
        gp_Pnt pt = surf.Value(u, v);
        return {pt.X(), pt.Y(), pt.Z()};
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("pointOnSurface: ") + e.what());
    }
}

uint32_t OcctKernel::outerWire(uint32_t faceId) {
    try {
        TopoDS_Wire wire = ShapeAnalysis::OuterWire(TopoDS::Face(get(faceId)));
        if (wire.IsNull()) {
            throw std::runtime_error("outerWire: face has no outer wire");
        }
        return store(wire);
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("outerWire: ") + e.what());
    }
}
