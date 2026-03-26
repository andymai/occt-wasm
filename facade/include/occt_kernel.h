#pragma once

#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

#include <TopoDS_Shape.hxx>

/// Mesh data returned from tessellation.
/// Owns heap-allocated arrays; cleaned up by destructor.
struct MeshData {
    float* positions = nullptr;  // xyz interleaved
    float* normals = nullptr;    // xyz interleaved
    uint32_t* indices = nullptr; // triangle indices
    int positionCount = 0;       // number of floats (vertexCount * 3)
    int normalCount = 0;         // number of floats (vertexCount * 3)
    int indexCount = 0;          // number of uint32s (triangleCount * 3)

    MeshData() = default;
    ~MeshData();

    // Move-only (Embind needs copy ctor, implemented as ownership transfer)
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

/// Arena-based OCCT kernel. All shapes are stored by u32 ID.
/// JS/TS never interacts with OCCT types directly.
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
    uint32_t makeCylinder(double radius, double height);
    uint32_t makeSphere(double radius);
    uint32_t makeCone(double r1, double r2, double height);
    uint32_t makeTorus(double majorRadius, double minorRadius);

    // --- Booleans ---
    uint32_t fuse(uint32_t a, uint32_t b);
    uint32_t cut(uint32_t a, uint32_t b);
    uint32_t common(uint32_t a, uint32_t b);

    // --- Tessellation ---
    MeshData tessellate(uint32_t id, double linearDeflection, double angularDeflection);

    // --- I/O ---
    uint32_t importStep(const std::string& data);
    std::string exportStep(uint32_t id);

    // --- Query ---
    BBoxData getBoundingBox(uint32_t id);
    double getVolume(uint32_t id);
    double getSurfaceArea(uint32_t id);

  private:
    uint32_t store(const TopoDS_Shape& shape);
    const TopoDS_Shape& get(uint32_t id) const;

    std::unordered_map<uint32_t, TopoDS_Shape> arena_;
    uint32_t nextId_ = 1;
};
