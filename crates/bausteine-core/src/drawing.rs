// SPDX-License-Identifier: GPL-2.0-only
/*
 * bausteine-core drawing: the faces and the lines of the four views, ready for the GPU.
 */

//! The faces and the lines of the four views, as the GPU reads them.
//!
//! Version 1.3 draws every edge of every body in every view, so a body
//! shows its hidden edges as well as its outline is missing on curved
//! surfaces. A [`Drawing`] follows the rules of a technical drawing instead:
//! it draws the edges where faces meet at an angle and the outline where a
//! curved surface turns away from the viewer, and the renderer draws the
//! hidden ones dashed. A body that a difference cuts away draws as a dashed
//! ghost, since only the ray tracer shows the solid of the CSG.
//!
//! The vertex layouts are plain arrays of `f32`, [`FACE_STRIDE`] and
//! [`LINE_STRIDE`] values per vertex, which the shaders of `bausteine-web`
//! read.

use crate::{
    body::Body,
    math::Vec3,
    mesh::{
        self,
        UnitMesh, //
    },
    scene::{
        Role,
        Scene, //
    },
    view::{
        Camera,
        View, //
    },
};

/// The values of a face vertex: position, normal, colour with alpha, the
/// index of its item and whether the item is selected.
pub const FACE_STRIDE: usize = 12;
/// The values of a line vertex: position, the position of the other end of
/// its segment, its style and one value of padding.
pub const LINE_STRIDE: usize = 8;

/// The style of a line, which the line shader turns into colour and dashes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Style {
    /// An edge or an outline of a body.
    Edge = 0,
    /// An edge or an outline of the selected body.
    Selected = 1,
    /// An edge of a body that a difference cuts away, always dashed.
    Cutter = 2,
    /// A line of the grid every unit.
    Minor = 3,
    /// A line of the grid every five units.
    Major = 4,
    /// The x axis.
    AxisX = 5,
    /// The y axis.
    AxisY = 6,
    /// The z axis.
    AxisZ = 7,
}

/// A body of the scene moved into place.
#[derive(Clone, Debug)]
struct Shape {
    /// The index of its item.
    item: usize,
    /// The index of its mesh in [`Drawing::meshes`].
    mesh: usize,
    /// The points in the scene.
    positions: Vec<Vec3>,
    /// The normal of every face.
    normals: Vec<Vec3>,
    /// Whether it adds or cuts material.
    role: Role,
    /// The colour of its faces.
    color: [f32; 3],
}

/// The bodies of a scene, moved into place and ready to draw in any view.
#[derive(Clone, Debug, Default)]
pub struct Drawing {
    /// The unit meshes, one per body and hole.
    meshes: Vec<(Body, u32, UnitMesh)>,
    /// The bodies of the scene.
    shapes: Vec<Shape>,
}

impl Drawing {
    /// Returns an empty drawing.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns the index of the unit mesh of `body` with the relative hole
    /// `hole`, which it builds on first use.
    fn mesh(&mut self, body: Body, hole: f32) -> usize {
        let key = if body == Body::Disc {
            (hole * 1000.0).round() as u32
        } else {
            0
        };
        if let Some(i) = self
            .meshes
            .iter()
            .position(|(b, k, _)| *b == body && *k == key)
        {
            return i;
        }
        self.meshes
            .push((body, key, UnitMesh::of(body, key as f32 / 1000.0)));
        self.meshes.len() - 1
    }

    /// Moves every body of `scene` into place, `D3_Refresh` of `Module1.bas`.
    pub fn set_scene(&mut self, scene: &Scene) {
        self.shapes.clear();
        let expanded = scene.expanded();
        let scene = &expanded.scene;
        for (item, body) in scene.bodies() {
            let source = &scene.items[item];
            let mesh = self.mesh(body, source.hole());
            let matrix = scene.world_matrix(item);
            let (positions, normals) = mesh::place(&self.meshes[mesh].2, &matrix);
            if !positions.iter().all(|p| p.is_finite()) {
                continue;
            }
            let material = source.material();
            self.shapes.push(Shape {
                item: expanded.origin[item],
                mesh,
                positions,
                normals,
                role: scene.role(item),
                color: material.base,
            });
        }
    }

    /// Returns the face vertices of every body that adds material.
    #[must_use]
    pub fn faces(&self, selected: Option<usize>) -> Vec<f32> {
        let mut out = Vec::new();
        for shape in self.shapes.iter().filter(|s| s.role == Role::Solid) {
            let unit = &self.meshes[shape.mesh].2;
            let flag = if Some(shape.item) == selected {
                1.0
            } else {
                0.0
            };
            for (t, tri) in unit.triangles.iter().enumerate() {
                for &p in tri {
                    let position = shape.positions[p as usize];
                    let normal = mesh::corner_normal(unit, &shape.normals, t as u32, p);
                    out.extend_from_slice(&position.to_array());
                    out.extend_from_slice(&normal.to_array());
                    out.extend_from_slice(&shape.color);
                    out.push(1.0);
                    out.push(shape.item as f32);
                    out.push(flag);
                }
            }
        }
        out
    }

    /// Returns the line vertices of the edges and outlines of every body as
    /// `camera` sees them.
    #[must_use]
    pub fn lines(&self, camera: &Camera, selected: Option<usize>) -> Vec<f32> {
        let mut out = Vec::new();
        for shape in &self.shapes {
            let unit = &self.meshes[shape.mesh].2;
            let style = match (shape.role, Some(shape.item) == selected) {
                (_, true) => Style::Selected,
                (Role::Cutter, false) => Style::Cutter,
                (Role::Solid, false) => Style::Edge,
            };
            for edge in &unit.edges {
                let a = shape.positions[edge.a as usize];
                let b = shape.positions[edge.b as usize];
                let toward = camera.toward_viewer((a + b) * 0.5);
                if mesh::is_crease(&shape.normals, edge)
                    || mesh::is_outline(&shape.normals, edge, toward)
                {
                    segment(&mut out, a, b, style);
                }
            }
        }
        out
    }

    /// Returns the item of the body nearest to the viewer under the pixel
    /// `(x, y)` of `camera`, or `None` where the ray meets no body.
    #[must_use]
    pub fn pick(&self, camera: &Camera, x: f32, y: f32) -> Option<usize> {
        let (origin, direction) = camera.ray(x, y)?;
        let mut best: Option<(f32, usize)> = None;
        for shape in &self.shapes {
            let unit = &self.meshes[shape.mesh].2;
            for tri in &unit.triangles {
                let [a, b, c] = tri.map(|p| shape.positions[p as usize]);
                if let Some(t) = intersect(origin, direction, a, b, c)
                    && best.is_none_or(|(d, _)| t < d)
                {
                    best = Some((t, shape.item));
                }
            }
        }
        best.map(|(_, item)| item)
    }

    /// Returns the smallest box around every body, or `None` for no body.
    #[must_use]
    pub fn bounds(&self) -> Option<(Vec3, Vec3)> {
        let mut points = self.shapes.iter().flat_map(|s| s.positions.iter().copied());
        let first = points.next()?;
        Some(points.fold((first, first), |(lo, hi), p| {
            (
                Vec3::new(lo.x.min(p.x), lo.y.min(p.y), lo.z.min(p.z)),
                Vec3::new(hi.x.max(p.x), hi.y.max(p.y), hi.z.max(p.z)),
            )
        }))
    }
}

/// Appends the segment from `a` to `b` in `style`.
fn segment(out: &mut Vec<f32>, a: Vec3, b: Vec3, style: Style) {
    let style = f32::from(style as u8);
    out.extend_from_slice(&a.to_array());
    out.extend_from_slice(&b.to_array());
    out.extend_from_slice(&[style, 0.0]);
    out.extend_from_slice(&b.to_array());
    out.extend_from_slice(&a.to_array());
    out.extend_from_slice(&[style, 0.0]);
}

/// Returns the distance along the ray to the triangle `a`, `b`, `c`, the
/// algorithm of Möller and Trumbore, or `None` where the ray misses it.
fn intersect(origin: Vec3, direction: Vec3, a: Vec3, b: Vec3, c: Vec3) -> Option<f32> {
    let e1 = b - a;
    let e2 = c - a;
    let p = direction.cross(e2);
    let det = e1.dot(p);
    if det.abs() < 1e-9 {
        return None;
    }
    let inv = 1.0 / det;
    let s = origin - a;
    let u = s.dot(p) * inv;
    if !(0.0..=1.0).contains(&u) {
        return None;
    }
    let q = s.cross(e1);
    let v = direction.dot(q) * inv;
    if v < 0.0 || u + v > 1.0 {
        return None;
    }
    let t = e2.dot(q) * inv;
    (t > 0.0).then_some(t)
}

/// Returns the line vertices of the grid and the axes of the view of `camera`.
///
/// A parallel view shows the grid of its plane of projection over the whole
/// viewport, with a line every unit and a stronger one every five, as the
/// background raster of `grid` in `3D_bau.frm`, and the two axes that lie in
/// that plane from one edge of the viewport to the other. The oblique view
/// shows the ground plane from zero to ten and the axes of `D3_Achse`.
#[must_use]
pub fn grid(camera: &Camera) -> Vec<f32> {
    let mut out = Vec::new();
    if camera.view == View::Oblique {
        oblique_grid(&mut out);
        return out;
    }
    let center = camera.eye - camera.toward * camera.eye.dot(camera.toward);
    let half_w = camera.width * 0.5 / camera.pixels_per_unit;
    let half_h = camera.height * 0.5 / camera.pixels_per_unit;
    let step = if camera.pixels_per_unit >= 9.0 {
        1.0
    } else {
        5.0
    };
    let (u, v) = (camera.right, camera.up);
    let (cu, cv) = (center.dot(u), center.dot(v));
    let (u0, u1) = (
        ((cu - half_w) / step).floor(),
        ((cu + half_w) / step).ceil(),
    );
    let (v0, v1) = (
        ((cv - half_h) / step).floor(),
        ((cv + half_h) / step).ceil(),
    );
    let lo_v = v0 * step;
    let hi_v = v1 * step;
    let lo_u = u0 * step;
    let hi_u = u1 * step;
    let mut k = u0;
    while k <= u1 {
        let at = k * step;
        let style = line_style(at);
        segment(&mut out, u * at + v * lo_v, u * at + v * hi_v, style);
        k += 1.0;
    }
    let mut k = v0;
    while k <= v1 {
        let at = k * step;
        let style = line_style(at);
        segment(&mut out, v * at + u * lo_u, v * at + u * hi_u, style);
        k += 1.0;
    }
    for (axis, style) in [
        (Vec3::X, Style::AxisX),
        (Vec3::Y, Style::AxisY),
        (Vec3::Z, Style::AxisZ),
    ] {
        let (su, sv) = (axis.dot(u), axis.dot(v));
        let Some((from, to)) = axis_span(su, lo_u, hi_u).or_else(|| axis_span(sv, lo_v, hi_v))
        else {
            continue;
        };
        segment(&mut out, axis * from, axis * to, style);
    }
    out
}

/// Returns the span of an axis that runs `along` one direction of the plane
/// of projection, in units of the axis, over the extent `lo` to `hi` the
/// grid covers in that direction.
///
/// The axis runs through the whole view, from the edge its negative half
/// points to as far as the edge of its positive half, as P-035 asks of the
/// modern look. An axis that does not lie in that direction answers `None`.
fn axis_span(along: f32, lo: f32, hi: f32) -> Option<(f32, f32)> {
    if along > 0.5 {
        Some((lo, hi))
    } else if along < -0.5 {
        Some((-hi, -lo))
    } else {
        None
    }
}

/// Returns the style of a grid line at the coordinate `at`.
fn line_style(at: f32) -> Style {
    if (at / 5.0).fract().abs() < 1e-4 {
        Style::Major
    } else {
        Style::Minor
    }
}

/// Appends the ground grid and the axes with their arrows of the oblique view.
fn oblique_grid(out: &mut Vec<f32>) {
    for k in 0..=10 {
        let at = k as f32;
        let style = line_style(at);
        segment(
            out,
            Vec3::new(at, 0.0, 0.0),
            Vec3::new(at, 10.0, 0.0),
            style,
        );
        segment(
            out,
            Vec3::new(0.0, at, 0.0),
            Vec3::new(10.0, at, 0.0),
            style,
        );
    }
    let arrows = [
        (Vec3::X * 13.0, Vec3::X, Vec3::Y, Style::AxisX),
        (Vec3::Y * 12.0, Vec3::Y, Vec3::X, Style::AxisY),
        (Vec3::Z * 8.0, Vec3::Z, Vec3::Y, Style::AxisZ),
    ];
    for (tip, axis, side, style) in arrows {
        segment(out, Vec3::ZERO, tip, style);
        let back = tip - axis * 0.6;
        segment(out, back + side * 0.2, tip, style);
        segment(out, back - side * 0.2, tip, style);
    }
}
