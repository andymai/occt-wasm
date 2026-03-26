#include "occt_kernel.h"

#include <BRepCheck_Analyzer.hxx>
#include <ShapeFix_Shape.hxx>
#include <ShapeUpgrade_UnifySameDomain.hxx>
#include <Standard_Failure.hxx>

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
