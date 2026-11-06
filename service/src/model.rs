// SPDX-License-Identifier: GPL-2.0-only
/*
 * bausteine model: the types of the GraphQL API and the store of the scenes.
 */

//! The types of the GraphQL API and the store of the scenes.

use std::sync::{
    LazyLock, Mutex, MutexGuard, PoisonError,
    atomic::{AtomicU64, Ordering},
};

use aosabi::prelude::*;
use bausteine_core::{body, examples, math, pov, scene, texture};

/// The most scenes the service keeps, the oldest goes first.
const MAX_SCENES: usize = 256;
/// The most items a scene holds.
pub const MAX_ITEMS: usize = 512;
/// The largest coordinate, dimension or angle an item takes.
const MAX_VALUE: f64 = 10_000.0;

/// A point or a vector in the coordinates of the GZ lesson: x towards the
/// viewer of the front view, y to the right and z up.
#[derive(Clone, Copy, PartialEq)]
pub struct Vector {
    /// The x coordinate.
    pub x: f64,
    /// The y coordinate.
    pub y: f64,
    /// The z coordinate.
    pub z: f64,
}

/// What an item of a scene is, a basic body or a group of the CSG.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    /// A sphere, its position the centre, its size x the radius.
    Sphere,
    /// A cone, its position the centre of its base, its size x the radius and z the height.
    Cone,
    /// A cylinder, its position the centre of its base, its size x the radius and z the height.
    Cylinder,
    /// A cube, its position the corner at the back, left and bottom, its size x the edge.
    Cube,
    /// A cuboid, its position the corner at the back, left and bottom, its size the edges.
    Cuboid,
    /// A square pyramid, its position the corner of its base, its size the base and the height.
    Pyramid,
    /// A three sided prism, its position the corner of its base, its size the base and the height.
    Prism,
    /// A disc in the plane of x and y, its size x the radius, with a hole of the inner radius.
    Disc,
    /// A group that unites its children.
    Union,
    /// A group that takes every later child away from the first.
    Difference,
    /// A group of what all its children have in common.
    Intersection,
    /// A group that unites its children without their inner surfaces.
    Merge,
    /// A group that defines a new body under its name, `#Neu` of version 1.3,
    /// and places it once where it stands.
    Declare,
    /// A new placement of the body of a declaration, with its own position,
    /// size and turns.
    Instance,
}

impl Kind {
    /// Every kind, in the order of the body bar.
    pub const ALL: [Self; 14] = [
        Self::Sphere,
        Self::Cone,
        Self::Cylinder,
        Self::Cube,
        Self::Cuboid,
        Self::Pyramid,
        Self::Prism,
        Self::Disc,
        Self::Union,
        Self::Difference,
        Self::Intersection,
        Self::Merge,
        Self::Declare,
        Self::Instance,
    ];
}

/// Returns which family `kind` belongs to: 1 for a body, 2 for a group of
/// the CSG, 0 for a declaration or an instance, which keep their kind.
pub fn kind_family(kind: Kind) -> u8 {
    match kind {
        Kind::Sphere
        | Kind::Cone
        | Kind::Cylinder
        | Kind::Cube
        | Kind::Cuboid
        | Kind::Pyramid
        | Kind::Prism
        | Kind::Disc => 1,
        Kind::Union | Kind::Difference | Kind::Intersection | Kind::Merge => 2,
        Kind::Declare | Kind::Instance => 0,
    }
}

/// Returns the kind of the geometry crate for `kind`.
pub fn geometry_kind(kind: Kind) -> body::Kind {
    use body::{Body, Kind as K, Operation};
    match kind {
        Kind::Sphere => K::Body(Body::Sphere),
        Kind::Cone => K::Body(Body::Cone),
        Kind::Cylinder => K::Body(Body::Cylinder),
        Kind::Cube => K::Body(Body::Cube),
        Kind::Cuboid => K::Body(Body::Cuboid),
        Kind::Pyramid => K::Body(Body::Pyramid),
        Kind::Prism => K::Body(Body::Prism),
        Kind::Disc => K::Body(Body::Disc),
        Kind::Union => K::Group(Operation::Union),
        Kind::Difference => K::Group(Operation::Difference),
        Kind::Intersection => K::Group(Operation::Intersection),
        Kind::Merge => K::Group(Operation::Merge),
        Kind::Declare => K::Group(Operation::Declare),
        Kind::Instance => K::Instance,
    }
}

/// Returns the kind of the API for a kind of the geometry crate.
fn api_kind(kind: body::Kind) -> Kind {
    Kind::ALL
        .into_iter()
        .find(|k| geometry_kind(*k) == kind)
        .unwrap_or(Kind::Union)
}

/// A kind with what the interface says about it.
pub struct KindInfo {
    /// The kind.
    pub kind: Kind,
    /// The German name of the kind.
    pub label: String,
    /// What the position of a body names, empty for a group.
    pub anchor: String,
    /// Whether the kind is a group of the CSG.
    pub group: bool,
    /// The type code of version 1.3 of the program.
    pub code: i32,
}

/// An item of a scene, a body or a group of the CSG.
#[derive(Clone)]
pub struct Item {
    /// The id of the item in its scene.
    pub id: ID,
    /// The name the object list shows.
    pub name: String,
    /// What the item is.
    pub kind: Kind,
    /// The id of the group the item belongs to, null at the top.
    pub parent: Option<ID>,
    /// The anchor of a body, or the move of a group.
    pub position: Vector,
    /// The dimensions of a body, or the scaling of a group.
    pub size: Vector,
    /// The turns about the x, y and z axes in degrees, z first.
    pub rotation: Vector,
    /// The colour as #rrggbb.
    pub color: String,
    /// The name of a standard texture of POV-Ray, which wins over the colour.
    pub texture: Option<String>,
    /// The radius of the hole of a disc.
    pub inner_radius: f64,
    /// The id of the declaration an instance places.
    pub source: Option<ID>,
}

/// A scene of a class: its items in the order of the object list.
#[derive(Clone)]
pub struct Scene {
    /// The id of the scene, which the address of the page carries.
    pub id: ID,
    /// The name of the scene.
    pub name: String,
    /// The count of the changes, which grows by one with each.
    pub revision: i32,
    /// The items, every group before its children.
    pub items: Vec<Item>,
}

impl Scene {
    /// The scene file of POV-Ray 3 for the scene, seen from `eye` towards
    /// `target`, by default from the camera of version 1.3.
    /// @param eye The position of the camera.
    /// @param target The point the camera looks at.
    /// @param classic Whether the head takes the layout of version 1.3.
    /// @param date The date of the head, as the page formats it.
    /// @param time The time of the head, as the page formats it.
    pub fn pov(
        &self,
        eye: Option<Point>,
        target: Option<Point>,
        classic: Option<bool>,
        date: Option<String>,
        time: Option<String>,
    ) -> String {
        let mut shot = pov::Shot::default();
        if let Some(eye) = eye {
            shot.eye = eye.vector();
        }
        if let Some(target) = target {
            shot.target = target.vector();
        }
        let head = pov::Header {
            classic: classic.unwrap_or(false),
            date: date.as_deref(),
            time: time.as_deref(),
        };
        pov::export_with(&geometry(self), &shot, &head)
    }

    /// The lines of the list OBJEKTE of version 1.3 for the scene.
    pub fn list(&self) -> Vec<ListLine> {
        object_list(self)
    }
}

/// One line of the list OBJEKTE, as `CB2_ADD` of version 1.3 writes it.
pub struct ListLine {
    /// The text of the line: its number, two blanks for each level of the
    /// CSG, a blank, the marks of the open groups and the name.
    pub text: String,
    /// The id of the item of the line, null for the raster, the group for
    /// the line that ends it.
    pub item: Option<ID>,
    /// Whether the line ends a group, `CSG-Ende`, or a declaration.
    pub end: bool,
}

/// Returns the lines of the list OBJEKTE for `scene`.
///
/// Version 1.3 keeps its objects in one flat array and writes a line for
/// each: an opener of the CSG at the level it stands, its members two
/// blanks deeper behind the mark of the opener, `°` for a union, `-` for a
/// difference, `^` for an intersection and `+` for a merge, and the line
/// `CSG-Ende` back at the level of the opener. `#Neu` takes no mark and no
/// level, and the end of a declaration is a line with its name. The tree
/// of 2.0 writes the same lines, with the line `0 Raster` first.
pub fn object_list(scene: &Scene) -> Vec<ListLine> {
    let mut lines = vec![ListLine {
        text: String::from("0 Raster"),
        item: None,
        end: false,
    }];
    list_level(scene, None, 0, "", &mut lines, 0);
    lines
}

/// Appends the lines of the members of `parent` at the level `depth` with
/// the marks `marks` to `lines`.
fn list_level(
    scene: &Scene,
    parent: Option<&ID>,
    depth: usize,
    marks: &str,
    lines: &mut Vec<ListLine>,
    nesting: usize,
) {
    if nesting > scene::MAX_DEPTH {
        return;
    }
    let members = scene
        .items
        .iter()
        .filter(|item| item.parent.as_ref() == parent);
    for item in members {
        let number = lines.len();
        let indent = " ".repeat(depth * 2);
        let mark = match item.kind {
            Kind::Union => Some('°'),
            Kind::Difference => Some('-'),
            Kind::Intersection => Some('^'),
            Kind::Merge => Some('+'),
            _ => None,
        };
        let name = match item.kind {
            Kind::Declare => format!("#Neu {}", item.name),
            _ => item.name.clone(),
        };
        lines.push(ListLine {
            text: format!("{number}{indent} {marks}{name}"),
            item: Some(item.id.clone()),
            end: false,
        });
        match (item.kind, mark) {
            (_, Some(mark)) => {
                let inner = format!("{marks}{mark}");
                list_level(scene, Some(&item.id), depth + 1, &inner, lines, nesting + 1);
                let number = lines.len();
                lines.push(ListLine {
                    text: format!("{number}{indent} {marks}CSG-Ende"),
                    item: Some(item.id.clone()),
                    end: true,
                });
            }
            (Kind::Declare, None) => {
                list_level(scene, Some(&item.id), depth, marks, lines, nesting + 1);
                let number = lines.len();
                lines.push(ListLine {
                    text: format!("{number}{indent} {marks}{}", item.name),
                    item: Some(item.id.clone()),
                    end: true,
                });
            }
            _ => {}
        }
    }
}

/// A standard texture of POV-Ray.
pub struct Texture {
    /// The name in the include files of POV-Ray.
    pub name: String,
    /// The German name of its group.
    pub group: String,
}

/// An example scene a class starts from.
pub struct Example {
    /// The key that `createScene` takes.
    pub key: String,
    /// The German title.
    pub title: String,
}

/// A point a client sends.
pub struct Point {
    /// The x coordinate.
    pub x: f64,
    /// The y coordinate.
    pub y: f64,
    /// The z coordinate.
    pub z: f64,
}

impl Point {
    /// The point as a vector of the geometry crate.
    fn vector(&self) -> math::Vec3 {
        math::Vec3::new(self.x as f32, self.y as f32, self.z as f32)
    }
}

/// An item a client adds, or one of the items that replace a scene.
pub struct NewItem {
    /// The id of the item, kept where the scene holds no item of that id
    /// yet, which is how an undo restores a scene with its ids.
    pub id: Option<ID>,
    /// The name, by default the German name of the kind.
    pub name: Option<String>,
    /// What the item is.
    pub kind: Kind,
    /// The id of the group the item belongs to.
    pub parent: Option<ID>,
    /// The anchor of a body, or the move of a group, by default the origin.
    pub position: Option<Point>,
    /// The dimensions, by default one in every direction.
    pub size: Option<Point>,
    /// The turns in degrees, by default none.
    pub rotation: Option<Point>,
    /// The colour as #rrggbb, by default a light grey.
    pub color: Option<String>,
    /// The name of a standard texture.
    pub texture: Option<String>,
    /// The radius of the hole of a disc.
    pub inner_radius: Option<f64>,
    /// The id of the declaration an instance places.
    pub source: Option<ID>,
}

/// The changes to an item, where a missing field keeps its value.
pub struct ItemPatch {
    /// The new name.
    pub name: Option<String>,
    /// The new kind: a body becomes another body, a group of the CSG another
    /// group, as the button Ändern of version 1.3 runs the procedure of the
    /// body CB1 names over the selected object.
    pub kind: Option<Kind>,
    /// The new position.
    pub position: Option<Point>,
    /// The new dimensions.
    pub size: Option<Point>,
    /// The new turns.
    pub rotation: Option<Point>,
    /// The new colour as #rrggbb.
    pub color: Option<String>,
    /// The new texture, where an empty name removes it.
    pub texture: Option<String>,
    /// The new radius of the hole of a disc.
    pub inner_radius: Option<f64>,
    /// The id of the new group, where an empty id moves the item to the top.
    pub parent: Option<ID>,
    /// The id of the declaration an instance places from now on.
    pub source: Option<ID>,
}

/// The scenes the service keeps, the newest last.
static SCENES: LazyLock<Mutex<Vec<Scene>>> = LazyLock::new(|| Mutex::new(Vec::new()));
/// The counter the ids of scenes and items are taken from.
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

/// Returns the scenes, locked for the caller.
pub fn scenes() -> MutexGuard<'static, Vec<Scene>> {
    SCENES.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Returns a fresh id.
pub fn next_id() -> ID {
    ID::from(NEXT_ID.fetch_add(1, Ordering::Relaxed).to_string())
}

/// Adds `scene` to the store and drops the oldest scene beyond the limit.
pub fn keep(scene: Scene) -> Scene {
    let mut all = scenes();
    all.push(scene.clone());
    let extra = all.len().saturating_sub(MAX_SCENES);
    all.drain(..extra);
    scene
}

/// Returns the error of a request a client cannot have meant.
pub fn bad_input(message: &str, field: &str) -> Error {
    ServiceError::msg(message)
        .code("BAD_USER_INPUT")
        .status(400)
        .details(json::Map::from([("field", field)]))
        .into()
}

/// Returns the error of a scene the service does not keep.
pub fn no_scene(id: &ID) -> Error {
    ServiceError::msg("Diese Szene gibt es nicht")
        .code("SCENE_NOT_FOUND")
        .status(404)
        .details(json::Map::from([("id", id.0.as_str())]))
        .into()
}

/// Returns the vector of `point`, checked to be finite and in range.
pub fn checked(point: &Point, field: &str) -> Result<Vector> {
    let values = [point.x, point.y, point.z];
    if values.iter().any(|v| !v.is_finite() || v.abs() > MAX_VALUE) {
        return Err(bad_input("Eine Zahl ist zu groß oder keine Zahl", field));
    }
    Ok(Vector {
        x: point.x,
        y: point.y,
        z: point.z,
    })
}

/// Returns `color` when it is a colour of the form #rrggbb.
pub fn checked_color(color: &str) -> Result<String> {
    let valid = color.len() == 7
        && color.starts_with('#')
        && color[1..].chars().all(|c| c.is_ascii_hexdigit());
    if valid {
        Ok(color.to_ascii_lowercase())
    } else {
        Err(bad_input("Eine Farbe hat die Form #rrggbb", "color"))
    }
}

/// Returns `texture` when it names a standard texture, `None` for an empty name.
pub fn checked_texture(texture: &str) -> Result<Option<String>> {
    if texture.is_empty() {
        return Ok(None);
    }
    match texture::find(texture) {
        Some(_) => Ok(Some(String::from(texture))),
        None => Err(bad_input("Diese Textur gibt es nicht", "texture")),
    }
}

/// Returns `name` trimmed and cut to 60 characters.
pub fn checked_name(name: &str) -> String {
    name.trim().chars().take(60).collect()
}

/// Returns the scene of the geometry crate for `source`.
pub fn geometry(source: &Scene) -> scene::Scene {
    let index_of = |id: &ID| source.items.iter().position(|item| item.id == *id);
    let mut out = scene::Scene::new();
    for item in &source.items {
        let v = |v: Vector| math::Vec3::new(v.x as f32, v.y as f32, v.z as f32);
        out.items.push(scene::Item {
            name: item.name.clone(),
            kind: geometry_kind(item.kind),
            parent: item.parent.as_ref().and_then(index_of),
            position: v(item.position),
            size: v(item.size),
            rotation: v(item.rotation),
            color: parse_color(&item.color),
            texture: item.texture.as_deref().and_then(texture::find),
            inner_radius: item.inner_radius as f32,
            source: item.source.as_ref().and_then(index_of),
        });
    }
    out.repair();
    out
}

/// Returns the scene named `name` with the items of a scene of the
/// geometry crate, each with a fresh id.
pub fn from_geometry(name: String, source: &scene::Scene) -> Scene {
    let ids: Vec<ID> = source.items.iter().map(|_| next_id()).collect();
    let items = source
        .items
        .iter()
        .zip(&ids)
        .map(|(item, id)| {
            let v = |v: math::Vec3| Vector {
                x: f64::from(v.x),
                y: f64::from(v.y),
                z: f64::from(v.z),
            };
            Item {
                id: id.clone(),
                name: item.name.clone(),
                kind: api_kind(item.kind),
                parent: item.parent.and_then(|p| ids.get(p).cloned()),
                position: v(item.position),
                size: v(item.size),
                rotation: v(item.rotation),
                color: format_color(item.color),
                texture: item
                    .texture
                    .and_then(|t| texture::TEXTURES.get(t))
                    .map(|t| String::from(t.name)),
                inner_radius: f64::from(item.inner_radius),
                source: item.source.and_then(|s| ids.get(s).cloned()),
            }
        })
        .collect();
    Scene {
        id: next_id(),
        name,
        revision: 0,
        items,
    }
}

/// Returns the ids of the item `id` of `scene` and of every item in its groups below.
pub fn subtree(scene: &Scene, id: &ID) -> Vec<ID> {
    let mut out = vec![id.clone()];
    let mut i = 0;
    while i < out.len() {
        let current = out[i].clone();
        for item in &scene.items {
            if item.parent.as_ref() == Some(&current) && !out.contains(&item.id) {
                out.push(item.id.clone());
            }
        }
        i += 1;
    }
    out
}

/// Returns whether `parent` may hold the item `id`: it is a group of
/// `scene` and does not lie below the item.
pub fn can_hold(scene: &Scene, parent: &ID, id: Option<&ID>) -> bool {
    let is_group = scene
        .items
        .iter()
        .any(|item| item.id == *parent && matches!(geometry_kind(item.kind), body::Kind::Group(_)));
    let below = id.is_some_and(|id| subtree(scene, id).contains(parent));
    is_group && !below
}

/// Puts the items of every group of `scene` after their group, keeping
/// their order otherwise, so the list reads as the object list of version 1.3.
pub fn order(scene: &mut Scene) {
    let mut ordered: Vec<Item> = Vec::with_capacity(scene.items.len());
    let mut pending: Vec<Item> = std::mem::take(&mut scene.items);
    let mut progress = true;
    while !pending.is_empty() && progress {
        progress = false;
        let mut rest = Vec::new();
        for item in pending {
            let ready = match &item.parent {
                None => true,
                Some(parent) => ordered.iter().any(|placed| placed.id == *parent),
            };
            if ready {
                let at = insertion(&ordered, &item);
                ordered.insert(at, item);
                progress = true;
            } else {
                rest.push(item);
            }
        }
        pending = rest;
    }
    for mut item in pending {
        item.parent = None;
        ordered.push(item);
    }
    scene.items = ordered;
}

/// Returns whether the instance `id`, in the group `parent`, may place the
/// declaration `source` of `scene`: `source` is a declaration, and neither
/// the instance nor its group lies inside it.
pub fn can_place(scene: &Scene, source: &ID, parent: Option<&ID>, id: Option<&ID>) -> bool {
    let is_declaration = scene
        .items
        .iter()
        .any(|item| item.id == *source && item.kind == Kind::Declare);
    let inside = subtree(scene, source);
    let below =
        parent.is_some_and(|p| inside.contains(p)) || id.is_some_and(|i| inside.contains(i));
    is_declaration && !below
}

/// Returns where `item` goes in `ordered`: after its group and the items
/// already below that group, or at the end for an item at the top.
fn insertion(ordered: &[Item], item: &Item) -> usize {
    let Some(parent) = &item.parent else {
        return ordered.len();
    };
    let Some(start) = ordered.iter().position(|placed| placed.id == *parent) else {
        return ordered.len();
    };
    let mut below = vec![parent.clone()];
    let mut at = start + 1;
    while at < ordered.len() {
        match &ordered[at].parent {
            Some(p) if below.contains(p) => {
                below.push(ordered[at].id.clone());
                at += 1;
            }
            _ => break,
        }
    }
    at
}

/// Returns the colour #rrggbb as three components from zero to one.
fn parse_color(color: &str) -> [f32; 3] {
    let value = color
        .strip_prefix('#')
        .and_then(|hex| u32::from_str_radix(hex, 16).ok())
        .unwrap_or(0x00d9_d9d9);
    scene::rgb(value)
}

/// Returns three components from zero to one as #rrggbb.
fn format_color(color: [f32; 3]) -> String {
    let [r, g, b] = color.map(|c| (c.clamp(0.0, 1.0) * 255.0).round() as u8);
    format!("#{r:02x}{g:02x}{b:02x}")
}

/// Returns the examples of the geometry crate.
pub fn example_list() -> Vec<Example> {
    examples::EXAMPLES
        .iter()
        .map(|(key, title)| Example {
            key: String::from(*key),
            title: String::from(*title),
        })
        .collect()
}
