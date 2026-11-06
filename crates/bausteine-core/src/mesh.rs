// SPDX-License-Identifier: GPL-2.0-only
/*
 * bausteine-core mesh: the polygon model of the unit bodies and its edges.
 */

//! The polygon model of the unit bodies and the edges between their faces.
//!
//! Section 5.4 of the thesis describes a body as a list of points and a list
//! of faces over them, and version 1.3 draws the edges of such lists, `FP`
//! and `FE` of `Module1.bas`. A [`UnitMesh`] keeps every point once and
//! knows for each edge the one or two faces it borders, so a view can tell
//! the edges that a technical drawing shows: the edges of the body, where its
//! faces meet at an angle, and the outline, where a curved face turns away
//! from the viewer.

use crate::{
    body::Body,
    math::{
        Mat4,
        Vec3, //
    },
};

/// The number of segments of a circle.
pub const SEGMENTS: u32 = 48;
/// The number of rings of a sphere from pole to pole.
pub const RINGS: u32 = 24;
/// The cosine of the largest angle between two faces that a surface still
/// shades smoothly over, 35 degrees.
pub const CREASE: f32 = 0.819;

/// An edge of a mesh with the faces on its two sides.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Edge {
    /// The index of the first point.
    pub a: u32,
    /// The index of the second point.
    pub b: u32,
    /// The face on one side.
    pub left: u32,
    /// The face on the other side, `None` on the border of an open surface.
    pub right: Option<u32>,
}

/// The polygon model of a unit body.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct UnitMesh {
    /// The points, each one once.
    pub positions: Vec<Vec3>,
    /// The triangles, counter clockwise seen from outside.
    pub triangles: Vec<[u32; 3]>,
    /// Every edge once, with its faces.
    pub edges: Vec<Edge>,
    /// Where the faces of each point start in [`UnitMesh::point_faces`].
    pub point_offsets: Vec<u32>,
    /// The faces around each point, one run per point.
    pub point_faces: Vec<u32>,
}

impl UnitMesh {
    /// Returns the polygon model of `body`, a disc with the relative hole `hole`.
    #[must_use]
    pub fn of(body: Body, hole: f32) -> Self {
        let mut mesh = Self::default();
        match body {
            Body::Sphere => mesh.sphere(),
            Body::Cone => mesh.cone(),
            Body::Cylinder => mesh.cylinder(),
            Body::Cube | Body::Cuboid => mesh.cuboid(),
            Body::Pyramid => mesh.pyramid(),
            Body::Prism => mesh.prism(),
            Body::Disc => mesh.disc(hole),
        }
        mesh.link();
        mesh
    }

    /// Appends a point and returns its index.
    fn point(&mut self, x: f32, y: f32, z: f32) -> u32 {
        self.positions.push(Vec3::new(x, y, z));
        self.positions.len() as u32 - 1
    }

    /// Appends the triangle of the points `a`, `b` and `c`.
    fn triangle(&mut self, a: u32, b: u32, c: u32) {
        self.triangles.push([a, b, c]);
    }

    /// Appends the quadrilateral of the points `a`, `b`, `c` and `d` as two triangles.
    fn quad(&mut self, a: u32, b: u32, c: u32, d: u32) {
        self.triangle(a, b, c);
        self.triangle(a, c, d);
    }

    /// Appends a ring of [`SEGMENTS`] points of `radius` at the height `z`
    /// and returns the index of its first point.
    fn ring(&mut self, radius: f32, z: f32) -> u32 {
        let first = self.positions.len() as u32;
        for i in 0..SEGMENTS {
            let angle = core::f32::consts::TAU * i as f32 / SEGMENTS as f32;
            let (s, c) = angle.sin_cos();
            self.point(radius * c, radius * s, z);
        }
        first
    }

    /// Returns the index of the point `i` of the ring that starts at `first`.
    const fn on(first: u32, i: u32) -> u32 {
        first + i % SEGMENTS
    }

    /// Builds the sphere of `D3_Kugel` from latitudes and longitudes.
    fn sphere(&mut self) {
        let north = self.point(0.0, 0.0, 1.0);
        let mut rings = Vec::new();
        for r in 1..RINGS {
            let polar = core::f32::consts::PI * r as f32 / RINGS as f32;
            let (s, c) = polar.sin_cos();
            rings.push(self.ring(s, c));
        }
        let south = self.point(0.0, 0.0, -1.0);
        let first = rings[0];
        for i in 0..SEGMENTS {
            self.triangle(north, Self::on(first, i), Self::on(first, i + 1));
        }
        for pair in rings.windows(2) {
            let (upper, lower) = (pair[0], pair[1]);
            for i in 0..SEGMENTS {
                self.quad(
                    Self::on(upper, i),
                    Self::on(lower, i),
                    Self::on(lower, i + 1),
                    Self::on(upper, i + 1),
                );
            }
        }
        let last = rings[rings.len() - 1];
        for i in 0..SEGMENTS {
            self.triangle(south, Self::on(last, i + 1), Self::on(last, i));
        }
    }

    /// Builds the cone of `D3_Kegel`, its base and its mantle.
    fn cone(&mut self) {
        let center = self.point(0.0, 0.0, 0.0);
        let base = self.ring(1.0, 0.0);
        let apex = self.point(0.0, 0.0, 1.0);
        for i in 0..SEGMENTS {
            self.triangle(center, Self::on(base, i + 1), Self::on(base, i));
            self.triangle(Self::on(base, i), Self::on(base, i + 1), apex);
        }
    }

    /// Builds the cylinder of `D3_Zylinder`, its base, its top and its mantle.
    fn cylinder(&mut self) {
        let bottom = self.point(0.0, 0.0, 0.0);
        let top = self.point(0.0, 0.0, 1.0);
        let low = self.ring(1.0, 0.0);
        let high = self.ring(1.0, 1.0);
        for i in 0..SEGMENTS {
            self.triangle(bottom, Self::on(low, i + 1), Self::on(low, i));
            self.triangle(top, Self::on(high, i), Self::on(high, i + 1));
            self.quad(
                Self::on(low, i),
                Self::on(low, i + 1),
                Self::on(high, i + 1),
                Self::on(high, i),
            );
        }
    }

    /// Builds the unit cube of `Wuerfel_dat`.
    fn cuboid(&mut self) {
        let p: Vec<u32> = [
            (0.0, 0.0, 0.0),
            (1.0, 0.0, 0.0),
            (1.0, 1.0, 0.0),
            (0.0, 1.0, 0.0),
            (0.0, 0.0, 1.0),
            (1.0, 0.0, 1.0),
            (1.0, 1.0, 1.0),
            (0.0, 1.0, 1.0),
        ]
        .into_iter()
        .map(|(x, y, z)| self.point(x, y, z))
        .collect();
        self.quad(p[0], p[3], p[2], p[1]);
        self.quad(p[4], p[5], p[6], p[7]);
        self.quad(p[0], p[1], p[5], p[4]);
        self.quad(p[1], p[2], p[6], p[5]);
        self.quad(p[2], p[3], p[7], p[6]);
        self.quad(p[3], p[0], p[4], p[7]);
    }

    /// Builds the square pyramid of `Pyramide4_dat`.
    fn pyramid(&mut self) {
        let a = self.point(0.0, 0.0, 0.0);
        let b = self.point(1.0, 0.0, 0.0);
        let c = self.point(1.0, 1.0, 0.0);
        let d = self.point(0.0, 1.0, 0.0);
        let apex = self.point(0.5, 0.5, 1.0);
        self.quad(a, d, c, b);
        self.triangle(a, b, apex);
        self.triangle(b, c, apex);
        self.triangle(c, d, apex);
        self.triangle(d, a, apex);
    }

    /// Builds the three sided prism of `Prisma3_dat`.
    fn prism(&mut self) {
        let h = 0.866_025_4;
        let a = self.point(0.0, 0.0, 0.0);
        let b = self.point(1.0, 0.0, 0.0);
        let c = self.point(0.5, h, 0.0);
        let d = self.point(0.0, 0.0, 1.0);
        let e = self.point(1.0, 0.0, 1.0);
        let f = self.point(0.5, h, 1.0);
        self.triangle(a, c, b);
        self.triangle(d, e, f);
        self.quad(a, b, e, d);
        self.quad(b, c, f, e);
        self.quad(c, a, d, f);
    }

    /// Builds the disc of `D3_Disc`, a ring between the radii `hole` and one.
    fn disc(&mut self, hole: f32) {
        let outer = self.ring(1.0, 0.0);
        if hole <= 0.001 {
            let center = self.point(0.0, 0.0, 0.0);
            for i in 0..SEGMENTS {
                self.triangle(center, Self::on(outer, i), Self::on(outer, i + 1));
            }
            return;
        }
        let inner = self.ring(hole, 0.0);
        for i in 0..SEGMENTS {
            self.quad(
                Self::on(inner, i),
                Self::on(outer, i),
                Self::on(outer, i + 1),
                Self::on(inner, i + 1),
            );
        }
    }

    /// Finds the faces of every edge and of every point.
    fn link(&mut self) {
        let mut sides: Vec<(u32, u32, u32)> = Vec::with_capacity(self.triangles.len() * 3);
        for (t, tri) in self.triangles.iter().enumerate() {
            for k in 0..3 {
                let (a, b) = (tri[k], tri[(k + 1) % 3]);
                sides.push((a.min(b), a.max(b), t as u32));
            }
        }
        sides.sort_unstable();
        let mut i = 0;
        while i < sides.len() {
            let (a, b, left) = sides[i];
            let right = sides
                .get(i + 1)
                .filter(|next| next.0 == a && next.1 == b)
                .map(|next| next.2);
            self.edges.push(Edge { a, b, left, right });
            i += if right.is_some() { 2 } else { 1 };
            while i < sides.len() && sides[i].0 == a && sides[i].1 == b {
                i += 1;
            }
        }
        let mut counts = vec![0u32; self.positions.len() + 1];
        for tri in &self.triangles {
            for &p in tri {
                counts[p as usize + 1] += 1;
            }
        }
        for i in 1..counts.len() {
            counts[i] += counts[i - 1];
        }
        let mut fill = counts.clone();
        self.point_faces = vec![0; self.triangles.len() * 3];
        for (t, tri) in self.triangles.iter().enumerate() {
            for &p in tri {
                self.point_faces[fill[p as usize] as usize] = t as u32;
                fill[p as usize] += 1;
            }
        }
        self.point_offsets = counts;
    }

    /// Returns the faces around the point `p`.
    #[must_use]
    pub fn faces_of(&self, p: u32) -> &[u32] {
        let start = self.point_offsets[p as usize] as usize;
        let end = self.point_offsets[p as usize + 1] as usize;
        &self.point_faces[start..end]
    }
}

/// Moves `mesh` into the scene by `matrix`, `TransPipe` of `Module1.bas`,
/// and returns its points and the normal of every face.
///
/// The normals are taken from the moved points, so a scaling that differs
/// between the axes tilts them correctly, and a matrix that mirrors keeps
/// them pointing out of the body.
#[must_use]
pub fn place(mesh: &UnitMesh, matrix: &Mat4) -> (Vec<Vec3>, Vec<Vec3>) {
    let positions: Vec<Vec3> = mesh
        .positions
        .iter()
        .map(|&p| matrix.transform_point(p))
        .collect();
    let x = matrix.transform_vector(Vec3::X);
    let y = matrix.transform_vector(Vec3::Y);
    let z = matrix.transform_vector(Vec3::Z);
    let sign = if x.cross(y).dot(z) < 0.0 { -1.0 } else { 1.0 };
    let normals = mesh
        .triangles
        .iter()
        .map(|&[a, b, c]| {
            let (a, b, c) = (
                positions[a as usize],
                positions[b as usize],
                positions[c as usize],
            );
            (b - a).cross(c - a).normalize() * sign
        })
        .collect();
    (positions, normals)
}

/// Returns the normal of the corner `p` of the face `t`, the mean of the
/// faces around `p` whose `normals` lie within [`CREASE`] of the one of `t`.
#[must_use]
pub fn corner_normal(mesh: &UnitMesh, normals: &[Vec3], t: u32, p: u32) -> Vec3 {
    let own = normals[t as usize];
    let mut sum = Vec3::ZERO;
    for &f in mesh.faces_of(p) {
        let normal = normals[f as usize];
        if normal.dot(own) >= CREASE {
            sum = sum + normal;
        }
    }
    let sum = sum.normalize();
    if sum == Vec3::ZERO { own } else { sum }
}

/// Returns whether `edge` is an edge of the body, where its faces meet at
/// an angle or a surface ends.
#[must_use]
pub fn is_crease(normals: &[Vec3], edge: &Edge) -> bool {
    match edge.right {
        None => true,
        Some(right) => {
            let n1 = normals[edge.left as usize];
            let n2 = normals[right as usize];
            n1 != Vec3::ZERO && n2 != Vec3::ZERO && n1.dot(n2) < CREASE
        }
    }
}

/// Returns whether the smooth `edge` lies on the outline seen along
/// `toward`, the direction from the edge to the viewer.
#[must_use]
pub fn is_outline(normals: &[Vec3], edge: &Edge, toward: Vec3) -> bool {
    let Some(right) = edge.right else {
        return false;
    };
    let front = normals[edge.left as usize].dot(toward);
    let back = normals[right as usize].dot(toward);
    (front > 0.0) != (back > 0.0)
}
