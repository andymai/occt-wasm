#include "occt_kernel.h"

#include <BRepAdaptor_CompCurve.hxx>
#include <BRepAdaptor_Curve.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRep_Tool.hxx>
#include <GCPnts_AbscissaPoint.hxx>
#include <Geom2dAPI_Interpolate.hxx>
#include <Geom2d_BSplineCurve.hxx>
#include <GeomAPI_Interpolate.hxx>
#include <GeomAPI_PointsToBSpline.hxx>
#include <GeomAbs_CurveType.hxx>
#include <Geom_BSplineCurve.hxx>
#include <Geom_Curve.hxx>
#include <Geom_Plane.hxx>
#include <NCollection_Array1.hxx>
#include <NCollection_HArray1.hxx>
#include <Poly_Triangulation.hxx>
#include <Standard_Failure.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <gp_Ax3.hxx>
#include <gp_Dir.hxx>
#include <gp_Pln.hxx>
#include <gp_Pnt.hxx>
#include <gp_Pnt2d.hxx>

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

std::vector<double> OcctKernel::curvePointAtParam(uint32_t id, double param) {
    try {
        const auto& shape = get(id);
        gp_Pnt pt;
        if (shape.ShapeType() == TopAbs_WIRE) {
            BRepAdaptor_CompCurve comp(TopoDS::Wire(shape));
            pt = comp.Value(param);
        } else {
            BRepAdaptor_Curve curve(TopoDS::Edge(shape));
            pt = curve.Value(param);
        }
        return {pt.X(), pt.Y(), pt.Z()};
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("curvePointAtParam: ") + e.what());
    }
}

std::vector<double> OcctKernel::curveTangent(uint32_t id, double param) {
    try {
        const auto& shape = get(id);
        gp_Pnt pt;
        gp_Vec tangent;
        if (shape.ShapeType() == TopAbs_WIRE) {
            BRepAdaptor_CompCurve comp(TopoDS::Wire(shape));
            comp.D1(param, pt, tangent);
        } else {
            BRepAdaptor_Curve curve(TopoDS::Edge(shape));
            curve.D1(param, pt, tangent);
        }
        if (tangent.Magnitude() > 1e-10) {
            tangent.Normalize();
        }
        return {tangent.X(), tangent.Y(), tangent.Z()};
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("curveTangent: ") + e.what());
    }
}

std::vector<double> OcctKernel::curveParameters(uint32_t id) {
    try {
        const auto& shape = get(id);
        if (shape.ShapeType() == TopAbs_WIRE) {
            BRepAdaptor_CompCurve comp(TopoDS::Wire(shape));
            return {comp.FirstParameter(), comp.LastParameter()};
        }
        BRepAdaptor_Curve curve(TopoDS::Edge(shape));
        return {curve.FirstParameter(), curve.LastParameter()};
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("curveParameters: ") + e.what());
    }
}

bool OcctKernel::curveIsClosed(uint32_t id) {
    try {
        const auto& shape = get(id);
        if (shape.ShapeType() == TopAbs_WIRE) {
            return BRep_Tool::IsClosed(shape);
        }
        BRepAdaptor_Curve curve(TopoDS::Edge(shape));
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

uint32_t OcctKernel::liftCurve2dToPlane(std::vector<double> flatPoints2d, double planeOx,
                                        double planeOy, double planeOz, double planeZx,
                                        double planeZy, double planeZz, double planeXx,
                                        double planeXy, double planeXz) {
    try {
        int nPts = static_cast<int>(flatPoints2d.size()) / 2;
        if (nPts < 2) {
            throw std::runtime_error("liftCurve2dToPlane: need at least 2 points");
        }

        // Build the plane from origin + Z-axis + X-axis
        gp_Pnt origin(planeOx, planeOy, planeOz);
        gp_Dir zDir(planeZx, planeZy, planeZz);
        gp_Dir xDir(planeXx, planeXy, planeXz);
        gp_Ax3 ax3(origin, zDir, xDir);
        gp_Pln plane(ax3);

        // Create 2D points array
        Handle(NCollection_HArray1<gp_Pnt2d>) pts2d = new NCollection_HArray1<gp_Pnt2d>(1, nPts);
        for (int i = 0; i < nPts; i++) {
            pts2d->SetValue(i + 1, gp_Pnt2d(flatPoints2d[i * 2], flatPoints2d[i * 2 + 1]));
        }

        // Interpolate through the 2D points
        Geom2dAPI_Interpolate interp(pts2d, false, 1e-6);
        interp.Perform();
        if (!interp.IsDone()) {
            throw std::runtime_error("liftCurve2dToPlane: 2D interpolation failed");
        }

        // Build 3D edge from 2D curve on plane
        Handle(Geom_Surface) surface = new Geom_Plane(plane);
        BRepBuilderAPI_MakeEdge edgeMaker(interp.Curve(), surface);
        if (!edgeMaker.IsDone()) {
            throw std::runtime_error("liftCurve2dToPlane: edge construction failed");
        }
        return store(edgeMaker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("liftCurve2dToPlane: ") + e.what());
    }
}

NurbsCurveData OcctKernel::getNurbsCurveData(uint32_t edgeId) {
    try {
        BRepAdaptor_Curve adaptor(TopoDS::Edge(get(edgeId)));
        if (adaptor.GetType() != GeomAbs_BSplineCurve) {
            throw std::runtime_error("getNurbsCurveData: edge is not a BSpline curve");
        }

        Handle(Geom_BSplineCurve) bspline = adaptor.BSpline();
        NurbsCurveData result{};
        result.degree = bspline->Degree();
        result.rational = bspline->IsRational();
        result.periodic = bspline->IsPeriodic();

        // Knots and multiplicities
        int nKnots = bspline->NbKnots();
        result.knots.resize(nKnots);
        result.multiplicities.resize(nKnots);
        for (int i = 1; i <= nKnots; i++) {
            result.knots[i - 1] = bspline->Knot(i);
            result.multiplicities[i - 1] = bspline->Multiplicity(i);
        }

        // Poles (control points)
        int nPoles = bspline->NbPoles();
        result.poles.resize(nPoles * 3);
        for (int i = 1; i <= nPoles; i++) {
            gp_Pnt p = bspline->Pole(i);
            result.poles[(i - 1) * 3] = p.X();
            result.poles[(i - 1) * 3 + 1] = p.Y();
            result.poles[(i - 1) * 3 + 2] = p.Z();
        }

        // Weights (only if rational)
        if (bspline->IsRational()) {
            result.weights.resize(nPoles);
            for (int i = 1; i <= nPoles; i++) {
                result.weights[i - 1] = bspline->Weight(i);
            }
        }

        return result;
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("getNurbsCurveData: ") + e.what());
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
