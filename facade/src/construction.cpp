#include "occt_kernel.h"

#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeSolid.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_Sewing.hxx>
#include <Standard_Failure.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Builder.hxx>
#include <TopoDS_Compound.hxx>

#include <stdexcept>
#include <string>

uint32_t OcctKernel::makeVertex(double x, double y, double z) {
    try {
        BRepBuilderAPI_MakeVertex maker(gp_Pnt(x, y, z));
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeVertex: ") + e.what());
    }
}

uint32_t OcctKernel::makeEdge(uint32_t v1, uint32_t v2) {
    try {
        BRepBuilderAPI_MakeEdge maker(TopoDS::Vertex(get(v1)), TopoDS::Vertex(get(v2)));
        if (!maker.IsDone()) {
            throw std::runtime_error("makeEdge: construction failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeEdge: ") + e.what());
    }
}

uint32_t OcctKernel::makeWire(std::vector<uint32_t> edgeIds) {
    try {
        BRepBuilderAPI_MakeWire maker;
        for (uint32_t eid : edgeIds) {
            maker.Add(TopoDS::Edge(get(eid)));
        }
        if (!maker.IsDone()) {
            throw std::runtime_error("makeWire: construction failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeWire: ") + e.what());
    }
}

uint32_t OcctKernel::makeFace(uint32_t wireId) {
    try {
        BRepBuilderAPI_MakeFace maker(TopoDS::Wire(get(wireId)));
        if (!maker.IsDone()) {
            throw std::runtime_error("makeFace: construction failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeFace: ") + e.what());
    }
}

uint32_t OcctKernel::makeSolid(uint32_t shellId) {
    try {
        BRepBuilderAPI_MakeSolid maker(TopoDS::Shell(get(shellId)));
        if (!maker.IsDone()) {
            throw std::runtime_error("makeSolid: construction failed");
        }
        return store(maker.Shape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeSolid: ") + e.what());
    }
}

uint32_t OcctKernel::sew(std::vector<uint32_t> shapeIds, double tolerance) {
    try {
        BRepBuilderAPI_Sewing sewer(tolerance);
        for (uint32_t sid : shapeIds) {
            sewer.Add(get(sid));
        }
        sewer.Perform();
        return store(sewer.SewedShape());
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("sew: ") + e.what());
    }
}

uint32_t OcctKernel::makeCompound(std::vector<uint32_t> shapeIds) {
    try {
        TopoDS_Compound compound;
        TopoDS_Builder builder;
        builder.MakeCompound(compound);
        for (uint32_t sid : shapeIds) {
            builder.Add(compound, get(sid));
        }
        return store(compound);
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("makeCompound: ") + e.what());
    }
}
