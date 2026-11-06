// SPDX-License-Identifier: GPL-2.0-only
/*
 * bausteine-core: the geometry of 3D-Bausteine, shared by the service and the renderer.
 */

//! The geometry of 3D-Bausteine.
//!
//! 3D-Bausteine is the CAD program of the diploma thesis "Grundlagen der
//! 3D-Computergrafik" by Herbert Kleber, written in Visual Basic 5 with a
//! C library for the drawing of the oblique view. This crate is its
//! geometry in Rust, with no dependency outside the standard library, so
//! the service of Aosabi and the renderer in the browser share it.
//!
//! | Module | Holds | In version 1.3 |
//! | --- | --- | --- |
//! | [`math`] | The vectors and the 4x4 matrices | `M2.bas` |
//! | [`body`] | The basic bodies and the operations of the CSG | `F4.frm` |
//! | [`texture`] | The standard textures of POV-Ray | `Fill_CB3_Texi` |
//! | [`scene`] | The items and the tree of their groups | `obj()` of `Module1.bas` |
//! | [`mesh`] | The polygon model of the unit bodies | `D3_Kugel` and the others |
//! | [`view`] | The three normal views and the oblique view | `View()` of `3D_bau.frm` |
//! | [`drawing`] | The faces and the lines of the views | `draw2D` and `graf3d32.dll` |
//! | [`classic`] | The wire models on black of the classic look | `grid`, `draw2D` and `D3_Refresh` |
//! | [`pov`] | The export to POV-Ray | `POV.bas` |
//! | [`raytrace`] | The program of the ray tracer on the GPU | POV-Ray itself |
//! | [`packed`] | A scene as one array of numbers | |
//! | [`examples`] | The scenes a class starts from | The POV files of the slide show |

pub mod body;
pub mod classic;
pub mod drawing;
pub mod examples;
pub mod math;
pub mod mesh;
pub mod packed;
pub mod pov;
pub mod raytrace;
pub mod scene;
pub mod texture;
pub mod view;
