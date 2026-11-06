// SPDX-License-Identifier: GPL-2.0-only
/*
 * bausteine-core math: the vectors and the 4x4 matrices of the graphics pipeline.
 */

//! The vectors and the homogeneous 4x4 matrices of the graphics pipeline.
//!
//! Chapter 6 of the diploma thesis builds every transformation of a body as a
//! 4x4 matrix in homogeneous coordinates, and the module `M2.bas` of version
//! 1.3 multiplies them by hand. [`Mat4`] is that matrix, stored by columns as
//! WGSL reads a `mat4x4<f32>`, so a matrix goes to the GPU as it stands.

use core::ops::{
    Add,
    Mul,
    Neg,
    Sub, //
};

/// A point or a direction in space, in the coordinate system of the GZ lesson.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Vec3 {
    /// The x coordinate, which points towards the viewer of the front view.
    pub x: f32,
    /// The y coordinate, which points to the right in the front view.
    pub y: f32,
    /// The z coordinate, which points up.
    pub z: f32,
}

impl Vec3 {
    /// The origin.
    pub const ZERO: Self = Self::new(0.0, 0.0, 0.0);
    /// The vector whose three components are one.
    pub const ONE: Self = Self::new(1.0, 1.0, 1.0);
    /// The unit vector of the x axis.
    pub const X: Self = Self::new(1.0, 0.0, 0.0);
    /// The unit vector of the y axis.
    pub const Y: Self = Self::new(0.0, 1.0, 0.0);
    /// The unit vector of the z axis.
    pub const Z: Self = Self::new(0.0, 0.0, 1.0);

    /// Returns the vector of the three components.
    #[must_use]
    pub const fn new(x: f32, y: f32, z: f32) -> Self {
        Self { x, y, z }
    }

    /// Returns the scalar product, section 6.3.5 of the thesis.
    #[must_use]
    pub fn dot(self, other: Self) -> f32 {
        self.x * other.x + self.y * other.y + self.z * other.z
    }

    /// Returns the vector product, section 6.3.4 of the thesis.
    #[must_use]
    pub fn cross(self, other: Self) -> Self {
        Self::new(
            self.y * other.z - self.z * other.y,
            self.z * other.x - self.x * other.z,
            self.x * other.y - self.y * other.x,
        )
    }

    /// Returns the length, section 6.3.2 of the thesis.
    #[must_use]
    pub fn length(self) -> f32 {
        self.dot(self).sqrt()
    }

    /// Returns the unit vector of the same direction, or the zero vector for
    /// the zero vector.
    #[must_use]
    pub fn normalize(self) -> Self {
        let length = self.length();
        if length > f32::EPSILON {
            self * (1.0 / length)
        } else {
            Self::ZERO
        }
    }

    /// Returns the product of the components one by one.
    #[must_use]
    pub fn scale(self, other: Self) -> Self {
        Self::new(self.x * other.x, self.y * other.y, self.z * other.z)
    }

    /// Returns the smallest of the three components.
    #[must_use]
    pub fn min_element(self) -> f32 {
        self.x.min(self.y).min(self.z)
    }

    /// Returns the components as an array.
    #[must_use]
    pub const fn to_array(self) -> [f32; 3] {
        [self.x, self.y, self.z]
    }

    /// Returns whether every component is a finite number.
    #[must_use]
    pub fn is_finite(self) -> bool {
        self.x.is_finite() && self.y.is_finite() && self.z.is_finite()
    }
}

impl Add for Vec3 {
    type Output = Self;

    fn add(self, other: Self) -> Self {
        Self::new(self.x + other.x, self.y + other.y, self.z + other.z)
    }
}

impl Sub for Vec3 {
    type Output = Self;

    fn sub(self, other: Self) -> Self {
        Self::new(self.x - other.x, self.y - other.y, self.z - other.z)
    }
}

impl Mul<f32> for Vec3 {
    type Output = Self;

    fn mul(self, factor: f32) -> Self {
        Self::new(self.x * factor, self.y * factor, self.z * factor)
    }
}

impl Neg for Vec3 {
    type Output = Self;

    fn neg(self) -> Self {
        Self::new(-self.x, -self.y, -self.z)
    }
}

/// A homogeneous 4x4 matrix, stored by columns.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Mat4 {
    /// The four columns, the fourth of which holds the translation.
    pub cols: [[f32; 4]; 4],
}

impl Mat4 {
    /// The identity, `MEin` of `M2.bas`.
    pub const IDENTITY: Self = Self {
        cols: [
            [1.0, 0.0, 0.0, 0.0],
            [0.0, 1.0, 0.0, 0.0],
            [0.0, 0.0, 1.0, 0.0],
            [0.0, 0.0, 0.0, 1.0],
        ],
    };

    /// Returns the matrix of a translation by `offset`, section 6.2.2.
    #[must_use]
    pub fn translation(offset: Vec3) -> Self {
        let mut m = Self::IDENTITY;
        m.cols[3] = [offset.x, offset.y, offset.z, 1.0];
        m
    }

    /// Returns the matrix of a scaling by the factors of `factors`, section 6.2.3.
    #[must_use]
    pub fn scaling(factors: Vec3) -> Self {
        let mut m = Self::IDENTITY;
        m.cols[0][0] = factors.x;
        m.cols[1][1] = factors.y;
        m.cols[2][2] = factors.z;
        m
    }

    /// Returns the rotation by `degrees` about the x axis, section 6.2.4.
    #[must_use]
    pub fn rotation_x(degrees: f32) -> Self {
        let (s, c) = degrees.to_radians().sin_cos();
        let mut m = Self::IDENTITY;
        m.cols[1] = [0.0, c, s, 0.0];
        m.cols[2] = [0.0, -s, c, 0.0];
        m
    }

    /// Returns the rotation by `degrees` about the y axis.
    #[must_use]
    pub fn rotation_y(degrees: f32) -> Self {
        let (s, c) = degrees.to_radians().sin_cos();
        let mut m = Self::IDENTITY;
        m.cols[0] = [c, 0.0, -s, 0.0];
        m.cols[2] = [s, 0.0, c, 0.0];
        m
    }

    /// Returns the rotation by `degrees` about the z axis.
    #[must_use]
    pub fn rotation_z(degrees: f32) -> Self {
        let (s, c) = degrees.to_radians().sin_cos();
        let mut m = Self::IDENTITY;
        m.cols[0] = [c, s, 0.0, 0.0];
        m.cols[1] = [-s, c, 0.0, 0.0];
        m
    }

    /// Returns the element of row `row` and column `col`.
    #[must_use]
    pub const fn at(&self, row: usize, col: usize) -> f32 {
        self.cols[col][row]
    }

    /// Returns the product `self · other`, `MMul` of `M2.bas`.
    #[must_use]
    pub fn mul(&self, other: &Self) -> Self {
        let mut cols = [[0.0; 4]; 4];
        for (col, out) in cols.iter_mut().enumerate() {
            for (row, value) in out.iter_mut().enumerate() {
                *value = (0..4).map(|k| self.at(row, k) * other.at(k, col)).sum();
            }
        }
        Self { cols }
    }

    /// Returns the image of the point `p`, `MxVMul` of `M2.bas` over (x, y, z, 1).
    #[must_use]
    pub fn transform_point(&self, p: Vec3) -> Vec3 {
        let c = &self.cols;
        let w = c[0][3] * p.x + c[1][3] * p.y + c[2][3] * p.z + c[3][3];
        let w = if w.abs() > f32::EPSILON { 1.0 / w } else { 1.0 };
        Vec3::new(
            (c[0][0] * p.x + c[1][0] * p.y + c[2][0] * p.z + c[3][0]) * w,
            (c[0][1] * p.x + c[1][1] * p.y + c[2][1] * p.z + c[3][1]) * w,
            (c[0][2] * p.x + c[1][2] * p.y + c[2][2] * p.z + c[3][2]) * w,
        )
    }

    /// Returns the image of the direction `v`, which no translation moves.
    #[must_use]
    pub fn transform_vector(&self, v: Vec3) -> Vec3 {
        let c = &self.cols;
        Vec3::new(
            c[0][0] * v.x + c[1][0] * v.y + c[2][0] * v.z,
            c[0][1] * v.x + c[1][1] * v.y + c[2][1] * v.z,
            c[0][2] * v.x + c[1][2] * v.y + c[2][2] * v.z,
        )
    }

    /// Returns the inverse transformation, section 6.2.5 of the thesis, or
    /// `None` for a matrix that has none, such as a scaling by zero.
    #[must_use]
    pub fn inverse(&self) -> Option<Self> {
        let m: [f32; 16] = self.to_array();
        let mut inv = [0.0f32; 16];
        inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15]
            + m[9] * m[7] * m[14]
            + m[13] * m[6] * m[11]
            - m[13] * m[7] * m[10];
        inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15]
            - m[8] * m[7] * m[14]
            - m[12] * m[6] * m[11]
            + m[12] * m[7] * m[10];
        inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15]
            + m[8] * m[7] * m[13]
            + m[12] * m[5] * m[11]
            - m[12] * m[7] * m[9];
        inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14]
            - m[8] * m[6] * m[13]
            - m[12] * m[5] * m[10]
            + m[12] * m[6] * m[9];
        inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15]
            - m[9] * m[3] * m[14]
            - m[13] * m[2] * m[11]
            + m[13] * m[3] * m[10];
        inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15]
            + m[8] * m[3] * m[14]
            + m[12] * m[2] * m[11]
            - m[12] * m[3] * m[10];
        inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15]
            - m[8] * m[3] * m[13]
            - m[12] * m[1] * m[11]
            + m[12] * m[3] * m[9];
        inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14]
            + m[8] * m[2] * m[13]
            + m[12] * m[1] * m[10]
            - m[12] * m[2] * m[9];
        inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15]
            + m[5] * m[3] * m[14]
            + m[13] * m[2] * m[7]
            - m[13] * m[3] * m[6];
        inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15]
            - m[4] * m[3] * m[14]
            - m[12] * m[2] * m[7]
            + m[12] * m[3] * m[6];
        inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15]
            + m[4] * m[3] * m[13]
            + m[12] * m[1] * m[7]
            - m[12] * m[3] * m[5];
        inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14]
            - m[4] * m[2] * m[13]
            - m[12] * m[1] * m[6]
            + m[12] * m[2] * m[5];
        inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11]
            - m[5] * m[3] * m[10]
            - m[9] * m[2] * m[7]
            + m[9] * m[3] * m[6];
        inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11]
            + m[4] * m[3] * m[10]
            + m[8] * m[2] * m[7]
            - m[8] * m[3] * m[6];
        inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11]
            - m[4] * m[3] * m[9]
            - m[8] * m[1] * m[7]
            + m[8] * m[3] * m[5];
        inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10]
            + m[4] * m[2] * m[9]
            + m[8] * m[1] * m[6]
            - m[8] * m[2] * m[5];
        let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
        if det.abs() < 1e-12 || !det.is_finite() {
            return None;
        }
        let factor = 1.0 / det;
        let mut out = Self::IDENTITY;
        for (i, value) in inv.iter().enumerate() {
            out.cols[i / 4][i % 4] = value * factor;
        }
        Some(out)
    }

    /// Returns the sixteen elements column by column, as the GPU reads them.
    #[must_use]
    pub fn to_array(&self) -> [f32; 16] {
        let mut out = [0.0; 16];
        for (i, value) in out.iter_mut().enumerate() {
            *value = self.cols[i / 4][i % 4];
        }
        out
    }

    /// Returns the matrix whose rows are `right`, `up` and `back` around
    /// `eye`, the camera of a view whose viewer looks along `-back`.
    #[must_use]
    pub fn view(eye: Vec3, right: Vec3, up: Vec3, back: Vec3) -> Self {
        Self {
            cols: [
                [right.x, up.x, back.x, 0.0],
                [right.y, up.y, back.y, 0.0],
                [right.z, up.z, back.z, 0.0],
                [-right.dot(eye), -up.dot(eye), -back.dot(eye), 1.0],
            ],
        }
    }

    /// Returns the orthographic projection of the box `width` by `height`
    /// around the axis, with the depth from `near` to `far` mapped to the
    /// range zero to one of WebGPU.
    #[must_use]
    pub fn orthographic(width: f32, height: f32, near: f32, far: f32) -> Self {
        let mut m = Self::IDENTITY;
        m.cols[0][0] = 2.0 / width;
        m.cols[1][1] = 2.0 / height;
        m.cols[2][2] = -1.0 / (far - near);
        m.cols[3][2] = -near / (far - near);
        m
    }

    /// Returns the perspective projection of the vertical field `fov_y` in
    /// radians, with the depth from `near` to `far` mapped to zero to one.
    #[must_use]
    pub fn perspective(fov_y: f32, aspect: f32, near: f32, far: f32) -> Self {
        let f = 1.0 / (fov_y * 0.5).tan();
        Self {
            cols: [
                [f / aspect, 0.0, 0.0, 0.0],
                [0.0, f, 0.0, 0.0],
                [0.0, 0.0, far / (near - far), -1.0],
                [0.0, 0.0, near * far / (near - far), 0.0],
            ],
        }
    }
}
