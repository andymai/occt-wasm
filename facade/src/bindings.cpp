#include "occt_kernel.h"
#include <emscripten/bind.h>

using namespace emscripten;

EMSCRIPTEN_BINDINGS(occt_wasm) {
    // Vector types
    register_vector<uint32_t>("VectorUint32");
    register_vector<double>("VectorDouble");
    register_vector<int>("VectorInt");

    // MeshData
    class_<MeshData>("MeshData")
        .function("getPositionsPtr", &MeshData::getPositionsPtr)
        .function("getNormalsPtr", &MeshData::getNormalsPtr)
        .function("getIndicesPtr", &MeshData::getIndicesPtr)
        .property("positionCount", &MeshData::positionCount)
        .property("normalCount", &MeshData::normalCount)
        .property("indexCount", &MeshData::indexCount)
        .function("getFaceGroupsPtr", &MeshData::getFaceGroupsPtr)
        .property("faceGroupCount", &MeshData::faceGroupCount);

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
        .function("getEdgeGroupsPtr", &EdgeData::getEdgeGroupsPtr)
        .property("pointCount", &EdgeData::pointCount)
        .property("edgeGroupCount", &EdgeData::edgeGroupCount);

    // ProjectionData
    value_object<ProjectionData>("ProjectionData")
        .field("visibleOutline", &ProjectionData::visibleOutline)
        .field("visibleSmooth", &ProjectionData::visibleSmooth)
        .field("visibleSharp", &ProjectionData::visibleSharp)
        .field("hiddenOutline", &ProjectionData::hiddenOutline)
        .field("hiddenSmooth", &ProjectionData::hiddenSmooth)
        .field("hiddenSharp", &ProjectionData::hiddenSharp);

    // NurbsCurveData
    class_<NurbsCurveData>("NurbsCurveData")
        .property("degree", &NurbsCurveData::degree)
        .property("rational", &NurbsCurveData::rational)
        .property("periodic", &NurbsCurveData::periodic)
        .property("knots", &NurbsCurveData::knots)
        .property("multiplicities", &NurbsCurveData::multiplicities)
        .property("poles", &NurbsCurveData::poles)
        .property("weights", &NurbsCurveData::weights);

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
        .function("makeBoxFromCorners", &OcctKernel::makeBoxFromCorners)
        .function("makeCylinder", &OcctKernel::makeCylinder)
        .function("makeSphere", &OcctKernel::makeSphere)
        .function("makeCone", &OcctKernel::makeCone)
        .function("makeTorus", &OcctKernel::makeTorus)
        .function("makeEllipsoid", &OcctKernel::makeEllipsoid)
        .function("makeRectangle", &OcctKernel::makeRectangle)

        // Booleans
        .function("fuse", &OcctKernel::fuse)
        .function("cut", &OcctKernel::cut)
        .function("common", &OcctKernel::common)
        .function("intersect", &OcctKernel::intersect)
        .function("section", &OcctKernel::section)
        .function("fuseAll", &OcctKernel::fuseAll)
        .function("cutAll", &OcctKernel::cutAll)
        .function("split", &OcctKernel::split)

        // Modeling
        .function("extrude", &OcctKernel::extrude)
        .function("revolve", &OcctKernel::revolve)
        .function("fillet", &OcctKernel::fillet)
        .function("chamfer", &OcctKernel::chamfer)
        .function("chamferDistAngle", &OcctKernel::chamferDistAngle)
        .function("shell", &OcctKernel::shell)
        .function("offset", &OcctKernel::offset)
        .function("draft", &OcctKernel::draft)

        // Sweeps
        .function("pipe", &OcctKernel::pipe)
        .function("simplePipe", &OcctKernel::simplePipe)
        .function("loft", &OcctKernel::loft)
        .function("sweep", &OcctKernel::sweep)
        .function("sweepPipeShell", &OcctKernel::sweepPipeShell)
        .function("draftPrism", &OcctKernel::draftPrism)
        .function("revolveVec", &OcctKernel::revolveVec)

        // Construction
        .function("makeVertex", &OcctKernel::makeVertex)
        .function("makeEdge", &OcctKernel::makeEdge)
        .function("makeLineEdge", &OcctKernel::makeLineEdge)
        .function("makeCircleEdge", &OcctKernel::makeCircleEdge)
        .function("makeCircleArc", &OcctKernel::makeCircleArc)
        .function("makeArcEdge", &OcctKernel::makeArcEdge)
        .function("makeEllipseEdge", &OcctKernel::makeEllipseEdge)
        .function("makeEllipseArc", &OcctKernel::makeEllipseArc)
        .function("makeBezierEdge", &OcctKernel::makeBezierEdge)
        .function("makeHelixWire", &OcctKernel::makeHelixWire)
        .function("makeWire", &OcctKernel::makeWire)
        .function("makeFace", &OcctKernel::makeFace)
        .function("makeNonPlanarFace", &OcctKernel::makeNonPlanarFace)
        .function("addHolesInFace", &OcctKernel::addHolesInFace)
        .function("removeHolesFromFace", &OcctKernel::removeHolesFromFace)
        .function("solidFromShell", &OcctKernel::solidFromShell)
        .function("makeSolid", &OcctKernel::makeSolid)
        .function("sew", &OcctKernel::sew)
        .function("sewAndSolidify", &OcctKernel::sewAndSolidify)
        .function("buildSolidFromFaces", &OcctKernel::buildSolidFromFaces)
        .function("makeCompound", &OcctKernel::makeCompound)
        .function("buildTriFace", &OcctKernel::buildTriFace)

        // Transforms
        .function("translate", &OcctKernel::translate)
        .function("rotate", &OcctKernel::rotate)
        .function("scale", &OcctKernel::scale)
        .function("mirror", &OcctKernel::mirror)
        .function("copy", &OcctKernel::copy)
        .function("transform", &OcctKernel::transform)
        .function("generalTransform", &OcctKernel::generalTransform)
        .function("linearPattern", &OcctKernel::linearPattern)
        .function("circularPattern", &OcctKernel::circularPattern)
        .function("composeTransform", &OcctKernel::composeTransform)

        // Topology
        .function("getShapeType", &OcctKernel::getShapeType)
        .function("getSubShapes", &OcctKernel::getSubShapes)
        .function("downcast", &OcctKernel::downcast)
        .function("distanceBetween", &OcctKernel::distanceBetween)
        .function("isSame", &OcctKernel::isSame)
        .function("isEqual", &OcctKernel::isEqual)
        .function("isNull", &OcctKernel::isNull)
        .function("hashCode", &OcctKernel::hashCode)
        .function("shapeOrientation", &OcctKernel::shapeOrientation)
        .function("sharedEdges", &OcctKernel::sharedEdges)
        .function("adjacentFaces", &OcctKernel::adjacentFaces)
        .function("iterShapes", &OcctKernel::iterShapes)
        .function("edgeToFaceMap", &OcctKernel::edgeToFaceMap)

        // Mesh / Tessellation
        .function("tessellate", &OcctKernel::tessellate)
        .function("wireframe", &OcctKernel::wireframe)
        .function("hasTriangulation", &OcctKernel::hasTriangulation)
        .function("meshShape", &OcctKernel::meshShape)

        // I/O
        .function("importStep", &OcctKernel::importStep)
        .function("exportStep", &OcctKernel::exportStep)
        .function("importIges", &OcctKernel::importIges)
        .function("exportIges", &OcctKernel::exportIges)
        .function("exportStl", &OcctKernel::exportStl)
        .function("toBREP", &OcctKernel::toBREP)
        .function("fromBREP", &OcctKernel::fromBREP)

        // Query / Measure
        .function("getBoundingBox", &OcctKernel::getBoundingBox)
        .function("getVolume", &OcctKernel::getVolume)
        .function("getSurfaceArea", &OcctKernel::getSurfaceArea)
        .function("getLength", &OcctKernel::getLength)
        .function("getCenterOfMass", &OcctKernel::getCenterOfMass)
        .function("getLinearCenterOfMass", &OcctKernel::getLinearCenterOfMass)
        .function("surfaceCurvature", &OcctKernel::surfaceCurvature)

        // Vertex/Surface query
        .function("vertexPosition", &OcctKernel::vertexPosition)
        .function("surfaceType", &OcctKernel::surfaceType)
        .function("surfaceNormal", &OcctKernel::surfaceNormal)
        .function("pointOnSurface", &OcctKernel::pointOnSurface)
        .function("outerWire", &OcctKernel::outerWire)
        .function("uvBounds", &OcctKernel::uvBounds)
        .function("uvFromPoint", &OcctKernel::uvFromPoint)
        .function("projectPointOnFace", &OcctKernel::projectPointOnFace)
        .function("classifyPointOnFace", &OcctKernel::classifyPointOnFace)

        // Curve ops
        .function("curveType", &OcctKernel::curveType)
        .function("curvePointAtParam", &OcctKernel::curvePointAtParam)
        .function("curveTangent", &OcctKernel::curveTangent)
        .function("curveParameters", &OcctKernel::curveParameters)
        .function("curveIsClosed", &OcctKernel::curveIsClosed)
        .function("curveIsPeriodic", &OcctKernel::curveIsPeriodic)
        .function("curveLength", &OcctKernel::curveLength)
        .function("interpolatePoints", &OcctKernel::interpolatePoints)
        .function("approximatePoints", &OcctKernel::approximatePoints)

        // Projection (HLR)
        .function("projectEdges", &OcctKernel::projectEdges)

        // NURBS introspection
        .function("getNurbsCurveData", &OcctKernel::getNurbsCurveData)

        // 2D→3D curve lifting
        .function("liftCurve2dToPlane", &OcctKernel::liftCurve2dToPlane)

        // Modifiers (expanded)
        .function("thicken", &OcctKernel::thicken)
        .function("defeature", &OcctKernel::defeature)
        .function("reverseShape", &OcctKernel::reverseShape)
        .function("simplify", &OcctKernel::simplify)
        .function("filletVariable", &OcctKernel::filletVariable)
        .function("offsetWire2D", &OcctKernel::offsetWire2D)

        // Evolution
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

        // Null shape (test support)
        .function("makeNullShape", &OcctKernel::makeNullShape)

        // Healing / Repair
        .function("fixShape", &OcctKernel::fixShape)
        .function("unifySameDomain", &OcctKernel::unifySameDomain)
        .function("isValid", &OcctKernel::isValid)
        .function("healSolid", &OcctKernel::healSolid)
        .function("healFace", &OcctKernel::healFace)
        .function("healWire", &OcctKernel::healWire)
        .function("fixFaceOrientations", &OcctKernel::fixFaceOrientations)
        .function("removeDegenerateEdges", &OcctKernel::removeDegenerateEdges);
}
