#include "occt_kernel.h"

#include <BRepAlgoAPI_Common.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepAlgoAPI_Fuse.hxx>
#include <Standard_Failure.hxx>

#include <stdexcept>
#include <string>

uint32_t OcctKernel::fuse(uint32_t a, uint32_t b) {
    try {
        const auto& shapeA = get(a);
        const auto& shapeB = get(b);
        BRepAlgoAPI_Fuse op(shapeA, shapeB);
        op.Build();
        if (!op.IsDone() || op.HasErrors()) {
            throw std::runtime_error("fuse: boolean operation failed");
        }
        return store(op.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("fuse: ") + e.what());
    }
}

uint32_t OcctKernel::cut(uint32_t a, uint32_t b) {
    try {
        const auto& shapeA = get(a);
        const auto& shapeB = get(b);
        BRepAlgoAPI_Cut op(shapeA, shapeB);
        op.Build();
        if (!op.IsDone() || op.HasErrors()) {
            throw std::runtime_error("cut: boolean operation failed");
        }
        return store(op.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("cut: ") + e.what());
    }
}

uint32_t OcctKernel::common(uint32_t a, uint32_t b) {
    try {
        const auto& shapeA = get(a);
        const auto& shapeB = get(b);
        BRepAlgoAPI_Common op(shapeA, shapeB);
        op.Build();
        if (!op.IsDone() || op.HasErrors()) {
            throw std::runtime_error("common: boolean operation failed");
        }
        return store(op.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("common: ") + e.what());
    }
}
