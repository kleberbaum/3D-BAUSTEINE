// SPDX-License-Identifier: GPL-2.0-only
/*
 * bausteine-core scene: the items of a scene and the tree of their groups.
 */

//! The items of a scene and the tree of their groups.
//!
//! Version 1.3 keeps the objects in one array, `obj()` of `Module1.bas`, in
//! which a group of the CSG is a pair of a beginning and a `CSG-Ende`. A
//! [`Scene`] keeps a flat list as well, but every item names its group by
//! its index, so the tree is explicit and no item can close the wrong group.

use crate::{
    body::{
        Body,
        Kind,
        Operation, //
    },
    math::{
        Mat4,
        Vec3, //
    },
    texture::{
        self,
        Material, //
    },
};

/// How deep groups may nest, which also ends a walk up a broken chain.
pub const MAX_DEPTH: usize = 16;

/// An item of a scene: a body or a group of the CSG.
#[derive(Clone, Debug, PartialEq)]
pub struct Item {
    /// The name the object list shows.
    pub name: String,
    /// What the item is.
    pub kind: Kind,
    /// The index of the group the item belongs to, or `None` at the top.
    pub parent: Option<usize>,
    /// The anchor of the body, see [`Body::anchor`], or the move of a group.
    pub position: Vec3,
    /// The dimensions of the body, see [`Body::scale`], or the scaling of a group.
    pub size: Vec3,
    /// The turns about the x, y and z axes in degrees.
    pub rotation: Vec3,
    /// The colour, red, green and blue from zero to one.
    pub color: [f32; 3],
    /// The index of the texture in [`texture::TEXTURES`], which wins over the colour.
    pub texture: Option<usize>,
    /// The radius of the hole of a disc.
    pub inner_radius: f32,
    /// The index of the [`Operation::Declare`] group an instance places.
    pub source: Option<usize>,
}

impl Item {
    /// Returns an item of `kind` at the origin with the dimensions one.
    #[must_use]
    pub fn new(kind: Kind) -> Self {
        Self {
            name: String::from(kind.label()),
            kind,
            parent: None,
            position: Vec3::ZERO,
            size: Vec3::ONE,
            rotation: Vec3::ZERO,
            color: [0.85, 0.85, 0.85],
            texture: None,
            inner_radius: 0.0,
            source: None,
        }
    }

    /// Returns the item placed at `position` with the dimensions `size`.
    #[must_use]
    pub fn at(mut self, position: Vec3, size: Vec3) -> Self {
        self.position = position;
        self.size = size;
        self
    }

    /// Returns the item with the colour `color` given as `0xRRGGBB`.
    #[must_use]
    pub fn colored(mut self, color: u32) -> Self {
        self.color = rgb(color);
        self
    }

    /// Returns the item turned by `rotation` degrees about the three axes.
    #[must_use]
    pub fn turned(mut self, rotation: Vec3) -> Self {
        self.rotation = rotation;
        self
    }

    /// Returns the item with the texture named `name`, where the table holds it.
    #[must_use]
    pub fn textured(mut self, name: &str) -> Self {
        self.texture = texture::find(name);
        self
    }

    /// Returns the item in the group of index `parent`.
    #[must_use]
    pub fn within(mut self, parent: usize) -> Self {
        self.parent = Some(parent);
        self
    }

    /// Returns the item named `name`.
    #[must_use]
    pub fn named(mut self, name: &str) -> Self {
        self.name = String::from(name);
        self
    }

    /// Returns the scaling of the unit body, or the size of a group or an instance.
    #[must_use]
    pub fn scaling(&self) -> Vec3 {
        match self.kind {
            Kind::Body(body) => body.scale(self.size),
            Kind::Group(_) | Kind::Instance => self.size,
        }
    }

    /// Returns the matrix of the item in the coordinates of its group,
    /// `FillTM` of `M2.bas`: translation · rotation x · rotation y ·
    /// rotation z · scaling.
    #[must_use]
    pub fn local_matrix(&self) -> Mat4 {
        let rotation = Mat4::rotation_x(self.rotation.x)
            .mul(&Mat4::rotation_y(self.rotation.y))
            .mul(&Mat4::rotation_z(self.rotation.z));
        Mat4::translation(self.position)
            .mul(&rotation)
            .mul(&Mat4::scaling(self.scaling()))
    }

    /// Returns the material the ray tracer shades the item with.
    #[must_use]
    pub fn material(&self) -> Material {
        match self.texture.and_then(|i| texture::TEXTURES.get(i)) {
            Some(texture) => texture.material,
            None => texture::plain(self.color),
        }
    }

    /// Returns the inner radius of a disc relative to its radius, from zero to one.
    #[must_use]
    pub fn hole(&self) -> f32 {
        if self.size.x.abs() > f32::EPSILON {
            (self.inner_radius / self.size.x).clamp(0.0, 0.99)
        } else {
            0.0
        }
    }
}

/// Returns the colour of `0xRRGGBB` as three components from zero to one.
#[must_use]
pub fn rgb(color: u32) -> [f32; 3] {
    let channel = |shift: u32| ((color >> shift) & 0xff) as f32 / 255.0;
    [channel(16), channel(8), channel(0)]
}

/// How an item takes part in the solid the scene shows.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role {
    /// The item adds material.
    Solid,
    /// The item takes material away, a later child of a difference.
    Cutter,
}

/// A scene: a list of items, whose groups name their children by index.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Scene {
    /// The items, in the order of the object list.
    pub items: Vec<Item>,
}

impl Scene {
    /// Returns an empty scene.
    #[must_use]
    pub const fn new() -> Self {
        Self { items: Vec::new() }
    }

    /// Appends `item` and returns its index.
    pub fn push(&mut self, item: Item) -> usize {
        self.items.push(item);
        self.items.len() - 1
    }

    /// Returns the indices of the children of the group `parent`, or of the
    /// top level for `None`, in their order.
    pub fn children(&self, parent: Option<usize>) -> impl Iterator<Item = usize> + '_ {
        self.items
            .iter()
            .enumerate()
            .filter(move |(_, item)| item.parent == parent)
            .map(|(i, _)| i)
    }

    /// Returns the group of the item `index` where it names a valid one.
    #[must_use]
    pub fn parent_of(&self, index: usize) -> Option<usize> {
        let parent = self.items.get(index)?.parent?;
        match self.items.get(parent)?.kind {
            Kind::Group(_) if parent != index => Some(parent),
            _ => None,
        }
    }

    /// Returns the matrix that takes the unit body of the item `index` into
    /// the scene, the product of the matrices of its groups and its own.
    #[must_use]
    pub fn world_matrix(&self, index: usize) -> Mat4 {
        let Some(item) = self.items.get(index) else {
            return Mat4::IDENTITY;
        };
        let mut matrix = item.local_matrix();
        let mut current = index;
        for _ in 0..MAX_DEPTH {
            let Some(parent) = self.parent_of(current) else {
                break;
            };
            matrix = self.items[parent].local_matrix().mul(&matrix);
            current = parent;
        }
        matrix
    }

    /// Returns how many groups hold the item `index`.
    #[must_use]
    pub fn depth(&self, index: usize) -> usize {
        let mut depth = 0;
        let mut current = index;
        while let Some(parent) = self.parent_of(current) {
            depth += 1;
            current = parent;
            if depth >= MAX_DEPTH {
                break;
            }
        }
        depth
    }

    /// Returns whether the item `index` adds material or cuts it away.
    ///
    /// An item cuts where it, or a group above it, is a later child of a
    /// difference.
    #[must_use]
    pub fn role(&self, index: usize) -> Role {
        let mut current = index;
        for _ in 0..MAX_DEPTH {
            let Some(parent) = self.parent_of(current) else {
                break;
            };
            if self.items[parent].kind == Kind::Group(Operation::Difference)
                && self.children(Some(parent)).next() != Some(current)
            {
                return Role::Cutter;
            }
            current = parent;
        }
        Role::Solid
    }

    /// Clears every link to a group that is no group, that lies deeper than
    /// [`MAX_DEPTH`] or that closes a cycle, so every walk of the tree ends,
    /// and every source of an instance that names no declaration.
    pub fn repair(&mut self) {
        for index in 0..self.items.len() {
            let valid = self.items[index].source.is_some_and(|s| {
                self.items.get(s).map(|item| item.kind) == Some(Kind::Group(Operation::Declare))
            });
            if !valid || self.items[index].kind != Kind::Instance {
                self.items[index].source = None;
            }
        }
        for index in 0..self.items.len() {
            if self.parent_of(index).is_none() {
                self.items[index].parent = None;
                continue;
            }
            let mut current = index;
            let mut steps = 0;
            while let Some(parent) = self.parent_of(current) {
                steps += 1;
                if parent == index || steps > MAX_DEPTH {
                    self.items[index].parent = None;
                    break;
                }
                current = parent;
            }
        }
    }

    /// Returns the [`Operation::Declare`] group the instance `index` places,
    /// where it names a valid one that does not hold the instance itself.
    #[must_use]
    pub fn source_of(&self, index: usize) -> Option<usize> {
        let item = self.items.get(index)?;
        if item.kind != Kind::Instance {
            return None;
        }
        let source = item.source?;
        if self.items.get(source)?.kind != Kind::Group(Operation::Declare) {
            return None;
        }
        let mut current = index;
        for _ in 0..MAX_DEPTH {
            match self.parent_of(current) {
                Some(parent) if parent == source => return None,
                Some(parent) => current = parent,
                None => break,
            }
        }
        Some(source)
    }

    /// Returns the scene with every instance replaced by a union of copies
    /// of the children of the group it places, with the index in `self` that
    /// each item of the result stands for.
    ///
    /// The group of a declaration renders where it stands, as `Neu Ende` of
    /// version 1.3 places the new body once, and each instance places it
    /// again with its own transformation. Instances inside a declaration
    /// expand as deep as [`MAX_DEPTH`], so a declaration that places itself
    /// ends.
    #[must_use]
    pub fn expanded(&self) -> Expanded {
        let mut out = Expanded {
            scene: self.clone(),
            origin: (0..self.items.len()).collect(),
        };
        let mut queue: Vec<(usize, usize, usize)> = (0..self.items.len())
            .filter_map(|i| self.source_of(i).map(|s| (i, s, 0)))
            .collect();
        let mut at = 0;
        while at < queue.len() {
            let (instance, source, depth) = queue[at];
            at += 1;
            out.scene.items[instance].kind = Kind::Group(Operation::Union);
            if depth >= MAX_DEPTH {
                continue;
            }
            let origin = out.origin[instance];
            let mut stack: Vec<(usize, usize)> = self
                .children(Some(source))
                .map(|child| (child, instance))
                .collect();
            stack.reverse();
            while let Some((child, parent)) = stack.pop() {
                let mut copy = self.items[child].clone();
                copy.parent = Some(parent);
                if copy.texture.is_none() && parent == instance {
                    copy.texture = out.scene.items[instance].texture;
                }
                let index = out.scene.push(copy);
                out.origin.push(origin);
                if let Some(next) = self.source_of(child) {
                    queue.push((index, next, depth + 1));
                    continue;
                }
                let mut children: Vec<usize> = self.children(Some(child)).collect();
                children.reverse();
                stack.extend(children.into_iter().map(|c| (c, index)));
            }
        }
        out
    }

    /// Returns the bodies of the scene with the index of their item.
    pub fn bodies(&self) -> impl Iterator<Item = (usize, Body)> + '_ {
        self.items
            .iter()
            .enumerate()
            .filter_map(|(i, item)| match item.kind {
                Kind::Body(body) => Some((i, body)),
                Kind::Group(_) | Kind::Instance => None,
            })
    }
}

/// A scene whose instances are expanded, see [`Scene::expanded`].
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Expanded {
    /// The scene with copies in place of the instances.
    pub scene: Scene,
    /// For each item of [`Expanded::scene`], the index of the item in the
    /// original scene it stands for, the instance for a copy.
    pub origin: Vec<usize>,
}
