// SPDX-License-Identifier: GPL-2.0-only
/*
 * bausteine-core body: the basic bodies and the operations of the CSG.
 */

//! The basic bodies and the operations of the constructive solid geometry.
//!
//! Every body is a unit body in its own coordinates, which the transformation
//! of an item scales, turns and moves into the scene, as `D3_Refresh` of
//! `Module1.bas` does with the transformation matrix of a body. The unit
//! bodies are those of version 1.3, so a scene of the old program keeps its
//! meaning.

use crate::math::Vec3;

/// A basic body of the body bar.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Body {
    /// The sphere of radius one around the origin.
    Sphere,
    /// The cone of radius one on the plane z = 0 with its apex at (0, 0, 1).
    Cone,
    /// The cylinder of radius one from z = 0 to z = 1.
    Cylinder,
    /// The cube from the origin to (1, 1, 1), whose edges scale alike.
    Cube,
    /// The cuboid from the origin to (1, 1, 1), whose edges scale apart.
    Cuboid,
    /// The square pyramid on the unit square with its apex at (0.5, 0.5, 1).
    Pyramid,
    /// The regular three sided prism from z = 0 to z = 1.
    Prism,
    /// The disc of radius one in the plane z = 0, with a hole.
    Disc,
}

impl Body {
    /// Every body, in the order of the body bar.
    pub const ALL: [Self; 8] = [
        Self::Sphere,
        Self::Cone,
        Self::Cylinder,
        Self::Cube,
        Self::Cuboid,
        Self::Pyramid,
        Self::Prism,
        Self::Disc,
    ];

    /// Returns the German name the lesson uses.
    #[must_use]
    pub const fn label(self) -> &'static str {
        match self {
            Self::Sphere => "Kugel",
            Self::Cone => "Kegel",
            Self::Cylinder => "Zylinder",
            Self::Cube => "Würfel",
            Self::Cuboid => "Quader",
            Self::Pyramid => "Pyramide",
            Self::Prism => "Prisma",
            Self::Disc => "Scheibe",
        }
    }

    /// Returns the number of the body, the type code of version 1.3.
    #[must_use]
    pub const fn code(self) -> u32 {
        match self {
            Self::Sphere => 1,
            Self::Cone => 2,
            Self::Cylinder => 3,
            Self::Cube => 4,
            Self::Cuboid => 5,
            Self::Pyramid => 6,
            Self::Prism => 7,
            Self::Disc => 8,
        }
    }

    /// Returns the body of the type code `code`, or `None` for another code.
    #[must_use]
    pub fn from_code(code: u32) -> Option<Self> {
        Self::ALL.into_iter().find(|body| body.code() == code)
    }

    /// Returns the scaling of the unit body for the dimensions `size`.
    ///
    /// The dimensions are those of the input mask of version 1.3: the radius
    /// of a sphere and of a disc, the radius and the height of a cone and of
    /// a cylinder, the edge of a cube and the three edges of the other bodies.
    #[must_use]
    pub fn scale(self, size: Vec3) -> Vec3 {
        match self {
            Self::Sphere | Self::Cube => Vec3::new(size.x, size.x, size.x),
            Self::Cone | Self::Cylinder => Vec3::new(size.x, size.x, size.z),
            Self::Disc => Vec3::new(size.x, size.x, 1.0),
            Self::Cuboid | Self::Pyramid | Self::Prism => size,
        }
    }

    /// Returns what the position of the body names, for the hints of the status bar.
    #[must_use]
    pub const fn anchor(self) -> &'static str {
        match self {
            Self::Sphere => "Kugelmittelpunkt",
            Self::Cone | Self::Cylinder => "Mittelpunkt der Grundfläche",
            Self::Disc => "Mittelpunkt",
            Self::Cube | Self::Cuboid | Self::Pyramid | Self::Prism => {
                "Eckpunkt hinten, links, unten"
            }
        }
    }
}

/// An operation of the constructive solid geometry over the children of a group.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Operation {
    /// The union of all children.
    Union,
    /// The first child without every other one.
    Difference,
    /// What all children have in common.
    Intersection,
    /// The union without the inner surfaces, which matters for glass.
    Merge,
    /// The union that defines a new body under the name of the group,
    /// `#Neu` of version 1.3, which an [`Kind::Instance`] places again.
    Declare,
}

impl Operation {
    /// Every operation, in the order of the body bar.
    pub const ALL: [Self; 5] = [
        Self::Union,
        Self::Difference,
        Self::Intersection,
        Self::Merge,
        Self::Declare,
    ];

    /// Returns the German name of version 1.3.
    #[must_use]
    pub const fn label(self) -> &'static str {
        match self {
            Self::Union => "Vereinigung",
            Self::Difference => "Differenz",
            Self::Intersection => "Durchschnitt",
            Self::Merge => "Summe",
            Self::Declare => "Neu",
        }
    }

    /// Returns the keyword of POV-Ray.
    #[must_use]
    pub const fn keyword(self) -> &'static str {
        match self {
            Self::Union | Self::Declare => "union",
            Self::Difference => "difference",
            Self::Intersection => "intersection",
            Self::Merge => "merge",
        }
    }

    /// Returns the number of the operation, the type code of version 1.3
    /// without its sign.
    #[must_use]
    pub const fn code(self) -> u32 {
        match self {
            Self::Union => 101,
            Self::Difference => 102,
            Self::Intersection => 103,
            Self::Merge => 104,
            Self::Declare => 105,
        }
    }

    /// Returns the operation of the type code `code`, or `None` for another code.
    #[must_use]
    pub fn from_code(code: u32) -> Option<Self> {
        Self::ALL.into_iter().find(|op| op.code() == code)
    }
}

/// What an item of the scene is: a body or a group of the CSG.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    /// A basic body.
    Body(Body),
    /// A group whose children an operation combines.
    Group(Operation),
    /// A new placement of the body a [`Operation::Declare`] group defines,
    /// the object of type 200 of version 1.3.
    Instance,
}

impl Kind {
    /// The type code of an instance, that of version 1.3.
    pub const INSTANCE: u32 = 200;

    /// Returns the type code of the kind.
    #[must_use]
    pub const fn code(self) -> u32 {
        match self {
            Self::Body(body) => body.code(),
            Self::Group(op) => op.code(),
            Self::Instance => Self::INSTANCE,
        }
    }

    /// Returns the kind of the type code `code`, or `None` for another code.
    #[must_use]
    pub fn from_code(code: u32) -> Option<Self> {
        if code == Self::INSTANCE {
            return Some(Self::Instance);
        }
        Body::from_code(code)
            .map(Self::Body)
            .or_else(|| Operation::from_code(code).map(Self::Group))
    }

    /// Returns the German name of the kind.
    #[must_use]
    pub const fn label(self) -> &'static str {
        match self {
            Self::Body(body) => body.label(),
            Self::Group(op) => op.label(),
            Self::Instance => "Objekt",
        }
    }
}
