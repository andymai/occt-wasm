#include "occt_kernel.h"

#include <BRepAdaptor_Surface.hxx>
#include <BRepBndLib.hxx>
#include <BRepClass_FaceClassifier.hxx>
#include <BRepGProp.hxx>
#include <BRepLProp_SLProps.hxx>
#include <BRep_Tool.hxx>
#include <Bnd_Box.hxx>
#include <GProp_GProps.hxx>
#include <GeomAPI_ProjectPointOnSurf.hxx>
#include <GeomAbs_SurfaceType.hxx>
#include <Geom_Surface.hxx>
#include <ShapeAnalysis.hxx>
#include <ShapeAnalysis_Surface.hxx>
#include <Standard_Failure.hxx>
#include <TopAbs_State.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Wire.hxx>
#include <gp_Pnt.hxx>
#include <gp_Pnt2d.hxx>
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

std::vector<double> OcctKernel::getLinearCenterOfMass(uint32_t id) {
    try {
        const auto& shape = get(id);
        GProp_GProps props;
        BRepGProp::LinearProperties(shape, props);
        gp_Pnt com = props.CentreOfMass();
        return {com.X(), com.Y(), com.Z()};
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("getLinearCenterOfMass: ") + e.what());
    }
}

std::vector<double> OcctKernel::surfaceCurvature(uint32_t faceId, double u, double v) {
    try {
        BRepAdaptor_Surface surf(TopoDS::Face(get(faceId)));
        BRepLProp_SLProps props(surf, u, v, 2, 1e-6);
        if (!props.IsCurvatureDefined()) {
            throw std::runtime_error("surfaceCurvature: curvature not defined at point");
        }
        double mean = props.MeanCurvature();
        double gaussian = props.GaussianCurvature();
        double maxK = props.MaxCurvature();
        double minK = props.MinCurvature();
        return {mean, gaussian, maxK, minK};
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("surfaceCurvature: ") + e.what());
    }
}

std::vector<double> OcctKernel::uvBounds(uint32_t faceId) {
    try {
        BRepAdaptor_Surface surf(TopoDS::Face(get(faceId)));
        return {surf.FirstUParameter(), surf.LastUParameter(), surf.FirstVParameter(),
                surf.LastVParameter()};
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("uvBounds: ") + e.what());
    }
}

std::vector<double> OcctKernel::uvFromPoint(uint32_t faceId, double x, double y, double z) {
    try {
        TopoDS_Face face = TopoDS::Face(get(faceId));
        Handle(Geom_Surface) geomSurf = BRep_Tool::Surface(face);
        ShapeAnalysis_Surface sas(geomSurf);
        gp_Pnt2d uv = sas.ValueOfUV(gp_Pnt(x, y, z), 1e-6);
        return {uv.X(), uv.Y()};
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("uvFromPoint: ") + e.what());
    }
}

std::vector<double> OcctKernel::projectPointOnFace(uint32_t faceId, double x, double y, double z) {
    try {
        TopoDS_Face face = TopoDS::Face(get(faceId));
        Handle(Geom_Surface) geomSurf = BRep_Tool::Surface(face);
        GeomAPI_ProjectPointOnSurf proj(gp_Pnt(x, y, z), geomSurf);
        if (proj.NbPoints() == 0) {
            throw std::runtime_error("projectPointOnFace: no projection found");
        }
        gp_Pnt nearest = proj.NearestPoint();
        double u, v;
        proj.LowerDistanceParameters(u, v);
        return {nearest.X(), nearest.Y(), nearest.Z(), u, v, proj.LowerDistance()};
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("projectPointOnFace: ") + e.what());
    }
}

std::string OcctKernel::classifyPointOnFace(uint32_t faceId, double u, double v) {
    try {
        TopoDS_Face face = TopoDS::Face(get(faceId));
        BRepClass_FaceClassifier classifier(face, gp_Pnt2d(u, v), 1e-6);
        switch (classifier.State()) {
        case TopAbs_IN:
            return "in";
        case TopAbs_OUT:
            return "out";
        case TopAbs_ON:
            return "on";
        default:
            return "unknown";
        }
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("classifyPointOnFace: ") + e.what());
    }
}
