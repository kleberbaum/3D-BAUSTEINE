// SPDX-License-Identifier: GPL-2.0-only
/*
 * bausteine-core packed: a scene as one array of numbers, for the boundary to JavaScript.
 */

//! A scene as one array of numbers, which crosses the boundary between
//! JavaScript and WebAssembly in one copy.
//!
//! Every item takes [`ITEM_STRIDE`] values: the type code of its kind, the
//! index of its group or -1, its position, its dimensions, its turns, its
//! colour, the inner radius of a disc, the index of its texture or -1, the
//! index of the declaration an instance places or -1, and three values kept
//! free.

use crate::{
    body::Kind,
    math::Vec3,
    scene::{
        Item,
        Scene, //
    },
    texture::TEXTURES,
};

/// The values of one item.
pub const ITEM_STRIDE: usize = 20;

/// Returns the scene of the packed items in `values`.
///
/// An item of an unknown kind becomes an empty union, so the indices of the
/// items after it stay valid, and the tree is repaired before it returns.
#[must_use]
pub fn decode(values: &[f32]) -> Scene {
    let mut scene = Scene::new();
    for chunk in values.chunks_exact(ITEM_STRIDE) {
        let kind =
            Kind::from_code(chunk[0] as u32).unwrap_or(Kind::Group(crate::body::Operation::Union));
        let vector = |at: usize| Vec3::new(chunk[at], chunk[at + 1], chunk[at + 2]);
        let parent = (chunk[1] >= 0.0).then_some(chunk[1] as usize);
        let texture = (chunk[15] >= 0.0)
            .then_some(chunk[15] as usize)
            .filter(|&i| i < TEXTURES.len());
        scene.items.push(Item {
            name: String::from(kind.label()),
            kind,
            parent,
            position: vector(2),
            size: vector(5),
            rotation: vector(8),
            color: [chunk[11], chunk[12], chunk[13]],
            texture,
            inner_radius: chunk[14],
            source: (chunk[16] >= 0.0).then_some(chunk[16] as usize),
        });
    }
    scene.repair();
    scene
}

/// Returns the packed values of `scene`.
#[must_use]
pub fn encode(scene: &Scene) -> Vec<f32> {
    let mut out = Vec::with_capacity(scene.items.len() * ITEM_STRIDE);
    for item in &scene.items {
        out.push(item.kind.code() as f32);
        out.push(item.parent.map_or(-1.0, |p| p as f32));
        out.extend_from_slice(&item.position.to_array());
        out.extend_from_slice(&item.size.to_array());
        out.extend_from_slice(&item.rotation.to_array());
        out.extend_from_slice(&item.color);
        out.push(item.inner_radius);
        out.push(item.texture.map_or(-1.0, |t| t as f32));
        out.push(item.source.map_or(-1.0, |s| s as f32));
        out.extend_from_slice(&[0.0; 3]);
    }
    out
}
