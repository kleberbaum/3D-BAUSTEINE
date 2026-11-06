// SPDX-License-Identifier: GPL-2.0-only
/*
 * bausteine-web worker: the engine and the renderer, as wasm-bindgen exports them to the Web Worker.
 */

//! The engine and the renderer, joined for the script of the Web Worker.

use bausteine_core::{
    packed,
    scene::{
        Item,
        Scene, //
    },
};
use wasm_bindgen::prelude::*;

use crate::{
    engine::Engine,
    renderer::Renderer, //
};

/// The Web Worker of the page: the GraphQL engine and the renderer of one canvas.
#[wasm_bindgen]
pub struct Worker {
    /// The service with its GraphQL API.
    engine: Engine,
    /// The renderer of the canvas.
    renderer: Renderer,
    /// The id of the scene the views draw.
    shown: Option<String>,
    /// The revision of the shown scene the views draw.
    revision: i32,
    /// The ids of the items of the shown scene, in their order.
    ids: Vec<String>,
    /// The shown scene as the service holds it.
    base: Scene,
    /// The body the page is placing, drawn after the items of the scene.
    preview: Option<Item>,
    /// The id of the selected item.
    selected: Option<String>,
}

#[wasm_bindgen]
impl Worker {
    /// Boots the engine and opens WebGPU on `canvas`.
    ///
    /// # Errors
    ///
    /// Rejects with a German message where the boot fails or the browser
    /// offers no WebGPU in a worker.
    pub async fn create(canvas: web_sys::OffscreenCanvas) -> Result<Worker, JsValue> {
        std::panic::set_hook(Box::new(|info| {
            web_sys::console::error_1(&JsValue::from_str(&info.to_string()));
        }));
        let engine = Engine::boot().map_err(|e| JsValue::from_str(&e))?;
        let renderer = Renderer::new(canvas)
            .await
            .map_err(|e| JsValue::from_str(&e))?;
        Ok(Self {
            engine,
            renderer,
            shown: None,
            revision: -1,
            ids: Vec::new(),
            base: Scene::new(),
            preview: None,
            selected: None,
        })
    }

    /// Returns the schema text of the GraphQL API.
    #[must_use]
    pub fn schema(&self) -> String {
        String::from(self.engine.schema())
    }

    /// Answers the GraphQL request of the JSON body `body` with the JSON text
    /// of its response body, and lets the views follow a change of the
    /// shown scene.
    pub fn graphql(&mut self, body: &str) -> String {
        let answer = self.engine.answer(body);
        self.sync();
        answer
    }

    /// Lets the views draw the scene `id`.
    pub fn show(&mut self, id: &str) {
        self.shown = Some(String::from(id));
        self.revision = -1;
        self.sync();
    }

    /// Selects the item `id`, or no item for an empty id.
    pub fn set_selected(&mut self, id: &str) {
        self.selected = (!id.is_empty()).then(|| String::from(id));
        self.push();
    }

    /// Sets the body the page is placing, one packed item, or none for no values.
    pub fn set_preview(&mut self, values: &[f32]) {
        self.preview = packed::decode(values).items.into_iter().next();
        self.push();
    }

    /// Sets the size of the canvas in device pixels and the device pixels of
    /// one CSS pixel.
    pub fn resize(&mut self, width: u32, height: u32, scale: f32) {
        self.renderer.resize(width, height, scale);
    }

    /// Sets the viewport of the view `view` in CSS pixels of the canvas,
    /// where a width of zero hides the view.
    pub fn set_viewport(&mut self, view: u32, x: f32, y: f32, width: f32, height: f32) {
        self.renderer.set_viewport(view, x, y, width, height);
    }

    /// Sets the centre of the normal views and the CSS pixels one unit spans.
    pub fn set_ortho(&mut self, x: f32, y: f32, z: f32, pixels_per_unit: f32) {
        self.renderer.set_ortho(x, y, z, pixels_per_unit);
    }

    /// Sets the camera of the oblique view.
    pub fn set_orbit(&mut self, x: f32, y: f32, z: f32, yaw: f32, pitch: f32, distance: f32) {
        self.renderer.set_orbit(x, y, z, yaw, pitch, distance);
    }

    /// Switches the dark theme of the modern look.
    pub fn set_dark(&mut self, dark: bool) {
        self.renderer.set_dark(dark);
    }

    /// Switches the classic look of version 1.3.
    pub fn set_classic(&mut self, classic: bool) {
        self.renderer.set_classic(classic);
    }

    /// Sets the 3D zoom of the oblique view, 1 for the start of version 1.3.
    pub fn set_oblique_zoom(&mut self, zoom: f32) {
        self.renderer.set_oblique_zoom(zoom);
    }

    /// Turns the scene in the oblique view by the angles in degrees, for display alone.
    pub fn set_turn(&mut self, x: f32, y: f32, z: f32) {
        self.renderer.set_turn(x, y, z);
    }

    /// Switches the inverted drawing of the classic look.
    pub fn set_inverted(&mut self, inverted: bool) {
        self.renderer.set_inverted(inverted);
    }

    /// Switches the ray tracer of the oblique view.
    pub fn set_raytrace(&mut self, on: bool) {
        self.renderer.set_raytrace(on);
    }

    /// Draws the four views and returns their cameras, see `Renderer::cameras`.
    pub fn render(&mut self) -> Vec<f32> {
        self.renderer.render();
        self.renderer.cameras()
    }

    /// Returns the id of the item under the CSS pixel `(x, y)` of the view
    /// `view`, or an empty id.
    #[must_use]
    pub fn pick(&self, view: u32, x: f32, y: f32) -> String {
        self.renderer
            .pick(view, x, y)
            .and_then(|index| self.ids.get(index).cloned())
            .unwrap_or_default()
    }

    /// Returns the box around every body as six numbers, or none.
    #[must_use]
    pub fn bounds(&self) -> Vec<f32> {
        self.renderer.bounds()
    }

    /// Draws the four views into a picture of its own and returns its pixels.
    ///
    /// # Errors
    ///
    /// Rejects with a German message where the picture cannot be read back.
    pub async fn snapshot(&mut self) -> Result<Vec<u8>, JsValue> {
        self.renderer
            .snapshot()
            .await
            .map_err(|e| JsValue::from_str(&e))
    }
}

impl Worker {
    /// Takes the shown scene from the service where it changed.
    fn sync(&mut self) {
        let Some(id) = self.shown.clone() else {
            return;
        };
        let Some((revision, scene, ids)) = self.engine.snapshot(&id) else {
            self.revision = -1;
            self.base = Scene::new();
            self.ids.clear();
            self.push();
            return;
        };
        if revision != self.revision || ids != self.ids {
            self.revision = revision;
            self.base = scene;
            self.ids = ids;
            self.push();
        }
    }

    /// Hands the shown scene with the preview and the selection to the renderer.
    fn push(&mut self) {
        let mut scene = self.base.clone();
        let selected = if let Some(preview) = self.preview.clone() {
            Some(scene.push(preview))
        } else {
            self.selected
                .as_ref()
                .and_then(|id| self.ids.iter().position(|i| i == id))
        };
        scene.repair();
        self.renderer.set_scene(scene);
        self.renderer.set_selected(selected);
    }
}
