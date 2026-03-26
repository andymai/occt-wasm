#include "occt_kernel.h"

#include <IFSelect_ReturnStatus.hxx>
#include <STEPControl_Reader.hxx>
#include <STEPControl_StepModelType.hxx>
#include <STEPControl_Writer.hxx>
#include <Standard_Failure.hxx>

#include <sstream>
#include <stdexcept>
#include <string>

uint32_t OcctKernel::importStep(const std::string& data) {
    try {
        STEPControl_Reader reader;

        // Write data to Emscripten's virtual filesystem
        std::istringstream iss(data);

        // STEPControl_Reader needs a file path — write to virtual FS
        // Use a temporary approach: write string to /tmp/import.step
        {
            FILE* f = fopen("/tmp/import.step", "w");
            if (!f) {
                throw std::runtime_error("importStep: cannot create temp file");
            }
            fwrite(data.c_str(), 1, data.size(), f);
            fclose(f);
        }

        IFSelect_ReturnStatus status = reader.ReadFile("/tmp/import.step");
        if (status != IFSelect_RetDone) {
            throw std::runtime_error("importStep: failed to read STEP data");
        }

        reader.TransferRoots();
        if (reader.NbShapes() == 0) {
            throw std::runtime_error("importStep: no shapes found in STEP data");
        }

        return store(reader.OneShape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("importStep: ") + e.what());
    }
}

std::string OcctKernel::exportStep(uint32_t id) {
    try {
        const auto& shape = get(id);

        STEPControl_Writer writer;
        IFSelect_ReturnStatus status = writer.Transfer(shape, STEPControl_AsIs);
        if (status != IFSelect_RetDone) {
            throw std::runtime_error("exportStep: transfer failed");
        }

        // Write to temp file then read back
        const char* tmpPath = "/tmp/export.step";
        status = writer.Write(tmpPath);
        if (status != IFSelect_RetDone) {
            throw std::runtime_error("exportStep: write failed");
        }

        // Read file content
        FILE* f = fopen(tmpPath, "r");
        if (!f) {
            throw std::runtime_error("exportStep: cannot read temp file");
        }
        fseek(f, 0, SEEK_END);
        long size = ftell(f);
        fseek(f, 0, SEEK_SET);
        std::string result(size, '\0');
        fread(&result[0], 1, size, f);
        fclose(f);

        return result;
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("exportStep: ") + e.what());
    }
}
