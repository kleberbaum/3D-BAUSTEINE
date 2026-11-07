// SPDX-License-Identifier: GPL-2.0-only
/*
 * bausteine-web worker: the engine and the renderer, as wasm-bindgen exports them to the Web Worker.
 */

//! The engine and the renderer, joined for the script of the Web Worker.
//!
//! The script `web/js/worker.js` turns each message of the page into one
//! call of a [`Worker`] method, and `Documentation/worker.md` names the
//! messages with their fields. A method that fails rejects with an `Error`
//! of JavaScript whose message is German, for the person at the page, and
//! whose property `detail` holds the text of Rust, of wgpu or of the
//! browser, for the console. A panic is logged to the console and handed
//! to the function `bausteinePanic` of the global scope of the worker where
//! the script defines one, so the script answers the page with a fatal
//! error before the module of WebAssembly traps.

use std::fmt::Write as _;

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
    gpu::Failure,
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
    /// Rejects with an `Error` of a German message and a `detail` where the
    /// boot fails or the browser offers no WebGPU in a worker.
    pub async fn create(canvas: web_sys::OffscreenCanvas) -> Result<Worker, JsValue> {
        std::panic::set_hook(Box::new(|info| {
            let text = info.to_string();
            web_sys::console::error_1(&JsValue::from_str(&text));
            report_panic(&text);
        }));
        let engine = Engine::boot().map_err(|e| {
            error(&Failure::new(
                "Der Dienst von 3D-Bausteine startet nicht",
                e,
            ))
        })?;
        let renderer = Renderer::new(canvas).await.map_err(|e| error(&e))?;
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

    /// Moves the picture of the classic Schrägriss by `x` CSS pixels to the
    /// right and `y` down from the origin of version 1.3.
    pub fn set_oblique_pan(&mut self, x: f32, y: f32) {
        self.renderer.set_oblique_pan(x, y);
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

    /// Draws the four views into a picture of its own and returns its
    /// pixels: red, green, blue and alpha, rows packed tightly, alpha 255,
    /// over the size that `dump` names.
    ///
    /// # Errors
    ///
    /// Rejects with an `Error` of a German message and a `detail` where the
    /// picture cannot be read back.
    pub async fn snapshot(&mut self) -> Result<Vec<u8>, JsValue> {
        self.renderer.snapshot().await.map_err(|e| error(&e))
    }

    /// Returns the revision of the shown scene the views draw, `-1` where
    /// no scene is shown or the service keeps no such scene, so that a
    /// frame tells which state of the scene it shows.
    #[must_use]
    pub fn revision(&self) -> i32 {
        self.revision
    }

    /// Returns the state of the worker as the text of a JSON object, for the
    /// test notebooks and the console: the shown scene with its revision and
    /// the ids of its items, what the renderer was told last with its limits
    /// applied, the selection, whether a body is being placed, the size of
    /// the canvas and the adapter. The content of the scene is not in it,
    /// since GraphQL answers that.
    #[must_use]
    pub fn dump(&self) -> String {
        let s = self.renderer.settings();
        let viewports: Vec<String> = s.viewports.iter().map(|v| numbers(v)).collect();
        let ids: Vec<String> = self.ids.iter().map(|id| text(id)).collect();
        let fields = [
            ("shown", self.shown.as_deref().map_or_else(null, text)),
            ("revision", self.revision.to_string()),
            ("ids", format!("[{}]", ids.join(","))),
            ("viewports", format!("[{}]", viewports.join(","))),
            (
                "ortho",
                object(&[
                    ("x", number(s.ortho.center.x)),
                    ("y", number(s.ortho.center.y)),
                    ("z", number(s.ortho.center.z)),
                    ("ppu", number(s.ortho.pixels_per_unit)),
                ]),
            ),
            (
                "orbit",
                object(&[
                    ("x", number(s.orbit.target.x)),
                    ("y", number(s.orbit.target.y)),
                    ("z", number(s.orbit.target.z)),
                    ("yaw", number(s.orbit.yaw)),
                    ("pitch", number(s.orbit.pitch)),
                    ("distance", number(s.orbit.distance)),
                ]),
            ),
            ("obliqueZoom", number(s.oblique_zoom)),
            (
                "obliquePan",
                object(&[
                    ("x", number(s.oblique_pan[0])),
                    ("y", number(s.oblique_pan[1])),
                ]),
            ),
            (
                "turn",
                object(&[
                    ("x", number(s.turn.x)),
                    ("y", number(s.turn.y)),
                    ("z", number(s.turn.z)),
                ]),
            ),
            ("classic", s.classic.to_string()),
            ("dark", s.dark.to_string()),
            ("inverted", s.inverted.to_string()),
            ("raytrace", s.raytrace.to_string()),
            ("selected", self.selected.as_deref().map_or_else(null, text)),
            ("preview", self.preview.is_some().to_string()),
            (
                "size",
                object(&[
                    ("width", s.width.to_string()),
                    ("height", s.height.to_string()),
                    ("scale", number(s.scale)),
                ]),
            ),
            (
                "adapter",
                object(&[("name", text(&s.adapter)), ("backend", text("webgpu"))]),
            ),
        ];
        object(&fields)
    }

    /// Frees the device of WebGPU with every buffer and texture on the GPU.
    /// The object is gone after it, and the script ends the worker, which
    /// takes the service and its scenes with it.
    pub fn close(self) {
        self.renderer.close();
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

/// Returns the `Error` of JavaScript of `failure`: its German message, and
/// its detail as the property `detail`.
fn error(failure: &Failure) -> JsValue {
    let error = js_sys::Error::new(&failure.message);
    let _ = js_sys::Reflect::set(
        &error,
        &JsValue::from_str("detail"),
        &JsValue::from_str(&failure.detail),
    );
    error.into()
}

/// Hands the text of a panic to the function `bausteinePanic` of the global
/// scope, where the script of the worker defines one.
fn report_panic(text: &str) {
    let global = js_sys::global();
    let Ok(report) = js_sys::Reflect::get(&global, &JsValue::from_str("bausteinePanic")) else {
        return;
    };
    if let Some(report) = report.dyn_ref::<js_sys::Function>() {
        let _ = report.call1(&global, &JsValue::from_str(text));
    }
}

/// Returns the JSON object of `fields`, each a name and the JSON text of its value.
fn object(fields: &[(&str, String)]) -> String {
    let fields: Vec<String> = fields
        .iter()
        .map(|(name, value)| format!("{}:{value}", text(name)))
        .collect();
    format!("{{{}}}", fields.join(","))
}

/// Returns the JSON array of `values`.
fn numbers(values: &[f32]) -> String {
    let values: Vec<String> = values.iter().map(|&v| number(v)).collect();
    format!("[{}]", values.join(","))
}

/// Returns the JSON number of `value`, or `null` for a value that is not finite.
fn number(value: f32) -> String {
    if value.is_finite() {
        value.to_string()
    } else {
        null()
    }
}

/// Returns the JSON `null`.
fn null() -> String {
    String::from("null")
}

/// Returns the JSON string of `value`.
fn text(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for c in value.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            c if u32::from(c) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", u32::from(c));
            }
            c => out.push(c),
        }
    }
    out.push('"');
    out
}
