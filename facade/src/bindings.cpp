#include "occt_kernel.h"
#include <emscripten/bind.h>

using namespace emscripten;

EMSCRIPTEN_BINDINGS(occt_wasm) {
    // MeshData
    class_<MeshData>("MeshData")
        .function("getPositionsPtr", &MeshData::getPositionsPtr)
        .function("getNormalsPtr", &MeshData::getNormalsPtr)
        .function("getIndicesPtr", &MeshData::getIndicesPtr)
        .property("positionCount", &MeshData::positionCount)
        .property("normalCount", &MeshData::normalCount)
        .property("indexCount", &MeshData::indexCount);

    // BBoxData
    value_object<BBoxData>("BBoxData")
        .field("xmin", &BBoxData::xmin)
        .field("ymin", &BBoxData::ymin)
        .field("zmin", &BBoxData::zmin)
        .field("xmax", &BBoxData::xmax)
        .field("ymax", &BBoxData::ymax)
        .field("zmax", &BBoxData::zmax);

    // EdgeData
    class_<EdgeData>("EdgeData")
        .function("getPointsPtr", &EdgeData::getPointsPtr)
        .property("pointCount", &EdgeData::pointCount);

    // Vector types for Embind
    register_vector<uint32_t>("VectorUint32");

    // OcctKernel
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
        .function("section", &OcctKernel::section)

        // Modeling
        .function("extrude", &OcctKernel::extrude)
        .function("revolve", &OcctKernel::revolve)
        .function("fillet", &OcctKernel::fillet)
        .function("chamfer", &OcctKernel::chamfer)
        .function("shell", &OcctKernel::shell)
        .function("offset", &OcctKernel::offset)
        .function("draft", &OcctKernel::draft)

        // Sweeps
        .function("pipe", &OcctKernel::pipe)
        .function("loft", &OcctKernel::loft)

        // Construction
        .function("makeVertex", &OcctKernel::makeVertex)
        .function("makeEdge", &OcctKernel::makeEdge)
        .function("makeWire", &OcctKernel::makeWire)
        .function("makeFace", &OcctKernel::makeFace)
        .function("makeSolid", &OcctKernel::makeSolid)
        .function("sew", &OcctKernel::sew)
        .function("makeCompound", &OcctKernel::makeCompound)

        // Transforms
        .function("translate", &OcctKernel::translate)
        .function("rotate", &OcctKernel::rotate)
        .function("scale", &OcctKernel::scale)
        .function("mirror", &OcctKernel::mirror)
        .function("copy", &OcctKernel::copy)

        // Topology query
        .function("getShapeType", &OcctKernel::getShapeType)
        .function("getSubShapes", &OcctKernel::getSubShapes)
        .function("distanceBetween", &OcctKernel::distanceBetween)

        // Tessellation
        .function("tessellate", &OcctKernel::tessellate)
        .function("wireframe", &OcctKernel::wireframe)

        // I/O
        .function("importStep", &OcctKernel::importStep)
        .function("exportStep", &OcctKernel::exportStep)
        .function("exportStl", &OcctKernel::exportStl)

        // Query
        .function("getBoundingBox", &OcctKernel::getBoundingBox)
        .function("getVolume", &OcctKernel::getVolume)
        .function("getSurfaceArea", &OcctKernel::getSurfaceArea)

        // Healing
        .function("fixShape", &OcctKernel::fixShape)
        .function("unifySameDomain", &OcctKernel::unifySameDomain);
}
