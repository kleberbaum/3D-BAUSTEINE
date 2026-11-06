// SPDX-License-Identifier: GPL-2.0-only
/*
 * bausteine-core examples: the scenes a class starts from.
 */

//! The scenes a class starts from.
//!
//! Version 1.3 ships its examples as finished POV files and shows their
//! images in the slide show. These are the same ideas as scenes that stay
//! editable: every body once, a house cut by the CSG, the work piece of the
//! manual, the textures on spheres as in `kugeln2.pov`, and the roulette
//! table of `casino1.pov`.

use crate::{
    body::{
        Body,
        Kind,
        Operation, //
    },
    math::Vec3,
    scene::{
        Item,
        Scene, //
    },
};

/// The examples as their key and their German title.
pub const EXAMPLES: [(&str, &str); 5] = [
    ("bausteine", "Alle Bausteine"),
    ("haus", "Haus mit Tür und Fenster"),
    ("werkstueck", "Werkstück mit Bohrung"),
    ("kugeln", "Kugeln mit Texturen"),
    ("roulette", "Roulette"),
];

/// Returns the example of the key `key`, or `None` for another key.
#[must_use]
pub fn example(key: &str) -> Option<Scene> {
    match key {
        "bausteine" => Some(bausteine()),
        "haus" => Some(haus()),
        "werkstueck" => Some(werkstueck()),
        "kugeln" => Some(kugeln()),
        "roulette" => Some(roulette()),
        _ => None,
    }
}

/// Returns an item of the body `body`.
fn body(body: Body, position: Vec3, size: Vec3) -> Item {
    Item::new(Kind::Body(body)).at(position, size)
}

/// Returns a group of the operation `op`.
fn group(op: Operation) -> Item {
    Item::new(Kind::Group(op))
}

/// Every body of the body bar once, in its own colour.
fn bausteine() -> Scene {
    let v = Vec3::new;
    let mut scene = Scene::new();
    scene.push(body(Body::Sphere, v(2.0, 2.0, 1.0), v(1.0, 1.0, 1.0)).colored(0x00d9_4841));
    scene.push(body(Body::Cone, v(2.0, 5.0, 0.0), v(1.0, 1.0, 2.0)).colored(0x00f2_a33a));
    scene.push(body(Body::Cylinder, v(2.0, 8.0, 0.0), v(1.0, 1.0, 2.0)).colored(0x003a_8fd9));
    scene.push(body(Body::Cube, v(4.5, 1.0, 0.0), v(2.0, 2.0, 2.0)).colored(0x004c_af50));
    scene.push(body(Body::Cuboid, v(4.5, 4.0, 0.0), v(2.0, 2.5, 1.5)).colored(0x009c_6ade));
    scene.push(body(Body::Pyramid, v(4.5, 7.5, 0.0), v(2.0, 2.0, 2.5)).colored(0x00e0_c341));
    scene.push(body(Body::Prism, v(8.0, 1.0, 0.0), v(2.0, 2.0, 2.0)).colored(0x0026_a69a));
    let mut disc = body(Body::Disc, v(9.0, 6.0, 0.02), v(1.5, 1.5, 1.0)).colored(0x00ec_407a);
    disc.inner_radius = 0.6;
    scene.push(disc);
    scene
}

/// A house whose walls a difference cuts a door and a window into.
fn haus() -> Scene {
    let v = Vec3::new;
    let mut scene = Scene::new();
    let walls = scene.push(group(Operation::Difference).named("Mauern"));
    scene.push(
        body(Body::Cuboid, v(2.0, 2.0, 0.0), v(5.0, 7.0, 4.0))
            .colored(0x00f4_efe6)
            .named("Mauerwerk")
            .within(walls),
    );
    scene.push(
        body(Body::Cuboid, v(6.5, 3.5, 0.0), v(1.0, 1.2, 2.4))
            .named("Tür")
            .within(walls),
    );
    scene.push(
        body(Body::Cuboid, v(6.5, 6.0, 1.6), v(1.0, 2.0, 1.4))
            .named("Fenster")
            .within(walls),
    );
    scene.push(
        body(Body::Pyramid, v(2.0, 2.0, 4.0), v(5.0, 7.0, 2.6))
            .colored(0x00b2_3a2e)
            .named("Dach"),
    );
    scene.push(
        body(Body::Cylinder, v(3.4, 7.2, 4.4), v(0.35, 0.35, 2.0))
            .colored(0x008d_6e63)
            .named("Rauchfang"),
    );
    scene
}

/// The work piece of the manual: a cuboid with a hole drilled through it.
fn werkstueck() -> Scene {
    let v = Vec3::new;
    let mut scene = Scene::new();
    let piece = scene.push(
        group(Operation::Difference)
            .named("Werkstück")
            .textured("Polished_Chrome"),
    );
    scene.push(
        body(Body::Cuboid, v(2.0, 2.0, 0.0), v(4.0, 6.0, 2.0))
            .named("Rohling")
            .within(piece),
    );
    scene.push(
        body(Body::Cylinder, v(4.0, 5.0, -0.5), v(1.0, 1.0, 3.0))
            .named("Bohrung")
            .within(piece),
    );
    scene
}

/// Sixteen spheres, each in a texture of another family, as `kugeln2.pov`.
fn kugeln() -> Scene {
    const NAMES: [&str; 16] = [
        "Polished_Chrome",
        "Gold_Metal",
        "Copper_Metal",
        "Rusty_Iron",
        "White_Marble",
        "Red_Marble",
        "Jade",
        "Pink_Granite",
        "Glass3",
        "Green_Glass",
        "Ruby_Glass",
        "Water",
        "Cherry_Wood",
        "Pine_Wood",
        "Dark_Wood",
        "Candy_Cane",
    ];
    let mut scene = Scene::new();
    for (i, name) in NAMES.iter().enumerate() {
        let (row, col) = ((i / 4) as f32, (i % 4) as f32);
        let center = Vec3::new(1.5 + row * 2.4, 1.5 + col * 2.4, 0.9);
        scene.push(
            body(Body::Sphere, center, Vec3::new(0.9, 0.9, 0.9))
                .textured(name)
                .named(name),
        );
    }
    scene
}

/// The roulette table of `casino1.pov`, at a scale that fits the grid.
fn roulette() -> Scene {
    let v = Vec3::new;
    let mut scene = Scene::new();
    let table = scene.push(group(Operation::Union).named("Tisch"));
    let mut floor = body(Body::Disc, v(5.0, 5.0, 0.01), v(4.0, 4.0, 1.0)).colored(0x0021_7a3c);
    floor.inner_radius = 1.2;
    scene.push(floor.named("Teppich").within(table));
    for (dx, dy) in [(3.4, 0.0), (-3.4, 0.0), (0.0, 3.4), (0.0, -3.4)] {
        scene.push(
            body(
                Body::Cylinder,
                v(5.0 + dx, 5.0 + dy, 0.0),
                v(0.35, 0.35, 2.4),
            )
            .textured("Dark_Wood")
            .named("Bein")
            .within(table),
        );
    }
    scene.push(
        body(Body::Cylinder, v(5.0, 5.0, 2.4), v(4.2, 4.2, 0.3))
            .textured("Ruby_Glass")
            .named("Platte")
            .within(table),
    );
    scene.push(
        body(Body::Cone, v(5.0, 5.0, 2.7), v(0.8, 0.8, 2.0))
            .textured("Gold_Metal")
            .named("Kreisel"),
    );
    let balls = scene.push(
        group(Operation::Union)
            .named("Kugeln")
            .textured("Polished_Chrome"),
    );
    for k in 0..12 {
        let angle = core::f32::consts::TAU * k as f32 / 12.0;
        let (s, c) = angle.sin_cos();
        scene.push(
            body(
                Body::Sphere,
                v(5.0 + 3.2 * c, 5.0 + 3.2 * s, 2.9),
                v(0.2, 0.2, 0.2),
            )
            .named("Kugel")
            .within(balls),
        );
    }
    scene
}
