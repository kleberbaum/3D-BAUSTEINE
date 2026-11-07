// SPDX-License-Identifier: GPL-2.0-only
//
// 3D-Bausteine worker.js: the script of the Web Worker. It runs the module
// of WebAssembly with the service of Aosabi, which answers the GraphQL
// requests of the page, and the renderer, which draws the four views with
// WebGPU into the OffscreenCanvas the page hands over. Each message is one
// call of a method of the module, and the messages run one after the
// other, so a request never overtakes the state that came before it.
// Documentation/worker.md is the reference of the protocol.
//
// Messages from the page, each an object with a type:
//   init      { id, canvas, width, height, scale, offscreen }  the canvas is transferred
//   graphql   { id, body }                                      body is the JSON of a GraphQL request
//   state     { size, viewports, ortho, orbit, obliqueZoom, obliquePan, turn, dark, classic,
//               inverted, raytrace, scene, selected, preview }  the preview buffer may be transferred
//   pick      { id, view, x, y }
//   bounds    { id }
//   snapshot  { id }
//   render    { id }                                            draws now and answers the frame
//   dump      { id }
//   close     { }                                               frees the device and ends the worker
// Messages to the page:
//   ready     { id, protocol, schema, adapter }
//   graphql   { id, body }                                      body is the JSON text of the response
//   frame     { id?, cameras, revision }                        four times view_proj by columns, width, height
//   pick      { id, item }                                      the id of the item, or an empty id
//   bounds    { id, bounds }
//   snapshot  { id, width, height, pixels }                     RGBA, alpha 255, pixels is transferred
//   dump      { id, state }
//   error     { id?, message, detail?, fatal? }                 message is German, detail for the console

import init, { Worker as Engine } from '../pkg/bausteine_web.js';

/** The version of the protocol, which bridge.js holds as well and compares with `ready`. */
const PROTOCOL = 1;

/** The message of a panic of the module, after which the worker answers nothing more. */
const CRASHED = 'Der Web Worker ist ausgefallen und muss neu geladen werden';

let engine = null;
let canvas = null;
// The function that withdraws the frame asked for, or null when none is asked for.
let frame = null;
// The message the worker handles now, whose id a panic answers.
let current = null;
// The message and the detail of the panic, once there was one.
let fatal = null;

/** Posts `message` to the page, handing over the buffers of `transfer`. */
function post(message, transfer = []) {
  self.postMessage(message, transfer);
}

/** Returns an error of the German `message` with the text `detail` for the console. */
function failure(message, detail) {
  const error = new Error(message);
  error.detail = String(detail?.message ?? detail);
  return error;
}

/** Throws where the worker was never started. */
function running() {
  if (!engine) throw failure('Der Web Worker ist nicht gestartet', 'no init before this message');
}

/** Draws the four views and posts the frame, with `id` where it answers a render. */
function draw(id) {
  const cameras = engine.render();
  const message = { type: 'frame', cameras, revision: engine.revision() };
  if (id !== undefined) message.id = id;
  post(message, [cameras.buffer]);
}

/** Withdraws the frame asked for, if any. */
function cancelFrame() {
  frame?.();
  frame = null;
}

/**
 * Draws one frame soon, once however many changes arrive before it. The
 * frame runs through the queue of the messages, so it never draws while a
 * snapshot waits for its pixels.
 */
function invalidate() {
  if (frame || !engine) return;
  const run = () => {
    frame = null;
    enqueue({}, () => {
      if (engine) draw();
    });
  };
  if (self.requestAnimationFrame) {
    const handle = self.requestAnimationFrame(run);
    frame = () => self.cancelAnimationFrame(handle);
  } else {
    const handle = setTimeout(run, 16);
    frame = () => clearTimeout(handle);
  }
}

/**
 * Makes the canvas draw into an offscreen texture of its device. The headless
 * SwiftShader of the test notebooks loses its device on the first present to
 * a canvas, so the page asks for this with the address ?offscreen, and reads
 * the pixels back through snapshot as it does in a browser.
 */
function drawOffscreen() {
  if (typeof GPUCanvasContext === 'undefined') return;
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

/** Starts the module and WebGPU on the canvas of the message `init`, and answers `ready`. */
async function start(m) {
  if (engine) throw failure('Der Web Worker läuft schon', 'a second init');
  if (!self.navigator?.gpu) {
    throw failure('Dieser Browser bietet WebGPU in einem Web Worker nicht an', 'navigator.gpu is undefined in the worker');
  }
  if (m.offscreen) drawOffscreen();
  try {
    await init();
  } catch (error) {
    throw failure('Das Modul von WebAssembly lässt sich nicht laden', error);
  }
  canvas = m.canvas;
  canvas.width = m.width;
  canvas.height = m.height;
  engine = await Engine.create(canvas);
  engine.resize(m.width, m.height, m.scale);
  const { adapter } = JSON.parse(engine.dump());
  post({ type: 'ready', id: m.id, protocol: PROTOCOL, schema: engine.schema(), adapter });
}

/** Applies a state message to the renderer and the views, in the order of Documentation/worker.md. */
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
  if (m.obliquePan) engine.set_oblique_pan(m.obliquePan.x, m.obliquePan.y);
  if (m.turn) engine.set_turn(m.turn.x, m.turn.y, m.turn.z);
  if (m.dark !== undefined) engine.set_dark(m.dark);
  if (m.classic !== undefined) engine.set_classic(m.classic);
  if (m.inverted !== undefined) engine.set_inverted(m.inverted);
  if (m.raytrace !== undefined) engine.set_raytrace(m.raytrace);
  if (m.scene !== undefined) engine.show(m.scene ?? '');
  if (m.selected !== undefined) engine.set_selected(m.selected ?? '');
  if (m.preview !== undefined) engine.set_preview(m.preview ?? new Float32Array());
}

/** Frees the device and ends the worker. */
function close() {
  cancelFrame();
  if (engine) {
    engine.close();
    engine = null;
  }
  self.close();
}

async function handle(m) {
  switch (m.type) {
    case 'init':
      await start(m);
      break;
    case 'graphql':
      running();
      post({ type: 'graphql', id: m.id, body: engine.graphql(m.body) });
      invalidate();
      break;
    case 'state':
      running();
      applyState(m);
      invalidate();
      break;
    case 'pick':
      running();
      post({ type: 'pick', id: m.id, item: engine.pick(m.view, m.x, m.y) });
      break;
    case 'bounds':
      running();
      post({ type: 'bounds', id: m.id, bounds: Array.from(engine.bounds()) });
      break;
    case 'snapshot': {
      running();
      const pixels = await engine.snapshot();
      const { size } = JSON.parse(engine.dump());
      post({ type: 'snapshot', id: m.id, width: size.width, height: size.height, pixels }, [pixels.buffer]);
      break;
    }
    case 'render':
      running();
      cancelFrame();
      draw(m.id);
      break;
    case 'dump':
      running();
      post({ type: 'dump', id: m.id, state: JSON.parse(engine.dump()) });
      break;
    case 'close':
      close();
      break;
    default:
      throw failure(`Unbekannte Nachricht an den Web Worker: ${m.type}`, `unknown message type ${m.type}`);
  }
}

/**
 * Answers the page with a fatal error after a panic of the module, once.
 * The module of WebAssembly cannot go on after a panic, so the worker
 * answers every later message with the same error, and the page shows its
 * fallback with the offer to load the page anew.
 */
function crash(detail, id = current?.id) {
  if (fatal) return;
  fatal = { message: CRASHED, detail: String(detail) };
  cancelFrame();
  post({ type: 'error', id, fatal: true, ...fatal });
}

/** Answers the message `m` with the error `error`: German, with the English text as the detail. */
function answerError(m, error) {
  if (fatal) return;
  if (error instanceof WebAssembly.RuntimeError) {
    crash(error.stack ?? error, m.id);
    return;
  }
  const german = typeof error?.detail === 'string';
  post({
    type: 'error',
    id: m.id,
    message: german ? error.message : `Der Web Worker scheitert an der Nachricht ${m.type ?? 'frame'}`,
    detail: german ? error.detail : String(error?.message ?? error),
  });
}

// Messages run one after the other, so a GraphQL request never overtakes
// the state that came before it, and a frame reflects every state message
// before it.
let queue = Promise.resolve();

/** Runs `task` for the message `m` after every message before it. */
function enqueue(m, task) {
  queue = queue.then(async () => {
    if (fatal) {
      if (m.id !== undefined) post({ type: 'error', id: m.id, fatal: true, ...fatal });
      return;
    }
    current = m;
    try {
      await task();
    } catch (error) {
      answerError(m, error);
    } finally {
      current = null;
    }
  });
}

// The panic hook of the module calls this function with the text of the
// panic before the module traps. An error that no message caught, a trap
// inside a promise of the module for example, ends the worker the same way.
self.bausteinePanic = (text) => crash(text);
self.addEventListener('error', (event) => {
  crash(event.error?.stack ?? event.message);
  event.preventDefault();
});

self.onmessage = (event) => {
  const m = event.data ?? {};
  enqueue(m, () => handle(m));
};
