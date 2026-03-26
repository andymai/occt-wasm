#include "occt_kernel.h"

#include <BRepAlgoAPI_Cut.hxx>
#include <BRepAlgoAPI_Fuse.hxx>
#include <BRepBuilderAPI_MakeShape.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepFilletAPI_MakeFillet.hxx>
#include <Standard_Failure.hxx>
#include <TopAbs_ShapeEnum.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_ShapeMapHasher.hxx>
#include <TopoDS.hxx>

#include <stdexcept>
#include <string>

/// Build evolution data by tracking Modified/Generated/Deleted faces.
static EvolutionData buildEvolution(BRepBuilderAPI_MakeShape& maker, uint32_t resultId,
                                    const TopoDS_Shape& inputShape,
                                    const std::vector<int>& inputFaceHashes, int hashUpperBound) {
    EvolutionData evo;
    evo.resultId = resultId;

    auto hashShape = [&](const TopoDS_Shape& s) -> int {
        return static_cast<int>(TopTools_ShapeMapHasher{}(s) % static_cast<size_t>(hashUpperBound));
    };

    // For each input face, check if it was modified, generated, or deleted
    for (TopExp_Explorer ex(inputShape, TopAbs_FACE); ex.More(); ex.Next()) {
        const auto& face = ex.Current();
        int faceHash = hashShape(face);

        // Check if this face hash is in the input list
        bool tracked = false;
        for (int h : inputFaceHashes) {
            if (h == faceHash) {
                tracked = true;
                break;
            }
        }
        if (!tracked)
            continue;

        // Modified faces
        auto modifiedList = maker.Modified(face);
        if (!modifiedList.IsEmpty()) {
            evo.modified.push_back(faceHash);
            evo.modified.push_back(static_cast<int>(modifiedList.Size()));
            for (auto it = modifiedList.begin(); it != modifiedList.end(); ++it) {
                evo.modified.push_back(hashShape(*it));
            }
        }

        // Generated faces
        auto generatedList = maker.Generated(face);
        if (!generatedList.IsEmpty()) {
            evo.generated.push_back(faceHash);
            evo.generated.push_back(static_cast<int>(generatedList.Size()));
            for (auto it = generatedList.begin(); it != generatedList.end(); ++it) {
                evo.generated.push_back(hashShape(*it));
            }
        }

        // Deleted faces
        if (maker.IsDeleted(face)) {
            evo.deleted.push_back(faceHash);
        }
    }

    return evo;
}

EvolutionData OcctKernel::translateWithHistory(uint32_t id, double dx, double dy, double dz,
                                               std::vector<int> inputFaceHashes,
                                               int hashUpperBound) {
    try {
        const auto& shape = get(id);
        gp_Trsf trsf;
        trsf.SetTranslation(gp_Vec(dx, dy, dz));
        BRepBuilderAPI_Transform maker(shape, trsf, true);
        uint32_t resultId = store(maker.Shape());
        return buildEvolution(maker, resultId, shape, inputFaceHashes, hashUpperBound);
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("translateWithHistory: ") + e.what());
    }
}

EvolutionData OcctKernel::fuseWithHistory(uint32_t a, uint32_t b, std::vector<int> inputFaceHashes,
                                          int hashUpperBound) {
    try {
        const auto& shapeA = get(a);
        const auto& shapeB = get(b);
        BRepAlgoAPI_Fuse op(shapeA, shapeB);
        op.Build();
        if (!op.IsDone() || op.HasErrors()) {
            throw std::runtime_error("fuseWithHistory: operation failed");
        }
        uint32_t resultId = store(op.Shape());

        // Build evolution from both input shapes
        EvolutionData evo = buildEvolution(op, resultId, shapeA, inputFaceHashes, hashUpperBound);
        // Also check shapeB
        EvolutionData evoB = buildEvolution(op, resultId, shapeB, inputFaceHashes, hashUpperBound);
        // Merge B into A
        evo.modified.insert(evo.modified.end(), evoB.modified.begin(), evoB.modified.end());
        evo.generated.insert(evo.generated.end(), evoB.generated.begin(), evoB.generated.end());
        evo.deleted.insert(evo.deleted.end(), evoB.deleted.begin(), evoB.deleted.end());
        return evo;
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("fuseWithHistory: ") + e.what());
    }
}

EvolutionData OcctKernel::cutWithHistory(uint32_t a, uint32_t b, std::vector<int> inputFaceHashes,
                                         int hashUpperBound) {
    try {
        const auto& shapeA = get(a);
        const auto& shapeB = get(b);
        BRepAlgoAPI_Cut op(shapeA, shapeB);
        op.Build();
        if (!op.IsDone() || op.HasErrors()) {
            throw std::runtime_error("cutWithHistory: operation failed");
        }
        uint32_t resultId = store(op.Shape());

        EvolutionData evo = buildEvolution(op, resultId, shapeA, inputFaceHashes, hashUpperBound);
        EvolutionData evoB = buildEvolution(op, resultId, shapeB, inputFaceHashes, hashUpperBound);
        evo.modified.insert(evo.modified.end(), evoB.modified.begin(), evoB.modified.end());
        evo.generated.insert(evo.generated.end(), evoB.generated.begin(), evoB.generated.end());
        evo.deleted.insert(evo.deleted.end(), evoB.deleted.begin(), evoB.deleted.end());
        return evo;
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("cutWithHistory: ") + e.what());
    }
}

EvolutionData OcctKernel::filletWithHistory(uint32_t solidId, std::vector<uint32_t> edgeIds,
                                            double radius, std::vector<int> inputFaceHashes,
                                            int hashUpperBound) {
    try {
        const auto& solid = get(solidId);
        BRepFilletAPI_MakeFillet maker(solid);
        for (uint32_t eid : edgeIds) {
            maker.Add(radius, TopoDS::Edge(get(eid)));
        }
        maker.Build();
        if (!maker.IsDone()) {
            throw std::runtime_error("filletWithHistory: operation failed");
        }
        uint32_t resultId = store(maker.Shape());
        return buildEvolution(maker, resultId, solid, inputFaceHashes, hashUpperBound);
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("filletWithHistory: ") + e.what());
    }
}
