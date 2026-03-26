#include "occt_kernel.h"
#include <emscripten/bind.h>

using namespace emscripten;

EMSCRIPTEN_BINDINGS(occt_wasm) {
    // MeshData — returned from tessellate()
    class_<MeshData>("MeshData")
        .function("getPositionsPtr", &MeshData::getPositionsPtr)
        .function("getNormalsPtr", &MeshData::getNormalsPtr)
        .function("getIndicesPtr", &MeshData::getIndicesPtr)
        .property("positionCount", &MeshData::positionCount)
        .property("normalCount", &MeshData::normalCount)
        .property("indexCount", &MeshData::indexCount);

    // BBoxData — returned from getBoundingBox()
    value_object<BBoxData>("BBoxData")
        .field("xmin", &BBoxData::xmin)
        .field("ymin", &BBoxData::ymin)
        .field("zmin", &BBoxData::zmin)
        .field("xmax", &BBoxData::xmax)
        .field("ymax", &BBoxData::ymax)
        .field("zmax", &BBoxData::zmax);

    // OcctKernel — the main API
    class_<OcctKernel>("OcctKernel")
        .constructor<>()

        // Arena
        .function("release", &OcctKernel::release)
        .function("releaseAll", &OcctKernel::releaseAll)
        .function("getShapeCount", &OcctKernel::getShapeCount)

        // Primitives
        .function("makeBox", &OcctKernel::makeBox)
        .function("makeCylinder", &OcctKernel::makeCylinder)
        .function("makeSphere", &OcctKernel::makeSphere)
        .function("makeCone", &OcctKernel::makeCone)
        .function("makeTorus", &OcctKernel::makeTorus)

        // Booleans
        .function("fuse", &OcctKernel::fuse)
        .function("cut", &OcctKernel::cut)
        .function("common", &OcctKernel::common)

        // Tessellation
        .function("tessellate", &OcctKernel::tessellate)

        // I/O
        .function("importStep", &OcctKernel::importStep)
        .function("exportStep", &OcctKernel::exportStep)

        // Query
        .function("getBoundingBox", &OcctKernel::getBoundingBox)
        .function("getVolume", &OcctKernel::getVolume)
        .function("getSurfaceArea", &OcctKernel::getSurfaceArea);
}
