// SPDX-License-Identifier: GPL-2.0-only
//
// 3D-Bausteine bridge.js: the page side of the Web Worker. It starts the
// worker, hands it the canvas, sends GraphQL requests and state, and keeps
// the cameras of the last frame, from which the page projects the points
// of its overlays without asking the worker.

/** The views in the order of the renderer, View::ALL of bausteine-core. */
export const VIEWS = [
  { name: 'Aufriss', axes: ['y', 'z'], hidden: 'x', right: ['y', 1], up: ['z', 1] },
  { name: 'Kreuzriss', axes: ['x', 'z'], hidden: 'y', right: ['x', -1], up: ['z', 1] },
  { name: 'Grundriss', axes: ['y', 'x'], hidden: 'z', right: ['y', 1], up: ['x', -1] },
  { name: 'Schrägriss', axes: [], hidden: null, right: null, up: null },
];
export const OBLIQUE = 3;

/** The page side of the Web Worker. */
export class Bridge {
  constructor() {
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.next = 1;
    this.pending = new Map();
    this.cameras = null;
    this.frameListeners = [];
    this.worker.onmessage = (event) => this.receive(event.data);
    this.worker.onerror = (event) => {
      const message = event.message || 'Der Web Worker ist ausgefallen';
      for (const { reject } of this.pending.values()) reject(new Error(message));
      this.pending.clear();
      this.failure?.(message);
    };
  }

  /** Hands the canvas to the worker and waits until its engine and WebGPU are up. */
  init(canvas, { width, height, scale, offscreen }) {
    const offscreenCanvas = canvas.transferControlToOffscreen();
    return this.call('init', { canvas: offscreenCanvas, width, height, scale, offscreen }, [offscreenCanvas]);
  }

  /** Sends one message with an id and answers the reply with the same id. */
  call(type, payload = {}, transfer = []) {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type, id, ...payload }, transfer);
    });
  }

  receive(m) {
    if (m.type === 'frame') {
      this.cameras = m.cameras;
      for (const listener of this.frameListeners) listener(m.cameras);
      return;
    }
    const waiting = this.pending.get(m.id);
    if (!waiting) {
      if (m.type === 'error') console.error(m.message);
      return;
    }
    this.pending.delete(m.id);
    if (m.type === 'error') waiting.reject(new Error(m.message));
    else waiting.resolve(m);
  }

  /** Sends one GraphQL request and answers its response body as an object. */
  async graphql(query, variables = {}) {
    const reply = await this.call('graphql', { body: JSON.stringify({ query, variables }) });
    return JSON.parse(reply.body);
  }

  /** Sends state to the renderer, which draws a frame after it. */
  state(fields) {
    this.worker.postMessage({ type: 'state', ...fields });
  }

  /** Answers the id of the item under the CSS pixel (x, y) of the view `view`, or an empty id. */
  async pick(view, x, y) {
    return (await this.call('pick', { view, x, y })).item;
  }

  /** Answers the box around every body as six numbers, or an empty array. */
  async bounds() {
    return (await this.call('bounds')).bounds;
  }

  /** Answers the pixels of all four views with the size of the canvas. */
  async snapshot() {
    return this.call('snapshot');
  }

  /** Calls `listener` with the cameras after every frame. */
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
