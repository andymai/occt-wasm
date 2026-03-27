// XCAF support: real OCCT XDE for assemblies, colors, STEP/glTF I/O.

#include "occt_kernel.h"

#include <TDocStd_Application.hxx>
#include <TDocStd_Document.hxx>
#include <XCAFApp_Application.hxx>
#include <XCAFDoc_ColorTool.hxx>
#include <XCAFDoc_DocumentTool.hxx>
#include <XCAFDoc_ShapeTool.hxx>

#include <NCollection_Sequence.hxx>
#include <TDF_Label.hxx>
#include <TDataStd_Name.hxx>

#include <Quantity_Color.hxx>
#include <TopLoc_Location.hxx>
#include <gp_Ax1.hxx>
#include <gp_Dir.hxx>
#include <gp_Pnt.hxx>
#include <gp_Trsf.hxx>
#include <gp_Vec.hxx>

#include <BRepMesh_IncrementalMesh.hxx>
#include <Message_ProgressRange.hxx>
#include <STEPCAFControl_Reader.hxx>
#include <STEPCAFControl_Writer.hxx>
#include <STEPControl_StepModelType.hxx>
#include <Standard_Failure.hxx>
#include <TCollection_AsciiString.hxx>
#include <TCollection_ExtendedString.hxx>

#include <NCollection_IndexedDataMap.hxx>
#include <RWGltf_CafWriter.hxx>

#include <cmath>
#include <fstream>
#include <sstream>
#include <stdexcept>

// --- Helpers ---

static Handle(TDocStd_Application) getXCAFApp() {
    static Handle(TDocStd_Application) app;
    if (app.IsNull()) {
        app = XCAFApp_Application::GetApplication();
    }
    return app;
}

static TDF_Label lookupLabel(const std::map<int, TDF_Label>& registry, int labelId) {
    auto it = registry.find(labelId);
    if (it == registry.end()) {
        throw std::runtime_error("invalid label ID: " + std::to_string(labelId));
    }
    return it->second;
}

// --- Document lifecycle ---

uint32_t OcctKernel::xcafNewDocument() {
    try {
        Handle(TDocStd_Application) app = getXCAFApp();
        Handle(TDocStd_Document) doc;
        app->NewDocument("BinXCAF", doc);

        uint32_t id = nextXcafId_++;
        xcafDocs_[id] = XCAFDocRecord{doc, {}, 1};
        return id;
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("xcafNewDocument: ") + e.what());
    }
}

void OcctKernel::xcafClose(uint32_t docId) {
    auto it = xcafDocs_.find(docId);
    if (it == xcafDocs_.end()) {
        throw std::runtime_error("xcafClose: invalid document ID");
    }
    try {
        Handle(TDocStd_Application) app = getXCAFApp();
        app->Close(it->second.doc);
    } catch (...) {
        // Close can fail if doc is already closed — ignore
    }
    xcafDocs_.erase(it);
}

// --- Shape management ---

int OcctKernel::xcafAddShape(uint32_t docId, uint32_t shapeId) {
    try {
        auto it = xcafDocs_.find(docId);
        if (it == xcafDocs_.end())
            throw std::runtime_error("xcafAddShape: invalid document ID");

        Handle(XCAFDoc_ShapeTool) shapeTool =
            XCAFDoc_DocumentTool::ShapeTool(it->second.doc->Main());
        TDF_Label label = shapeTool->AddShape(get(shapeId));

        int facadeId = it->second.nextLabelId++;
        it->second.labelRegistry[facadeId] = label;
        return facadeId;
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("xcafAddShape: ") + e.what());
    }
}

int OcctKernel::xcafAddComponent(uint32_t docId, int parentLabelId, uint32_t shapeId, double tx,
                                 double ty, double tz, double rx, double ry, double rz) {
    try {
        auto it = xcafDocs_.find(docId);
        if (it == xcafDocs_.end())
            throw std::runtime_error("xcafAddComponent: invalid document ID");

        Handle(XCAFDoc_ShapeTool) shapeTool =
            XCAFDoc_DocumentTool::ShapeTool(it->second.doc->Main());

        TDF_Label parentLabel = lookupLabel(it->second.labelRegistry, parentLabelId);

        // Build location transform (Euler angles in radians)
        gp_Trsf trsf;
        if (std::abs(rx) > 1e-12 || std::abs(ry) > 1e-12 || std::abs(rz) > 1e-12) {
            gp_Trsf rotX, rotY, rotZ;
            rotX.SetRotation(gp_Ax1(gp_Pnt(0, 0, 0), gp_Dir(1, 0, 0)), rx);
            rotY.SetRotation(gp_Ax1(gp_Pnt(0, 0, 0), gp_Dir(0, 1, 0)), ry);
            rotZ.SetRotation(gp_Ax1(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)), rz);
            trsf = rotZ * rotY * rotX;
        }
        trsf.SetTranslationPart(gp_Vec(tx, ty, tz));
        TopLoc_Location loc(trsf);

        // First add the shape as a standalone label, then add as component with location
        TDF_Label shapeLabel = shapeTool->AddShape(get(shapeId));
        TDF_Label compLabel = shapeTool->AddComponent(parentLabel, shapeLabel, loc);

        int facadeId = it->second.nextLabelId++;
        it->second.labelRegistry[facadeId] = compLabel;
        return facadeId;
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("xcafAddComponent: ") + e.what());
    }
}

// --- Metadata ---

void OcctKernel::xcafSetColor(uint32_t docId, int labelId, double r, double g, double b) {
    try {
        auto it = xcafDocs_.find(docId);
        if (it == xcafDocs_.end())
            throw std::runtime_error("xcafSetColor: invalid document ID");

        Handle(XCAFDoc_ColorTool) colorTool =
            XCAFDoc_DocumentTool::ColorTool(it->second.doc->Main());
        TDF_Label label = lookupLabel(it->second.labelRegistry, labelId);

        Quantity_Color color(r, g, b, Quantity_TOC_RGB);
        colorTool->SetColor(label, color, XCAFDoc_ColorGen);
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("xcafSetColor: ") + e.what());
    }
}

void OcctKernel::xcafSetName(uint32_t docId, int labelId, const std::string& name) {
    try {
        auto it = xcafDocs_.find(docId);
        if (it == xcafDocs_.end())
            throw std::runtime_error("xcafSetName: invalid document ID");

        TDF_Label label = lookupLabel(it->second.labelRegistry, labelId);
        TDataStd_Name::Set(label, TCollection_ExtendedString(name.c_str()));
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("xcafSetName: ") + e.what());
    }
}

// --- Query ---

XCAFLabelInfo OcctKernel::xcafGetLabelInfo(uint32_t docId, int labelId) {
    try {
        auto it = xcafDocs_.find(docId);
        if (it == xcafDocs_.end())
            throw std::runtime_error("xcafGetLabelInfo: invalid document ID");

        TDF_Label label = lookupLabel(it->second.labelRegistry, labelId);

        XCAFLabelInfo info;
        info.labelId = labelId;

        Handle(XCAFDoc_ShapeTool) shapeTool =
            XCAFDoc_DocumentTool::ShapeTool(it->second.doc->Main());
        Handle(XCAFDoc_ColorTool) colorTool =
            XCAFDoc_DocumentTool::ColorTool(it->second.doc->Main());

        // Name
        Handle(TDataStd_Name) nameAttr;
        if (label.FindAttribute(TDataStd_Name::GetID(), nameAttr)) {
            TCollection_ExtendedString ext = nameAttr->Get();
            info.name = TCollection_AsciiString(ext).ToCString();
        }

        // Color
        Quantity_Color color;
        if (colorTool->GetColor(label, XCAFDoc_ColorGen, color)) {
            info.hasColor = true;
            info.r = color.Red();
            info.g = color.Green();
            info.b = color.Blue();
        }

        // Assembly/component flags
        info.isAssembly = shapeTool->IsAssembly(label);
        info.isComponent = shapeTool->IsComponent(label);

        // Shape
        TopoDS_Shape shape;
        if (shapeTool->GetShape(label, shape) && !shape.IsNull()) {
            info.shapeId = store(shape);
        }

        return info;
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("xcafGetLabelInfo: ") + e.what());
    }
}

std::vector<int> OcctKernel::xcafGetChildLabels(uint32_t docId, int parentLabelId) {
    try {
        auto it = xcafDocs_.find(docId);
        if (it == xcafDocs_.end())
            throw std::runtime_error("xcafGetChildLabels: invalid document ID");

        Handle(XCAFDoc_ShapeTool) shapeTool =
            XCAFDoc_DocumentTool::ShapeTool(it->second.doc->Main());
        TDF_Label parentLabel = lookupLabel(it->second.labelRegistry, parentLabelId);

        NCollection_Sequence<TDF_Label> children;
        shapeTool->GetComponents(parentLabel, children);

        std::vector<int> ids;
        for (int i = 1; i <= children.Length(); ++i) {
            int facadeId = it->second.nextLabelId++;
            it->second.labelRegistry[facadeId] = children.Value(i);
            ids.push_back(facadeId);
        }
        return ids;
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("xcafGetChildLabels: ") + e.what());
    }
}

std::vector<int> OcctKernel::xcafGetRootLabels(uint32_t docId) {
    try {
        auto it = xcafDocs_.find(docId);
        if (it == xcafDocs_.end())
            throw std::runtime_error("xcafGetRootLabels: invalid document ID");

        Handle(XCAFDoc_ShapeTool) shapeTool =
            XCAFDoc_DocumentTool::ShapeTool(it->second.doc->Main());

        NCollection_Sequence<TDF_Label> roots;
        shapeTool->GetFreeShapes(roots);

        std::vector<int> ids;
        for (int i = 1; i <= roots.Length(); ++i) {
            int facadeId = it->second.nextLabelId++;
            it->second.labelRegistry[facadeId] = roots.Value(i);
            ids.push_back(facadeId);
        }
        return ids;
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("xcafGetRootLabels: ") + e.what());
    }
}

// --- STEP I/O ---

std::string OcctKernel::xcafExportSTEP(uint32_t docId) {
    try {
        auto it = xcafDocs_.find(docId);
        if (it == xcafDocs_.end())
            throw std::runtime_error("xcafExportSTEP: invalid document ID");

        STEPCAFControl_Writer writer;
        writer.SetColorMode(Standard_True);
        writer.SetNameMode(Standard_True);

        if (!writer.Transfer(it->second.doc, STEPControl_AsIs)) {
            throw std::runtime_error("xcafExportSTEP: transfer failed");
        }

        std::string tmpPath = "/tmp/xcaf_export.step";
        if (writer.Write(tmpPath.c_str()) != IFSelect_RetDone) {
            throw std::runtime_error("xcafExportSTEP: write failed");
        }

        std::ifstream ifs(tmpPath);
        std::string content((std::istreambuf_iterator<char>(ifs)),
                            std::istreambuf_iterator<char>());
        std::remove(tmpPath.c_str());
        return content;
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("xcafExportSTEP: ") + e.what());
    }
}

uint32_t OcctKernel::xcafImportSTEP(const std::string& stepData) {
    try {
        std::string tmpPath = "/tmp/xcaf_import.step";
        {
            std::ofstream ofs(tmpPath);
            ofs << stepData;
        }

        Handle(TDocStd_Application) app = getXCAFApp();
        Handle(TDocStd_Document) doc;
        app->NewDocument("BinXCAF", doc);

        STEPCAFControl_Reader reader;
        reader.SetColorMode(Standard_True);
        reader.SetNameMode(Standard_True);
        reader.SetLayerMode(Standard_True);

        if (reader.ReadFile(tmpPath.c_str()) != IFSelect_RetDone) {
            std::remove(tmpPath.c_str());
            throw std::runtime_error("xcafImportSTEP: read failed");
        }
        std::remove(tmpPath.c_str());

        if (!reader.Transfer(doc)) {
            throw std::runtime_error("xcafImportSTEP: transfer failed");
        }

        uint32_t id = nextXcafId_++;
        xcafDocs_[id] = XCAFDocRecord{doc, {}, 1};
        return id;
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("xcafImportSTEP: ") + e.what());
    }
}

// --- glTF export ---

std::string OcctKernel::xcafExportGLTF(uint32_t docId, double linDeflection, double angDeflection) {
    try {
        auto it = xcafDocs_.find(docId);
        if (it == xcafDocs_.end())
            throw std::runtime_error("xcafExportGLTF: invalid document ID");

        // Tessellate all shapes in the document
        Handle(XCAFDoc_ShapeTool) shapeTool =
            XCAFDoc_DocumentTool::ShapeTool(it->second.doc->Main());
        NCollection_Sequence<TDF_Label> labels;
        shapeTool->GetFreeShapes(labels);
        for (int i = 1; i <= labels.Length(); ++i) {
            TopoDS_Shape shape;
            if (shapeTool->GetShape(labels.Value(i), shape)) {
                BRepMesh_IncrementalMesh mesh(shape, linDeflection, Standard_False, angDeflection,
                                              Standard_True);
            }
        }

        // Write glTF binary (.glb) via Handle-allocated writer
        std::string tmpPath = "/tmp/xcaf_export.glb";
        NCollection_IndexedDataMap<TCollection_AsciiString, TCollection_AsciiString> fileInfo;

        Handle(RWGltf_CafWriter) writer =
            new RWGltf_CafWriter(TCollection_AsciiString(tmpPath.c_str()), Standard_True);
        writer->SetTransformationFormat(RWGltf_WriterTrsfFormat_Compact);
        if (!writer->Perform(it->second.doc, fileInfo, Message_ProgressRange())) {
            throw std::runtime_error("xcafExportGLTF: write failed");
        }

        // Return file path — JS reads binary via Module.FS.readFile()
        return tmpPath;
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("xcafExportGLTF: ") + e.what());
    }
}
