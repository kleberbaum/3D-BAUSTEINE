// SPDX-License-Identifier: GPL-2.0-only
/*
 * bausteine-core view: the three associated normal views and the oblique view.
 */

//! The three associated normal views of the GZ lesson and the oblique view.
//!
//! The front view (Aufriss), the top view (Grundriss) and the side view
//! (Kreuzriss) are parallel projections along the axes, set up as `View()`
//! in `Form_Load` of `3D_bau.frm`: the top view shows y to the right and x
//! down, the front view y to the right and z up, the side view x to the left
//! and z up. The three share one centre and one scale, so a point lies on
//! one horizontal line in the front and the side view and on one vertical
//! line in the front and the top view, the reference lines of the lesson.
//! The oblique view (Schrägriss) is a perspective camera that orbits the
//! scene.

use crate::math::{
    Mat4,
    Vec3, //
};

/// One of the four views.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum View {
    /// The top view, Grundriss, seen from above.
    Top,
    /// The front view, Aufriss, seen from the front.
    Front,
    /// The side view, Kreuzriss, seen from the side.
    Side,
    /// The oblique view, Schrägriss, in perspective.
    Oblique,
}

impl View {
    /// The four views, in the order the renderer draws them.
    pub const ALL: [Self; 4] = [Self::Front, Self::Side, Self::Top, Self::Oblique];

    /// Returns the German name of the view.
    #[must_use]
    pub const fn label(self) -> &'static str {
        match self {
            Self::Top => "Grundriss",
            Self::Front => "Aufriss",
            Self::Side => "Kreuzriss",
            Self::Oblique => "Schrägriss",
        }
    }

    /// Returns the view of the number `index` in [`View::ALL`].
    #[must_use]
    pub fn from_index(index: u32) -> Option<Self> {
        Self::ALL.get(index as usize).copied()
    }

    /// Returns the directions in the scene that point right, up and towards
    /// the viewer on the screen of a parallel view, or `None` for the oblique one.
    #[must_use]
    pub const fn axes(self) -> Option<(Vec3, Vec3, Vec3)> {
        match self {
            Self::Top => Some((Vec3::Y, Vec3::new(-1.0, 0.0, 0.0), Vec3::Z)),
            Self::Front => Some((Vec3::Y, Vec3::Z, Vec3::X)),
            Self::Side => Some((Vec3::new(-1.0, 0.0, 0.0), Vec3::Z, Vec3::Y)),
            Self::Oblique => None,
        }
    }
}

/// The shared state of the three parallel views.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Ortho {
    /// The point of the scene in the middle of every parallel view.
    pub center: Vec3,
    /// How many CSS pixels one unit of the scene spans.
    pub pixels_per_unit: f32,
}

impl Default for Ortho {
    fn default() -> Self {
        Self {
            center: Vec3::new(5.0, 5.0, 4.0),
            pixels_per_unit: 24.0,
        }
    }
}

/// The camera of the oblique view, which orbits a target.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Orbit {
    /// The point the camera looks at.
    pub target: Vec3,
    /// The angle about the z axis in degrees.
    pub yaw: f32,
    /// The angle above the plane z = 0 in degrees.
    pub pitch: f32,
    /// The distance from the target.
    pub distance: f32,
}

impl Default for Orbit {
    /// The camera of the POV export of version 1.3, `location <15,8,-15>`,
    /// which looks at the origin from x = 15, y = 15 and z = 8.
    fn default() -> Self {
        Self {
            target: Vec3::new(2.5, 2.5, 1.5),
            yaw: 45.0,
            pitch: 24.0,
            distance: 22.0,
        }
    }
}

impl Orbit {
    /// Returns the position of the camera.
    #[must_use]
    pub fn eye(&self) -> Vec3 {
        let (sy, cy) = self.yaw.to_radians().sin_cos();
        let (sp, cp) = self.pitch.to_radians().sin_cos();
        self.target + Vec3::new(cy * cp, sy * cp, sp) * self.distance
    }
}

/// The vertical field of the oblique view in degrees.
pub const FIELD_OF_VIEW: f32 = 40.0;

/// A camera of one view, ready for the GPU and for picking.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Camera {
    /// The view the camera belongs to.
    pub view: View,
    /// The product of projection and view.
    pub view_proj: Mat4,
    /// The position of a perspective camera.
    pub eye: Vec3,
    /// The direction towards the viewer of a parallel camera.
    pub toward: Vec3,
    /// The direction right on the screen.
    pub right: Vec3,
    /// The direction up on the screen.
    pub up: Vec3,
    /// Whether the camera projects in parallel.
    pub parallel: bool,
    /// How many CSS pixels one unit spans, at the target of a perspective camera.
    pub pixels_per_unit: f32,
    /// The width of the viewport in CSS pixels.
    pub width: f32,
    /// The height of the viewport in CSS pixels.
    pub height: f32,
}

/// How far a parallel camera sees before and behind the centre.
const DEPTH: f32 = 500.0;

impl Camera {
    /// Returns the camera of the parallel view `view` over `ortho` in a
    /// viewport of `width` by `height` CSS pixels.
    #[must_use]
    pub fn parallel(view: View, ortho: &Ortho, width: f32, height: f32) -> Option<Self> {
        let (right, up, toward) = view.axes()?;
        let ppu = ortho.pixels_per_unit.max(0.01);
        let eye = ortho.center + toward * DEPTH;
        let view_matrix = Mat4::view(eye, right, up, toward);
        let projection = Mat4::orthographic(width / ppu, height / ppu, 0.0, 2.0 * DEPTH);
        Some(Self {
            view,
            view_proj: projection.mul(&view_matrix),
            eye,
            toward,
            right,
            up,
            parallel: true,
            pixels_per_unit: ppu,
            width,
            height,
        })
    }

    /// Returns the camera of the oblique view over `orbit` in a viewport of
    /// `width` by `height` CSS pixels.
    #[must_use]
    pub fn oblique(orbit: &Orbit, width: f32, height: f32) -> Self {
        let eye = orbit.eye();
        let back = (eye - orbit.target).normalize();
        let right = Vec3::Z.cross(back).normalize();
        let up = back.cross(right);
        let view_matrix = Mat4::view(eye, right, up, back);
        let fov = FIELD_OF_VIEW.to_radians();
        let aspect = width / height.max(1.0);
        let projection = Mat4::perspective(fov, aspect, 0.1, 1000.0);
        let ppu = height / (2.0 * (fov * 0.5).tan() * orbit.distance.max(0.1));
        Self {
            view: View::Oblique,
            view_proj: projection.mul(&view_matrix),
            eye,
            toward: back,
            right,
            up,
            parallel: false,
            pixels_per_unit: ppu,
            width,
            height,
        }
    }

    /// Returns the camera of the oblique view of version 1.3 in a viewport of
    /// `width` by `height` CSS pixels, at the 3D zoom `zoom`, 1 for the
    /// `d3zoomf` of 10 that the program starts with.
    ///
    /// `D3_Refresh` of `Module1.bas` projects in parallel, a cavalier view:
    /// a unit of y runs 40 points to the right, a unit of z 40 points up, and
    /// a unit of x, which points towards the viewer, 20 points to the left
    /// and 5 down, so the x axis recedes to the lower left at 14 degrees,
    /// shortened to about half. The origin sits in the middle of the width
    /// and at 70 percent of the height, and 40 points are the share of a
    /// view of 328 points of the design scale.
    #[must_use]
    pub fn cavalier(zoom: f32, width: f32, height: f32) -> Self {
        let ppu = height * 40.0 / 328.27 * zoom.max(0.01);
        let kx = 2.0 * ppu / width.max(1.0);
        let ky = 2.0 * ppu / height.max(1.0);
        // x on the screen = y - x / 2, up on the screen = z - x / 8, and the
        // depth grows away from the viewer, against x, in the range zero to
        // one of WebGPU.
        let view_proj = Mat4 {
            cols: [
                [-0.5 * kx, -0.125 * ky, -0.5 / DEPTH, 0.0],
                [kx, 0.0, 0.0, 0.0],
                [0.0, ky, 0.0, 0.0],
                [0.0, -0.4, 0.5, 1.0],
            ],
        };
        let toward = Vec3::new(1.0, 0.5, 0.125).normalize();
        Self {
            view: View::Oblique,
            view_proj,
            eye: toward * DEPTH,
            toward,
            right: Vec3::Y,
            up: Vec3::Z,
            parallel: true,
            pixels_per_unit: ppu,
            width,
            height,
        }
    }

    /// Returns the camera that shows the scene turned by `turn`, the angles
    /// about the x, y and z axes in degrees, about the origin.
    ///
    /// The tab Kamera of version 1.3 turns a copy of the scene for display
    /// and leaves the data as they are. Turning the camera the other way is
    /// the same picture, and every edge, outline and pick of the turned
    /// camera stays right in the coordinates of the scene.
    #[must_use]
    pub fn turned(&self, turn: Vec3) -> Self {
        if turn == Vec3::ZERO {
            return *self;
        }
        let rotation = Mat4::rotation_x(turn.x)
            .mul(&Mat4::rotation_y(turn.y))
            .mul(&Mat4::rotation_z(turn.z));
        let back = Mat4::rotation_z(-turn.z)
            .mul(&Mat4::rotation_y(-turn.y))
            .mul(&Mat4::rotation_x(-turn.x));
        Self {
            view_proj: self.view_proj.mul(&rotation),
            eye: back.transform_point(self.eye),
            toward: back.transform_vector(self.toward),
            right: back.transform_vector(self.right),
            up: back.transform_vector(self.up),
            ..*self
        }
    }

    /// Returns the direction from `point` towards the viewer.
    #[must_use]
    pub fn toward_viewer(&self, point: Vec3) -> Vec3 {
        if self.parallel {
            self.toward
        } else {
            self.eye - point
        }
    }

    /// Returns the position of `point` in CSS pixels of the viewport, or
    /// `None` behind a perspective camera.
    #[must_use]
    pub fn project(&self, point: Vec3) -> Option<(f32, f32)> {
        let m = &self.view_proj;
        let clip_w =
            m.at(3, 0) * point.x + m.at(3, 1) * point.y + m.at(3, 2) * point.z + m.at(3, 3);
        if clip_w <= 1e-4 {
            return None;
        }
        let ndc = m.transform_point(point);
        Some((
            (ndc.x * 0.5 + 0.5) * self.width,
            (0.5 - ndc.y * 0.5) * self.height,
        ))
    }

    /// Returns the ray through the pixel `(x, y)` as its origin and direction.
    #[must_use]
    pub fn ray(&self, x: f32, y: f32) -> Option<(Vec3, Vec3)> {
        let inverse = self.view_proj.inverse()?;
        let ndc_x = x / self.width * 2.0 - 1.0;
        let ndc_y = 1.0 - y / self.height * 2.0;
        let near = inverse.transform_point(Vec3::new(ndc_x, ndc_y, 0.0));
        let far = inverse.transform_point(Vec3::new(ndc_x, ndc_y, 1.0));
        let direction = (far - near).normalize();
        Some((near, direction))
    }
}
