#pragma once

#include <TopoDS_Shape.hxx>
#include <gp_Ax3.hxx>

namespace occtwasm {

/// A thread's groove, in the meridian plane: a trapezoid from the cylinder it
/// is cut into (the cover) to its root.
struct ThreadGrooveSpec {
    double pitch;
    /// Along the axis, from the frame's origin.
    double length;
    double coverRadius;
    double rootRadius;
    /// Half the groove's width at the cover and at the root.
    double coverHalfWidth;
    double rootHalfWidth;
    /// Where along the axis the profile's centre sits at angle 0.
    double phase;
};

/// The solid a right-handed thread removes from a cylinder of `coverRadius`
/// about `frame`'s Z axis, between z = 0 and z = length. Its faces come in
/// order: the cover, the lower flank, the root, the upper flank, each in
/// patches of less than a turn, then the end faces at z = 0 and z = length.
TopoDS_Shape buildThreadGroove(const gp_Ax3& frame, const ThreadGrooveSpec& spec);

} // namespace occtwasm
