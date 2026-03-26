#include "occt_kernel.h"

#include <BRepExtrema_DistShapeShape.hxx>
#include <Standard_Failure.hxx>
#include <TopAbs_ShapeEnum.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>

#include <stdexcept>
#include <string>

static TopAbs_ShapeEnum parseShapeType(const std::string& type) {
    if (type == "vertex")
        return TopAbs_VERTEX;
    if (type == "edge")
        return TopAbs_EDGE;
    if (type == "wire")
        return TopAbs_WIRE;
    if (type == "face")
        return TopAbs_FACE;
    if (type == "shell")
        return TopAbs_SHELL;
    if (type == "solid")
        return TopAbs_SOLID;
    if (type == "compound")
        return TopAbs_COMPOUND;
    throw std::runtime_error("Unknown shape type: " + type);
}

static std::string shapeTypeToString(TopAbs_ShapeEnum type) {
    switch (type) {
    case TopAbs_VERTEX:
        return "vertex";
    case TopAbs_EDGE:
        return "edge";
    case TopAbs_WIRE:
        return "wire";
    case TopAbs_FACE:
        return "face";
    case TopAbs_SHELL:
        return "shell";
    case TopAbs_SOLID:
        return "solid";
    case TopAbs_COMPSOLID:
        return "compsolid";
    case TopAbs_COMPOUND:
        return "compound";
    default:
        return "shape";
    }
}

std::string OcctKernel::getShapeType(uint32_t id) {
    return shapeTypeToString(get(id).ShapeType());
}

std::vector<uint32_t> OcctKernel::getSubShapes(uint32_t id, const std::string& shapeType) {
    try {
        TopAbs_ShapeEnum toExplore = parseShapeType(shapeType);
        std::vector<uint32_t> result;
        for (TopExp_Explorer ex(get(id), toExplore); ex.More(); ex.Next()) {
            result.push_back(store(ex.Current()));
        }
        return result;
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("getSubShapes: ") + e.what());
    }
}

double OcctKernel::distanceBetween(uint32_t a, uint32_t b) {
    try {
        BRepExtrema_DistShapeShape dist(get(a), get(b));
        if (!dist.IsDone()) {
            throw std::runtime_error("distanceBetween: computation failed");
        }
        return dist.Value();
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("distanceBetween: ") + e.what());
    }
}
