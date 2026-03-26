#include "occt_kernel.h"

#include <BRepCheck_Analyzer.hxx>
#include <ShapeFix_Face.hxx>
#include <ShapeFix_Shape.hxx>
#include <ShapeFix_Solid.hxx>
#include <ShapeFix_Wire.hxx>
#include <ShapeUpgrade_UnifySameDomain.hxx>
#include <Standard_Failure.hxx>
#include <TopoDS.hxx>

#include <stdexcept>
#include <string>

uint32_t OcctKernel::fixShape(uint32_t id) {
    try {
        ShapeFix_Shape fixer(get(id));
        fixer.Perform();
        return store(fixer.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("fixShape: ") + e.what());
    }
}

uint32_t OcctKernel::unifySameDomain(uint32_t id) {
    try {
        ShapeUpgrade_UnifySameDomain upgrader(get(id), true, true, false);
        upgrader.Build();
        return store(upgrader.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("unifySameDomain: ") + e.what());
    }
}

bool OcctKernel::isValid(uint32_t id) {
    try {
        BRepCheck_Analyzer checker(get(id));
        return checker.IsValid();
    } catch (const Standard_Failure&) {
        return false;
    }
}

uint32_t OcctKernel::healSolid(uint32_t id, double tolerance) {
    try {
        Handle(ShapeFix_Solid) fixer = new ShapeFix_Solid(TopoDS::Solid(get(id)));
        fixer->SetPrecision(tolerance);
        fixer->Perform();
        return store(fixer->Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("healSolid: ") + e.what());
    }
}

uint32_t OcctKernel::healFace(uint32_t id, double tolerance) {
    try {
        ShapeFix_Face fixer(TopoDS::Face(get(id)));
        fixer.SetPrecision(tolerance);
        fixer.Perform();
        return store(fixer.Face());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("healFace: ") + e.what());
    }
}

uint32_t OcctKernel::healWire(uint32_t id, double tolerance) {
    try {
        ShapeFix_Wire fixer;
        fixer.Load(TopoDS::Wire(get(id)));
        fixer.SetPrecision(tolerance);
        fixer.Perform();
        return store(fixer.Wire());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("healWire: ") + e.what());
    }
}

uint32_t OcctKernel::fixFaceOrientations(uint32_t id) {
    try {
        ShapeFix_Shape fixer(get(id));
        fixer.Perform();
        return store(fixer.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("fixFaceOrientations: ") + e.what());
    }
}

uint32_t OcctKernel::removeDegenerateEdges(uint32_t id) {
    try {
        ShapeFix_Shape fixer(get(id));
        fixer.Perform();
        return store(fixer.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("removeDegenerateEdges: ") + e.what());
    }
}
