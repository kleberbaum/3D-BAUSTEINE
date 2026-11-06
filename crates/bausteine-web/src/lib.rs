// SPDX-License-Identifier: GPL-2.0-only
/*
 * bausteine-web: the Web Worker of 3D-Bausteine, the GraphQL engine and the renderer on WebGPU.
 */

//! The Web Worker of 3D-Bausteine.
//!
//! The page of 3D-Bausteine starts one Web Worker, which runs this crate as
//! a module of WebAssembly. The worker holds two things:
//!
//! | Module | Holds | In version 1.3 |
//! | --- | --- | --- |
//! | [`engine`] | The service with its GraphQL API, booted through `aosabi::embed` | The arrays `obj()` and `D3obj()` of `Module1.bas` |
//! | `renderer` | The four views on WebGPU, drawn into an `OffscreenCanvas` | The drawing of `3D_bau.frm`, `graf3d32.dll` and POV-Ray |
//!
//! The page asks the engine every question over GraphQL through messages,
//! and the renderer reads the scene it draws straight from the service, so
//! the scene crosses the boundary between page and worker as GraphQL alone.
//! The `Worker` that `wasm-bindgen` exports joins the two for the script
//! `web/js/worker.js`. On the build host the binary `bausteine-graphql`
//! boots the same engine for the test notebooks.

pub mod engine;
#[cfg(target_arch = "wasm32")]
mod gpu;
#[cfg(target_arch = "wasm32")]
mod renderer;
#[cfg(target_arch = "wasm32")]
mod worker;
