// SPDX-License-Identifier: GPL-2.0-only
/*
 * bausteine-core classic: the drawing of version 1.3, wire models on black with the dot raster.
 */

//! The drawing of version 1.3, for the classic look of the interface.
//!
//! Version 1.3 draws every view on black: a white dot at every point of the
//! grid, the axes from -2 to 10 with an arrow and a letter drawn of lines,
//! as `grid` of `3D_bau.frm` does, and every body as the wire model that
//! `D3_Refresh` of `Module1.bas` builds, in the colour of the body. A circle
//! of such a model has twelve segments, `D3_Kreis`, a sphere is five
//! circles of latitude and six of longitude, and a normal view draws a
//! sphere as one circle, `drawKugel`. The oblique view shows the ground
//! raster of `D3_Scala` and the axes of `D3_Achse` with their letters.
//!
//! Every edge, hidden or not, draws solid, since version 1.3 knows no hidden
//! line. The vertices take the layout of [`crate::drawing::LINE_STRIDE`],
//! with the style [`WIRE`] and the colour packed into the last value, or
//! the style [`RASTER`] for the white marks of the grid.

use core::f32::consts::PI;

use crate::{
    body::Body,
    math::{
        Mat4,
        Vec3, //
    },
    scene::Scene,
    view::{
        Camera,
        View, //
    },
};

/// The style of a wire of a body, in the colour packed beside it.
pub const WIRE: u8 = 8;
/// The style of the white marks of the raster and the axes.
pub const RASTER: u8 = 9;

/// Appends the segment from `a` to `b` in `style` with the colour `rgb`.
fn segment(out: &mut Vec<f32>, a: Vec3, b: Vec3, style: u8, rgb: [f32; 3]) {
    let packed = packed_color(rgb);
    let style = f32::from(style);
    out.extend_from_slice(&a.to_array());
    out.extend_from_slice(&b.to_array());
    out.extend_from_slice(&[style, packed]);
    out.extend_from_slice(&b.to_array());
    out.extend_from_slice(&a.to_array());
    out.extend_from_slice(&[style, packed]);
}

/// Returns the colour `rgb` as one number `0xRRGGBB`, which an `f32` holds exactly.
fn packed_color(rgb: [f32; 3]) -> f32 {
    let [r, g, b] = rgb.map(|c| (c.clamp(0.0, 1.0) * 255.0).round() as u32);
    ((r << 16) | (g << 8) | b) as f32
}

/// The wire model of a unit body as pairs of points.
#[derive(Clone, Debug, Default)]
struct Wire {
    /// The edges.
    edges: Vec<(Vec3, Vec3)>,
}

impl Wire {
    /// Adds the circle of `D3_Kreis`: twelve points from `(x, y + r, z)`
    /// around the axis z, each joined to the next.
    fn circle(&mut self, center: Vec3, r: f32) -> Vec<Vec3> {
        let points: Vec<Vec3> = (0..12)
            .map(|n| {
                let angle = PI / 6.0 * n as f32;
                center + Vec3::new(-angle.sin() * r, angle.cos() * r, 0.0)
            })
            .collect();
        for n in 0..12 {
            self.edges.push((points[n], points[(n + 1) % 12]));
        }
        points
    }

    /// Adds the edge from `a` to `b`.
    fn edge(&mut self, a: Vec3, b: Vec3) {
        self.edges.push((a, b));
    }

    /// Returns the wire model of `D3_Refresh` for `body`.
    fn of(body: Body, hole: f32) -> Self {
        let mut w = Self::default();
        let v = Vec3::new;
        match body {
            Body::Sphere => {
                for (z, r) in [
                    (0.0, 1.0),
                    (0.5, 0.87),
                    (-0.5, 0.87),
                    (0.87, 0.5),
                    (-0.87, 0.5),
                ] {
                    w.circle(v(0.0, 0.0, z), r);
                }
                for l in 0..6 {
                    let (sl, cl) = (PI / 6.0 * l as f32).sin_cos();
                    let points: Vec<Vec3> = (0..=12)
                        .map(|b| {
                            let (sb, cb) = (PI / 6.0 * b as f32).sin_cos();
                            v(-sl * sb, cl * sb, cb)
                        })
                        .collect();
                    for pair in points.windows(2) {
                        w.edge(pair[0], pair[1]);
                    }
                }
            }
            Body::Cone => {
                let base = w.circle(Vec3::ZERO, 1.0);
                for p in base {
                    w.edge(v(0.0, 0.0, 1.0), p);
                }
            }
            Body::Cylinder => {
                let low = w.circle(Vec3::ZERO, 1.0);
                let high = w.circle(v(0.0, 0.0, 1.0), 1.0);
                for (a, b) in low.into_iter().zip(high) {
                    w.edge(a, b);
                }
            }
            Body::Cube | Body::Cuboid => {
                let p = [
                    v(0.0, 0.0, 0.0),
                    v(1.0, 0.0, 0.0),
                    v(1.0, 1.0, 0.0),
                    v(0.0, 1.0, 0.0),
                    v(0.0, 0.0, 1.0),
                    v(1.0, 0.0, 1.0),
                    v(1.0, 1.0, 1.0),
                    v(0.0, 1.0, 1.0),
                ];
                for (a, b) in [
                    (0, 1),
                    (1, 2),
                    (2, 3),
                    (3, 0),
                    (4, 5),
                    (5, 6),
                    (6, 7),
                    (7, 4),
                    (0, 4),
                    (1, 5),
                    (2, 6),
                    (3, 7),
                ] {
                    w.edge(p[a], p[b]);
                }
            }
            Body::Pyramid => {
                let p = [
                    v(0.0, 0.0, 0.0),
                    v(1.0, 0.0, 0.0),
                    v(1.0, 1.0, 0.0),
                    v(0.0, 1.0, 0.0),
                ];
                let apex = v(0.5, 0.5, 1.0);
                for i in 0..4 {
                    w.edge(p[i], p[(i + 1) % 4]);
                    w.edge(p[i], apex);
                }
            }
            Body::Prism => {
                let h = 0.866;
                let low = [v(0.0, 0.0, 0.0), v(1.0, 0.0, 0.0), v(0.5, h, 0.0)];
                let high = low.map(|p| p + v(0.0, 0.0, 1.0));
                for i in 0..3 {
                    w.edge(low[i], low[(i + 1) % 3]);
                    w.edge(high[i], high[(i + 1) % 3]);
                    w.edge(low[i], high[i]);
                }
            }
            Body::Disc => {
                let outer = w.circle(Vec3::ZERO, 1.0);
                let inner = w.circle(Vec3::ZERO, hole);
                for (a, b) in outer.into_iter().zip(inner) {
                    w.edge(a, b);
                }
            }
        }
        w
    }
}

/// Returns the line vertices of the wire models of every body of `scene`
/// as `camera` sees them.
#[must_use]
pub fn wires(scene: &Scene, camera: &Camera) -> Vec<f32> {
    let mut out = Vec::new();
    let expanded = scene.expanded();
    let scene = &expanded.scene;
    for (index, body) in scene.bodies() {
        let item = &scene.items[index];
        let matrix = scene.world_matrix(index);
        let color = item.material().base;
        // A normal view draws a sphere as one circle, `drawKugel`, and the
        // oblique view as its wire model, also through the cavalier camera
        // of version 1.3, which projects in parallel too.
        if body == Body::Sphere && camera.view != View::Oblique {
            sphere_circle(&mut out, &matrix, camera, color);
            continue;
        }
        for (a, b) in Wire::of(body, item.hole()).edges {
            let (a, b) = (matrix.transform_point(a), matrix.transform_point(b));
            if a.is_finite() && b.is_finite() {
                segment(&mut out, a, b, WIRE, color);
            }
        }
    }
    out
}

/// Appends the circle `drawKugel` draws for a sphere in a normal view: its
/// centre and the radius of its first axis, in the plane of the view.
fn sphere_circle(out: &mut Vec<f32>, matrix: &Mat4, camera: &Camera, color: [f32; 3]) {
    let center = matrix.transform_point(Vec3::ZERO);
    let radius = matrix.transform_vector(Vec3::X).length();
    let points: Vec<Vec3> = (0..=48)
        .map(|n| {
            let (s, c) = (2.0 * PI * n as f32 / 48.0).sin_cos();
            center + camera.right * (c * radius) + camera.up * (s * radius)
        })
        .collect();
    for pair in points.windows(2) {
        segment(out, pair[0], pair[1], WIRE, color);
    }
}

/// Returns the line vertices of the axes, their arrows and their letters, and
/// the point vertices of the raster, of the view of `camera`.
///
/// The raster is one point vertex per point of the grid in the viewport, in
/// the layout of a line vertex whose other end is the point itself.
#[must_use]
pub fn raster(camera: &Camera) -> (Vec<f32>, Vec<f32>) {
    let mut lines = Vec::new();
    let mut dots = Vec::new();
    let white = [1.0, 1.0, 1.0];
    if camera.view == View::Oblique {
        ground(&mut lines, white);
        return (lines, dots);
    }
    let (u, v) = (camera.right, camera.up);
    let center = camera.eye - camera.toward * camera.eye.dot(camera.toward);
    let half_w = camera.width * 0.5 / camera.pixels_per_unit;
    let half_h = camera.height * 0.5 / camera.pixels_per_unit;
    let (cu, cv) = (center.dot(u), center.dot(v));
    let step = if camera.pixels_per_unit >= 4.0 {
        1.0
    } else {
        5.0
    };
    let mut a = ((cu - half_w) / step).floor() * step;
    while a <= cu + half_w {
        let mut b = ((cv - half_h) / step).floor() * step;
        while b <= cv + half_h {
            let p = u * a + v * b;
            dots.extend_from_slice(&p.to_array());
            dots.extend_from_slice(&p.to_array());
            dots.extend_from_slice(&[f32::from(RASTER), packed_color(white)]);
            b += step;
        }
        a += step;
    }
    // The Aufriss and the Kreuzriss draw a dot at every half step of their
    // ground line as well, the horizontal axis, over the whole width.
    if matches!(camera.view, View::Front | View::Side) {
        let mut a = ((cu - half_w) / step).floor() * step + step * 0.5;
        while a <= cu + half_w {
            let p = u * a;
            dots.extend_from_slice(&p.to_array());
            dots.extend_from_slice(&p.to_array());
            dots.extend_from_slice(&[f32::from(RASTER), packed_color(white)]);
            a += step;
        }
    }
    // The two axes of the view from -2 to 10 with an arrow at 10, and the
    // letter of each, in the axes of the screen as `grid` draws them.
    let axes = match camera.view {
        View::Top => [(Vec3::Y, 'y'), (Vec3::X, 'x')],
        View::Front => [(Vec3::Y, 'y'), (Vec3::Z, 'z')],
        _ => [(Vec3::X, 'x'), (Vec3::Z, 'z')],
    };
    for (axis, letter) in axes {
        let side = if axis.dot(u).abs() > 0.5 { v } else { u };
        segment(&mut lines, axis * -2.0, axis * 10.0, RASTER, white);
        segment(
            &mut lines,
            axis * 9.0 + side * 0.1,
            axis * 10.0,
            RASTER,
            white,
        );
        segment(
            &mut lines,
            axis * 9.0 - side * 0.1,
            axis * 10.0,
            RASTER,
            white,
        );
        glyph(
            &mut lines,
            letter,
            axis * 9.0 + side * 1.0,
            axis,
            side,
            white,
        );
    }
    (lines, dots)
}

/// A stroke of a letter, from a point to a point, each along and across the axis.
type Stroke = ((f32, f32), (f32, f32));

/// Appends the letter `letter` drawn of lines in the square from `origin`
/// along `along` and `side`, one unit large, as `grid` and `D3_Achse` draw
/// the names of the axes.
fn glyph(out: &mut Vec<f32>, letter: char, origin: Vec3, along: Vec3, side: Vec3, rgb: [f32; 3]) {
    let at = |a: f32, s: f32| origin + along * a + side * s;
    let strokes: &[Stroke] = match letter {
        'x' => &[((0.0, 0.0), (1.0, 1.0)), ((0.0, 1.0), (1.0, 0.0))],
        'y' => &[((0.0, 0.0), (0.5, 0.5)), ((1.0, 0.0), (0.0, 1.0))],
        _ => &[
            ((0.0, 0.0), (0.0, 1.0)),
            ((1.0, 0.0), (1.0, 1.0)),
            ((0.0, 1.0), (1.0, 0.0)),
        ],
    };
    for &((a0, s0), (a1, s1)) in strokes {
        segment(out, at(a0, s0), at(a1, s1), RASTER, rgb);
    }
}

/// Appends the ground raster of `D3_Scala` and the axes of `D3_Achse`: the
/// lines from 1 to 10 in the plane z = 0, the axes to 14, 12 and 8 with
/// their arrows, and their letters.
fn ground(out: &mut Vec<f32>, rgb: [f32; 3]) {
    let v = Vec3::new;
    for k in 1..=10 {
        let k = k as f32;
        segment(out, v(k, 0.0, 0.0), v(k, 10.0, 0.0), RASTER, rgb);
        segment(out, v(0.0, k, 0.0), v(10.0, k, 0.0), RASTER, rgb);
    }
    let lines = [
        (v(0.0, 0.0, 0.0), v(14.0, 0.0, 0.0)),
        (v(0.0, 0.0, 0.0), v(0.0, 12.0, 0.0)),
        (v(0.0, 0.0, 0.0), v(0.0, 0.0, 8.0)),
        (v(13.0, 0.0, -0.1), v(14.0, 0.0, 0.0)),
        (v(13.0, 0.0, 0.1), v(14.0, 0.0, 0.0)),
        (v(12.0, 0.0, 0.5), v(13.0, 0.0, 1.0)),
        (v(12.0, 0.0, 1.0), v(13.0, 0.0, 0.5)),
        (v(0.0, 11.0, -0.1), v(0.0, 12.0, 0.0)),
        (v(0.0, 11.0, 0.1), v(0.0, 12.0, 0.0)),
        (v(0.0, 11.5, 0.4), v(0.0, 12.0, 1.0)),
        (v(0.0, 11.6, 1.0), v(0.0, 11.75, 0.75)),
        (v(0.0, -0.1, 7.0), v(0.0, 0.0, 8.0)),
        (v(0.0, 0.1, 7.0), v(0.0, 0.0, 8.0)),
        (v(0.0, -1.0, 7.5), v(0.0, -1.5, 7.5)),
        (v(0.0, -1.0, 8.0), v(0.0, -1.5, 8.0)),
        (v(0.0, -1.5, 7.5), v(0.0, -1.0, 8.0)),
    ];
    for (a, b) in lines {
        segment(out, a, b, RASTER, rgb);
    }
}
