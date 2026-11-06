// SPDX-License-Identifier: GPL-2.0-only
//
// 3D-Bausteine worker.js: the script of the Web Worker. It runs the module
// of WebAssembly with the service of Aosabi, which answers the GraphQL
// requests of the page, and the renderer, which draws the four views with
// WebGPU into the OffscreenCanvas the page hands over.
//
// Messages from the page, each an object with a type:
//   init      { canvas, width, height, scale, offscreen }   the canvas is transferred
//   graphql   { id, body }                                   body is the JSON of a GraphQL request
//   state     { size, viewports, ortho, orbit, obliqueZoom, turn, dark, classic, inverted,
//               raytrace, scene, selected, preview }
//   pick      { id, view, x, y }
//   bounds    { id }
//   snapshot  { id }
// Messages to the page:
//   ready     { id, schema }
//   graphql   { id, body }                                   body is the JSON text of the response
//   frame     { cameras }                                    four times view_proj by columns, width, height
//   pick      { id, item }                                   the id of the item, or an empty id
//   bounds    { id, bounds }
//   snapshot  { id, width, height, pixels }                  pixels is transferred
//   error     { id, message }

import init, { Worker as Engine } from '../pkg/bausteine_web.js';

let engine = null;
let canvas = null;
let frame = 0;
let resolveReady;
const ready = new Promise((resolve) => {
  resolveReady = resolve;
});

/** Posts `message` to the page, handing over the buffers of `transfer`. */
function post(message, transfer = []) {
  self.postMessage(message, transfer);
}

/** Draws one frame soon, once however many changes arrive before it. */
function invalidate() {
  if (frame) return;
  const next = self.requestAnimationFrame?.bind(self) ?? ((f) => setTimeout(f, 16));
  frame = next(() => {
    frame = 0;
    if (!engine) return;
    const cameras = engine.render();
    post({ type: 'frame', cameras }, [cameras.buffer]);
  });
}

/**
 * Makes the canvas draw into an offscreen texture of its device. The headless
 * SwiftShader of the test notebooks loses its device on the first present to
 * a canvas, so the page asks for this with the address ?offscreen, and reads
 * the pixels back through snapshot as it does in a browser.
 */
function drawOffscreen() {
  const store = new WeakMap();
  GPUCanvasContext.prototype.configure = function configure(config) {
    store.set(this, { ...config, texture: null });
  };
  GPUCanvasContext.prototype.getCurrentTexture = function getCurrentTexture() {
    const c = store.get(this);
    const { width, height } = this.canvas;
    if (!c.texture || c.texture.width !== width || c.texture.height !== height) {
      c.texture?.destroy();
      c.texture = c.device.createTexture({
        size: [width, height],
        format: c.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
    }
    return c.texture;
  };
}

/** Applies a state message to the renderer and the views. */
function applyState(m) {
  if (m.size) {
    canvas.width = m.size.width;
    canvas.height = m.size.height;
    engine.resize(m.size.width, m.size.height, m.size.scale);
  }
  if (m.viewports) {
    m.viewports.forEach((v, i) => engine.set_viewport(i, v[0], v[1], v[2], v[3]));
  }
  if (m.ortho) engine.set_ortho(m.ortho.x, m.ortho.y, m.ortho.z, m.ortho.ppu);
  if (m.orbit) {
    const o = m.orbit;
    engine.set_orbit(o.x, o.y, o.z, o.yaw, o.pitch, o.distance);
  }
  if (m.obliqueZoom !== undefined) engine.set_oblique_zoom(m.obliqueZoom);
  if (m.turn) engine.set_turn(m.turn.x, m.turn.y, m.turn.z);
  if (m.dark !== undefined) engine.set_dark(m.dark);
  if (m.classic !== undefined) engine.set_classic(m.classic);
  if (m.inverted !== undefined) engine.set_inverted(m.inverted);
  if (m.raytrace !== undefined) engine.set_raytrace(m.raytrace);
  if (m.scene !== undefined) engine.show(m.scene ?? '');
  if (m.selected !== undefined) engine.set_selected(m.selected ?? '');
  if (m.preview !== undefined) engine.set_preview(m.preview ?? new Float32Array());
}

async function handle(m) {
  if (m.type === 'init') {
    if (m.offscreen) drawOffscreen();
    await init();
    canvas = m.canvas;
    canvas.width = m.width;
    canvas.height = m.height;
    engine = await Engine.create(canvas);
    engine.resize(m.width, m.height, m.scale);
    resolveReady();
    post({ type: 'ready', id: m.id, schema: engine.schema() });
    return;
  }
  await ready;
  switch (m.type) {
    case 'graphql':
      post({ type: 'graphql', id: m.id, body: engine.graphql(m.body) });
      invalidate();
      break;
    case 'state':
      applyState(m);
      invalidate();
      break;
    case 'pick':
      post({ type: 'pick', id: m.id, item: engine.pick(m.view, m.x, m.y) });
      break;
    case 'bounds':
      post({ type: 'bounds', id: m.id, bounds: Array.from(engine.bounds()) });
      break;
    case 'snapshot': {
      const pixels = await engine.snapshot();
      post({ type: 'snapshot', id: m.id, width: canvas.width, height: canvas.height, pixels }, [pixels.buffer]);
      break;
    }
    default:
      post({ type: 'error', id: m.id, message: `unknown message ${m.type}` });
  }
}

// Messages run one after the other, so a GraphQL request never overtakes
// the state that came before it.
let queue = Promise.resolve();
self.onmessage = (event) => {
  const m = event.data;
  queue = queue.then(() => handle(m)).catch((error) => {
    post({ type: 'error', id: m.id, message: String(error?.message ?? error) });
  });
};
