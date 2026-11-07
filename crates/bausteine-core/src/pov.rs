// SPDX-License-Identifier: GPL-2.0-only
/*
 * bausteine-core pov: the export of a scene as a scene file of POV-Ray.
 */

//! The export of a scene as a scene file of POV-Ray.
//!
//! The coordinate system of the GZ lesson is right handed with z up, and the
//! one of POV-Ray is left handed with y up. `pov_p` of `POV.bas` maps a point
//! (x, y, z) of the lesson to <y, z, -x> of POV-Ray, and so does this module.
//! The mapping is a mirror, so a turn about an axis of the lesson becomes a
//! turn in the other sense about the image of the axis: a turn about z by an
//! angle is `rotate <0, -angle, 0>`, about y `rotate <-angle, 0, 0>` and
//! about x `rotate <0, 0, angle>`. The turns are written one by one in the
//! order the matrix of an item applies them, z first, so the export draws
//! what the views show.
//!
//! A body or a group with a texture wears it as `texture { Gold_Metal }`.
//! Twenty names of the list of version 1.3 are pigments in `textures.inc`,
//! such as `Jade`, the marbles and most of the woods, and POV-Ray reads a
//! pigment inside a texture only as `pigment { }`, so the export writes
//! `texture { pigment { Jade } }` for them, see [`crate::texture::PIGMENTS`].

use core::fmt::Write as _;

use crate::{
    body::{
        Body,
        Kind,
        Operation, //
    },
    math::Vec3,
    scene::{
        Item,
        MAX_DEPTH,
        Scene, //
    },
    texture::TEXTURES,
};

/// The point of a camera for the export, the position and the point it looks at.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Shot {
    /// The position of the camera in the coordinates of the lesson.
    pub eye: Vec3,
    /// The point the camera looks at.
    pub target: Vec3,
}

impl Default for Shot {
    /// The camera of `Def_Pov`, `location <15,8,-15> look_at <0,0,0>`.
    fn default() -> Self {
        Self {
            eye: Vec3::new(15.0, 15.0, 8.0),
            target: Vec3::ZERO,
        }
    }
}

/// The head of the scene file: its layout and when it was written.
///
/// The page formats the date and the time as `Def_Pov` of version 1.3 wrote
/// `Date` and `Time` of Visual Basic in a German locale, the date as
/// `TT.MM.JJJJ` and the time as `HH:MM:SS`, for example `06.03.2002` and
/// `21:03:31`. The export takes them as they come and writes a line break
/// in them as a blank, so they never leave their line of comment.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Header<'a> {
    /// Whether the head takes the layout of `Def_Pov` of version 1.3, with
    /// an empty line after every line of comment.
    pub classic: bool,
    /// The date the page writes the file, as `TT.MM.JJJJ`.
    pub date: Option<&'a str>,
    /// The time the page writes the file, as `HH:MM:SS`.
    pub time: Option<&'a str>,
}

/// Returns the scene file of POV-Ray 3 for `scene` seen through `shot`.
#[must_use]
pub fn export(scene: &Scene, shot: &Shot) -> String {
    export_with(scene, shot, &Header::default())
}

/// Returns the scene file of POV-Ray 3 for `scene` seen through `shot`,
/// with the head `head`.
///
/// The module of WebAssembly reads no clock of the place it runs in, so the
/// page hands the date and the time in, as `Def_Pov` writes `Date` and
/// `Time` of Visual Basic into its head.
#[must_use]
pub fn export_with(scene: &Scene, shot: &Shot, head: &Header<'_>) -> String {
    let mut out = String::new();
    header(&mut out, shot, head);
    let writer = Writer {
        scene,
        names: names(scene),
    };
    let roots: Vec<usize> = scene.children(None).collect();
    let mut declarations = Vec::new();
    for &root in &roots {
        writer.collect(root, 0, &mut declarations);
    }
    for index in declarations {
        writer.declaration(&mut out, index);
    }
    for root in roots {
        writer.item(&mut out, root, 0, false);
    }
    out
}

/// Returns the identifier of POV-Ray of every declaration, `None` for
/// every other item.
///
/// `pov_declare` of version 1.3 takes the name after `#Neu` as it stands.
/// An identifier of POV-Ray holds letters, digits and underscores alone and
/// must not meet a name of the include files, so the name is spelled in
/// those letters, prefixed with `Neu_` and numbered where two meet.
fn names(scene: &Scene) -> Vec<Option<String>> {
    let mut taken: Vec<String> = Vec::new();
    scene
        .items
        .iter()
        .map(|item| {
            if item.kind != Kind::Group(Operation::Declare) {
                return None;
            }
            let mut base = String::from("Neu_");
            for c in item.name.chars() {
                match c {
                    'ä' => base.push_str("ae"),
                    'ö' => base.push_str("oe"),
                    'ü' => base.push_str("ue"),
                    'Ä' => base.push_str("Ae"),
                    'Ö' => base.push_str("Oe"),
                    'Ü' => base.push_str("Ue"),
                    'ß' => base.push_str("ss"),
                    c if c.is_ascii_alphanumeric() => base.push(c),
                    _ => base.push('_'),
                }
            }
            let mut name = base.clone();
            let mut n = 2;
            while taken.contains(&name) {
                name = format!("{base}_{n}");
                n += 1;
            }
            taken.push(name.clone());
            Some(name)
        })
        .collect()
}

/// The state of one export.
struct Writer<'a> {
    /// The scene.
    scene: &'a Scene,
    /// The identifier of each declaration.
    names: Vec<Option<String>>,
}

/// Writes the comment of the head, the includes, the sky, the camera, the
/// light and the room of `Def_Pov`.
fn header(out: &mut String, shot: &Shot, head: &Header<'_>) {
    let date = one_line(head.date.unwrap_or(""));
    let time = one_line(head.time.unwrap_or(""));
    if head.classic {
        // Def_Pov writes each comment with appCr, which ends it with two
        // line breaks.
        let _ = write!(
            out,
            "//==========================================================\n\n\
             // 3D-Bausteine Version 2.0 (klassisch) nach 3D-Baukasten 1.3 (c) 2002 H.Kleber\n\n\
             // POV 2 Datei Datum: {date} Zeit: {time}\n\n\
             //==========================================================\n\n"
        );
    } else {
        out.push_str(concat!(
            "// ==========================================================\n",
            "// 3D-Bausteine 2.0 nach 3D-Baukasten 1.3 (H. Kleber 2002)\n",
        ));
        if head.date.is_some() || head.time.is_some() {
            let _ = writeln!(out, "// Szene für POV-Ray 3, Datum: {date} Zeit: {time}");
        } else {
            out.push_str("// Szene für POV-Ray 3\n");
        }
        out.push_str("// ==========================================================\n");
    }
    out.push_str(concat!(
        "#include \"colors.inc\"\n",
        "#include \"textures.inc\"\n",
        "#include \"glass.inc\"\n",
        "#include \"metals.inc\"\n",
        "#include \"woods.inc\"\n",
        "#include \"stones.inc\"\n",
        "\n",
        "// Standardeinstellungen\n",
        "sky_sphere { pigment { Bright_Blue_Sky } }\n",
    ));
    let _ = writeln!(
        out,
        "camera {{ location {} look_at {} }}",
        point(shot.eye),
        point(shot.target)
    );
    out.push_str(concat!(
        "light_source { <5, 10, -20> color White }\n",
        "plane { <0, 1, 0>, 0 pigment { checker color White color Silver }\n",
        "  finish { ambient 0.3 reflection 0.3 } }\n",
        "plane { <1, 0, 0>, 0 pigment { color White } finish { ambient 0.3 } }\n",
        "plane { <0, 0, 1>, 0 pigment { color White } finish { ambient 0.3 } }\n",
    ));
}

impl Writer<'_> {
    /// Appends the declarations at and below `index` to `out`, the inner
    /// ones first, since POV-Ray reads a name before its use.
    fn collect(&self, index: usize, depth: usize, out: &mut Vec<usize>) {
        if depth > MAX_DEPTH {
            return;
        }
        for child in self.scene.children(Some(index)) {
            self.collect(child, depth + 1, out);
        }
        if self.names[index].is_some() && !out.contains(&index) {
            out.push(index);
        }
    }

    /// Writes the declaration `index` as `#declare`, `pov_declare` of version
    /// 1.3, ahead of every item.
    fn declaration(&self, out: &mut String, index: usize) {
        let Some(name) = &self.names[index] else {
            return;
        };
        let source = &self.scene.items[index];
        let _ = writeln!(
            out,
            "\n// Neuer Körper {}: {}",
            index + 1,
            one_line(&source.name)
        );
        let children: Vec<usize> = self.scene.children(Some(index)).collect();
        if children.is_empty() {
            let _ = writeln!(out, "#declare {name} = sphere {{ <0, 0, 0>, 0 }}");
            return;
        }
        let _ = writeln!(out, "#declare {name} = union {{");
        let textured = source.texture.is_some();
        for child in children {
            self.item(out, child, 1, textured);
        }
        let _ = writeln!(out, "}}");
    }

    /// Writes the item `index` and its children at the nesting `depth`, with
    /// no texture of its own where a group above it is textured.
    fn item(&self, out: &mut String, index: usize, depth: usize, inherited: bool) {
        if depth > MAX_DEPTH {
            return;
        }
        let scene = self.scene;
        let source = &scene.items[index];
        let pad = "  ".repeat(depth);
        let _ = writeln!(
            out,
            "\n{pad}// Objekt {}: {}",
            index + 1,
            one_line(&source.name)
        );
        match source.kind {
            Kind::Body(body) => {
                let _ = writeln!(out, "{pad}{}", shape(body, source));
                transform(out, source, &pad);
                if !inherited {
                    surface(out, source, &pad);
                }
                let _ = writeln!(out, "{pad}}}");
            }
            Kind::Group(Operation::Declare) => {
                // `Neu Ende` places the new body once where its group stands.
                self.object(out, index, index, &pad, inherited);
            }
            Kind::Instance => match scene.source_of(index) {
                Some(declaration) => self.object(out, index, declaration, &pad, inherited),
                None => {
                    let _ = writeln!(out, "{pad}// Kein neuer Körper zum Einsetzen");
                }
            },
            Kind::Group(op) => {
                let children: Vec<usize> = scene.children(Some(index)).collect();
                if children.is_empty() {
                    let _ = writeln!(out, "{pad}// Leere Gruppe, POV-Ray kennt keine");
                    return;
                }
                let textured = inherited || source.texture.is_some();
                let _ = writeln!(out, "{pad}{} {{", op.keyword());
                for child in children {
                    self.item(out, child, depth + 1, textured);
                }
                transform(out, source, &pad);
                if source.texture.is_some() && !inherited {
                    surface(out, source, &pad);
                }
                let _ = writeln!(out, "{pad}}}");
            }
        }
    }

    /// Writes `object { name }` of the declaration `declaration` with the
    /// transformation and the texture of the item `index`, as
    /// `pov_declare_Ende` and `pov_new_Object` do.
    fn object(
        &self,
        out: &mut String,
        index: usize,
        declaration: usize,
        pad: &str,
        inherited: bool,
    ) {
        let source = &self.scene.items[index];
        let Some(name) = &self.names[declaration] else {
            return;
        };
        let _ = writeln!(out, "{pad}object {{ {name}");
        transform(out, source, pad);
        if source.texture.is_some() && !inherited {
            surface(out, source, pad);
        }
        let _ = writeln!(out, "{pad}}}");
    }
}

/// Returns the opening of the unit body `body` in the coordinates of POV-Ray.
fn shape(body: Body, source: &Item) -> String {
    match body {
        Body::Sphere => String::from("sphere { <0, 0, 0>, 1"),
        Body::Cone => String::from("cone { <0, 0, 0>, 1, <0, 1, 0>, 0"),
        Body::Cylinder => String::from("cylinder { <0, 0, 0>, <0, 1, 0>, 1"),
        Body::Cube | Body::Cuboid => String::from("box { <0, 0, -1>, <1, 1, 0>"),
        Body::Pyramid => String::from(concat!(
            "prism { conic_sweep linear_spline 0, 1, 5,\n",
            "  <-0.5, -0.5>, <0.5, -0.5>, <0.5, 0.5>, <-0.5, 0.5>, <-0.5, -0.5>\n",
            "  scale <1, -1, 1> translate <0.5, 1, -0.5>"
        )),
        Body::Prism => String::from(concat!(
            "prism { linear_sweep linear_spline 0, 1, 4,\n",
            "  <0, 0>, <0, -1>, <0.866025, -0.5>, <0, 0>"
        )),
        Body::Disc => format!("disc {{ <0, 0, 0>, <0, 1, 0>, 1, {}", number(source.hole())),
    }
}

/// Writes the scaling, the turns and the move of `source`, `pov_transform`.
fn transform(out: &mut String, source: &Item, pad: &str) {
    let s = source.scaling();
    let r = source.rotation;
    let _ = write!(
        out,
        "{pad}  scale <{}, {}, {}>",
        number(s.y),
        number(s.z),
        number(s.x)
    );
    if r.z != 0.0 {
        let _ = write!(out, " rotate <0, {}, 0>", number(-r.z));
    }
    if r.y != 0.0 {
        let _ = write!(out, " rotate <{}, 0, 0>", number(-r.y));
    }
    if r.x != 0.0 {
        let _ = write!(out, " rotate <0, 0, {}>", number(r.x));
    }
    let _ = writeln!(out, " translate {}", point(source.position));
}

/// Writes the texture of `source`, or its colour, `pov_tex`, with a
/// pigment of `textures.inc` wrapped in `pigment { }`.
fn surface(out: &mut String, source: &Item, pad: &str) {
    if let Some(texture) = source.texture.and_then(|i| TEXTURES.get(i)) {
        if texture.is_pigment() {
            let _ = writeln!(out, "{pad}  texture {{ pigment {{ {} }} }}", texture.name);
        } else {
            let _ = writeln!(out, "{pad}  texture {{ {} }}", texture.name);
        }
    } else {
        let [r, g, b] = source.color;
        let _ = writeln!(
            out,
            "{pad}  pigment {{ rgb <{}, {}, {}> }}",
            number(r),
            number(g),
            number(b)
        );
    }
}

/// Returns `text` with every line break as a blank, for a line of comment.
fn one_line(text: &str) -> String {
    text.replace(['\n', '\r'], " ")
}

/// Returns the point `p` of the lesson as a vector of POV-Ray.
fn point(p: Vec3) -> String {
    format!("<{}, {}, {}>", number(p.y), number(p.z), number(-p.x))
}

/// Returns `value` with a point as the decimal mark and no needless digits,
/// what the function `Punkt` of `POV.bas` does for a German locale.
fn number(value: f32) -> String {
    if !value.is_finite() {
        return String::from("0");
    }
    let rounded = (f64::from(value) * 10_000.0).round() / 10_000.0;
    let text = format!("{rounded:.4}");
    let text = text.trim_end_matches('0').trim_end_matches('.');
    if text == "-0" {
        String::from("0")
    } else {
        String::from(text)
    }
}
