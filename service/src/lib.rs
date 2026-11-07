// SPDX-License-Identifier: GPL-2.0-only
/*
 * bausteine: the service of 3D-Bausteine on Aosabi.
 */

//! The service of 3D-Bausteine: the scenes of a page behind one GraphQL API.
//!
//! Version 1.3 keeps its scene in the memory of one program and writes it
//! out as a POV file. Version 2.0 keeps the scenes in this service, whose
//! plain Rust types are the GraphQL schema that `cargo aosabi build` infers.
//! The page runs the service inside its Web Worker, booted through
//! `aosabi::embed`, and asks it every question over GraphQL. The renderer in
//! the same worker reads the scene it draws through [`snapshot`].

mod model;

use aosabi::prelude::*;
use bausteine_core::{body, examples};

pub use model::{
    Example, Item, ItemPatch, Kind, KindInfo, ListLine, Material, NewItem, Point, Scene, Surface,
    Texture, Vector,
};

use model::{
    MAX_ITEMS, bad_input, can_hold, can_place, checked, checked_color, checked_name,
    checked_texture, example_list, from_geometry, geometry_kind, keep, kind_family, next_id,
    no_scene, order, scenes, subtree, texture_list,
};

/// The queries of 3D-Bausteine.
pub struct Query;

impl Query {
    /// Returns one scene, or null where the service keeps no scene of the id.
    /// @param id The id of the scene.
    pub fn scene(&self, id: ID) -> Option<Scene> {
        scenes().iter().find(|scene| scene.id == id).cloned()
    }

    /// Lists the scenes the service keeps, the newest first.
    pub fn scenes(&self) -> Vec<Scene> {
        scenes().iter().rev().cloned().collect()
    }

    /// Lists the kinds of items, the bodies first and the groups after them.
    pub fn kinds(&self) -> Vec<KindInfo> {
        Kind::ALL
            .into_iter()
            .map(|kind| {
                let geometry = geometry_kind(kind);
                let anchor = match geometry {
                    body::Kind::Body(body) => body.anchor(),
                    body::Kind::Group(_) | body::Kind::Instance => "",
                };
                KindInfo {
                    kind,
                    label: String::from(geometry.label()),
                    anchor: String::from(anchor),
                    group: matches!(geometry, body::Kind::Group(_)),
                    code: geometry.code() as i32,
                }
            })
            .collect()
    }

    /// Lists the standard textures of POV-Ray an item can wear, each with the
    /// material the ray tracer in the browser renders it with.
    pub fn textures(&self) -> Vec<Texture> {
        texture_list()
    }

    /// Lists the example scenes a class starts from.
    pub fn examples(&self) -> Vec<Example> {
        example_list()
    }
}

/// The changes to the scenes of 3D-Bausteine.
pub struct Mutation;

impl Mutation {
    /// Creates a scene, empty or as a copy of an example, and returns it.
    /// @param name The name of the scene.
    /// @param example The key of an example to start from.
    pub fn create_scene(&self, name: Option<String>, example: Option<String>) -> Result<Scene> {
        let name = name
            .as_deref()
            .map(checked_name)
            .filter(|name| !name.is_empty());
        let source = match example.as_deref() {
            None | Some("") => bausteine_core::scene::Scene::new(),
            Some(key) => examples::example(key)
                .ok_or_else(|| bad_input("Dieses Beispiel gibt es nicht", "example"))?,
        };
        let title = example
            .as_deref()
            .and_then(|key| examples::EXAMPLES.iter().find(|(k, _)| *k == key))
            .map_or("Neue Szene", |(_, title)| *title);
        let name = name.unwrap_or_else(|| String::from(title));
        Ok(keep(from_geometry(name, &source)))
    }

    /// Renames a scene and returns it. A name of nothing but blanks is refused.
    /// @param id The id of the scene.
    /// @param name The new name.
    pub fn rename_scene(&self, id: ID, name: String) -> Result<Scene> {
        let name = checked_name(&name);
        change(&id, |scene| {
            if name.is_empty() {
                return Err(bad_input("Eine Szene braucht einen Namen", "name"));
            }
            scene.name = name;
            Ok(())
        })
    }

    /// Deletes a scene and answers whether there was one.
    /// @param id The id of the scene.
    pub fn delete_scene(&self, id: ID) -> bool {
        let mut all = scenes();
        let before = all.len();
        all.retain(|scene| scene.id != id);
        before != all.len()
    }

    /// Adds an item to a scene and returns it with its id.
    ///
    /// The button Einfügen of version 1.3 inserts behind the line of the
    /// list that is selected, so `after` names the item the new one follows
    /// among its siblings, or its group, which it then opens. Without
    /// `after` the item goes last into its group.
    /// @param scene The id of the scene.
    /// @param input The item.
    /// @param after The item the new item follows, or its group.
    pub fn add_item(&self, scene: ID, input: NewItem, after: Option<ID>) -> Result<Item> {
        let mut added = None;
        change(&scene, |target| {
            if target.items.len() >= MAX_ITEMS {
                return Err(bad_input("Die Szene ist voll", "scene"));
            }
            let item = new_item(input, target)?;
            added = Some(item.clone());
            let at = after
                .as_ref()
                .and_then(|after| place_after(target, after, &item.parent));
            match at {
                Some(at) => target.items.insert(at, item),
                None => target.items.push(item),
            }
            Ok(())
        })?;
        added.ok_or_else(|| bad_input("Das Objekt wurde nicht eingefügt", "input"))
    }

    /// Changes an item of a scene and returns it.
    /// @param scene The id of the scene.
    /// @param id The id of the item.
    /// @param input The fields to change.
    pub fn update_item(&self, scene: ID, id: ID, input: ItemPatch) -> Result<Item> {
        let mut changed = None;
        change(&scene, |target| {
            let parent = match input.parent.as_ref() {
                None => None,
                Some(p) if p.0.is_empty() => Some(None),
                Some(p) => Some(Some(p.clone())),
            };
            check_move(target, &id, parent.as_ref(), input.source.as_ref())?;
            let Some(item) = target.items.iter_mut().find(|item| item.id == id) else {
                return Err(bad_input("Dieses Objekt gibt es nicht", "id"));
            };
            patch(item, input)?;
            if let Some(parent) = parent {
                item.parent = parent;
            }
            changed = Some(item.clone());
            Ok(())
        })?;
        changed.ok_or_else(|| bad_input("Dieses Objekt gibt es nicht", "id"))
    }

    /// Moves an item with everything in its groups behind another item of
    /// the same group, or to the front of its group, and returns the scene.
    ///
    /// The order of the members of a group is part of its meaning, since a
    /// difference keeps its first member and takes the later ones away.
    /// @param scene The id of the scene.
    /// @param id The id of the item.
    /// @param after The member of the same group the item follows, or null for the front.
    pub fn move_item(&self, scene: ID, id: ID, after: Option<ID>) -> Result<Scene> {
        change(&scene, |target| {
            let Some(item) = target.items.iter().find(|item| item.id == id) else {
                return Err(bad_input("Dieses Objekt gibt es nicht", "id"));
            };
            let parent = item.parent.clone();
            if let Some(after) = &after {
                let sibling = target
                    .items
                    .iter()
                    .any(|other| other.id == *after && other.parent == parent);
                if !sibling || *after == id {
                    return Err(bad_input(
                        "Das Ziel liegt nicht in derselben Gruppe",
                        "after",
                    ));
                }
            }
            let moved = subtree(target, &id);
            let (block, rest): (Vec<Item>, Vec<Item>) = std::mem::take(&mut target.items)
                .into_iter()
                .partition(|item| moved.contains(&item.id));
            target.items = rest;
            let at = match &after {
                Some(after) => place_after(target, after, &parent),
                None => Some(front_of(target, parent.as_ref())),
            };
            let at = at.unwrap_or(target.items.len());
            target.items.splice(at..at, block);
            Ok(())
        })
    }

    /// Removes an item with everything in its groups and returns the scene.
    /// An id the scene does not hold is refused and counts no change.
    /// @param scene The id of the scene.
    /// @param id The id of the item.
    pub fn remove_item(&self, scene: ID, id: ID) -> Result<Scene> {
        change(&scene, |target| {
            if !target.items.iter().any(|item| item.id == id) {
                return Err(bad_input("Dieses Objekt gibt es nicht", "id"));
            }
            let gone = subtree(target, &id);
            target.items.retain(|item| !gone.contains(&item.id));
            Ok(())
        })
    }

    /// Replaces every item of a scene, for an undo or an import, and returns the scene.
    /// @param scene The id of the scene.
    /// @param items The items, every group before its children.
    pub fn replace_items(&self, scene: ID, items: Vec<NewItem>) -> Result<Scene> {
        if items.len() > MAX_ITEMS {
            return Err(bad_input("Die Szene ist voll", "items"));
        }
        change(&scene, |target| {
            target.items.clear();
            for input in items {
                let item = new_item(input, target)?;
                target.items.push(item);
            }
            Ok(())
        })
    }
}

/// Runs `edit` on the scene `id`, counts the change and returns the scene after it.
fn change(id: &ID, edit: impl FnOnce(&mut Scene) -> Result<()>) -> Result<Scene> {
    let scene = {
        let mut all = scenes();
        let Some(scene) = all.iter_mut().find(|scene| scene.id == *id) else {
            return Err(no_scene(id));
        };
        edit(scene)?;
        order(scene);
        scene.revision += 1;
        scene.clone()
    };
    Ok(scene)
}

/// Returns the index of `target.items` behind which a new member of
/// `parent` goes that follows `after`: behind `after` and everything in its
/// groups where `after` is a member of `parent`, at the front of `parent`
/// where `after` is `parent` itself, and `None` otherwise.
fn place_after(target: &Scene, after: &ID, parent: &Option<ID>) -> Option<usize> {
    let at = target.items.iter().position(|item| item.id == *after)?;
    if parent.as_ref() == Some(after) {
        return Some(at + 1);
    }
    if target.items[at].parent != *parent {
        return None;
    }
    let inside = subtree(target, after);
    let mut end = at + 1;
    while end < target.items.len() && inside.contains(&target.items[end].id) {
        end += 1;
    }
    Some(end)
}

/// Returns the index of `target.items` where the first member of `parent`
/// goes: behind the group, or at the start for the top.
fn front_of(target: &Scene, parent: Option<&ID>) -> usize {
    parent
        .and_then(|parent| target.items.iter().position(|item| item.id == *parent))
        .map_or(0, |at| at + 1)
}

/// Returns the item of `input` for the scene `target`, with a fresh id
/// unless `input` names one the scene does not hold yet.
fn new_item(input: NewItem, target: &Scene) -> Result<Item> {
    let id = match input.id {
        Some(id) if !id.0.is_empty() && !target.items.iter().any(|item| item.id == id) => id,
        _ => next_id(),
    };
    if let Some(parent) = &input.parent
        && !can_hold(target, parent, None)
    {
        return Err(bad_input("Diese Gruppe gibt es nicht", "parent"));
    }
    let source = match (input.kind, input.source) {
        (Kind::Instance, Some(source))
            if can_place(target, &source, input.parent.as_ref(), None) =>
        {
            Some(source)
        }
        (Kind::Instance, _) => {
            return Err(bad_input(
                "Ein Objekt setzt einen neuen Körper ein, der nicht über ihm liegt",
                "source",
            ));
        }
        _ => None,
    };
    let one = Vector {
        x: 1.0,
        y: 1.0,
        z: 1.0,
    };
    let zero = Vector {
        x: 0.0,
        y: 0.0,
        z: 0.0,
    };
    let name = input
        .name
        .as_deref()
        .map(checked_name)
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| String::from(geometry_kind(input.kind).label()));
    Ok(Item {
        id,
        name,
        kind: input.kind,
        parent: input.parent,
        position: input
            .position
            .map_or(Ok(zero), |p| checked(&p, "position"))?,
        size: input.size.map_or(Ok(one), |p| checked(&p, "size"))?,
        rotation: input
            .rotation
            .map_or(Ok(zero), |p| checked(&p, "rotation"))?,
        color: input
            .color
            .map_or_else(|| Ok(String::from("#d9d9d9")), |c| checked_color(&c))?,
        texture: input.texture.map_or(Ok(None), |t| checked_texture(&t))?,
        inner_radius: checked_radius(input.inner_radius.unwrap_or(0.0))?,
        source,
    })
}

/// Checks that the item `id` of `target` may move into the group `parent`
/// and place the declaration `source`, where a change names them.
///
/// A group never moves into a group below itself, and an instance never
/// lies inside the declaration it places, so neither the tree nor the
/// expansion of the instances closes a cycle.
fn check_move(
    target: &Scene,
    id: &ID,
    parent: Option<&Option<ID>>,
    source: Option<&ID>,
) -> Result<()> {
    let Some(item) = target.items.iter().find(|item| item.id == *id) else {
        return Err(bad_input("Dieses Objekt gibt es nicht", "id"));
    };
    let group = parent.map_or_else(|| item.parent.clone(), Clone::clone);
    if let Some(Some(group)) = parent
        && !can_hold(target, group, Some(id))
    {
        return Err(bad_input(
            "Diese Gruppe kann das Objekt nicht aufnehmen",
            "parent",
        ));
    }
    let placed = source.cloned().or_else(|| item.source.clone());
    if let Some(placed) = placed
        && (item.kind != Kind::Instance || !can_place(target, &placed, group.as_ref(), Some(id)))
    {
        let field = if source.is_some() { "source" } else { "parent" };
        return Err(bad_input(
            "Ein Objekt setzt einen neuen Körper ein, der nicht über ihm liegt",
            field,
        ));
    }
    Ok(())
}

/// Applies the fields of `input` to `item`.
fn patch(item: &mut Item, input: ItemPatch) -> Result<()> {
    if let Some(name) = input.name {
        item.name = checked_name(&name);
    }
    if let Some(kind) = input.kind
        && kind != item.kind
    {
        let family = kind_family(item.kind);
        if family == 0 || family != kind_family(kind) {
            return Err(bad_input(
                "Ein Körper wird nur zu einem Körper, eine Gruppe nur zu einer Gruppe",
                "kind",
            ));
        }
        item.kind = kind;
    }
    if let Some(position) = input.position {
        item.position = checked(&position, "position")?;
    }
    if let Some(size) = input.size {
        item.size = checked(&size, "size")?;
    }
    if let Some(rotation) = input.rotation {
        item.rotation = checked(&rotation, "rotation")?;
    }
    if let Some(color) = input.color {
        item.color = checked_color(&color)?;
    }
    if let Some(texture) = input.texture {
        item.texture = checked_texture(&texture)?;
    }
    if let Some(radius) = input.inner_radius {
        item.inner_radius = checked_radius(radius)?;
    }
    if let Some(source) = input.source {
        item.source = Some(source);
    }
    Ok(())
}

/// Returns `radius` when it is a radius a disc can have.
fn checked_radius(radius: f64) -> Result<f64> {
    if radius.is_finite() && (0.0..=10_000.0).contains(&radius) {
        Ok(radius)
    } else {
        Err(bad_input("Der innere Radius ist ungültig", "innerRadius"))
    }
}

/// Returns the scene `id` as the geometry crate holds it, with its revision
/// and the id of each item in the order of the items, or `None` where the
/// service keeps no such scene.
///
/// The renderer in the Web Worker draws the scene from this, so it never
/// parses a response of the API.
#[must_use]
pub fn snapshot(id: &str) -> Option<(i32, bausteine_core::scene::Scene, Vec<String>)> {
    let all = scenes();
    let scene = all.iter().find(|scene| scene.id.0 == id)?;
    let ids = scene.items.iter().map(|item| item.id.0.clone()).collect();
    Some((scene.revision, model::geometry(scene), ids))
}

/// Returns the app: the roots of the API.
pub fn app() -> impl IntoApp {
    App::new().query(Query).mutation(Mutation)
}
