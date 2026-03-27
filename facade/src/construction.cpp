#include "occt_kernel.h"

#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeSolid.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_Sewing.hxx>
#include <BRepOffsetAPI_MakeFilling.hxx>
#include <BRep_Builder.hxx>
#include <BRep_Tool.hxx>
#include <GC_MakeArcOfCircle.hxx>
#include <Geom2d_Line.hxx>
#include <GeomAbs_Shape.hxx>
#include <Geom_BezierCurve.hxx>
#include <Geom_Circle.hxx>
#include <Geom_CylindricalSurface.hxx>
#include <Geom_Ellipse.hxx>
#include <Geom_Surface.hxx>
#include <Geom_TrimmedCurve.hxx>
#include <NCollection_Array1.hxx>
#include <ShapeAnalysis.hxx>
#include <ShapeFix_Wire.hxx>
#include <Standard_Failure.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Builder.hxx>
#include <TopoDS_Compound.hxx>
#include <TopoDS_Wire.hxx>
#include <gp_Ax2.hxx>
#include <gp_Ax3.hxx>
#include <gp_Circ.hxx>
#include <gp_Dir.hxx>
#include <gp_Dir2d.hxx>
#include <gp_Elips.hxx>
#include <gp_Pnt.hxx>
#include <gp_Pnt2d.hxx>

#include <algorithm>
#include <cmath>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

uint32_t OcctKernel::makeVertex(double x, double y, double z) {
    try {
        BRepBuilderAPI_MakeVertex maker(gp_Pnt(x, y, z));
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeVertex: ") + e.what());
    }
}

uint32_t OcctKernel::makeEdge(uint32_t v1, uint32_t v2) {
    try {
        BRepBuilderAPI_MakeEdge maker(TopoDS::Vertex(get(v1)), TopoDS::Vertex(get(v2)));
        if (!maker.IsDone()) {
            throw std::runtime_error("makeEdge: construction failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeEdge: ") + e.what());
    }
}

uint32_t OcctKernel::makeWire(std::vector<uint32_t> edgeIds) {
    try {
        BRepBuilderAPI_MakeWire maker;
        for (uint32_t eid : edgeIds) {
            maker.Add(TopoDS::Edge(get(eid)));
            // If Add fails partway, try continuing — the wire may still be usable
        }
        if (maker.IsDone()) {
            return store(maker.Shape());
        }
        // Fallback: try with increased tolerance via ShapeFix_Wire
        // Build a wire from edges directly and let ShapeFix close gaps
        BRep_Builder builder;
        TopoDS_Wire rawWire;
        builder.MakeWire(rawWire);
        for (uint32_t eid : edgeIds) {
            builder.Add(rawWire, TopoDS::Edge(get(eid)));
        }
        ShapeFix_Wire fixer(rawWire, TopoDS_Face(), 1e-3);
        fixer.FixConnected();
        fixer.FixReorder();
        if (fixer.Wire().IsNull()) {
            throw std::runtime_error("makeWire: construction failed (even with ShapeFix)");
        }
        return store(fixer.Wire());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeWire: ") + e.what());
    }
}

uint32_t OcctKernel::makeFace(uint32_t wireId) {
    try {
        BRepBuilderAPI_MakeFace maker(TopoDS::Wire(get(wireId)));
        if (!maker.IsDone()) {
            throw std::runtime_error("makeFace: construction failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeFace: ") + e.what());
    }
}

uint32_t OcctKernel::makeSolid(uint32_t shellId) {
    try {
        BRepBuilderAPI_MakeSolid maker(TopoDS::Shell(get(shellId)));
        if (!maker.IsDone()) {
            throw std::runtime_error("makeSolid: construction failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeSolid: ") + e.what());
    }
}

uint32_t OcctKernel::sew(std::vector<uint32_t> shapeIds, double tolerance) {
    try {
        BRepBuilderAPI_Sewing sewer(tolerance);
        for (uint32_t sid : shapeIds) {
            sewer.Add(get(sid));
        }
        sewer.Perform();
        return store(sewer.SewedShape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("sew: ") + e.what());
    }
}

uint32_t OcctKernel::makeCompound(std::vector<uint32_t> shapeIds) {
    try {
        TopoDS_Compound compound;
        TopoDS_Builder builder;
        builder.MakeCompound(compound);
        for (uint32_t sid : shapeIds) {
            builder.Add(compound, get(sid));
        }
        return store(compound);
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeCompound: ") + e.what());
    }
}

uint32_t OcctKernel::makeLineEdge(double x1, double y1, double z1, double x2, double y2,
                                  double z2) {
    try {
        BRepBuilderAPI_MakeEdge maker(gp_Pnt(x1, y1, z1), gp_Pnt(x2, y2, z2));
        if (!maker.IsDone()) {
            throw std::runtime_error("makeLineEdge: construction failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeLineEdge: ") + e.what());
    }
}

uint32_t OcctKernel::makeCircleEdge(double cx, double cy, double cz, double nx, double ny,
                                    double nz, double radius) {
    try {
        gp_Ax2 axis(gp_Pnt(cx, cy, cz), gp_Dir(nx, ny, nz));
        gp_Circ circle(axis, radius);
        BRepBuilderAPI_MakeEdge maker(circle);
        if (!maker.IsDone()) {
            throw std::runtime_error("makeCircleEdge: construction failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeCircleEdge: ") + e.what());
    }
}

uint32_t OcctKernel::makeCircleArc(double cx, double cy, double cz, double nx, double ny, double nz,
                                   double radius, double startAngle, double endAngle) {
    try {
        gp_Ax2 axis(gp_Pnt(cx, cy, cz), gp_Dir(nx, ny, nz));
        gp_Circ circle(axis, radius);
        Handle(Geom_TrimmedCurve) arc =
            new Geom_TrimmedCurve(new Geom_Circle(circle), startAngle, endAngle);
        BRepBuilderAPI_MakeEdge maker(arc);
        if (!maker.IsDone()) {
            throw std::runtime_error("makeCircleArc: construction failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeCircleArc: ") + e.what());
    }
}

uint32_t OcctKernel::makeArcEdge(double x1, double y1, double z1, double x2, double y2, double z2,
                                 double x3, double y3, double z3) {
    try {
        GC_MakeArcOfCircle arc(gp_Pnt(x1, y1, z1), gp_Pnt(x2, y2, z2), gp_Pnt(x3, y3, z3));
        if (!arc.IsDone()) {
            throw std::runtime_error("makeArcEdge: construction failed");
        }
        BRepBuilderAPI_MakeEdge maker(arc.Value());
        if (!maker.IsDone()) {
            throw std::runtime_error("makeArcEdge: edge construction failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeArcEdge: ") + e.what());
    }
}

uint32_t OcctKernel::makeEllipseEdge(double cx, double cy, double cz, double nx, double ny,
                                     double nz, double majorRadius, double minorRadius) {
    try {
        gp_Ax2 axis(gp_Pnt(cx, cy, cz), gp_Dir(nx, ny, nz));
        gp_Elips ellipse(axis, majorRadius, minorRadius);
        BRepBuilderAPI_MakeEdge maker(ellipse);
        if (!maker.IsDone()) {
            throw std::runtime_error("makeEllipseEdge: construction failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeEllipseEdge: ") + e.what());
    }
}

uint32_t OcctKernel::makeBezierEdge(std::vector<double> flatPoints) {
    try {
        int nPts = static_cast<int>(flatPoints.size()) / 3;
        if (nPts < 2) {
            throw std::runtime_error("makeBezierEdge: need at least 2 points");
        }
        NCollection_Array1<gp_Pnt> poles(1, nPts);
        for (int i = 0; i < nPts; i++) {
            poles.SetValue(i + 1,
                           gp_Pnt(flatPoints[i * 3], flatPoints[i * 3 + 1], flatPoints[i * 3 + 2]));
        }
        Handle(Geom_BezierCurve) curve = new Geom_BezierCurve(poles);
        BRepBuilderAPI_MakeEdge maker(curve);
        if (!maker.IsDone()) {
            throw std::runtime_error("makeBezierEdge: construction failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeBezierEdge: ") + e.what());
    }
}

uint32_t OcctKernel::makeEllipseArc(double cx, double cy, double cz, double nx, double ny,
                                    double nz, double majorRadius, double minorRadius,
                                    double startAngle, double endAngle) {
    try {
        gp_Ax2 axis(gp_Pnt(cx, cy, cz), gp_Dir(nx, ny, nz));
        gp_Elips ellipse(axis, majorRadius, minorRadius);
        Handle(Geom_TrimmedCurve) arc =
            new Geom_TrimmedCurve(new Geom_Ellipse(ellipse), startAngle, endAngle);
        BRepBuilderAPI_MakeEdge maker(arc);
        if (!maker.IsDone()) {
            throw std::runtime_error("makeEllipseArc: construction failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeEllipseArc: ") + e.what());
    }
}

uint32_t OcctKernel::makeHelixWire(double px, double py, double pz, double dx, double dy, double dz,
                                   double pitch, double height, double radius) {
    try {
        gp_Ax3 ax3(gp_Pnt(px, py, pz), gp_Dir(dx, dy, dz));
        Handle(Geom_CylindricalSurface) cylinder = new Geom_CylindricalSurface(ax3, radius);

        // A helix on a cylindrical surface is a 2D line: u = t, v = pitch/(2*pi) * t
        double slope = pitch / (2.0 * M_PI);
        double nTurns = height / pitch;
        double uMax = nTurns * 2.0 * M_PI;

        Handle(Geom2d_Line) line2d = new Geom2d_Line(gp_Pnt2d(0, 0), gp_Dir2d(1, slope));

        BRepBuilderAPI_MakeEdge edgeMaker(line2d, cylinder, 0.0, uMax);
        if (!edgeMaker.IsDone()) {
            throw std::runtime_error("makeHelixWire: edge construction failed");
        }
        BRepBuilderAPI_MakeWire wireMaker(edgeMaker.Edge());
        if (!wireMaker.IsDone()) {
            throw std::runtime_error("makeHelixWire: wire construction failed");
        }
        return store(wireMaker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeHelixWire: ") + e.what());
    }
}

uint32_t OcctKernel::makeNonPlanarFace(uint32_t wireId) {
    try {
        BRepOffsetAPI_MakeFilling filler;
        for (TopExp_Explorer ex(get(wireId), TopAbs_EDGE); ex.More(); ex.Next()) {
            filler.Add(TopoDS::Edge(ex.Current()), GeomAbs_C0);
        }
        filler.Build();
        if (!filler.IsDone()) {
            throw std::runtime_error("makeNonPlanarFace: construction failed");
        }
        return store(filler.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeNonPlanarFace: ") + e.what());
    }
}

uint32_t OcctKernel::addHolesInFace(uint32_t faceId, std::vector<uint32_t> holeWireIds) {
    try {
        TopoDS_Face face = TopoDS::Face(get(faceId));
        BRepBuilderAPI_MakeFace maker(face);
        for (uint32_t wid : holeWireIds) {
            // Holes must be reversed orientation
            TopoDS_Wire hole = TopoDS::Wire(get(wid));
            hole.Reverse();
            maker.Add(hole);
        }
        if (!maker.IsDone()) {
            throw std::runtime_error("addHolesInFace: construction failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("addHolesInFace: ") + e.what());
    }
}

uint32_t OcctKernel::removeHolesFromFace(uint32_t faceId, std::vector<int> holeIndices) {
    try {
        TopoDS_Face face = TopoDS::Face(get(faceId));
        // Collect inner wires (all wires except the outer wire)
        TopoDS_Wire outer = ShapeAnalysis::OuterWire(face);
        std::vector<TopoDS_Wire> innerWires;
        for (TopExp_Explorer ex(face, TopAbs_WIRE); ex.More(); ex.Next()) {
            TopoDS_Wire w = TopoDS::Wire(ex.Current());
            if (!w.IsSame(outer)) {
                innerWires.push_back(w);
            }
        }
        // Build set of indices to remove
        std::set<int> removeSet(holeIndices.begin(), holeIndices.end());
        // Rebuild face: start from outer wire on the same surface
        Handle(Geom_Surface) geomSurf = BRep_Tool::Surface(face);
        BRepBuilderAPI_MakeFace maker(geomSurf, outer, true);
        for (int i = 0; i < static_cast<int>(innerWires.size()); i++) {
            if (removeSet.find(i) == removeSet.end()) {
                maker.Add(innerWires[i]);
            }
        }
        if (!maker.IsDone()) {
            throw std::runtime_error("removeHolesFromFace: construction failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("removeHolesFromFace: ") + e.what());
    }
}

uint32_t OcctKernel::solidFromShell(uint32_t shellId) {
    return makeSolid(shellId);
}

uint32_t OcctKernel::buildSolidFromFaces(std::vector<uint32_t> faceIds, double tolerance) {
    return sewAndSolidify(faceIds, tolerance);
}

uint32_t OcctKernel::sewAndSolidify(std::vector<uint32_t> faceIds, double tolerance) {
    try {
        BRepBuilderAPI_Sewing sewer(tolerance);
        for (uint32_t fid : faceIds) {
            sewer.Add(get(fid));
        }
        sewer.Perform();
        TopoDS_Shape sewn = sewer.SewedShape();
        // Try to make a solid from the sewn shell
        if (sewn.ShapeType() == TopAbs_SHELL) {
            BRepBuilderAPI_MakeSolid maker(TopoDS::Shell(sewn));
            if (maker.IsDone()) {
                return store(maker.Shape());
            }
        }
        return store(sewn);
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("sewAndSolidify: ") + e.what());
    }
}

uint32_t OcctKernel::buildTriFace(double ax, double ay, double az, double bx, double by, double bz,
                                  double cx2, double cy2, double cz2) {
    try {
        gp_Pnt pa(ax, ay, az), pb(bx, by, bz), pc(cx2, cy2, cz2);
        BRepBuilderAPI_MakeWire wireMaker;
        wireMaker.Add(BRepBuilderAPI_MakeEdge(pa, pb).Edge());
        wireMaker.Add(BRepBuilderAPI_MakeEdge(pb, pc).Edge());
        wireMaker.Add(BRepBuilderAPI_MakeEdge(pc, pa).Edge());
        if (!wireMaker.IsDone()) {
            throw std::runtime_error("buildTriFace: wire construction failed");
        }
        BRepBuilderAPI_MakeFace faceMaker(wireMaker.Wire());
        if (!faceMaker.IsDone()) {
            throw std::runtime_error("buildTriFace: face construction failed");
        }
        return store(faceMaker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("buildTriFace: ") + e.what());
    }
}
