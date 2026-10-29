#include "occt_kernel.h"

#include <BRepAdaptor_Curve2d.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_MakeShapeOnMesh.hxx>
#include <BRepGProp.hxx>
#include <BRepGProp_Domain.hxx>
#include <BRepGProp_Face.hxx>
#include <BRepGProp_MeshProps.hxx>
#include <BRepGProp_Sinert.hxx>
#include <BRepGProp_Vinert.hxx>
#include <BRepLib_ToolTriangulatedShape.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRepTools.hxx>
#include <BRepTopAdaptor_FClass2d.hxx>
#include <BRep_Builder.hxx>
#include <BRep_Tool.hxx>
#include <Bnd_Box.hxx>
#include <ElCLib.hxx>
#include <GProp_GProps.hxx>
#include <GeomAbs_CurveType.hxx>
#include <GeomAbs_SurfaceType.hxx>
#include <GeomConvert_BSplineSurfaceToBezierSurface.hxx>
#include <Geom_BSplineSurface.hxx>
#include <Geom_BezierSurface.hxx>
#include <Message_ProgressRange.hxx>
#include <NCollection_Array1.hxx>
#include <NCollection_Array2.hxx>
#include <NCollection_Vec3.hxx>
#include <OSD.hxx>
#include <OSD_FileSystem.hxx>
#include <Poly_Triangle.hxx>
#include <Poly_Triangulation.hxx>
#include <Precision.hxx>
#include <RWStl_Reader.hxx>
#include <Standard_Failure.hxx>
#include <Standard_ReadLineBuffer.hxx>
#include <TopAbs_Orientation.hxx>
#include <TopExp_Explorer.hxx>
#include <TopLoc_Location.hxx>
#include <TopTools_ShapeMapHasher.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Compound.hxx>
#include <TopoDS_Edge.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS_Iterator.hxx>
#include <TopoDS_Vertex.hxx>
#include <XCAFDoc_DocumentTool.hxx>
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <gp_Dir.hxx>
#include <gp_Pnt.hxx>
#include <gp_Pnt2d.hxx>
#include <gp_XYZ.hxx>
#include <istream>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <vector>

// --- XCAF helpers (used by generated xcaf methods) ---

namespace {

// XCAFApp_Application without its constructor, which registers a presentation
// driver for OCCT's own viewer (TPrsStd_DriverTable / XCAFPrs_Driver). Nothing
// here displays a document, but that one call links the AIS, PrsDim and V3d
// code (TKVCAF, TKV3d, part of TKService) into the module: about 1 MB of the
// .wasm. InitDocument is the part the XCAF methods depend on, and it is the
// same call XCAFApp_Application::InitDocument makes.
class XcafApplication : public TDocStd_Application {
  public:
    const char* ResourcesName() override {
        return "XCAF";
    }

    void InitDocument(const Handle(CDM_Document) & doc) const override {
        XCAFDoc_DocumentTool::Set(Handle(TDocStd_Document)::DownCast(doc)->Main());
    }
};

} // namespace

const Handle(TDocStd_Application) & getXCAFApp() {
    static Handle(TDocStd_Application) app;
    if (app.IsNull()) {
        app = new XcafApplication;
    }
    return app;
}

TDF_Label lookupLabel(const std::map<int, TDF_Label>& registry, int labelId) {
    auto it = registry.find(labelId);
    if (it == registry.end()) {
        throw std::runtime_error("invalid label ID: " + std::to_string(labelId));
    }
    return it->second;
}

// --- STL import ---

namespace {

// The reader RWStl::ReadFile uses, which OCCT keeps private. RWStl's exported
// stream readers are no substitute: they pick ASCII by a "solid" prefix alone,
// which misreads binary files whose 80-byte header starts the same way, and
// they stop after the first solid of a multi-domain file.
class StlMeshReader : public RWStl_Reader {
  public:
    int AddNode(const gp_XYZ& point) override {
        nodes_.push_back(point);
        return static_cast<int>(nodes_.size());
    }

    void AddTriangle(int n1, int n2, int n3) override {
        triangles_.emplace_back(n1, n2, n3);
    }

    Handle(Poly_Triangulation) triangulation() const {
        if (triangles_.empty()) {
            return {};
        }
        Handle(Poly_Triangulation) mesh = new Poly_Triangulation(
            static_cast<int>(nodes_.size()), static_cast<int>(triangles_.size()), false);
        for (size_t i = 0; i < nodes_.size(); ++i) {
            mesh->SetNode(static_cast<int>(i) + 1, nodes_[i]);
        }
        for (size_t i = 0; i < triangles_.size(); ++i) {
            mesh->SetTriangle(static_cast<int>(i) + 1, triangles_[i]);
        }
        return mesh;
    }

  private:
    std::vector<gp_XYZ> nodes_;
    std::vector<Poly_Triangle> triangles_;
};

// 80-byte header + 4-byte facet count + one 50-byte facet.
constexpr size_t kStlMinBinarySize = 134;

} // namespace

TopoDS_Shape readStl(const std::string& data) {
    std::istringstream stream(data, std::ios::binary);
    StlMeshReader reader;
    // RWStl_Reader::Read without the file open: the same format probe, then
    // one pass per concatenated solid, all merged into a single mesh.
    const bool ascii = data.size() < kStlMinBinarySize || reader.IsAscii(stream, true);
    const std::streampos end(static_cast<std::streamoff>(data.size()));
    Standard_ReadLineBuffer buffer(1024);
    while (stream.good()) {
        const bool ok = ascii ? reader.ReadAscii(stream, buffer, end, Message_ProgressRange())
                              : reader.ReadBinary(stream, Message_ProgressRange());
        if (!ok) {
            break;
        }
        stream >> std::ws;
    }

    Handle(Poly_Triangulation) mesh = reader.triangulation();
    if (mesh.IsNull()) {
        return {};
    }
    BRepBuilderAPI_MakeShapeOnMesh converter(mesh);
    converter.Build();
    if (!converter.IsDone()) {
        return {};
    }
    return converter.Shape();
}

// --- In-memory files ---

namespace {

// Serves "mem://" URLs from memory, for OCCT writers that insist on a file
// name: the standalone WASI build has no filesystem. Writers may open a URL
// again for reading (the glTF writer copies its temporary .bin into the .glb).
class MemoryFileSystem : public OSD_FileSystem {
  public:
    static constexpr const char* kPrefix = "mem://";

    bool IsSupportedPath(const TCollection_AsciiString& url) const override {
        return url.StartsWith(kPrefix);
    }

    bool IsOpenIStream(const std::shared_ptr<std::istream>& stream) const override {
        return stream != nullptr;
    }

    bool IsOpenOStream(const std::shared_ptr<std::ostream>& stream) const override {
        return stream != nullptr;
    }

    std::shared_ptr<std::istream> OpenIStream(const TCollection_AsciiString& url,
                                              const std::ios_base::openmode mode,
                                              const int64_t offset,
                                              const std::shared_ptr<std::istream>&) override {
        auto file = files_.find(url.ToCString());
        if (file == files_.end()) {
            return nullptr;
        }
        auto stream = std::make_shared<std::istringstream>(file->second->str(), mode);
        if (offset >= 0) {
            stream->seekg(offset);
        }
        return stream;
    }

    std::shared_ptr<std::ostream> OpenOStream(const TCollection_AsciiString& url,
                                              const std::ios_base::openmode mode) override {
        auto stream = std::make_shared<std::ostringstream>(mode);
        files_[url.ToCString()] = stream;
        return stream;
    }

    std::shared_ptr<std::streambuf> OpenStreamBuffer(const TCollection_AsciiString&,
                                                     const std::ios_base::openmode, const int64_t,
                                                     int64_t*) override {
        return nullptr;
    }

    std::string take(const std::string& url) const {
        auto file = files_.find(url);
        if (file == files_.end()) {
            throw std::runtime_error("nothing was written to " + url);
        }
        return file->second->str();
    }

    void clear() {
        files_.clear();
    }

  private:
    std::map<std::string, std::shared_ptr<std::ostringstream>> files_;
};

MemoryFileSystem& memoryFileSystem() {
    static const Handle(MemoryFileSystem) fs = [] {
        Handle(MemoryFileSystem) created = new MemoryFileSystem();
        OSD_FileSystem::AddDefaultProtocol(created, true);
        return created;
    }();
    return *fs;
}

} // namespace

std::string writeToMemory(const char* extension,
                          const std::function<void(const TCollection_AsciiString& url)>& write) {
    MemoryFileSystem& fs = memoryFileSystem();
    struct Clear {
        MemoryFileSystem& fs;
        ~Clear() {
            fs.clear();
        }
    } clear{fs};
    const std::string url = std::string(MemoryFileSystem::kPrefix) + "export" + extension;
    write(TCollection_AsciiString(url.c_str()));
    return fs.take(url);
}

// --- Accurate measurement ---

namespace {

// Faces OCCT's fixed-order Gauss quadrature integrates exactly enough: an
// elementary surface bounded by conic pcurves. Anything else (BSpline/Bezier
// surfaces, or a plane trimmed by a BSpline curve) can be off by percent.
bool isElementarySurface(GeomAbs_SurfaceType type) {
    switch (type) {
    case GeomAbs_Plane:
    case GeomAbs_Cylinder:
    case GeomAbs_Cone:
    case GeomAbs_Sphere:
    case GeomAbs_Torus:
        return true;
    default:
        return false;
    }
}

bool isConic2d(GeomAbs_CurveType type) {
    switch (type) {
    case GeomAbs_Line:
    case GeomAbs_Circle:
    case GeomAbs_Ellipse:
    case GeomAbs_Hyperbola:
    case GeomAbs_Parabola:
        return true;
    default:
        return false;
    }
}

bool needsAdaptiveIntegration(const TopoDS_Face& face) {
    if (!isElementarySurface(BRepAdaptor_Surface(face, false).GetType())) {
        return true;
    }
    for (TopExp_Explorer ex(face, TopAbs_EDGE); ex.More(); ex.Next()) {
        const TopoDS_Edge& edge = TopoDS::Edge(ex.Current());
        if (!isConic2d(BRepAdaptor_Curve2d(edge, face).GetType())) {
            return true;
        }
    }
    return false;
}

bool hasSurface(const TopoDS_Face& face) {
    TopLoc_Location location;
    return !BRep_Tool::Surface(face, location).IsNull();
}

bool hasFreeformFace(const TopoDS_Shape& shape) {
    for (TopExp_Explorer ex(shape, TopAbs_FACE); ex.More(); ex.Next()) {
        const TopoDS_Face& face = TopoDS::Face(ex.Current());
        if (hasSurface(face) && needsAdaptiveIntegration(face)) {
            return true;
        }
    }
    return false;
}

gp_Pnt vertexCentroid(const TopoDS_Shape& shape) {
    gp_XYZ sum(0, 0, 0);
    int count = 0;
    for (TopExp_Explorer ex(shape, TopAbs_VERTEX); ex.More(); ex.Next(), ++count) {
        sum += BRep_Tool::Pnt(TopoDS::Vertex(ex.Current())).XYZ();
    }
    return gp_Pnt(count > 0 ? sum / count : sum);
}

// Relative error target for the adaptive pass. Measured on BSpline solids
// (a GTransform-scaled cylinder and sphere, a cut through one), it lands
// within ~2e-7 of the exact volume.
constexpr double kAdaptiveEps = 1e-8;

// BRepGProp's own face loop, choosing per face between its fixed-order Gauss
// quadrature (exact and fast on elementary faces) and its adaptive one.
// `Integrator` is BRepGProp_Vinert (volume) or BRepGProp_Sinert (area);
// `orientedOnly` skips INTERNAL/EXTERNAL faces, as the volume loop does.
template <typename Integrator>
void integrateFaces(const TopoDS_Shape& shape, GProp_GProps& props,
                    BRepGProp_MeshProps::BRepGProp_MeshObjType meshType, bool orientedOnly) {
    gp_Pnt systemOrigin(0, 0, 0);
    systemOrigin.Transform(shape.Location());
    props = GProp_GProps(systemOrigin);

    const gp_Pnt origin = vertexCentroid(shape);
    Integrator integrator;
    integrator.SetLocation(origin);
    BRepGProp_MeshProps meshProps(meshType);
    meshProps.SetLocation(origin);
    BRepGProp_Face faceIntegrand;
    BRepGProp_Domain domain;

    for (TopExp_Explorer ex(shape, TopAbs_FACE); ex.More(); ex.Next()) {
        const TopoDS_Face& face = TopoDS::Face(ex.Current());
        const TopAbs_Orientation orientation = face.Orientation();
        if (orientedOnly && orientation != TopAbs_FORWARD && orientation != TopAbs_REVERSED) {
            continue;
        }
        if (!hasSurface(face)) {
            TopLoc_Location location;
            const Handle(Poly_Triangulation)& mesh = BRep_Tool::Triangulation(face, location);
            if (!mesh.IsNull() && mesh->NbTriangles() > 0) {
                meshProps.Perform(mesh, location, orientation);
                props.Add(meshProps);
            }
            continue;
        }
        faceIntegrand.Load(face);
        const bool naturalBounds = face.NbChildren() == 0;
        if (!naturalBounds) {
            domain.Init(face);
        }
        if (needsAdaptiveIntegration(face)) {
            if (naturalBounds) {
                integrator.Perform(faceIntegrand, kAdaptiveEps);
            } else {
                integrator.Perform(faceIntegrand, domain, kAdaptiveEps);
            }
        } else if (naturalBounds) {
            integrator.Perform(faceIntegrand);
        } else {
            integrator.Perform(faceIntegrand, domain);
        }
        props.Add(integrator);
    }
}

} // namespace

void volumeProperties(const TopoDS_Shape& shape, GProp_GProps& props) {
    if (!hasFreeformFace(shape)) {
        BRepGProp::VolumeProperties(shape, props);
        return;
    }
    integrateFaces<BRepGProp_Vinert>(shape, props, BRepGProp_MeshProps::Vinert, true);
}

void surfaceProperties(const TopoDS_Shape& shape, GProp_GProps& props) {
    if (!hasFreeformFace(shape)) {
        BRepGProp::SurfaceProperties(shape, props);
        return;
    }
    integrateFaces<BRepGProp_Sinert>(shape, props, BRepGProp_MeshProps::Sinert, false);
}

namespace {

// A rational Bezier patch in homogeneous form: pole (i, j) is stored at
// 4 * (i * nv + j) as (w*x, w*y, w*z, w). [u0, u1] x [v0, v1] is the part of
// the face's surface parameter space it covers.
struct HullPatch {
    int nu = 0;
    int nv = 0;
    std::vector<double> poles;
    double u0 = 0, u1 = 0, v0 = 0, v1 = 0;
    int depth = 0;

    double* pole(int i, int j) {
        return &poles[4 * static_cast<size_t>(i * nv + j)];
    }
    const double* pole(int i, int j) const {
        return &poles[4 * static_cast<size_t>(i * nv + j)];
    }
    double coord(int i, int j, int axis) const {
        const double* p = pole(i, j);
        return p[axis] / p[3];
    }
};

HullPatch hullPatch(const Geom_BezierSurface& surface, double u0, double u1, double v0, double v1) {
    HullPatch patch;
    patch.nu = surface.NbUPoles();
    patch.nv = surface.NbVPoles();
    patch.poles.resize(4 * static_cast<size_t>(patch.nu * patch.nv));
    patch.u0 = u0;
    patch.u1 = u1;
    patch.v0 = v0;
    patch.v1 = v1;
    for (int i = 0; i < patch.nu; ++i) {
        for (int j = 0; j < patch.nv; ++j) {
            const gp_Pnt p = surface.Pole(i + 1, j + 1);
            const double w = surface.Weight(i + 1, j + 1);
            double* h = patch.pole(i, j);
            h[0] = p.X() * w;
            h[1] = p.Y() * w;
            h[2] = p.Z() * w;
            h[3] = w;
        }
    }
    return patch;
}

// De Casteljau split at the parameter midpoint, along u or along v.
void splitPatch(const HullPatch& patch, bool alongU, HullPatch& low, HullPatch& high) {
    low = patch;
    high = patch;
    low.depth = high.depth = patch.depth + 1;
    const int n = alongU ? patch.nu : patch.nv;
    const int rows = alongU ? patch.nv : patch.nu;
    std::vector<double> work(4 * static_cast<size_t>(n));
    for (int r = 0; r < rows; ++r) {
        auto at = [&](HullPatch& p, int k) { return alongU ? p.pole(k, r) : p.pole(r, k); };
        for (int k = 0; k < n; ++k) {
            const double* src = alongU ? patch.pole(k, r) : patch.pole(r, k);
            std::copy(src, src + 4, &work[4 * static_cast<size_t>(k)]);
        }
        std::copy(&work[0], &work[4], at(low, 0));
        std::copy(&work[4 * static_cast<size_t>(n - 1)], &work[4 * static_cast<size_t>(n)],
                  at(high, n - 1));
        for (int level = 1; level < n; ++level) {
            for (int k = 0; k < n - level; ++k) {
                for (int c = 0; c < 4; ++c) {
                    work[4 * k + c] = 0.5 * (work[4 * k + c] + work[4 * (k + 1) + c]);
                }
            }
            std::copy(&work[0], &work[4], at(low, level));
            const int last = n - 1 - level;
            std::copy(&work[4 * static_cast<size_t>(last)],
                      &work[4 * static_cast<size_t>(last + 1)], at(high, last));
        }
    }
    if (alongU) {
        const double mid = 0.5 * (patch.u0 + patch.u1);
        low.u1 = mid;
        high.u0 = mid;
    } else {
        const double mid = 0.5 * (patch.v0 + patch.v1);
        low.v1 = mid;
        high.v0 = mid;
    }
}

// Extremes 0..2 are the x/y/z minima, 3..5 the maxima, each with the surface
// parameters of the point that attains it.
struct SurfaceExtremes {
    double value[6];
    double u[6];
    double v[6];
    bool converged[6];
};

void takeCorners(const HullPatch& patch, SurfaceExtremes& ext) {
    const int is[2] = {0, patch.nu - 1};
    const int js[2] = {0, patch.nv - 1};
    for (int a = 0; a < 2; ++a) {
        for (int b = 0; b < 2; ++b) {
            for (int axis = 0; axis < 3; ++axis) {
                const double c = patch.coord(is[a], js[b], axis);
                const double u = a == 0 ? patch.u0 : patch.u1;
                const double v = b == 0 ? patch.v0 : patch.v1;
                if (c < ext.value[axis]) {
                    ext.value[axis] = c;
                    ext.u[axis] = u;
                    ext.v[axis] = v;
                }
                if (c > ext.value[axis + 3]) {
                    ext.value[axis + 3] = c;
                    ext.u[axis + 3] = u;
                    ext.v[axis + 3] = v;
                }
            }
        }
    }
}

// How far the control net bends along u (or v) in the coordinates still being
// searched: the larger second difference picks the direction worth splitting.
double bend(const HullPatch& patch, bool alongU, const bool open[6]) {
    const int n = alongU ? patch.nu : patch.nv;
    const int rows = alongU ? patch.nv : patch.nu;
    double worst = 0;
    for (int axis = 0; axis < 3; ++axis) {
        if (!open[axis] && !open[axis + 3]) {
            continue;
        }
        for (int r = 0; r < rows; ++r) {
            for (int k = 1; k + 1 < n; ++k) {
                auto c = [&](int i) {
                    return alongU ? patch.coord(i, r, axis) : patch.coord(r, i, axis);
                };
                worst = std::max(worst, std::abs(c(k - 1) - 2 * c(k) + c(k + 1)));
            }
        }
    }
    return worst;
}

// Splits per face before an unfinished direction falls back to OCCT's bounds.
constexpr int kHullSplitBudget = 20000;
constexpr int kHullMaxDepth = 64;

// The extremes of a BSpline or Bezier face's surface over the face's UV box,
// each certified by the convex hull of the control net: a patch whose hull
// cannot beat the best point found so far is dropped, and the rest are split.
// Returns false for any other surface.
bool surfaceExtremes(const TopoDS_Face& face, SurfaceExtremes& ext) {
    BRepAdaptor_Surface surface(face, false);
    if (surface.GetType() != GeomAbs_BSplineSurface && surface.GetType() != GeomAbs_BezierSurface) {
        return false;
    }
    double u0 = 0, u1 = 0, v0 = 0, v1 = 0;
    BRepTools::UVBounds(face, u0, u1, v0, v1);

    // A periodic direction is searched over one whole period, a superset of
    // the face's range there; its witnesses are mapped back into the face's
    // range before they are classified.
    double uPeriod = 0;
    double vPeriod = 0;
    std::vector<HullPatch> stack;
    try {
        if (surface.GetType() == GeomAbs_BSplineSurface) {
            Handle(Geom_BSplineSurface) bspline =
                Handle(Geom_BSplineSurface)::DownCast(surface.BSpline()->Copy());
            // GeomConvert_BSplineSurfaceToBezierSurface keeps only the first span
            // of a periodic surface asked for its whole period.
            if (bspline->IsUPeriodic()) {
                uPeriod = bspline->UPeriod();
                bspline->SetUNotPeriodic();
            }
            if (bspline->IsVPeriodic()) {
                vPeriod = bspline->VPeriod();
                bspline->SetVNotPeriodic();
            }
            double su0 = 0, su1 = 0, sv0 = 0, sv1 = 0;
            bspline->Bounds(su0, su1, sv0, sv1);
            const double cu0 = uPeriod > 0 ? su0 : std::max(u0, su0);
            const double cu1 = uPeriod > 0 ? su1 : std::min(u1, su1);
            const double cv0 = vPeriod > 0 ? sv0 : std::max(v0, sv0);
            const double cv1 = vPeriod > 0 ? sv1 : std::min(v1, sv1);
            if (!(cu1 - cu0 > Precision::PConfusion()) || !(cv1 - cv0 > Precision::PConfusion())) {
                return false;
            }
            GeomConvert_BSplineSurfaceToBezierSurface converter(bspline, cu0, cu1, cv0, cv1,
                                                                Precision::PConfusion());
            const int nu = converter.NbUPatches();
            const int nv = converter.NbVPatches();
            NCollection_Array2<Handle(Geom_BezierSurface)> patches(1, nu, 1, nv);
            converter.Patches(patches);
            NCollection_Array1<double> uKnots(1, nu + 1);
            NCollection_Array1<double> vKnots(1, nv + 1);
            converter.UKnots(uKnots);
            converter.VKnots(vKnots);
            for (int i = 1; i <= nu; ++i) {
                for (int j = 1; j <= nv; ++j) {
                    stack.push_back(hullPatch(*patches(i, j), uKnots(i), uKnots(i + 1), vKnots(j),
                                              vKnots(j + 1)));
                }
            }
        } else if (surface.GetType() == GeomAbs_BezierSurface) {
            const double cu0 = std::max(u0, 0.0);
            const double cu1 = std::min(u1, 1.0);
            const double cv0 = std::max(v0, 0.0);
            const double cv1 = std::min(v1, 1.0);
            if (!(cu1 - cu0 > Precision::PConfusion()) || !(cv1 - cv0 > Precision::PConfusion())) {
                return false;
            }
            Handle(Geom_BezierSurface) bezier =
                Handle(Geom_BezierSurface)::DownCast(surface.Bezier()->Copy());
            bezier->Segment(cu0, cu1, cv0, cv1);
            stack.push_back(hullPatch(*bezier, cu0, cu1, cv0, cv1));
        } else {
            return false;
        }
    } catch (const Standard_Failure&) {
        return false;
    }

    for (int d = 0; d < 6; ++d) {
        ext.value[d] = d < 3 ? RealLast() : -RealLast();
        ext.u[d] = u0;
        ext.v[d] = v0;
        ext.converged[d] = true;
    }
    Bnd_Box hull;
    for (const HullPatch& patch : stack) {
        takeCorners(patch, ext);
        for (int i = 0; i < patch.nu; ++i) {
            for (int j = 0; j < patch.nv; ++j) {
                hull.Add(gp_Pnt(patch.coord(i, j, 0), patch.coord(i, j, 1), patch.coord(i, j, 2)));
            }
        }
    }
    const double tol = std::max(Precision::Confusion(), 1e-10 * std::sqrt(hull.SquareExtent()));

    int splits = 0;
    while (!stack.empty()) {
        HullPatch patch = std::move(stack.back());
        stack.pop_back();
        bool open[6];
        bool anyOpen = false;
        for (int axis = 0; axis < 3; ++axis) {
            double lo = RealLast();
            double hi = -RealLast();
            for (int i = 0; i < patch.nu; ++i) {
                for (int j = 0; j < patch.nv; ++j) {
                    const double c = patch.coord(i, j, axis);
                    lo = std::min(lo, c);
                    hi = std::max(hi, c);
                }
            }
            open[axis] = lo < ext.value[axis] - tol;
            open[axis + 3] = hi > ext.value[axis + 3] + tol;
            anyOpen = anyOpen || open[axis] || open[axis + 3];
        }
        if (!anyOpen) {
            continue;
        }
        if (patch.depth >= kHullMaxDepth || splits >= kHullSplitBudget) {
            for (int d = 0; d < 6; ++d) {
                ext.converged[d] = ext.converged[d] && !open[d];
            }
            continue;
        }
        const bool alongU =
            patch.nv < 3 || (patch.nu >= 3 && bend(patch, true, open) >= bend(patch, false, open));
        HullPatch low, high;
        splitPatch(patch, alongU, low, high);
        ++splits;
        takeCorners(low, ext);
        takeCorners(high, ext);
        stack.push_back(std::move(low));
        stack.push_back(std::move(high));
    }
    for (int d = 0; d < 6; ++d) {
        if (uPeriod > 0) {
            ext.u[d] = ElCLib::InPeriod(ext.u[d], u0, u0 + uPeriod);
        }
        if (vPeriod > 0) {
            ext.v[d] = ElCLib::InPeriod(ext.v[d], v0, v0 + vPeriod);
        }
    }
    return true;
}

void addFaceBounds(const TopoDS_Face& face, Bnd_Box& box, bool useTriangulation) {
    TopLoc_Location location;
    const Handle(Poly_Triangulation)& mesh = BRep_Tool::Triangulation(face, location);
    SurfaceExtremes ext;
    if ((useTriangulation && !mesh.IsNull()) || !hasSurface(face) || !surfaceExtremes(face, ext)) {
        BRepBndLib::AddOptimal(face, box, useTriangulation, false);
        return;
    }

    // An extreme of the surface over the UV box is the face's own only when the
    // point attaining it lies on the face; otherwise the face's extreme is on
    // its boundary (or elsewhere inside), which OCCT's face bounds cover.
    const double tol2d =
        std::max(BRepAdaptor_Surface(face, false).UResolution(BRep_Tool::Tolerance(face)),
                 Precision::PConfusion());
    BRepTopAdaptor_FClass2d classifier(face, tol2d);
    bool certified[6];
    bool allCertified = true;
    for (int d = 0; d < 6; ++d) {
        const bool onFace = classifier.Perform(gp_Pnt2d(ext.u[d], ext.v[d])) != TopAbs_OUT;
        certified[d] = onFace && ext.converged[d];
        if (!onFace) {
            ext.value[d] = d < 3 ? RealLast() : -RealLast();
        }
        allCertified = allCertified && certified[d];
    }
    double lo[3] = {ext.value[0], ext.value[1], ext.value[2]};
    double hi[3] = {ext.value[3], ext.value[4], ext.value[5]};
    if (!allCertified) {
        Bnd_Box occt;
        BRepBndLib::AddOptimal(face, occt, useTriangulation, false);
        if (!occt.IsVoid()) {
            double o[6];
            occt.Get(o[0], o[1], o[2], o[3], o[4], o[5]);
            for (int axis = 0; axis < 3; ++axis) {
                lo[axis] = std::min(lo[axis], o[axis]);
                hi[axis] = std::max(hi[axis], o[axis + 3]);
            }
        }
    }
    if (lo[0] > hi[0] || lo[1] > hi[1] || lo[2] > hi[2]) {
        return;
    }
    Bnd_Box faceBox;
    faceBox.Update(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]);
    faceBox.Enlarge(Precision::Confusion());
    box.Add(faceBox);
}

} // namespace

void addPreciseBounds(const TopoDS_Shape& shape, Bnd_Box& box, bool useTriangulation) {
    for (TopExp_Explorer ex(shape, TopAbs_FACE); ex.More(); ex.Next()) {
        addFaceBounds(TopoDS::Face(ex.Current()), box, useTriangulation);
    }
    for (TopExp_Explorer ex(shape, TopAbs_EDGE, TopAbs_FACE); ex.More(); ex.Next()) {
        BRepBndLib::AddOptimal(ex.Current(), box, useTriangulation, false);
    }
    for (TopExp_Explorer ex(shape, TopAbs_VERTEX, TopAbs_EDGE); ex.More(); ex.Next()) {
        BRepBndLib::AddOptimal(ex.Current(), box, useTriangulation, false);
    }
}

int OcctKernel::registerLabel(XCAFDocRecord& record, const TDF_Label& label) {
    auto known = record.labelIds.find(label);
    if (known != record.labelIds.end()) {
        return known->second;
    }
    int facadeId = record.nextLabelId++;
    record.labelRegistry[facadeId] = label;
    record.labelIds.emplace(label, facadeId);
    return facadeId;
}

// --- MeshData implementation ---

MeshData::~MeshData() {
    std::free(positions);
    std::free(normals);
    std::free(uvs);
    std::free(indices);
    std::free(faceGroups);
}

MeshData::MeshData(const MeshData& other)
    : positions(other.positions), normals(other.normals), uvs(other.uvs), indices(other.indices),
      faceGroups(other.faceGroups), positionCount(other.positionCount),
      normalCount(other.normalCount), uvCount(other.uvCount), indexCount(other.indexCount),
      faceGroupCount(other.faceGroupCount) {
    auto& mut = const_cast<MeshData&>(other);
    mut.positions = nullptr;
    mut.normals = nullptr;
    mut.uvs = nullptr;
    mut.indices = nullptr;
    mut.faceGroups = nullptr;
}

int MeshData::getPositionsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(positions));
}

int MeshData::getNormalsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(normals));
}

int MeshData::getUvsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(uvs));
}

int MeshData::getIndicesPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(indices));
}

int MeshData::getFaceGroupsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(faceGroups));
}

// --- OcctKernel implementation ---

OcctKernel::OcctKernel() {
    OSD::SetSignal(false);
}

OcctKernel::~OcctKernel() {
    releaseAll();
}

uint32_t OcctKernel::store(const TopoDS_Shape& shape) {
    uint32_t id = nextId_++;
    arena_.emplace(id, shape);
    return id;
}

OcctKernel::BatchScope::BatchScope(OcctKernel& kernel, size_t expected) : kernel_(kernel) {
    ids_.reserve(expected);
}

OcctKernel::BatchScope::~BatchScope() {
    for (uint32_t id : ids_) {
        kernel_.arena_.erase(id);
    }
}

uint32_t OcctKernel::BatchScope::add(const TopoDS_Shape& shape) {
    uint32_t id = kernel_.store(shape);
    try {
        ids_.push_back(id);
    } catch (...) {
        // The shape is stored but unrecorded, so the destructor would not see
        // it. Enumerators reserve nothing, so this growth can throw.
        kernel_.arena_.erase(id);
        throw;
    }
    return id;
}

std::vector<uint32_t> OcctKernel::BatchScope::take() {
    std::vector<uint32_t> taken = std::move(ids_);
    ids_.clear();
    return taken;
}

const TopoDS_Shape& OcctKernel::get(uint32_t id) const {
    auto it = arena_.find(id);
    if (it == arena_.end()) {
        throw std::runtime_error("Invalid shape ID: " + std::to_string(id));
    }
    return it->second;
}

// A profile face whose normal opposes the sweep direction yields an inside-out
// (negative-volume) solid. Upstream OpenCascade's boolean tolerated these, but
// occt-wasm's strict BOP rejects them (returns empty) -- notably for engraved
// text, where glyph faces carry arbitrary winding. Reverse any negative-volume
// solid to outward orientation, recursing into compounds so multi-shell sweep
// results (e.g. a compound profile) are normalized member by member.
TopoDS_Shape OcctKernel::normalizeSolidOrientation(const TopoDS_Shape& shape) {
    if (shape.ShapeType() == TopAbs_SOLID) {
        GProp_GProps props;
        BRepGProp::VolumeProperties(shape, props);
        if (props.Mass() < 0.0) {
            TopoDS_Shape reversed = shape;
            reversed.Reverse();
            return reversed;
        }
        return shape;
    }
    if (shape.ShapeType() == TopAbs_COMPOUND) {
        TopoDS_Compound rebuilt;
        BRep_Builder builder;
        builder.MakeCompound(rebuilt);
        for (TopoDS_Iterator it(shape); it.More(); it.Next()) {
            builder.Add(rebuilt, normalizeSolidOrientation(it.Value()));
        }
        return rebuilt;
    }
    return shape;
}

// Shared mesh builder for tessellate() and tessellateRelative(). `relative`
// selects per-edge size-relative deflection vs. absolute.
MeshData OcctKernel::buildMeshData(const TopoDS_Shape& shape, double linearDeflection,
                                   double angularDeflection, bool relative) {
    BRepMesh_IncrementalMesh mesher(shape, linearDeflection, relative, angularDeflection, false);
    if (!mesher.IsDone()) {
        throw std::runtime_error("tessellate: meshing failed");
    }

    // Cache each face's triangulation during this single traversal so the fill
    // pass below reuses it instead of re-exploring the shape and re-fetching
    // every triangulation handle a second time.
    struct FaceEntry {
        Handle(Poly_Triangulation) tri;
        TopLoc_Location loc;
        TopoDS_Face face;
    };
    std::vector<FaceEntry> faces;

    int totalNodes = 0;
    int totalTris = 0;
    for (TopExp_Explorer ex(shape, TopAbs_FACE); ex.More(); ex.Next()) {
        const TopoDS_Face& face = TopoDS::Face(ex.Current());
        TopLoc_Location loc;
        auto tri = BRep_Tool::Triangulation(face, loc);
        if (tri.IsNull())
            continue;
        totalNodes += tri->NbNodes();
        totalTris += tri->NbTriangles();
        faces.push_back({tri, loc, face});
    }
    int totalFaces = static_cast<int>(faces.size());

    MeshData result;
    result.positionCount = totalNodes * 3;
    result.normalCount = totalNodes * 3;
    result.uvCount = totalNodes * 2;
    result.indexCount = totalTris * 3;

    result.positions = static_cast<float*>(std::malloc(result.positionCount * sizeof(float)));
    result.normals = static_cast<float*>(std::malloc(result.normalCount * sizeof(float)));
    result.uvs = static_cast<float*>(std::malloc(result.uvCount * sizeof(float)));
    result.indices = static_cast<uint32_t*>(std::malloc(result.indexCount * sizeof(uint32_t)));
    result.faceGroupCount = totalFaces * 3;
    result.faceGroups = static_cast<int32_t*>(std::malloc(result.faceGroupCount * sizeof(int32_t)));

    if ((!result.positions && result.positionCount > 0) ||
        (!result.normals && result.normalCount > 0) || (!result.uvs && result.uvCount > 0) ||
        (!result.indices && result.indexCount > 0) ||
        (!result.faceGroups && result.faceGroupCount > 0)) {
        throw std::runtime_error("tessellate: memory allocation failed");
    }

    int vertexOffset = 0;
    int triOffset = 0;
    int faceGroupIdx = 0;

    for (const auto& entry : faces) {
        const TopoDS_Face& face = entry.face;
        const TopLoc_Location& loc = entry.loc;
        Handle(Poly_Triangulation) tri = entry.tri;

        const auto& trsf = loc.Transformation();
        bool identityLoc = loc.IsIdentity();
        int nbNodes = tri->NbNodes();
        int nbTri = tri->NbTriangles();

        if (identityLoc) {
            for (int i = 1; i <= nbNodes; i++) {
                const gp_Pnt& p = tri->Node(i);
                int base = (vertexOffset + i - 1) * 3;
                result.positions[base + 0] = static_cast<float>(p.X());
                result.positions[base + 1] = static_cast<float>(p.Y());
                result.positions[base + 2] = static_cast<float>(p.Z());
            }
        } else {
            for (int i = 1; i <= nbNodes; i++) {
                gp_Pnt p = tri->Node(i).Transformed(trsf);
                int base = (vertexOffset + i - 1) * 3;
                result.positions[base + 0] = static_cast<float>(p.X());
                result.positions[base + 1] = static_cast<float>(p.Y());
                result.positions[base + 2] = static_cast<float>(p.Z());
            }
        }

        bool hasUV = tri->HasUVNodes();
        for (int i = 1; i <= nbNodes; i++) {
            int uvBase = (vertexOffset + i - 1) * 2;
            if (hasUV) {
                const gp_Pnt2d& uv = tri->UVNode(i);
                result.uvs[uvBase + 0] = static_cast<float>(uv.X());
                result.uvs[uvBase + 1] = static_cast<float>(uv.Y());
            } else {
                result.uvs[uvBase + 0] = 0.0f;
                result.uvs[uvBase + 1] = 0.0f;
            }
        }

        // Triangulation normals are surface normals: ComputeNormals ignores the
        // face orientation, and the Poly_Triangulation is shared by every face
        // using this surface, so the flip must happen here, not in the cache.
        bool isReversed = (face.Orientation() == TopAbs_REVERSED);
        if (!tri->HasNormals()) {
            BRepLib_ToolTriangulatedShape::ComputeNormals(face, tri);
        }
        bool hasNormals = tri->HasNormals();
        for (int i = 1; i <= nbNodes; i++) {
            gp_Dir d(0, 0, 1);
            if (hasNormals) {
                NCollection_Vec3<float> nv;
                tri->Normal(i, nv);
                if (nv.x() != 0.0f || nv.y() != 0.0f || nv.z() != 0.0f) {
                    d = gp_Dir(nv.x(), nv.y(), nv.z());
                }
            }
            if (isReversed) {
                d.Reverse();
            }
            if (!identityLoc) {
                d = d.Transformed(trsf);
            }
            int base = (vertexOffset + i - 1) * 3;
            result.normals[base + 0] = static_cast<float>(d.X());
            result.normals[base + 1] = static_cast<float>(d.Y());
            result.normals[base + 2] = static_cast<float>(d.Z());
        }

        for (int t = 1; t <= nbTri; t++) {
            const auto& triangle = tri->Triangle(t);
            int n1 = triangle.Value(1);
            int n2 = triangle.Value(2);
            int n3 = triangle.Value(3);

            if (isReversed) {
                int tmp = n1;
                n1 = n2;
                n2 = tmp;
            }

            result.indices[triOffset + 0] = static_cast<uint32_t>(n1 - 1 + vertexOffset);
            result.indices[triOffset + 1] = static_cast<uint32_t>(n2 - 1 + vertexOffset);
            result.indices[triOffset + 2] = static_cast<uint32_t>(n3 - 1 + vertexOffset);
            triOffset += 3;
        }

        int faceTriStart = triOffset - nbTri * 3;
        int faceHash = static_cast<int>(TopTools_ShapeMapHasher{}(face) % 2147483647);
        result.faceGroups[faceGroupIdx + 0] = faceTriStart;
        result.faceGroups[faceGroupIdx + 1] = nbTri * 3;
        result.faceGroups[faceGroupIdx + 2] = faceHash;
        faceGroupIdx += 3;

        vertexOffset += nbNodes;
    }

    return result;
}

// --- MeshBatchData implementation ---

MeshBatchData::~MeshBatchData() {
    std::free(positions);
    std::free(normals);
    std::free(indices);
    std::free(shapeOffsets);
}

MeshBatchData::MeshBatchData(const MeshBatchData& other)
    : positions(other.positions), normals(other.normals), indices(other.indices),
      shapeOffsets(other.shapeOffsets), positionCount(other.positionCount),
      normalCount(other.normalCount), indexCount(other.indexCount), shapeCount(other.shapeCount) {
    auto& mut = const_cast<MeshBatchData&>(other);
    mut.positions = nullptr;
    mut.normals = nullptr;
    mut.indices = nullptr;
    mut.shapeOffsets = nullptr;
}

int MeshBatchData::getPositionsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(positions));
}

int MeshBatchData::getNormalsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(normals));
}

int MeshBatchData::getIndicesPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(indices));
}

int MeshBatchData::getShapeOffsetsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(shapeOffsets));
}

// --- EdgeData implementation ---

EdgeData::~EdgeData() {
    std::free(points);
    std::free(edgeGroups);
}

EdgeData::EdgeData(const EdgeData& other)
    : points(other.points), edgeGroups(other.edgeGroups), pointCount(other.pointCount),
      edgeGroupCount(other.edgeGroupCount) {
    auto& mut = const_cast<EdgeData&>(other);
    mut.points = nullptr;
    mut.edgeGroups = nullptr;
}

int EdgeData::getPointsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(points));
}

int EdgeData::getEdgeGroupsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(edgeGroups));
}
