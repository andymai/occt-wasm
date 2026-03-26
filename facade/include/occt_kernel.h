#pragma once

#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

#include <TopoDS_Shape.hxx>

/// Mesh data returned from tessellation.
struct MeshData {
    float* positions = nullptr;
    float* normals = nullptr;
    uint32_t* indices = nullptr;
    int positionCount = 0;
    int normalCount = 0;
    int indexCount = 0;

    MeshData() = default;
    ~MeshData();
    MeshData(const MeshData& other);
    MeshData& operator=(const MeshData&) = delete;
    int getPositionsPtr() const;
    int getNormalsPtr() const;
    int getIndicesPtr() const;
};

/// Bounding box result.
struct BBoxData {
    double xmin, ymin, zmin, xmax, ymax, zmax;
};

/// Edge line data for wireframe rendering.
struct EdgeData {
    float* points = nullptr;
    int pointCount = 0;

    EdgeData() = default;
    ~EdgeData();
    EdgeData(const EdgeData& other);
    EdgeData& operator=(const EdgeData&) = delete;
    int getPointsPtr() const;
};

/// Evolution data from an operation.
struct EvolutionData {
    uint32_t resultId = 0;
    std::vector<int> modified;
    std::vector<int> generated;
    std::vector<int> deleted;
};

/// Arena-based OCCT kernel — full brepjs KernelAdapter coverage.
class OcctKernel {
  public:
    OcctKernel();
    ~OcctKernel();

    // --- Arena management ---
    void release(uint32_t id);
    void releaseAll();
    uint32_t getShapeCount() const;

    // --- Primitives ---
    uint32_t makeBox(double dx, double dy, double dz);
    uint32_t makeBoxFromCorners(double x1, double y1, double z1, double x2, double y2, double z2);
    uint32_t makeCylinder(double radius, double height);
    uint32_t makeSphere(double radius);
    uint32_t makeCone(double r1, double r2, double height);
    uint32_t makeTorus(double majorRadius, double minorRadius);
    uint32_t makeEllipsoid(double rx, double ry, double rz);
    uint32_t makeRectangle(double width, double height);

    // --- Booleans ---
    uint32_t fuse(uint32_t a, uint32_t b);
    uint32_t cut(uint32_t a, uint32_t b);
    uint32_t common(uint32_t a, uint32_t b);
    uint32_t intersect(uint32_t a, uint32_t b);
    uint32_t section(uint32_t a, uint32_t b);
    uint32_t fuseAll(std::vector<uint32_t> shapeIds);
    uint32_t cutAll(uint32_t shapeId, std::vector<uint32_t> toolIds);
    uint32_t split(uint32_t shapeId, std::vector<uint32_t> toolIds);

    // --- Modeling operations ---
    uint32_t extrude(uint32_t shapeId, double dx, double dy, double dz);
    uint32_t revolve(uint32_t shapeId, double px, double py, double pz, double dx, double dy,
                     double dz, double angleRad);
    uint32_t fillet(uint32_t solidId, std::vector<uint32_t> edgeIds, double radius);
    uint32_t chamfer(uint32_t solidId, std::vector<uint32_t> edgeIds, double distance);
    uint32_t chamferDistAngle(uint32_t solidId, std::vector<uint32_t> edgeIds, double distance,
                              double angleDeg);
    uint32_t shell(uint32_t solidId, std::vector<uint32_t> faceIds, double thickness);
    uint32_t offset(uint32_t solidId, double distance);
    uint32_t draft(uint32_t shapeId, uint32_t faceId, double angleRad, double dx, double dy,
                   double dz);

    // --- Sweep operations ---
    uint32_t pipe(uint32_t profileId, uint32_t spineId);
    uint32_t simplePipe(uint32_t profileId, uint32_t spineId);
    uint32_t loft(std::vector<uint32_t> wireIds, bool isSolid);
    uint32_t sweep(uint32_t wireId, uint32_t spineId, int transitionMode);
    uint32_t sweepPipeShell(uint32_t profileId, uint32_t spineId, bool freenet, bool smooth);
    uint32_t draftPrism(uint32_t shapeId, double dx, double dy, double dz, double angleDeg);
    uint32_t revolveVec(uint32_t shapeId, double cx, double cy, double cz, double dx, double dy,
                        double dz, double angle);

    // --- Shape construction ---
    uint32_t makeVertex(double x, double y, double z);
    uint32_t makeEdge(uint32_t v1, uint32_t v2);
    uint32_t makeLineEdge(double x1, double y1, double z1, double x2, double y2, double z2);
    uint32_t makeCircleEdge(double cx, double cy, double cz, double nx, double ny, double nz,
                            double radius);
    uint32_t makeCircleArc(double cx, double cy, double cz, double nx, double ny, double nz,
                           double radius, double startAngle, double endAngle);
    uint32_t makeArcEdge(double x1, double y1, double z1, double x2, double y2, double z2,
                         double x3, double y3, double z3);
    uint32_t makeEllipseEdge(double cx, double cy, double cz, double nx, double ny, double nz,
                             double majorRadius, double minorRadius);
    uint32_t makeEllipseArc(double cx, double cy, double cz, double nx, double ny, double nz,
                            double majorRadius, double minorRadius, double startAngle,
                            double endAngle);
    uint32_t makeBezierEdge(std::vector<double> flatPoints);
    uint32_t makeHelixWire(double px, double py, double pz, double dx, double dy, double dz,
                           double pitch, double height, double radius);
    uint32_t makeWire(std::vector<uint32_t> edgeIds);
    uint32_t makeFace(uint32_t wireId);
    uint32_t makeNonPlanarFace(uint32_t wireId);
    uint32_t addHolesInFace(uint32_t faceId, std::vector<uint32_t> holeWireIds);
    uint32_t removeHolesFromFace(uint32_t faceId, std::vector<int> holeIndices);
    uint32_t solidFromShell(uint32_t shellId);
    uint32_t makeSolid(uint32_t shellId);
    uint32_t sew(std::vector<uint32_t> shapeIds, double tolerance);
    uint32_t sewAndSolidify(std::vector<uint32_t> faceIds, double tolerance);
    uint32_t buildSolidFromFaces(std::vector<uint32_t> faceIds, double tolerance);
    uint32_t makeCompound(std::vector<uint32_t> shapeIds);
    uint32_t buildTriFace(double ax, double ay, double az, double bx, double by, double bz,
                          double cx2, double cy2, double cz2);

    // --- Transforms ---
    uint32_t translate(uint32_t id, double dx, double dy, double dz);
    uint32_t rotate(uint32_t id, double px, double py, double pz, double dx, double dy, double dz,
                    double angleRad);
    uint32_t scale(uint32_t id, double px, double py, double pz, double factor);
    uint32_t mirror(uint32_t id, double px, double py, double pz, double nx, double ny, double nz);
    uint32_t copy(uint32_t id);
    uint32_t transform(uint32_t id, std::vector<double> matrix);
    uint32_t generalTransform(uint32_t id, std::vector<double> matrix);
    uint32_t linearPattern(uint32_t id, double dx, double dy, double dz, double spacing, int count);
    uint32_t circularPattern(uint32_t id, double cx, double cy, double cz, double ax, double ay,
                             double az, double angle, int count);
    std::vector<double> composeTransform(std::vector<double> m1, std::vector<double> m2);

    // --- Topology query ---
    std::string getShapeType(uint32_t id);
    std::vector<uint32_t> getSubShapes(uint32_t id, const std::string& shapeType);
    uint32_t downcast(uint32_t id, const std::string& targetType);
    double distanceBetween(uint32_t a, uint32_t b);
    bool isSame(uint32_t a, uint32_t b);
    bool isEqual(uint32_t a, uint32_t b);
    bool isNull(uint32_t id);
    int hashCode(uint32_t id, int upperBound);
    std::string shapeOrientation(uint32_t id);
    std::vector<uint32_t> sharedEdges(uint32_t faceA, uint32_t faceB);
    std::vector<uint32_t> adjacentFaces(uint32_t shapeId, uint32_t faceId);
    std::vector<uint32_t> iterShapes(uint32_t id);
    std::vector<int> edgeToFaceMap(uint32_t id, int hashUpperBound);

    // --- Tessellation / Mesh ---
    MeshData tessellate(uint32_t id, double linearDeflection, double angularDeflection);
    EdgeData wireframe(uint32_t id, double deflection);
    bool hasTriangulation(uint32_t id);
    MeshData meshShape(uint32_t id, double linearDeflection, double angularDeflection);

    // --- I/O ---
    uint32_t importStep(const std::string& data);
    std::string exportStep(uint32_t id);
    uint32_t importIges(const std::string& data);
    std::string exportIges(uint32_t id);
    std::string exportStl(uint32_t id, double linearDeflection);
    std::string toBREP(uint32_t id);
    uint32_t fromBREP(const std::string& data);

    // --- Query / Measure ---
    BBoxData getBoundingBox(uint32_t id);
    double getVolume(uint32_t id);
    double getSurfaceArea(uint32_t id);
    double getLength(uint32_t id);
    std::vector<double> getCenterOfMass(uint32_t id);
    std::vector<double> getLinearCenterOfMass(uint32_t id);
    double surfaceCurvature(uint32_t faceId, double u, double v);

    // --- Vertex/Surface query ---
    std::vector<double> vertexPosition(uint32_t vertexId);
    std::string surfaceType(uint32_t faceId);
    std::vector<double> surfaceNormal(uint32_t faceId, double u, double v);
    std::vector<double> pointOnSurface(uint32_t faceId, double u, double v);
    uint32_t outerWire(uint32_t faceId);
    std::vector<double> uvBounds(uint32_t faceId);
    std::vector<double> uvFromPoint(uint32_t faceId, double x, double y, double z);
    std::vector<double> projectPointOnFace(uint32_t faceId, double x, double y, double z);
    std::string classifyPointOnFace(uint32_t faceId, double u, double v);

    // --- Curve ops ---
    std::string curveType(uint32_t edgeId);
    std::vector<double> curvePointAtParam(uint32_t edgeId, double param);
    std::vector<double> curveTangent(uint32_t edgeId, double param);
    std::vector<double> curveParameters(uint32_t edgeId);
    bool curveIsClosed(uint32_t edgeId);
    bool curveIsPeriodic(uint32_t edgeId);
    double curveLength(uint32_t edgeId);
    uint32_t interpolatePoints(std::vector<double> flatPoints, bool periodic);
    uint32_t approximatePoints(std::vector<double> flatPoints, double tolerance);

    // --- Modifier (expanded) ---
    uint32_t thicken(uint32_t shapeId, double thickness);
    uint32_t defeature(uint32_t shapeId, std::vector<uint32_t> faceIds);
    uint32_t reverseShape(uint32_t id);
    uint32_t simplify(uint32_t id);
    uint32_t filletVariable(uint32_t solidId, uint32_t edgeId, double startRadius,
                            double endRadius);
    uint32_t offsetWire2D(uint32_t wireId, double offset, int joinType);

    // --- Evolution (operations with shape history) ---
    EvolutionData translateWithHistory(uint32_t id, double dx, double dy, double dz,
                                       std::vector<int> inputFaceHashes, int hashUpperBound);
    EvolutionData fuseWithHistory(uint32_t a, uint32_t b, std::vector<int> inputFaceHashes,
                                  int hashUpperBound);
    EvolutionData cutWithHistory(uint32_t a, uint32_t b, std::vector<int> inputFaceHashes,
                                 int hashUpperBound);
    EvolutionData filletWithHistory(uint32_t solidId, std::vector<uint32_t> edgeIds, double radius,
                                    std::vector<int> inputFaceHashes, int hashUpperBound);
    EvolutionData rotateWithHistory(uint32_t id, double px, double py, double pz, double dx,
                                    double dy, double dz, double angle,
                                    std::vector<int> inputFaceHashes, int hashUpperBound);
    EvolutionData mirrorWithHistory(uint32_t id, double px, double py, double pz, double nx,
                                    double ny, double nz, std::vector<int> inputFaceHashes,
                                    int hashUpperBound);
    EvolutionData scaleWithHistory(uint32_t id, double cx, double cy, double cz, double factor,
                                   std::vector<int> inputFaceHashes, int hashUpperBound);
    EvolutionData intersectWithHistory(uint32_t a, uint32_t b, std::vector<int> inputFaceHashes,
                                       int hashUpperBound);
    EvolutionData chamferWithHistory(uint32_t solidId, std::vector<uint32_t> edgeIds,
                                     double distance, std::vector<int> inputFaceHashes,
                                     int hashUpperBound);
    EvolutionData shellWithHistory(uint32_t solidId, std::vector<uint32_t> faceIds,
                                   double thickness, std::vector<int> inputFaceHashes,
                                   int hashUpperBound);
    EvolutionData offsetWithHistory(uint32_t solidId, double distance,
                                    std::vector<int> inputFaceHashes, int hashUpperBound);
    EvolutionData thickenWithHistory(uint32_t shapeId, double thickness,
                                     std::vector<int> inputFaceHashes, int hashUpperBound);

    // --- Healing / Repair ---
    uint32_t fixShape(uint32_t id);
    uint32_t unifySameDomain(uint32_t id);
    bool isValid(uint32_t id);
    uint32_t healSolid(uint32_t id, double tolerance);
    uint32_t healFace(uint32_t id, double tolerance);
    uint32_t healWire(uint32_t id, double tolerance);
    uint32_t fixFaceOrientations(uint32_t id);
    uint32_t removeDegenerateEdges(uint32_t id);

  private:
    uint32_t store(const TopoDS_Shape& shape);
    const TopoDS_Shape& get(uint32_t id) const;

    std::unordered_map<uint32_t, TopoDS_Shape> arena_;
    uint32_t nextId_ = 1;
};
