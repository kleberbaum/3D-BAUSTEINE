// SPDX-License-Identifier: GPL-2.0-only
//
// 3D-Bausteine bridge.js: the page side of the Web Worker. It starts the
// worker, hands it the canvas, sends GraphQL requests and state, and keeps
// the cameras of the last frame, from which the page projects the points
// of its overlays without asking the worker. It checks that the worker
// speaks its version of the protocol, writes the revision of each frame to
// the attribute data-revision of the root element, and tells the page
// through its failure callback when the worker is gone.
// Documentation/worker.md is the reference of the protocol.

/** The views in the order of the renderer, View::ALL of bausteine-core. */
export const VIEWS = [
  { name: 'Aufriss', axes: ['y', 'z'], hidden: 'x', right: ['y', 1], up: ['z', 1] },
  { name: 'Kreuzriss', axes: ['x', 'z'], hidden: 'y', right: ['x', -1], up: ['z', 1] },
  { name: 'Grundriss', axes: ['y', 'x'], hidden: 'z', right: ['y', 1], up: ['x', -1] },
  { name: 'Schrägriss', axes: [], hidden: null, right: null, up: null },
];
export const OBLIQUE = 3;

/** The version of the protocol, which worker.js holds as well and answers in `ready`. */
export const PROTOCOL = 1;

/** Returns an error of the German `message` with the text `detail` for the console. */
function failure(message, detail, fatal = false) {
  const error = new Error(message);
  if (detail !== undefined) error.detail = detail;
  if (fatal) error.fatal = true;
  return error;
}

/** The page side of the Web Worker. */
export class Bridge {
  /** The version of the protocol of this page. */
  static PROTOCOL = PROTOCOL;

  constructor() {
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.next = 1;
    this.pending = new Map();
    // The cameras and the revision of the last frame.
    this.cameras = null;
    this.revision = -1;
    // What the worker answered in `ready`.
    this.protocol = null;
    this.schema = '';
    this.adapter = null;
    // The error after which the worker answers nothing more, and whether the page closed it.
    this.broken = null;
    this.closed = false;
    // Called with a German message and a detail when the worker is gone for good.
    this.failure = null;
    this.frameListeners = [];
    this.worker.onmessage = (event) => this.receive(event.data);
    this.worker.onerror = (event) => {
      event.preventDefault?.();
      this.breakDown(failure('Der Web Worker ist ausgefallen', event.message || 'error event of the worker', true));
    };
    this.worker.onmessageerror = () => console.error('Eine Nachricht des Web Workers lässt sich nicht lesen');
    // The revision of each frame goes to the root element, where a test waits for it.
    this.onFrame((cameras, revision) => {
      if (typeof document !== 'undefined') document.documentElement.dataset.revision = String(revision);
    });
  }

  /**
   * Hands the canvas to the worker and waits until its engine and WebGPU are
   * up. Answers the message `ready`, and rejects with a German message where
   * the worker fails or speaks another version of the protocol.
   */
  async init(canvas, { width, height, scale, offscreen }) {
    const offscreenCanvas = canvas.transferControlToOffscreen();
    const ready = await this.call('init', { canvas: offscreenCanvas, width, height, scale, offscreen }, [offscreenCanvas]);
    this.protocol = ready.protocol ?? null;
    this.schema = ready.schema ?? '';
    this.adapter = ready.adapter ?? null;
    if (this.protocol !== PROTOCOL) {
      const error = failure(
        'Seite und Web Worker gehören zu verschiedenen Versionen. Neu laden holt beide frisch.',
        `the page speaks protocol ${PROTOCOL}, the worker ${this.protocol ?? 'none'}`,
        true,
      );
      this.breakDown(error);
      throw error;
    }
    return ready;
  }

  /** Sends one message with an id and answers the reply with the same id. */
  call(type, payload = {}, transfer = []) {
    if (this.broken) return Promise.reject(this.broken);
    if (this.closed) return Promise.reject(failure('Der Web Worker ist beendet', `${type} after close`));
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type, id, ...payload }, transfer);
    });
  }

  receive(m) {
    if (m.type === 'frame') {
      this.cameras = m.cameras;
      if (Number.isInteger(m.revision)) this.revision = m.revision;
      for (const listener of this.frameListeners) listener(m.cameras, this.revision);
      if (m.id === undefined) return;
    }
    if (m.type === 'error' && m.fatal) {
      this.breakDown(failure(m.message, m.detail, true));
      return;
    }
    const waiting = this.pending.get(m.id);
    if (!waiting) {
      if (m.type === 'error') console.error(m.message, m.detail ?? '');
      return;
    }
    this.pending.delete(m.id);
    if (m.type === 'error') waiting.reject(failure(m.message, m.detail));
    else waiting.resolve(m);
  }

  /** Ends every call that waits with `error` and tells the page once that the worker is gone. */
  breakDown(error) {
    if (this.broken) return;
    this.broken = error;
    for (const { reject } of this.pending.values()) reject(error);
    this.pending.clear();
    console.error(error.message, error.detail ?? '');
    this.failure?.(error.message, error.detail);
  }

  /** Sends one GraphQL request and answers its response body as an object. */
  async graphql(query, variables = {}) {
    const reply = await this.call('graphql', { body: JSON.stringify({ query, variables }) });
    return JSON.parse(reply.body);
  }

  /**
   * Sends state to the renderer, which draws a frame after it. A preview
   * that owns its whole buffer is transferred rather than copied.
   */
  state(fields) {
    if (this.broken || this.closed) return;
    const preview = fields.preview;
    const transfer = preview instanceof Float32Array && preview.byteOffset === 0
      && preview.byteLength === preview.buffer.byteLength ? [preview.buffer] : [];
    this.worker.postMessage({ type: 'state', ...fields }, transfer);
  }

  /** Answers the id of the item under the CSS pixel (x, y) of the view `view`, or an empty id. */
  async pick(view, x, y) {
    return (await this.call('pick', { view, x, y })).item;
  }

  /** Answers the box around every body as six numbers, or an empty array. */
  async bounds() {
    return (await this.call('bounds')).bounds;
  }

  /** Answers the pixels of all four views as RGBA with the size of the canvas. */
  async snapshot() {
    return this.call('snapshot');
  }

  /**
   * Lets the worker draw a frame now, after every state sent before, and
   * answers it as `{cameras, revision}`. The frame listeners hear it as well.
   */
  async render() {
    const frame = await this.call('render');
    return { cameras: frame.cameras, revision: frame.revision };
  }

  /** Answers the state of the worker, the object of Documentation/worker.md. */
  async dump() {
    return (await this.call('dump')).state;
  }

  /**
   * Lets the worker free its device and end, after the messages sent before.
   * Every call after it rejects.
   */
  close() {
    if (this.closed || this.broken) return;
    this.closed = true;
    this.worker.postMessage({ type: 'close' });
  }

  /** Calls `listener` with the cameras and the revision after every frame. */
  onFrame(listener) {
    this.frameListeners.push(listener);
  }

  /** Answers the CSS pixel of the viewport of `view` where the point (x, y, z) appears, or null. */
  project(view, x, y, z) {
    const c = this.cameras;
    if (!c) return null;
    const o = view * 18;
    const m = c.subarray(o, o + 16);
    const width = c[o + 16];
    const height = c[o + 17];
    if (!width || !height) return null;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (cw <= 1e-4) return null;
    return [(cx / cw * 0.5 + 0.5) * width, (0.5 - cy / cw * 0.5) * height];
  }
}

/**
 * Answers the point of the scene under the CSS pixel (x, y) of the normal
 * view `view` of `width` by `height`, with null for the coordinate the view
 * does not show, from the shared centre and scale of the normal views.
 */
export function unproject(view, x, y, width, height, ortho) {
  const v = VIEWS[view];
  if (!v.right) return null;
  const du = (x - width / 2) / ortho.ppu;
  const dv = (height / 2 - y) / ortho.ppu;
  const point = { x: ortho.x, y: ortho.y, z: ortho.z };
  point[v.right[0]] += du * v.right[1];
  point[v.up[0]] += dv * v.up[1];
  point[v.hidden] = null;
  return point;
}
