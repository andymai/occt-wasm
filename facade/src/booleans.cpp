#include "occt_kernel.h"

#include <BRepAlgoAPI_BuilderAlgo.hxx>
#include <BRepAlgoAPI_Common.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepAlgoAPI_Fuse.hxx>
#include <BRepAlgoAPI_Splitter.hxx>
#include <NCollection_List.hxx>
#include <ShapeUpgrade_UnifySameDomain.hxx>
#include <Standard_Failure.hxx>
#include <TopoDS_Shape.hxx>

#include <stdexcept>
#include <string>

uint32_t OcctKernel::intersect(uint32_t a, uint32_t b) {
    return common(a, b);
}

uint32_t OcctKernel::fuseAll(std::vector<uint32_t> shapeIds) {
    try {
        if (shapeIds.empty()) {
            throw std::runtime_error("fuseAll: no shapes provided");
        }
        if (shapeIds.size() == 1) {
            return store(get(shapeIds[0]));
        }
        NCollection_List<TopoDS_Shape> args;
        for (uint32_t sid : shapeIds) {
            args.Append(get(sid));
        }
        BRepAlgoAPI_BuilderAlgo builder;
        builder.SetArguments(args);
        builder.SetRunParallel(true);
        builder.SetUseOBB(true);
        builder.Build();
        if (!builder.IsDone() || builder.HasErrors()) {
            throw std::runtime_error("fuseAll: operation failed");
        }
        return store(builder.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("fuseAll: ") + e.what());
    }
}

uint32_t OcctKernel::cutAll(uint32_t shapeId, std::vector<uint32_t> toolIds) {
    try {
        if (toolIds.empty()) {
            return store(get(shapeId));
        }
        NCollection_List<TopoDS_Shape> args;
        args.Append(get(shapeId));
        NCollection_List<TopoDS_Shape> tools;
        for (uint32_t tid : toolIds) {
            tools.Append(get(tid));
        }
        BRepAlgoAPI_Cut cutter;
        cutter.SetArguments(args);
        cutter.SetTools(tools);
        cutter.SetRunParallel(true);
        cutter.SetUseOBB(true);
        cutter.Build();
        if (!cutter.IsDone() || cutter.HasErrors()) {
            throw std::runtime_error("cutAll: operation failed");
        }
        return store(cutter.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("cutAll: ") + e.what());
    }
}

uint32_t OcctKernel::booleanPipeline(uint32_t baseId, std::vector<int> opCodes,
                                     std::vector<uint32_t> toolIds) {
    try {
        if (opCodes.size() != toolIds.size()) {
            throw std::runtime_error("booleanPipeline: opCodes and toolIds must have same length");
        }
        TopoDS_Shape current = get(baseId);
        for (size_t i = 0; i < opCodes.size(); i++) {
            const auto& tool = get(toolIds[i]);
            bool isLast = (i == opCodes.size() - 1);
            Message_ProgressRange progress;

            switch (opCodes[i]) {
            case 0: { // fuse
                BRepAlgoAPI_Fuse op(current, tool, progress);
                if (!op.IsDone() || op.HasErrors())
                    throw std::runtime_error("booleanPipeline: fuse step failed");
                current = op.Shape();
                break;
            }
            case 1: { // cut
                BRepAlgoAPI_Cut op(current, tool, progress);
                if (!op.IsDone() || op.HasErrors())
                    throw std::runtime_error("booleanPipeline: cut step failed");
                current = op.Shape();
                break;
            }
            case 2: { // intersect
                BRepAlgoAPI_Common op(current, tool, progress);
                if (!op.IsDone() || op.HasErrors())
                    throw std::runtime_error("booleanPipeline: intersect step failed");
                current = op.Shape();
                break;
            }
            default:
                throw std::runtime_error("booleanPipeline: unknown opCode");
            }

            // Only simplify the final result
            if (isLast) {
                ShapeUpgrade_UnifySameDomain upgrader(current, Standard_True, Standard_True,
                                                      Standard_False);
                upgrader.Build();
                current = upgrader.Shape();
            }
        }
        return store(current);
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("booleanPipeline: ") + e.what());
    }
}

uint32_t OcctKernel::split(uint32_t shapeId, std::vector<uint32_t> toolIds) {
    try {
        NCollection_List<TopoDS_Shape> args;
        args.Append(get(shapeId));
        NCollection_List<TopoDS_Shape> tools;
        for (uint32_t tid : toolIds) {
            tools.Append(get(tid));
        }
        BRepAlgoAPI_Splitter splitter;
        splitter.SetArguments(args);
        splitter.SetTools(tools);
        splitter.Build();
        if (!splitter.IsDone() || splitter.HasErrors()) {
            throw std::runtime_error("split: operation failed");
        }
        return store(splitter.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("split: ") + e.what());
    }
}
