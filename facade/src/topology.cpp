#include "occt_kernel.h"

#include <BRepExtrema_DistShapeShape.hxx>
#include <BRep_Tool.hxx>
#include <Standard_Failure.hxx>
#include <TopAbs_Orientation.hxx>
#include <TopAbs_ShapeEnum.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_ShapeMapHasher.hxx>
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

bool OcctKernel::isSame(uint32_t a, uint32_t b) {
    return get(a).IsSame(get(b));
}

bool OcctKernel::isEqual(uint32_t a, uint32_t b) {
    return get(a).IsEqual(get(b));
}

bool OcctKernel::isNull(uint32_t id) {
    return get(id).IsNull();
}

int OcctKernel::hashCode(uint32_t id, int upperBound) {
    return static_cast<int>(TopTools_ShapeMapHasher{}(get(id)) % static_cast<size_t>(upperBound));
}

std::string OcctKernel::shapeOrientation(uint32_t id) {
    switch (get(id).Orientation()) {
    case TopAbs_FORWARD:
        return "forward";
    case TopAbs_REVERSED:
        return "reversed";
    case TopAbs_INTERNAL:
        return "internal";
    case TopAbs_EXTERNAL:
        return "external";
    default:
        return "unknown";
    }
}

uint32_t OcctKernel::downcast(uint32_t id, const std::string& targetType) {
    // In our arena, shapes are already stored as TopoDS_Shape which can be any sub-type.
    // downcast just re-stores the same shape (OCCT's TopoDS::Vertex etc. are just casts).
    // This ensures the arena has a separate ID for the downcast reference.
    try {
        const auto& shape = get(id);
        TopAbs_ShapeEnum target = parseShapeType(targetType);
        if (shape.ShapeType() != target) {
            throw std::runtime_error("downcast: shape type mismatch — expected " + targetType +
                                     ", got " + shapeTypeToString(shape.ShapeType()));
        }
        return store(shape);
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("downcast: ") + e.what());
    }
}

std::vector<uint32_t> OcctKernel::adjacentFaces(uint32_t shapeId, uint32_t faceId) {
    try {
        const auto& shape = get(shapeId);
        const auto& targetFace = get(faceId);
        std::vector<uint32_t> result;

        // Find faces that share an edge with targetFace
        for (TopExp_Explorer exF(shape, TopAbs_FACE); exF.More(); exF.Next()) {
            if (exF.Current().IsSame(targetFace))
                continue;
            bool adjacent = false;
            for (TopExp_Explorer exE1(targetFace, TopAbs_EDGE); exE1.More() && !adjacent;
                 exE1.Next()) {
                for (TopExp_Explorer exE2(exF.Current(), TopAbs_EDGE); exE2.More(); exE2.Next()) {
                    if (exE1.Current().IsSame(exE2.Current())) {
                        adjacent = true;
                        break;
                    }
                }
            }
            if (adjacent) {
                result.push_back(store(exF.Current()));
            }
        }
        return result;
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("adjacentFaces: ") + e.what());
    }
}

std::vector<uint32_t> OcctKernel::sharedEdges(uint32_t faceA, uint32_t faceB) {
    try {
        const auto& fa = get(faceA);
        const auto& fb = get(faceB);
        std::vector<uint32_t> result;
        for (TopExp_Explorer exA(fa, TopAbs_EDGE); exA.More(); exA.Next()) {
            for (TopExp_Explorer exB(fb, TopAbs_EDGE); exB.More(); exB.Next()) {
                if (exA.Current().IsSame(exB.Current())) {
                    result.push_back(store(exA.Current()));
                    break;
                }
            }
        }
        return result;
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("sharedEdges: ") + e.what());
    }
}
