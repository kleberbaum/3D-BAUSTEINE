// SPDX-License-Identifier: GPL-2.0-only
/*
 * bausteine-web renderer: the four views of one OffscreenCanvas on WebGPU.
 */

//! The four views of one canvas on WebGPU.
//!
//! Version 1.3 draws the three normal views with the drawing methods of
//! Visual Basic and the oblique view with `graf3d32.dll`, a library in C
//! whose functions `show_3D`, `rotation`, `scalierung` and `translation`
//! the module `Module1.bas` declares. A [`Renderer`] takes the place of both:
//! it draws the four views into the `OffscreenCanvas` the page hands its Web
//! Worker, and traces the rays of the oblique view on the GPU in place of
//! POV-Ray.

use crate::gpu::{
    CAMERA_VALUES,
    Frame,
    Gpu, //
};
use bausteine_core::{
    classic,
    drawing::{
        self,
        Drawing, //
    },
    math::Vec3,
    raytrace,
    scene::Scene,
    view::{
        Camera,
        Orbit,
        Ortho,
        View, //
    },
};

/// The renderer of one canvas with the four views.
pub struct Renderer {
    /// The state of WebGPU.
    gpu: Gpu,
    /// The scene as it was handed over last.
    scene: Scene,
    /// The bodies of the scene moved into place.
    drawing: Drawing,
    /// The selected item.
    selected: Option<usize>,
    /// The shared state of the parallel views.
    ortho: Ortho,
    /// The camera of the oblique view.
    orbit: Orbit,
    /// The viewport of each view in CSS pixels, in the order of [`View::ALL`].
    viewports: [[f32; 4]; 4],
    /// The device pixels of one CSS pixel.
    scale: f32,
    /// Whether the dark theme is on.
    dark: bool,
    /// Whether the oblique view is ray traced.
    raytrace: bool,
    /// The look of the views.
    look: Look,
    /// The 3D zoom, `d3zoomf` of version 1.3 divided by its start value 10.
    oblique_zoom: f32,
    /// The turn of the scene in the oblique view about the x, y and z axes
    /// in degrees, the tab Kamera of version 1.3.
    turn: Vec3,
    /// How the classic look draws: as on the screen, or inverted, black on
    /// white, as the pictures of the thesis are printed.
    ink: Ink,
    /// Whether the faces and the program of the ray tracer are out of date.
    stale: bool,
}

impl Renderer {
    /// Opens WebGPU on `canvas`.
    ///
    /// # Errors
    ///
    /// Returns a German message where the browser offers no WebGPU.
    pub async fn new(canvas: web_sys::OffscreenCanvas) -> Result<Self, String> {
        let (width, height) = (canvas.width(), canvas.height());
        let gpu = Gpu::new(canvas, width, height).await?;
        Ok(Self {
            gpu,
            scene: Scene::new(),
            drawing: Drawing::new(),
            selected: None,
            ortho: Ortho::default(),
            orbit: Orbit::default(),
            viewports: [[0.0; 4]; 4],
            scale: 1.0,
            dark: false,
            raytrace: false,
            look: Look::Modern,
            oblique_zoom: 1.0,
            turn: Vec3::ZERO,
            ink: Ink::Screen,
            stale: true,
        })
    }

    /// Sets the size of the canvas in device pixels and the device pixels
    /// of one CSS pixel.
    pub fn resize(&mut self, width: u32, height: u32, scale: f32) {
        self.scale = scale.max(0.25);
        self.gpu.resize(width, height);
    }

    /// Sets the viewport of the view `view` in CSS pixels of the canvas,
    /// where a width of zero hides the view.
    pub fn set_viewport(&mut self, view: u32, x: f32, y: f32, width: f32, height: f32) {
        if let Some(slot) = self.viewports.get_mut(view as usize) {
            *slot = [x, y, width, height];
        }
    }

    /// Replaces the scene the views draw.
    pub fn set_scene(&mut self, scene: Scene) {
        self.scene = scene;
        self.drawing.set_scene(&self.scene);
        self.stale = true;
    }

    /// Selects the item `index`, or no item.
    pub fn set_selected(&mut self, index: Option<usize>) {
        if self.selected != index {
            self.selected = index;
            self.stale = true;
        }
    }

    /// Sets the centre of the parallel views and the CSS pixels one unit spans.
    pub fn set_ortho(&mut self, x: f32, y: f32, z: f32, pixels_per_unit: f32) {
        self.ortho = Ortho {
            center: Vec3::new(x, y, z),
            pixels_per_unit: pixels_per_unit.clamp(2.0, 400.0),
        };
    }

    /// Sets the camera of the oblique view: the target, the angles in
    /// degrees and the distance.
    pub fn set_orbit(&mut self, x: f32, y: f32, z: f32, yaw: f32, pitch: f32, distance: f32) {
        self.orbit = Orbit {
            target: Vec3::new(x, y, z),
            yaw,
            pitch: pitch.clamp(-89.0, 89.0),
            distance: distance.clamp(1.0, 400.0),
        };
    }

    /// Switches the dark theme.
    pub fn set_dark(&mut self, dark: bool) {
        self.dark = dark;
        self.update_clear();
    }

    /// Switches the classic look of version 1.3: wire models on black with
    /// the dot raster, in place of the shaded technical drawing.
    pub fn set_classic(&mut self, classic: bool) {
        self.look = if classic { Look::Classic } else { Look::Modern };
        self.update_clear();
    }

    /// Sets the 3D zoom of the oblique view, 1 for the start value of
    /// version 1.3, which keeps its own zoom apart from the normal views.
    pub fn set_oblique_zoom(&mut self, zoom: f32) {
        self.oblique_zoom = zoom.clamp(0.05, 20.0);
    }

    /// Turns the scene in the oblique view about the origin by the angles
    /// `x`, `y` and `z` in degrees, for display alone.
    pub fn set_turn(&mut self, x: f32, y: f32, z: f32) {
        self.turn = Vec3::new(x, y, z);
    }

    /// Switches the inverted drawing of the classic look, black on white.
    pub fn set_inverted(&mut self, inverted: bool) {
        self.ink = if inverted { Ink::Print } else { Ink::Screen };
    }

    /// Switches the ray tracer of the oblique view.
    pub fn set_raytrace(&mut self, on: bool) {
        self.raytrace = on;
    }

    /// Draws the four views.
    pub fn render(&mut self) {
        self.refresh();
        let views = self.views();
        let frames = Self::frames(&views);
        self.gpu.render(&frames);
    }

    /// Draws the four views into a picture of its own and answers its
    /// pixels, as `ImageData` takes them, for saving the rendered image.
    ///
    /// # Errors
    ///
    /// Returns a German message where the picture cannot be read back.
    pub async fn snapshot(&mut self) -> Result<Vec<u8>, String> {
        self.refresh();
        let views = self.views();
        let frames = Self::frames(&views);
        self.gpu.snapshot(&frames).await
    }

    /// Returns the item of the body under the CSS pixel `(x, y)` of the
    /// viewport of `view`, or `None`.
    #[must_use]
    pub fn pick(&self, view: u32, x: f32, y: f32) -> Option<usize> {
        self.camera(view as usize)
            .and_then(|camera| self.drawing.pick(&camera, x, y))
    }

    /// Returns the cameras of the four views for the overlays of the page:
    /// for each view its product of projection and view, by columns, and the
    /// width and the height of its viewport in CSS pixels, zeros for a hidden
    /// view.
    #[must_use]
    pub fn cameras(&self) -> Vec<f32> {
        let mut out = Vec::with_capacity(4 * 18);
        for i in 0..4 {
            match self.camera(i) {
                Some(camera) => {
                    out.extend_from_slice(&camera.view_proj.to_array());
                    out.extend_from_slice(&[camera.width, camera.height]);
                }
                None => out.extend_from_slice(&[0.0; 18]),
            }
        }
        out
    }

    /// Returns the box around every body as six numbers, or an empty array.
    #[must_use]
    pub fn bounds(&self) -> Vec<f32> {
        self.drawing
            .bounds()
            .map_or_else(Vec::new, |(lo, hi)| [lo.to_array(), hi.to_array()].concat())
    }
}

/// What one view draws, owned, before it becomes a [`Frame`].
struct ViewData {
    /// The viewport in pixels of the canvas.
    viewport: [f32; 4],
    /// The values of the camera.
    camera: [f32; CAMERA_VALUES],
    /// Whether the ray tracer draws the view.
    raytrace: bool,
    /// The line vertices of the grid.
    grid: Vec<f32>,
    /// The line vertices of the edges.
    lines: Vec<f32>,
    /// The point vertices of the raster of the classic look.
    dots: Vec<f32>,
    /// Whether the view draws the classic look.
    classic: bool,
}

/// The look of the views.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Look {
    /// The shaded technical drawing of version 2.0.
    Modern,
    /// The wire models on black of version 1.3.
    Classic,
}

/// How the classic look puts its colours on the views.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Ink {
    /// As on the screen of version 1.3: light on black.
    Screen,
    /// Inverted, dark on white, as the thesis prints its pictures.
    Print,
}

impl Renderer {
    /// Sets the colour between the views, the frame of the look.
    fn update_clear(&mut self) {
        let [r, g, b]: [f64; 3] = if self.look == Look::Classic {
            [0.753, 0.753, 0.753]
        } else if self.dark {
            [0.149, 0.169, 0.196]
        } else {
            [0.886, 0.886, 0.867]
        };
        self.gpu.clear = wgpu::Color { r, g, b, a: 1.0 };
    }

    /// Returns the colour behind a view.
    fn background(&self) -> [f32; 4] {
        if self.look == Look::Classic && self.ink == Ink::Print {
            [1.0, 1.0, 1.0, 1.0]
        } else if self.look == Look::Classic {
            [0.0, 0.0, 0.0, 1.0]
        } else if self.dark {
            [0.071, 0.078, 0.094, 1.0]
        } else {
            [0.988, 0.988, 0.984, 1.0]
        }
    }

    /// Uploads the faces and the program of the ray tracer where the scene
    /// or the selection changed.
    fn refresh(&mut self) {
        if self.stale {
            self.gpu.set_faces(&self.drawing.faces(self.selected));
            let (nodes, _) = raytrace::program(&self.scene, self.selected);
            self.gpu.set_nodes(&nodes);
            self.stale = false;
        }
    }

    /// Returns what each of the four views draws.
    fn views(&self) -> Vec<ViewData> {
        let node_count = raytrace::program(&self.scene, None).1;
        (0..4)
            .map(|i| {
                let Some(camera) = self.camera(i) else {
                    return ViewData {
                        viewport: [0.0; 4],
                        camera: [0.0; CAMERA_VALUES],
                        raytrace: false,
                        grid: Vec::new(),
                        lines: Vec::new(),
                        dots: Vec::new(),
                        classic: false,
                    };
                };
                let viewport = self.viewports[i].map(|v| v * self.scale);
                let raytrace = self.raytrace && View::ALL[i] == View::Oblique;
                let camera_values = self.uniforms(&camera, viewport, node_count);
                if self.look == Look::Classic {
                    let (grid, dots) = classic::raster(&camera);
                    return ViewData {
                        viewport,
                        camera: camera_values,
                        raytrace,
                        grid,
                        lines: classic::wires(&self.scene, &camera),
                        dots,
                        classic: true,
                    };
                }
                ViewData {
                    viewport,
                    camera: camera_values,
                    raytrace,
                    grid: drawing::grid(&camera),
                    lines: self.drawing.lines(&camera, self.selected),
                    dots: Vec::new(),
                    classic: false,
                }
            })
            .collect()
    }

    /// Returns the frames over `views`.
    fn frames(views: &[ViewData]) -> Vec<Frame<'_>> {
        views
            .iter()
            .map(|view| Frame {
                viewport: view.viewport,
                camera: view.camera,
                raytrace: view.raytrace,
                grid: &view.grid,
                lines: &view.lines,
                dots: &view.dots,
                classic: view.classic,
            })
            .collect()
    }

    /// Returns the camera of the view of index `index` over its viewport,
    /// or `None` for a hidden view.
    fn camera(&self, index: usize) -> Option<Camera> {
        let view = *View::ALL.get(index)?;
        let [_, _, width, height] = self.viewports[index];
        if width < 1.0 || height < 1.0 {
            return None;
        }
        match view {
            View::Oblique if self.look == Look::Classic => {
                Some(Camera::cavalier(self.oblique_zoom, width, height).turned(self.turn))
            }
            View::Oblique => {
                let orbit = Orbit {
                    distance: self.orbit.distance / self.oblique_zoom,
                    ..self.orbit
                };
                Some(Camera::oblique(&orbit, width, height).turned(self.turn))
            }
            _ => Camera::parallel(view, &self.ortho, width, height),
        }
    }

    /// Returns the values of the struct `Camera` of common.wgsl.
    fn uniforms(&self, camera: &Camera, viewport: [f32; 4], nodes: usize) -> [f32; CAMERA_VALUES] {
        let mut out = [0.0; CAMERA_VALUES];
        out[0..16].copy_from_slice(&camera.view_proj.to_array());
        let inverse = camera.view_proj.inverse().unwrap_or(camera.view_proj);
        out[16..32].copy_from_slice(&inverse.to_array());
        let parallel = if camera.parallel { 1.0 } else { 0.0 };
        out[32..36].copy_from_slice(&[camera.eye.x, camera.eye.y, camera.eye.z, parallel]);
        let toward = camera.toward;
        let ppu = camera.pixels_per_unit * self.scale;
        out[36..40].copy_from_slice(&[toward.x, toward.y, toward.z, ppu]);
        out[40..43].copy_from_slice(&camera.right.to_array());
        out[44..47].copy_from_slice(&camera.up.to_array());
        out[48..52].copy_from_slice(&viewport);
        let dark = if self.dark { 1.0 } else { 0.0 };
        let classic = match (self.look, self.ink) {
            (Look::Classic, Ink::Print) => 2.0,
            (Look::Classic, Ink::Screen) => 1.0,
            (Look::Modern, _) => 0.0,
        };
        out[52..56].copy_from_slice(&[dark, nodes as f32, self.scale, classic]);
        out[56..60].copy_from_slice(&self.background());
        out
    }
}
