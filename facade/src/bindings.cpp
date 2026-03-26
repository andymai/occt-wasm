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
    register_vector<double>("VectorDouble");
    register_vector<int>("VectorInt");

    // EvolutionData
    class_<EvolutionData>("EvolutionData")
        .property("resultId", &EvolutionData::resultId)
        .property("modified", &EvolutionData::modified)
        .property("generated", &EvolutionData::generated)
        .property("deleted", &EvolutionData::deleted);

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
        .function("fuseAll", &OcctKernel::fuseAll)
        .function("cutAll", &OcctKernel::cutAll)
        .function("split", &OcctKernel::split)

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
        .function("sweep", &OcctKernel::sweep)
        .function("sweepPipeShell", &OcctKernel::sweepPipeShell)
        .function("draftPrism", &OcctKernel::draftPrism)

        // Construction
        .function("makeVertex", &OcctKernel::makeVertex)
        .function("makeEdge", &OcctKernel::makeEdge)
        .function("makeLineEdge", &OcctKernel::makeLineEdge)
        .function("makeCircleEdge", &OcctKernel::makeCircleEdge)
        .function("makeCircleArc", &OcctKernel::makeCircleArc)
        .function("makeArcEdge", &OcctKernel::makeArcEdge)
        .function("makeEllipseEdge", &OcctKernel::makeEllipseEdge)
        .function("makeBezierEdge", &OcctKernel::makeBezierEdge)
        .function("makeWire", &OcctKernel::makeWire)
        .function("makeFace", &OcctKernel::makeFace)
        .function("makeNonPlanarFace", &OcctKernel::makeNonPlanarFace)
        .function("addHolesInFace", &OcctKernel::addHolesInFace)
        .function("makeSolid", &OcctKernel::makeSolid)
        .function("sew", &OcctKernel::sew)
        .function("sewAndSolidify", &OcctKernel::sewAndSolidify)
        .function("makeCompound", &OcctKernel::makeCompound)
        .function("buildTriFace", &OcctKernel::buildTriFace)

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
        .function("downcast", &OcctKernel::downcast)
        .function("adjacentFaces", &OcctKernel::adjacentFaces)
        .function("isSame", &OcctKernel::isSame)
        .function("isEqual", &OcctKernel::isEqual)
        .function("isNull", &OcctKernel::isNull)
        .function("hashCode", &OcctKernel::hashCode)
        .function("shapeOrientation", &OcctKernel::shapeOrientation)
        .function("sharedEdges", &OcctKernel::sharedEdges)

        // Tessellation
        .function("tessellate", &OcctKernel::tessellate)
        .function("wireframe", &OcctKernel::wireframe)

        // I/O
        .function("importStep", &OcctKernel::importStep)
        .function("exportStep", &OcctKernel::exportStep)
        .function("exportStl", &OcctKernel::exportStl)
        .function("toBREP", &OcctKernel::toBREP)
        .function("fromBREP", &OcctKernel::fromBREP)

        // Query
        .function("getBoundingBox", &OcctKernel::getBoundingBox)
        .function("getVolume", &OcctKernel::getVolume)
        .function("getSurfaceArea", &OcctKernel::getSurfaceArea)
        .function("getLength", &OcctKernel::getLength)
        .function("getCenterOfMass", &OcctKernel::getCenterOfMass)

        // Vertex/surface query
        .function("vertexPosition", &OcctKernel::vertexPosition)
        .function("surfaceType", &OcctKernel::surfaceType)
        .function("surfaceNormal", &OcctKernel::surfaceNormal)
        .function("pointOnSurface", &OcctKernel::pointOnSurface)
        .function("outerWire", &OcctKernel::outerWire)

        // Evolution (history tracking)
        .function("translateWithHistory", &OcctKernel::translateWithHistory)
        .function("fuseWithHistory", &OcctKernel::fuseWithHistory)
        .function("cutWithHistory", &OcctKernel::cutWithHistory)
        .function("filletWithHistory", &OcctKernel::filletWithHistory)
        .function("rotateWithHistory", &OcctKernel::rotateWithHistory)
        .function("mirrorWithHistory", &OcctKernel::mirrorWithHistory)
        .function("scaleWithHistory", &OcctKernel::scaleWithHistory)
        .function("intersectWithHistory", &OcctKernel::intersectWithHistory)
        .function("chamferWithHistory", &OcctKernel::chamferWithHistory)
        .function("shellWithHistory", &OcctKernel::shellWithHistory)
        .function("offsetWithHistory", &OcctKernel::offsetWithHistory)
        .function("thickenWithHistory", &OcctKernel::thickenWithHistory)

        // Modifiers (expanded)
        .function("thicken", &OcctKernel::thicken)
        .function("defeature", &OcctKernel::defeature)
        .function("reverseShape", &OcctKernel::reverseShape)
        .function("simplify", &OcctKernel::simplify)

        // Transform (expanded)
        .function("linearPattern", &OcctKernel::linearPattern)
        .function("circularPattern", &OcctKernel::circularPattern)

        // Curve ops
        .function("curveType", &OcctKernel::curveType)
        .function("curvePointAtParam", &OcctKernel::curvePointAtParam)
        .function("curveTangent", &OcctKernel::curveTangent)
        .function("curveParameters", &OcctKernel::curveParameters)
        .function("curveIsClosed", &OcctKernel::curveIsClosed)
        .function("curveLength", &OcctKernel::curveLength)
        .function("interpolatePoints", &OcctKernel::interpolatePoints)

        // Mesh
        .function("hasTriangulation", &OcctKernel::hasTriangulation)

        // Healing
        .function("fixShape", &OcctKernel::fixShape)
        .function("unifySameDomain", &OcctKernel::unifySameDomain)
        .function("isValid", &OcctKernel::isValid);
}
