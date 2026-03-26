#include "occt_kernel.h"

#include <BRepAdaptor_Curve.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRep_Tool.hxx>
#include <GCPnts_AbscissaPoint.hxx>
#include <GeomAPI_Interpolate.hxx>
#include <GeomAPI_PointsToBSpline.hxx>
#include <GeomAbs_CurveType.hxx>
#include <Geom_Curve.hxx>
#include <NCollection_Array1.hxx>
#include <NCollection_HArray1.hxx>
#include <Poly_Triangulation.hxx>
#include <Standard_Failure.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>

#include <stdexcept>
#include <string>

std::string OcctKernel::curveType(uint32_t edgeId) {
    try {
        BRepAdaptor_Curve curve(TopoDS::Edge(get(edgeId)));
        switch (curve.GetType()) {
        case GeomAbs_Line:
            return "line";
        case GeomAbs_Circle:
            return "circle";
        case GeomAbs_Ellipse:
            return "ellipse";
        case GeomAbs_Hyperbola:
            return "hyperbola";
        case GeomAbs_Parabola:
            return "parabola";
        case GeomAbs_BezierCurve:
            return "bezier";
        case GeomAbs_BSplineCurve:
            return "bspline";
        case GeomAbs_OffsetCurve:
            return "offset";
        default:
            return "other";
        }
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("curveType: ") + e.what());
    }
}

std::vector<double> OcctKernel::curvePointAtParam(uint32_t edgeId, double param) {
    try {
        BRepAdaptor_Curve curve(TopoDS::Edge(get(edgeId)));
        gp_Pnt pt = curve.Value(param);
        return {pt.X(), pt.Y(), pt.Z()};
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("curvePointAtParam: ") + e.what());
    }
}

std::vector<double> OcctKernel::curveTangent(uint32_t edgeId, double param) {
    try {
        BRepAdaptor_Curve curve(TopoDS::Edge(get(edgeId)));
        gp_Pnt pt;
        gp_Vec tangent;
        curve.D1(param, pt, tangent);
        if (tangent.Magnitude() > 1e-10) {
            tangent.Normalize();
        }
        return {tangent.X(), tangent.Y(), tangent.Z()};
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("curveTangent: ") + e.what());
    }
}

std::vector<double> OcctKernel::curveParameters(uint32_t edgeId) {
    try {
        BRepAdaptor_Curve curve(TopoDS::Edge(get(edgeId)));
        return {curve.FirstParameter(), curve.LastParameter()};
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("curveParameters: ") + e.what());
    }
}

bool OcctKernel::curveIsClosed(uint32_t edgeId) {
    try {
        BRepAdaptor_Curve curve(TopoDS::Edge(get(edgeId)));
        return curve.IsClosed();
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("curveIsClosed: ") + e.what());
    }
}

double OcctKernel::curveLength(uint32_t edgeId) {
    try {
        BRepAdaptor_Curve curve(TopoDS::Edge(get(edgeId)));
        return GCPnts_AbscissaPoint::Length(curve);
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("curveLength: ") + e.what());
    }
}

uint32_t OcctKernel::interpolatePoints(std::vector<double> flatPoints, bool periodic) {
    try {
        int nPts = static_cast<int>(flatPoints.size()) / 3;
        if (nPts < 2) {
            throw std::runtime_error("interpolatePoints: need at least 2 points");
        }

        Handle(NCollection_HArray1<gp_Pnt>) pts = new NCollection_HArray1<gp_Pnt>(1, nPts);
        for (int i = 0; i < nPts; i++) {
            pts->SetValue(i + 1,
                          gp_Pnt(flatPoints[i * 3], flatPoints[i * 3 + 1], flatPoints[i * 3 + 2]));
        }

        GeomAPI_Interpolate interp(pts, periodic, 1e-6);
        interp.Perform();
        if (!interp.IsDone()) {
            throw std::runtime_error("interpolatePoints: interpolation failed");
        }

        BRepBuilderAPI_MakeEdge edgeMaker(interp.Curve());
        if (!edgeMaker.IsDone()) {
            throw std::runtime_error("interpolatePoints: edge construction failed");
        }
        return store(edgeMaker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("interpolatePoints: ") + e.what());
    }
}

bool OcctKernel::curveIsPeriodic(uint32_t edgeId) {
    try {
        BRepAdaptor_Curve curve(TopoDS::Edge(get(edgeId)));
        return curve.IsPeriodic();
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("curveIsPeriodic: ") + e.what());
    }
}

uint32_t OcctKernel::approximatePoints(std::vector<double> flatPoints, double tolerance) {
    try {
        int nPts = static_cast<int>(flatPoints.size()) / 3;
        if (nPts < 2) {
            throw std::runtime_error("approximatePoints: need at least 2 points");
        }

        NCollection_Array1<gp_Pnt> pts(1, nPts);
        for (int i = 0; i < nPts; i++) {
            pts.SetValue(i + 1,
                         gp_Pnt(flatPoints[i * 3], flatPoints[i * 3 + 1], flatPoints[i * 3 + 2]));
        }

        GeomAPI_PointsToBSpline approx(pts, 3, 8, GeomAbs_C2, tolerance);
        if (!approx.IsDone()) {
            throw std::runtime_error("approximatePoints: approximation failed");
        }

        BRepBuilderAPI_MakeEdge edgeMaker(approx.Curve());
        if (!edgeMaker.IsDone()) {
            throw std::runtime_error("approximatePoints: edge construction failed");
        }
        return store(edgeMaker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("approximatePoints: ") + e.what());
    }
}

bool OcctKernel::hasTriangulation(uint32_t id) {
    try {
        for (TopExp_Explorer ex(get(id), TopAbs_FACE); ex.More(); ex.Next()) {
            TopLoc_Location loc;
            auto tri = BRep_Tool::Triangulation(TopoDS::Face(ex.Current()), loc);
            if (!tri.IsNull())
                return true;
        }
        return false;
    } catch (const Standard_Failure&) {
        return false;
    }
}
