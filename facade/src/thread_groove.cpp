// A thread's groove as a solid with exact topology.
//
// A groove swept along a helix meets the cylinder it is cut into in a curve
// the boolean has to find, and the walk that finds it can lose the piece
// between the seam and the tool's end. That leaves the section edges open,
// so the boolean silently leaves the face unsplit. Here nothing is found:
// every curve is known in closed form, and the cover faces lie on the
// cylinder itself, so a cut only matches edges that are already there.
//
// The solid is four helical strips (cover, flank, root, flank) trimmed by the
// planes z = 0 and z = length. All of its edges are affine in (angle, height):
// helices, circles in the end planes, and on the flanks Archimedean spirals.

#include "thread_groove.h"

#include <BRep_Builder.hxx>
#include <Geom2d_BSplineCurve.hxx>
#include <Geom2d_Circle.hxx>
#include <Geom_BSplineCurve.hxx>
#include <Geom_BSplineSurface.hxx>
#include <Geom_Circle.hxx>
#include <Geom_CylindricalSurface.hxx>
#include <Geom_Line.hxx>
#include <Geom_Plane.hxx>
#include <NCollection_Array1.hxx>
#include <NCollection_Array2.hxx>
#include <TopLoc_Location.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Edge.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS_Shell.hxx>
#include <TopoDS_Solid.hxx>
#include <TopoDS_Vertex.hxx>
#include <TopoDS_Wire.hxx>
#include <gp_Ax2.hxx>
#include <gp_Ax22d.hxx>
#include <gp_Pnt.hxx>
#include <gp_Pnt2d.hxx>
#include <gp_Trsf.hxx>
#include <gp_Vec.hxx>

#include <algorithm>
#include <cmath>
#include <deque>
#include <functional>
#include <limits>
#include <stdexcept>
#include <utility>
#include <vector>

namespace occtwasm {
namespace {

constexpr double kTwoPi = 2.0 * M_PI;
constexpr double kTolerance = 1.0e-6;
// Quintic Hermite pieces this short follow a helix within 1e-8 of its radius.
// Pcurves get as many spans, as BRepGProp integrates along them span by span.
constexpr int kSpansPerTurn = 24;
// Faces stay under a turn: a face on a cylinder must not overlap itself in u,
// and BRepGProp loses accuracy over a long face.
constexpr double kLongestPatch = 1.75 * M_PI;

struct Derivatives {
    gp_XYZ point, first, second;
};
using CurveFn = std::function<Derivatives(double)>;

Handle(Geom_BSplineCurve) hermiteCurve(const CurveFn& f, double from, double to, int spans) {
    const double h = (to - from) / spans;
    NCollection_Array1<gp_Pnt> poles(1, 5 * spans + 1);
    NCollection_Array1<double> knots(1, spans + 1);
    NCollection_Array1<int> mults(1, spans + 1);
    for (int i = 0; i <= spans; i++) {
        knots(i + 1) = from + i * h;
        mults(i + 1) = (i == 0 || i == spans) ? 6 : 5;
    }
    for (int i = 0; i < spans; i++) {
        const Derivatives a = f(from + i * h), b = f(from + (i + 1) * h);
        const int k = 5 * i + 1;
        poles(k) = gp_Pnt(a.point);
        poles(k + 1) = gp_Pnt(a.point + a.first * (h / 5));
        poles(k + 2) = gp_Pnt(a.point + a.first * (2 * h / 5) + a.second * (h * h / 20));
        poles(k + 3) = gp_Pnt(b.point - b.first * (2 * h / 5) + b.second * (h * h / 20));
        poles(k + 4) = gp_Pnt(b.point - b.first * (h / 5));
        if (i == spans - 1) poles(k + 5) = gp_Pnt(b.point);
    }
    Handle(Geom_BSplineCurve) curve = new Geom_BSplineCurve(poles, knots, mults, 5);
    // The pieces share value and two derivatives, so the curve is C2 at its knots.
    for (int i = 2; i <= spans; i++) curve->RemoveKnot(i, 3, 1.0e-9);
    return curve;
}

int spansOver(double from, double to) {
    return std::max(2, static_cast<int>(std::ceil(std::abs(to - from) / kTwoPi * kSpansPerTurn)));
}

/// An edge with its parameter range and its (angle, height) at both ends.
struct Edge {
    TopoDS_Edge shape;
    double first, last;
    double angle0, height0, angle1, height1;
    Handle(Geom2d_Curve) onPlane;
};
struct Side {
    const Edge* edge;
    bool forward;
};
using Chain = std::deque<Edge>;

/// The strip of surface between two helices of the profile.
struct Strip {
    int lower, upper;
    Chain endLow, endHigh;
    std::deque<Edge> walls;
};

class GrooveBuilder {
public:
    explicit GrooveBuilder(const ThreadGrooveSpec& spec) : length_(spec.length), rise_(spec.pitch / kTwoPi) {
        radius_[0] = radius_[3] = spec.coverRadius;
        radius_[1] = radius_[2] = spec.rootRadius;
        height_[0] = spec.phase - spec.coverHalfWidth;
        height_[1] = spec.phase - spec.rootHalfWidth;
        height_[2] = spec.phase + spec.rootHalfWidth;
        height_[3] = spec.phase + spec.coverHalfWidth;
        internal_ = spec.coverRadius < spec.rootRadius;
        for (int i = 0; i < 4; i++) {
            start_[i] = -height_[i] / rise_;
            end_[i] = (length_ - height_[i]) / rise_;
        }
        placeCuts();
    }

    TopoDS_Shape build() {
        Strip strips[4] = {makeStrip(0, 3), makeStrip(0, 1), makeStrip(1, 2), makeStrip(2, 3)};
        BRep_Builder builder;
        TopoDS_Shell shell;
        builder.MakeShell(shell);
        for (Strip& strip : strips) {
            for (const TopoDS_Face& face : patches(strip)) builder.Add(shell, face);
        }
        builder.Add(shell, endFace(strips, false));
        builder.Add(shell, endFace(strips, true));
        shell.Closed(true);
        TopoDS_Solid solid;
        builder.MakeSolid(solid);
        builder.Add(solid, shell);
        return solid;
    }

private:
    double length_, rise_;
    double radius_[4], height_[4], start_[4], end_[4];
    bool internal_ = false;
    std::vector<double> cuts_;
    Chain helix_[4];
    std::vector<std::pair<gp_Pnt, TopoDS_Vertex>> vertices_;

    /// Angles the whole groove divides at, kept off the ends of its helices.
    void placeCuts() {
        const double from = *std::min_element(start_, start_ + 4), to = *std::max_element(end_, end_ + 4);
        const int pieces = std::max(1, static_cast<int>(std::ceil((to - from) / kLongestPatch)));
        cuts_.push_back(from);
        for (int j = 1; j < pieces; j++) {
            double cut = from + j * (to - from) / pieces;
            for (bool clear = false; !clear;) {
                clear = true;
                for (int i = 0; i < 4; i++) {
                    if (std::abs(cut - start_[i]) < 1.0e-3 || std::abs(cut - end_[i]) < 1.0e-3) {
                        cut += 2.0e-3;
                        clear = false;
                    }
                }
            }
            cuts_.push_back(cut);
        }
        cuts_.push_back(to);
    }

    std::vector<double> divided(double from, double to) const {
        std::vector<double> out{from};
        for (size_t j = 1; j + 1 < cuts_.size(); j++) {
            if (cuts_[j] > from + 1.0e-9 && cuts_[j] < to - 1.0e-9) out.push_back(cuts_[j]);
        }
        out.push_back(to);
        return out;
    }

    gp_Pnt pointAt(double radius, double angle, double height) const {
        return gp_Pnt(radius * std::cos(angle), radius * std::sin(angle), height);
    }
    bool isCylinder(const Strip& s) const { return radius_[s.lower] == radius_[s.upper]; }
    /// How far across the strip (0 to 1) the point at this angle and height lies.
    double across(const Strip& s, double angle, double height) const {
        return (height - rise_ * angle - height_[s.lower]) / (height_[s.upper] - height_[s.lower]);
    }
    double radiusOn(const Strip& s, double angle, double height) const {
        return radius_[s.lower] + (radius_[s.upper] - radius_[s.lower]) * across(s, angle, height);
    }
    double width(const Strip& s) const {
        return std::hypot(radius_[s.upper] - radius_[s.lower], height_[s.upper] - height_[s.lower]);
    }
    double lowest(const Strip& s, double angle) const { return std::max(0.0, height_[s.lower] + rise_ * angle); }
    double highest(const Strip& s, double angle) const { return std::min(length_, height_[s.upper] + rise_ * angle); }

    TopoDS_Vertex vertexAt(const gp_Pnt& p) {
        for (const auto& known : vertices_) {
            if (known.first.Distance(p) < 1.0e-8) return known.second;
        }
        TopoDS_Vertex v;
        BRep_Builder().MakeVertex(v, p, kTolerance);
        vertices_.emplace_back(p, v);
        return v;
    }

    TopoDS_Edge makeEdge(const Handle(Geom_Curve)& curve, const gp_Pnt& a, const gp_Pnt& b, double first, double last) {
        BRep_Builder builder;
        TopoDS_Edge edge;
        builder.MakeEdge(edge, curve, TopLoc_Location(), kTolerance);
        builder.Add(edge, vertexAt(a).Oriented(TopAbs_FORWARD));
        builder.Add(edge, vertexAt(b).Oriented(TopAbs_REVERSED));
        builder.Range(edge, first, last);
        return edge;
    }

    CurveFn helixAt(double radius, double height) const {
        const double rise = rise_;
        return [=](double t) {
            const double c = std::cos(t), s = std::sin(t);
            return Derivatives{gp_XYZ(radius * c, radius * s, height + rise * t),
                               gp_XYZ(-radius * s, radius * c, rise), gp_XYZ(-radius * c, -radius * s, 0)};
        };
    }

    void makeHelix(int i) {
        if (!helix_[i].empty()) return;
        const double radius = radius_[i], height = height_[i];
        const std::vector<double> at = divided(start_[i], end_[i]);
        for (size_t q = 0; q + 1 < at.size(); q++) {
            const double a = at[q], b = at[q + 1];
            Handle(Geom_Curve) curve = hermiteCurve(helixAt(radius, height), a, b, spansOver(a, b));
            const double za = height + rise_ * a, zb = height + rise_ * b;
            helix_[i].push_back(Edge{makeEdge(curve, pointAt(radius, a, za), pointAt(radius, b, zb), a, b), a, b, a, za, b, zb, {}});
        }
    }

    /// The strip's edge in an end plane over [a, b]: a circle on a cylinder, a spiral on a flank.
    Edge endEdge(const Strip& s, double a, double b, double plane) {
        if (isCylinder(s)) {
            const double radius = radius_[s.lower], turns = kTwoPi * std::floor(a / kTwoPi);
            const double first = a - turns, last = b - turns;
            Handle(Geom_Curve) circle = new Geom_Circle(gp_Ax2(gp_Pnt(0, 0, plane), gp::DZ(), gp::DX()), radius);
            Edge e{makeEdge(circle, pointAt(radius, a, plane), pointAt(radius, b, plane), first, last), first, last, a, plane, b, plane, {}};
            e.onPlane = new Geom2d_Circle(gp_Ax22d(gp_Pnt2d(0, 0), gp_Dir2d(1, 0), gp_Dir2d(0, 1)), radius);
            return e;
        }
        const double ra = radiusOn(s, a, plane), rb = radiusOn(s, b, plane), slope = (rb - ra) / (b - a);
        const CurveFn spiral = [=](double t) {
            const double r = ra + slope * (t - a), c = std::cos(t), n = std::sin(t);
            return Derivatives{gp_XYZ(r * c, r * n, plane), gp_XYZ(slope * c - r * n, slope * n + r * c, 0),
                               gp_XYZ(-2 * slope * n - r * c, 2 * slope * c - r * n, 0)};
        };
        Handle(Geom_BSplineCurve) curve = hermiteCurve(spiral, a, b, spansOver(a, b));
        Edge e{makeEdge(curve, pointAt(ra, a, plane), pointAt(rb, b, plane), a, b), a, b, a, plane, b, plane, {}};
        NCollection_Array1<gp_Pnt2d> poles(1, curve->NbPoles());
        for (int n = 1; n <= curve->NbPoles(); n++) poles(n) = gp_Pnt2d(curve->Pole(n).X(), curve->Pole(n).Y());
        e.onPlane = new Geom2d_BSplineCurve(poles, curve->Knots(), curve->Multiplicities(), curve->Degree());
        return e;
    }

    Strip makeStrip(int lower, int upper) {
        makeHelix(lower);
        makeHelix(upper);
        Strip s{lower, upper, {}, {}, {}};
        const std::vector<double> low = divided(start_[upper], start_[lower]), high = divided(end_[upper], end_[lower]);
        for (size_t i = 0; i + 1 < low.size(); i++) s.endLow.push_back(endEdge(s, low[i], low[i + 1], 0));
        for (size_t i = 0; i + 1 < high.size(); i++) s.endHigh.push_back(endEdge(s, high[i], high[i + 1], length_));
        return s;
    }

    /// The edge across the strip at `angle`, where two of its patches meet.
    Edge wallAt(const Strip& s, double angle) {
        const double a = lowest(s, angle), b = highest(s, angle);
        const gp_Pnt pa = pointAt(radiusOn(s, angle, a), angle, a), pb = pointAt(radiusOn(s, angle, b), angle, b);
        const double distance = pa.Distance(pb);
        Handle(Geom_Curve) line = new Geom_Line(gp_Ax1(pa, gp_Dir(gp_Vec(pa, pb))));
        return Edge{makeEdge(line, pa, pb, 0, distance), 0, distance, angle, a, angle, b, {}};
    }

    static void collect(const Chain& chain, double from, double to, bool forward, std::vector<Side>& out) {
        std::vector<Side> part;
        for (const Edge& e : chain) {
            if (e.angle0 >= from - 1.0e-9 && e.angle1 <= to + 1.0e-9) part.push_back({&e, forward});
        }
        if (!forward) std::reverse(part.begin(), part.end());
        out.insert(out.end(), part.begin(), part.end());
    }

    static void addPcurve(const Edge& e, const Handle(Geom_Surface)& surface, const Handle(Geom2d_Curve)& curve) {
        BRep_Builder builder;
        builder.UpdateEdge(e.shape, curve, surface, TopLoc_Location(), kTolerance);
        builder.Range(e.shape, surface, TopLoc_Location(), e.first, e.last);
    }

    /// A straight pcurve with a span per piece of a turn, in the edge's own parameter.
    static Handle(Geom2d_Curve) straightPcurve(double u0, double v0, double u1, double v1, double first, double last) {
        const int spans = std::max(1, static_cast<int>(std::ceil(std::abs(u1 - u0) / kTwoPi * kSpansPerTurn)));
        NCollection_Array1<gp_Pnt2d> poles(1, spans + 1);
        NCollection_Array1<double> knots(1, spans + 1);
        NCollection_Array1<int> mults(1, spans + 1);
        for (int i = 0; i <= spans; i++) {
            const double w = static_cast<double>(i) / spans;
            poles(i + 1) = gp_Pnt2d(u0 + w * (u1 - u0), v0 + w * (v1 - v0));
            knots(i + 1) = first + w * (last - first);
            mults(i + 1) = (i == 0 || i == spans) ? 2 : 1;
        }
        return new Geom2d_BSplineCurve(poles, knots, mults, 1);
    }

    static TopoDS_Face makeFace(const Handle(Geom_Surface)& surface, const std::vector<Side>& sides, bool reversed) {
        BRep_Builder builder;
        TopoDS_Face face;
        builder.MakeFace(face, surface, TopLoc_Location(), 1.0e-7);
        TopoDS_Wire wire;
        builder.MakeWire(wire);
        for (const Side& side : sides) {
            builder.Add(wire, side.edge->shape.Oriented(side.forward ? TopAbs_FORWARD : TopAbs_REVERSED));
        }
        wire.Closed(true);
        builder.Add(face, wire);
        if (reversed) face.Reverse();
        return face;
    }

    /// A flank over [a, b]: straight across, between the strip's two helices.
    Handle(Geom_Surface) flankSurface(const Strip& s, double a, double b) const {
        const double from = a - 0.01, to = b + 0.01;
        const int spans = spansOver(from, to);
        Handle(Geom_BSplineCurve) low = hermiteCurve(helixAt(radius_[s.lower], height_[s.lower]), from, to, spans);
        Handle(Geom_BSplineCurve) high = hermiteCurve(helixAt(radius_[s.upper], height_[s.upper]), from, to, spans);
        const int count = low->NbPoles();
        NCollection_Array2<gp_Pnt> poles(1, count, 1, 2);
        for (int q = 1; q <= count; q++) {
            poles(q, 1) = low->Pole(q);
            poles(q, 2) = high->Pole(q);
        }
        NCollection_Array1<double> vKnots(1, 2);
        vKnots(1) = 0;
        vKnots(2) = width(s);
        NCollection_Array1<int> vMults(1, 2);
        vMults(1) = vMults(2) = 2;
        return new Geom_BSplineSurface(poles, low->Knots(), vKnots, low->Multiplicities(), vMults, 5, 1);
    }

    /// Whether a flank patch's natural normal points into the solid.
    bool flankFacesIn(const Strip& s, const Handle(Geom_Surface)& surface, double a, double b) const {
        const double angle = (a + b) / 2, height = (lowest(s, angle) + highest(s, angle)) / 2;
        gp_Pnt p;
        gp_Vec du, dv;
        surface->D1(angle, width(s) * across(s, angle, height), p, du, dv);
        double radius = 0, middle = 0;
        for (int q = 0; q < 4; q++) {
            radius += radius_[q] / 4;
            middle += height_[q] / 4;
        }
        return du.Crossed(dv).Dot(gp_Vec(pointAt(radius, angle, middle + rise_ * angle), p)) < 0;
    }

    /// The strip's faces, a patch between each pair of cuts.
    std::vector<TopoDS_Face> patches(Strip& s) {
        std::vector<TopoDS_Face> out;
        const std::vector<double> at = divided(start_[s.upper], end_[s.lower]);
        for (size_t j = 1; j + 1 < at.size(); j++) s.walls.push_back(wallAt(s, at[j]));
        const bool cylinder = isCylinder(s), cover = s.lower == 0 && s.upper == 3;
        for (size_t j = 0; j + 1 < at.size(); j++) {
            const double a = at[j], b = at[j + 1];
            std::vector<Side> sides;
            collect(s.endLow, a, b, true, sides);
            collect(helix_[s.lower], a, b, true, sides);
            if (j + 2 < at.size()) sides.push_back({&s.walls[j], true});
            collect(s.endHigh, a, b, false, sides);
            collect(helix_[s.upper], a, b, false, sides);
            if (j > 0) sides.push_back({&s.walls[j - 1], false});

            const double turns = kTwoPi * std::floor(a / kTwoPi), across_ = width(s);
            Handle(Geom_Surface) surface;
            if (cylinder) {
                surface = new Geom_CylindricalSurface(gp_Ax3(gp_Pnt(0, 0, 0), gp::DZ(), gp::DX()), radius_[s.lower]);
            } else {
                surface = flankSurface(s, a, b);
            }
            for (const Side& side : sides) {
                const Edge& e = *side.edge;
                const double u0 = cylinder ? e.angle0 - turns : e.angle0, u1 = cylinder ? e.angle1 - turns : e.angle1;
                const double v0 = cylinder ? e.height0 : across_ * across(s, e.angle0, e.height0);
                const double v1 = cylinder ? e.height1 : across_ * across(s, e.angle1, e.height1);
                addPcurve(e, surface, straightPcurve(u0, v0, u1, v1, e.first, e.last));
            }
            // A cylinder's normal points away from its axis, and the groove lies on the root's side of the cover.
            const bool reversed = cylinder ? cover == internal_ : flankFacesIn(s, surface, a, b);
            out.push_back(makeFace(surface, sides, reversed));
        }
        return out;
    }

    /// An end face, whose edges run round the profile.
    TopoDS_Face endFace(Strip* strips, bool high) {
        const double plane = high ? length_ : 0.0;
        Handle(Geom_Surface) surface = new Geom_Plane(gp_Ax3(gp_Pnt(0, 0, plane), gp::DZ(), gp::DX()));
        const double all = std::numeric_limits<double>::max();
        const auto chain = [&](const Strip& s) -> const Chain& { return high ? s.endHigh : s.endLow; };
        std::vector<Side> sides;
        collect(chain(strips[1]), -all, all, false, sides);
        collect(chain(strips[2]), -all, all, false, sides);
        collect(chain(strips[3]), -all, all, false, sides);
        collect(chain(strips[0]), -all, all, true, sides);
        for (const Side& side : sides) addPcurve(*side.edge, surface, side.edge->onPlane);

        std::vector<gp_Pnt2d> outline;
        for (const Side& side : sides) {
            const Edge& e = *side.edge;
            for (int q = 0; q < 8; q++) {
                const double w = side.forward ? q / 8.0 : 1 - q / 8.0;
                outline.push_back(e.onPlane->Value(e.first + w * (e.last - e.first)));
            }
        }
        double area = 0;
        for (size_t i = 0; i < outline.size(); i++) {
            const gp_Pnt2d& p = outline[i];
            const gp_Pnt2d& q = outline[(i + 1) % outline.size()];
            area += p.X() * q.Y() - q.X() * p.Y();
        }
        if (area < 0) {
            std::reverse(sides.begin(), sides.end());
            for (Side& side : sides) side.forward = !side.forward;
        }
        return makeFace(surface, sides, !high);
    }
};

}  // namespace

TopoDS_Shape buildThreadGroove(const gp_Ax3& frame, const ThreadGrooveSpec& spec) {
    if (!(spec.pitch > 0) || !(spec.length > 0)) {
        throw std::runtime_error("threadGroove: pitch and length must be positive");
    }
    if (!(spec.coverRadius > 0) || !(spec.rootRadius > 0) || spec.coverRadius == spec.rootRadius) {
        throw std::runtime_error("threadGroove: the cover and root must be different positive radii");
    }
    if (!(spec.rootHalfWidth > 0) || !(spec.coverHalfWidth > spec.rootHalfWidth) || !(2 * spec.coverHalfWidth < spec.pitch)) {
        throw std::runtime_error("threadGroove: the groove must narrow to its root and stay under a pitch wide");
    }
    TopoDS_Shape groove = GrooveBuilder(spec).build();
    gp_Trsf place;
    place.SetDisplacement(gp_Ax3(), frame);
    return groove.Moved(TopLoc_Location(place));
}

}  // namespace occtwasm
