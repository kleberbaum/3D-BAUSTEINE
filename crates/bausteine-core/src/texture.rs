// SPDX-License-Identifier: GPL-2.0-only
/*
 * bausteine-core texture: the standard textures of POV-Ray a body can wear.
 */

//! The standard textures of POV-Ray a body can wear.
//!
//! Version 1.3 offers the textures of the include files of POV-Ray 3.1 in a
//! combo box, `Fill_CB3_Texi` of `POV.bas`. The table keeps their names, so
//! an exported scene renders in POV-Ray as before, and gives each a
//! [`Material`] that the ray tracer in the browser approximates it with.

/// The family of a surface, which decides how the ray tracer shades it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Surface {
    /// A matte surface of one colour.
    Plain,
    /// A metal, which mirrors its surroundings in its own colour.
    Metal,
    /// A glass, which lets light through and mirrors at a flat angle.
    Glass,
    /// A wood, with the rings of its grain.
    Wood,
    /// A marble, with its veins.
    Marble,
    /// A stone of grains, a granite or an agate.
    Granite,
    /// The stripes of a candy cane.
    Stripes,
}

impl Surface {
    /// Returns the number the shader of the ray tracer reads.
    #[must_use]
    pub const fn code(self) -> u32 {
        match self {
            Self::Plain => 0,
            Self::Metal => 1,
            Self::Glass => 2,
            Self::Wood => 3,
            Self::Marble => 4,
            Self::Granite => 5,
            Self::Stripes => 6,
        }
    }
}

/// How the ray tracer in the browser approximates a texture.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Material {
    /// The family of the surface.
    pub surface: Surface,
    /// The main colour, red, green and blue from zero to one.
    pub base: [f32; 3],
    /// The second colour of a pattern.
    pub accent: [f32; 3],
    /// How much of its surroundings the surface mirrors, from zero to one.
    pub reflection: f32,
}

/// A standard texture, its name in POV-Ray and the group of the menu.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Texture {
    /// The name of the texture in the include files of POV-Ray.
    pub name: &'static str,
    /// The German name of its group in the menu.
    pub group: &'static str,
    /// The approximation of the ray tracer in the browser.
    pub material: Material,
}

/// Returns a texture of the table.
const fn texture(
    name: &'static str,
    group: &'static str,
    surface: Surface,
    base: [f32; 3],
    accent: [f32; 3],
    reflection: f32,
) -> Texture {
    Texture {
        name,
        group,
        material: Material {
            surface,
            base,
            accent,
            reflection,
        },
    }
}

/// The group of the metals.
const METAL: &str = "Metall";
/// The group of the stones.
const STONE: &str = "Stein";
/// The group of the glasses.
const GLASS: &str = "Glas";
/// The group of the woods.
const WOOD: &str = "Holz";
/// The group of every other texture.
const OTHER: &str = "Sonstige";

/// Every texture, in the order of the combo box of version 1.3.
pub const TEXTURES: [Texture; 43] = [
    texture(
        "Chrome_Metal",
        METAL,
        Surface::Metal,
        [0.80, 0.82, 0.85],
        [0.0; 3],
        0.75,
    ),
    texture(
        "Brass_Metal",
        METAL,
        Surface::Metal,
        [0.82, 0.66, 0.30],
        [0.0; 3],
        0.6,
    ),
    texture(
        "Gold_Metal",
        METAL,
        Surface::Metal,
        [0.95, 0.75, 0.25],
        [0.0; 3],
        0.65,
    ),
    texture(
        "Silver_Metal",
        METAL,
        Surface::Metal,
        [0.86, 0.86, 0.88],
        [0.0; 3],
        0.7,
    ),
    texture(
        "Bronze_Metal",
        METAL,
        Surface::Metal,
        [0.72, 0.46, 0.22],
        [0.0; 3],
        0.55,
    ),
    texture(
        "Copper_Metal",
        METAL,
        Surface::Metal,
        [0.86, 0.48, 0.30],
        [0.0; 3],
        0.6,
    ),
    texture(
        "Polished_Chrome",
        METAL,
        Surface::Metal,
        [0.92, 0.93, 0.95],
        [0.0; 3],
        0.9,
    ),
    texture(
        "Polished_Brass",
        METAL,
        Surface::Metal,
        [0.90, 0.74, 0.36],
        [0.0; 3],
        0.85,
    ),
    texture(
        "Aluminum",
        METAL,
        Surface::Metal,
        [0.78, 0.80, 0.82],
        [0.0; 3],
        0.4,
    ),
    texture(
        "Rusty_Iron",
        METAL,
        Surface::Granite,
        [0.45, 0.25, 0.14],
        [0.62, 0.36, 0.18],
        0.05,
    ),
    texture(
        "Brown_Agate",
        STONE,
        Surface::Marble,
        [0.50, 0.30, 0.18],
        [0.85, 0.70, 0.52],
        0.1,
    ),
    texture(
        "Sapphire_Agate",
        STONE,
        Surface::Marble,
        [0.10, 0.22, 0.60],
        [0.60, 0.72, 0.95],
        0.15,
    ),
    texture(
        "Pink_Granite",
        STONE,
        Surface::Granite,
        [0.85, 0.62, 0.60],
        [0.40, 0.30, 0.30],
        0.05,
    ),
    texture(
        "PinkAlabaster",
        STONE,
        Surface::Marble,
        [0.95, 0.85, 0.82],
        [0.85, 0.62, 0.60],
        0.1,
    ),
    texture(
        "White_Marble",
        STONE,
        Surface::Marble,
        [0.95, 0.95, 0.94],
        [0.55, 0.55, 0.58],
        0.15,
    ),
    texture(
        "Red_Marble",
        STONE,
        Surface::Marble,
        [0.72, 0.16, 0.12],
        [0.95, 0.80, 0.78],
        0.15,
    ),
    texture(
        "Jade",
        STONE,
        Surface::Marble,
        [0.18, 0.55, 0.32],
        [0.55, 0.85, 0.62],
        0.2,
    ),
    texture(
        "Glass3",
        GLASS,
        Surface::Glass,
        [0.92, 0.96, 0.98],
        [0.0; 3],
        0.1,
    ),
    texture(
        "Green_Glass",
        GLASS,
        Surface::Glass,
        [0.55, 0.90, 0.60],
        [0.0; 3],
        0.1,
    ),
    texture(
        "Ruby_Glass",
        GLASS,
        Surface::Glass,
        [0.95, 0.35, 0.45],
        [0.0; 3],
        0.1,
    ),
    texture(
        "NBwinebottle",
        GLASS,
        Surface::Glass,
        [0.35, 0.55, 0.25],
        [0.0; 3],
        0.1,
    ),
    texture(
        "NBbeerbottle",
        GLASS,
        Surface::Glass,
        [0.75, 0.50, 0.18],
        [0.0; 3],
        0.1,
    ),
    texture(
        "Rosewood",
        WOOD,
        Surface::Wood,
        [0.45, 0.16, 0.10],
        [0.25, 0.07, 0.05],
        0.05,
    ),
    texture(
        "Cherry_Wood",
        WOOD,
        Surface::Wood,
        [0.62, 0.28, 0.18],
        [0.42, 0.16, 0.10],
        0.05,
    ),
    texture(
        "Tan_Wood",
        WOOD,
        Surface::Wood,
        [0.80, 0.62, 0.42],
        [0.62, 0.44, 0.28],
        0.03,
    ),
    texture(
        "Pine_Wood",
        WOOD,
        Surface::Wood,
        [0.90, 0.75, 0.50],
        [0.72, 0.54, 0.32],
        0.03,
    ),
    texture(
        "Dark_Wood",
        WOOD,
        Surface::Wood,
        [0.38, 0.24, 0.14],
        [0.22, 0.13, 0.07],
        0.03,
    ),
    texture(
        "White_Wood",
        WOOD,
        Surface::Wood,
        [0.93, 0.88, 0.78],
        [0.78, 0.70, 0.58],
        0.03,
    ),
    texture(
        "Cork",
        WOOD,
        Surface::Granite,
        [0.72, 0.55, 0.36],
        [0.50, 0.36, 0.22],
        0.0,
    ),
    texture(
        "Yellow_Pine",
        WOOD,
        Surface::Wood,
        [0.95, 0.80, 0.42],
        [0.75, 0.55, 0.25],
        0.03,
    ),
    texture(
        "DMFWood1",
        WOOD,
        Surface::Wood,
        [0.70, 0.46, 0.26],
        [0.50, 0.30, 0.16],
        0.05,
    ),
    texture(
        "DMFWood2",
        WOOD,
        Surface::Wood,
        [0.62, 0.40, 0.24],
        [0.44, 0.26, 0.14],
        0.05,
    ),
    texture(
        "DMFWood3",
        WOOD,
        Surface::Wood,
        [0.80, 0.60, 0.38],
        [0.58, 0.40, 0.22],
        0.05,
    ),
    texture(
        "DMFWood4",
        WOOD,
        Surface::Wood,
        [0.55, 0.36, 0.22],
        [0.36, 0.22, 0.12],
        0.05,
    ),
    texture(
        "DMFWood5",
        WOOD,
        Surface::Wood,
        [0.85, 0.66, 0.44],
        [0.64, 0.46, 0.28],
        0.05,
    ),
    texture(
        "DMFWood6",
        WOOD,
        Surface::Wood,
        [0.48, 0.30, 0.18],
        [0.30, 0.18, 0.10],
        0.05,
    ),
    texture(
        "Water",
        OTHER,
        Surface::Glass,
        [0.70, 0.85, 0.95],
        [0.0; 3],
        0.3,
    ),
    texture(
        "Candy_Cane",
        OTHER,
        Surface::Stripes,
        [0.95, 0.95, 0.95],
        [0.85, 0.10, 0.12],
        0.1,
    ),
    texture(
        "Peel",
        OTHER,
        Surface::Granite,
        [0.95, 0.60, 0.15],
        [0.85, 0.45, 0.08],
        0.05,
    ),
    texture(
        "Lightening1",
        OTHER,
        Surface::Marble,
        [0.15, 0.15, 0.35],
        [0.85, 0.85, 1.00],
        0.1,
    ),
    texture(
        "Starfield",
        OTHER,
        Surface::Granite,
        [0.02, 0.02, 0.05],
        [1.00, 1.00, 1.00],
        0.0,
    ),
    texture(
        "Blue_Sky2",
        OTHER,
        Surface::Marble,
        [0.30, 0.50, 0.90],
        [0.95, 0.95, 1.00],
        0.0,
    ),
    texture(
        "Blood_Sky",
        OTHER,
        Surface::Marble,
        [0.55, 0.05, 0.05],
        [0.95, 0.65, 0.15],
        0.0,
    ),
];

/// Returns the index of the texture named `name` in [`TEXTURES`], or `None`.
#[must_use]
pub fn find(name: &str) -> Option<usize> {
    TEXTURES.iter().position(|texture| texture.name == name)
}

/// Returns the material of a plain surface of the colour `color`.
#[must_use]
pub const fn plain(color: [f32; 3]) -> Material {
    Material {
        surface: Surface::Plain,
        base: color,
        accent: color,
        reflection: 0.04,
    }
}
