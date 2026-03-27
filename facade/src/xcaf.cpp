// XCAF support: assembly/color export via STEP.
// Uses STEPControl_Writer directly (no XCAF document) since
// the OCCT XCAF application framework crashes in WASM.

#include "occt_kernel.h"

#include <BRep_Builder.hxx>
#include <STEPControl_Writer.hxx>
#include <Standard_Failure.hxx>
#include <TopoDS_Compound.hxx>

#include <fstream>
#include <sstream>
#include <stdexcept>
#include <string>

// Split a NUL-separated string into individual strings
static std::vector<std::string> splitNul(const std::string& joined) {
    std::vector<std::string> result;
    size_t start = 0;
    while (start < joined.size()) {
        size_t end = joined.find('\0', start);
        if (end == std::string::npos) {
            result.push_back(joined.substr(start));
            break;
        }
        result.push_back(joined.substr(start, end - start));
        start = end + 1;
    }
    return result;
}

uint32_t OcctKernel::createXCAFDocument(std::vector<uint32_t> shapeIds,
                                        const std::string& joinedNames,
                                        std::vector<double> flatColors) {
    try {
        TopoDS_Compound compound;
        BRep_Builder builder;
        builder.MakeCompound(compound);
        for (uint32_t sid : shapeIds) {
            builder.Add(compound, get(sid));
        }
        uint32_t docId = store(compound);
        xcafDocs_[docId] = XCAFDocData{shapeIds, joinedNames, flatColors};
        return docId;
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("createXCAFDocument: ") + e.what());
    }
}

std::string OcctKernel::writeXCAFToSTEP(uint32_t docId) {
    try {
        auto it = xcafDocs_.find(docId);
        if (it == xcafDocs_.end()) {
            throw std::runtime_error("writeXCAFToSTEP: invalid document ID");
        }
        const auto& data = it->second;
        return exportStepWithXCAF(data.shapeIds, data.joinedNames, data.colors);
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("writeXCAFToSTEP: ") + e.what());
    }
}

std::string OcctKernel::exportStepWithXCAF(std::vector<uint32_t> shapeIds,
                                           const std::string& /* joinedNames */,
                                           std::vector<double> /* flatColors */) {
    try {
        // Note: colors and names are stored but not written to STEP because
        // XCAF document framework (__next_prime overflow) doesn't work in WASM.
        // We export shapes as a compound via STEPControl_Writer instead.
        // TODO: investigate OCCT XCAF initialization for proper color/name support.

        TopoDS_Compound compound;
        BRep_Builder builder;
        builder.MakeCompound(compound);
        for (uint32_t sid : shapeIds) {
            builder.Add(compound, get(sid));
        }

        // Use the existing exportStep which already works in WASM
        uint32_t compoundId = store(compound);
        std::string result = exportStep(compoundId);
        release(compoundId);
        return result;
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("exportStepWithXCAF: ") + e.what());
    }
}
