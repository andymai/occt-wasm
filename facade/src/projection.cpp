#include "occt_kernel.h"

#include <BRepLib.hxx>
#include <HLRAlgo_Projector.hxx>
#include <HLRBRep_Algo.hxx>
#include <HLRBRep_HLRToShape.hxx>
#include <Standard_Failure.hxx>
#include <gp_Ax2.hxx>
#include <gp_Dir.hxx>
#include <gp_Pnt.hxx>

#include <stdexcept>
#include <string>

ProjectionData OcctKernel::projectEdges(uint32_t shapeId, double ox, double oy, double oz,
                                        double dx, double dy, double dz, double xx, double xy,
                                        double xz, bool hasXAxis) {
    try {
        const auto& shape = get(shapeId);

        Handle(HLRBRep_Algo) hlr = new HLRBRep_Algo();
        hlr->Add(shape, 0);

        gp_Pnt origin(ox, oy, oz);
        gp_Dir dir(dx, dy, dz);

        gp_Ax2 ax2 = hasXAxis ? gp_Ax2(origin, dir, gp_Dir(xx, xy, xz)) : gp_Ax2(origin, dir);

        HLRAlgo_Projector projector(ax2);
        hlr->Projector(projector);
        hlr->Update();
        hlr->Hide();

        HLRBRep_HLRToShape hlrShapes(hlr);

        ProjectionData result{};

        auto storeIfNotNull = [this](const TopoDS_Shape& s) -> uint32_t {
            if (s.IsNull())
                return 0;
            BRepLib::BuildCurves3d(s);
            return store(s);
        };

        result.visibleOutline = storeIfNotNull(hlrShapes.OutLineVCompound());
        result.visibleSmooth = storeIfNotNull(hlrShapes.Rg1LineVCompound());
        result.visibleSharp = storeIfNotNull(hlrShapes.VCompound());
        result.hiddenOutline = storeIfNotNull(hlrShapes.OutLineHCompound());
        result.hiddenSmooth = storeIfNotNull(hlrShapes.Rg1LineHCompound());
        result.hiddenSharp = storeIfNotNull(hlrShapes.HCompound());

        return result;
    } catch (const Standard_Failure& e) {
        throw std::runtime_error(std::string("projectEdges: ") + e.what());
    }
}
