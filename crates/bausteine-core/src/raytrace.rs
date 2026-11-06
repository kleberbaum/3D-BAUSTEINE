// SPDX-License-Identifier: GPL-2.0-only
/*
 * bausteine-core raytrace: the program of the ray tracer that runs on the GPU.
 */

//! The program of the ray tracer that runs on the GPU.
//!
//! Version 1.3 hands the scene to POV-Ray, which runs as a program of its
//! own. The renderer in the browser traces the scene itself, in a shader,
//! by sphere tracing distance functions, which section 5.2.5 of the thesis
//! calls the implicit representation of a body. A distance function makes
//! the operations of the CSG one line each: the union is the minimum, the
//! intersection the maximum and the difference the maximum with the negated
//! distance of the cutter.
//!
//! [`program`] writes the tree of the scene in postfix order, [`NODE_STRIDE`]
//! values per node: each body pushes its distance onto a stack, and each
//! operation combines the two topmost entries. The operations are binary, so
//! a group of many children takes as many stack entries as it nests deep.

use crate::{
    body::Kind,
    math::Vec3,
    scene::{
        MAX_DEPTH,
        Scene, //
    },
    texture::{
        Material,
        TEXTURES, //
    },
};

/// The values of a node of the program.
pub const NODE_STRIDE: usize = 32;
/// The most nodes a program holds, which bounds the work of the shader.
pub const MAX_NODES: usize = 512;
/// The code of a node that stands for nothing, an empty group.
pub const EMPTY: u32 = 0;

/// Returns the program of `scene` and the number of its nodes.
///
/// The top level is a union of every item that belongs to no group. A
/// selected item, `selected`, carries a mark that the shader outlines.
#[must_use]
pub fn program(scene: &Scene, selected: Option<usize>) -> (Vec<f32>, usize) {
    let expanded = scene.expanded();
    let mut writer = Writer {
        scene: &expanded.scene,
        origin: &expanded.origin,
        selected,
        out: Vec::new(),
        count: 0,
    };
    let roots: Vec<usize> = expanded.scene.children(None).collect();
    writer.list(&roots, 101, 0);
    let count = writer.count;
    (writer.out, count)
}

/// The state of one writing of a program.
struct Writer<'a> {
    /// The scene, with its instances expanded.
    scene: &'a Scene,
    /// The item of the original scene each item of the scene stands for.
    origin: &'a [usize],
    /// The selected item.
    selected: Option<usize>,
    /// The nodes written so far.
    out: Vec<f32>,
    /// How many nodes `out` holds.
    count: usize,
}

impl Writer<'_> {
    /// Writes the items of `indices` combined by the operation of code
    /// `code`, or the empty node for no item.
    fn list(&mut self, indices: &[usize], code: u32, depth: usize) {
        let Some((&first, rest)) = indices.split_first() else {
            self.operation(EMPTY);
            return;
        };
        self.item(first, depth);
        for &next in rest {
            self.item(next, depth);
            self.operation(code);
        }
    }

    /// Writes the item `index` and the children of a group.
    fn item(&mut self, index: usize, depth: usize) {
        let item = &self.scene.items[index];
        match item.kind {
            Kind::Body(body) => self.body(index, body.code()),
            Kind::Group(op) if depth < MAX_DEPTH => {
                let children: Vec<usize> = self.scene.children(Some(index)).collect();
                self.list(&children, op.code(), depth + 1);
            }
            Kind::Group(_) | Kind::Instance => self.operation(EMPTY),
        }
    }

    /// Writes a node that combines the two topmost entries of the stack.
    fn operation(&mut self, code: u32) {
        if self.count >= MAX_NODES {
            return;
        }
        let mut node = [0.0f32; NODE_STRIDE];
        node[0] = code as f32;
        self.out.extend_from_slice(&node);
        self.count += 1;
    }

    /// Writes the body of the item `index` with its inverse matrix and material.
    fn body(&mut self, index: usize, code: u32) {
        if self.count >= MAX_NODES {
            return;
        }
        let scene = self.scene;
        let matrix = scene.world_matrix(index);
        let Some(inverse) = matrix.inverse() else {
            self.operation(EMPTY);
            return;
        };
        let item = &scene.items[index];
        let columns = [
            matrix.transform_vector(Vec3::X).length(),
            matrix.transform_vector(Vec3::Y).length(),
            matrix.transform_vector(Vec3::Z).length(),
        ];
        let lipschitz = columns.into_iter().fold(f32::MAX, f32::min).max(1e-4);
        let material = self.material(index);
        let mut node = [0.0f32; NODE_STRIDE];
        node[0] = code as f32;
        node[2] = item.hole();
        node[3] = lipschitz;
        node[4..7].copy_from_slice(&material.base);
        node[7] = material.reflection;
        node[8..11].copy_from_slice(&material.accent);
        node[11] = material.surface.code() as f32;
        node[12..28].copy_from_slice(&inverse.to_array());
        node[28] = if Some(self.origin[index]) == self.selected {
            1.0
        } else {
            0.0
        };
        self.out.extend_from_slice(&node);
        self.count += 1;
    }

    /// Returns the material of the item `index`: its own texture, else the
    /// texture of the nearest textured group, else its colour.
    fn material(&self, index: usize) -> Material {
        let scene = self.scene;
        let mut current = index;
        for _ in 0..=MAX_DEPTH {
            if let Some(texture) = scene.items[current].texture.and_then(|i| TEXTURES.get(i)) {
                return texture.material;
            }
            match scene.parent_of(current) {
                Some(parent) => current = parent,
                None => break,
            }
        }
        scene.items[index].material()
    }
}
