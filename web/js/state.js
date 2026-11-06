// SPDX-License-Identifier: GPL-2.0-only
//
// 3D-Bausteine state.js: the state every part of the page shares. It holds
// the scene of the page with its list OBJEKTE, the selection, the zoom of
// the views, the look, the history for an undo, and the small helpers the
// modules use: the status field of F5, the message boxes and the events by
// which a module tells the others that something changed.

/** Returns the first element that matches `selector` inside `root`. */
export const $ = (selector, root = document) => root.querySelector(selector);

/** Returns every element that matches `selector` inside `root`. */
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** The defaults of the tab Einstellung, `Def_Datei` of version 1.3. */
export const DEFAULT_PATHS = {
  bauHome: 'C:\\3DBAU\\',
  povHome: 'C:\\3DBAU\\POV31\\',
  bspHome: 'C:\\3DBAU\\',
  bspDef: 'ausgabe',
};

/** The camera of the export of version 1.3, `location <15,8,-15> look_at <0,0,0>`, in the coordinates of the lesson. */
export const POV_CAMERA = { eye: { x: 15, y: 15, z: 8 }, target: { x: 0, y: 0, z: 0 } };

/** Reads the value `key` of the storage of the browser as JSON, or `fallback`. */
export function stored(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

/** Writes `value` as JSON under `key` into the storage of the browser, where it can. */
export function store(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or blocked storage keeps the value for this visit alone.
  }
}

/** The state of the page. */
export const app = {
  bridge: null,
  store: null,
  shelf: null,
  ready: false,
  sceneKey: null,
  textures: [],
  examples: [],
  scene: { id: null, name: '', revision: 0, items: [] },
  /** The lines of the list OBJEKTE, as `Scene.list` answers them. */
  lines: [{ text: '0 Raster', item: null, end: false }],
  /** The index of the selected line of the list OBJEKTE, -1 for none. */
  line: -1,
  /** The look: 'modern' or 'classic'. */
  look: document.documentElement.dataset.look === 'classic' ? 'classic' : 'modern',
  dark: document.documentElement.dataset.theme === 'dark',
  inverted: stored('bausteine.inverted', false),
  /** The mode of the tool bar: 'position', 'einfuegen' or 'bearbeiten'. */
  mode: 'position',
  /** The 2D zoom `zoomf` of version 1.3, which starts at 10 and steps once to 12. */
  zoomf: 12,
  /** The 3D zoom `d3zoomf` of version 1.3, which starts at 10. */
  d3zoomf: 10,
  /** The centre of the normal views in the modern look. */
  center: { x: 5, y: 5, z: 4 },
  orbit: { x: 2.5, y: 2.5, z: 1.5, yaw: 45, pitch: 24, distance: 22 },
  turn: { x: 0, y: 0, z: 0 },
  raytrace: false,
  /** The view that fills the area of the views alone, null for all four. */
  maximized: null,
  /** The camera of the export, null for the camera of version 1.3. */
  povCamera: null,
  settings: {
    snap: 1,
    geo: '#008080',
    screen: 'window',
    ...stored('bausteine.display', {}),
  },
  paths: { ...DEFAULT_PATHS, ...stored('bausteine.einstellung', {}) },
  history: [],
  future: [],
  palette: 0,
};

/** The events of the page, one EventTarget the modules share. */
const events = new EventTarget();

/** Calls `listener` with the detail of every event `name`. */
export function on(name, listener) {
  events.addEventListener(name, (event) => listener(event.detail));
}

/** Sends the event `name` with `detail` to every listener. */
export function emit(name, detail) {
  events.dispatchEvent(new CustomEvent(name, { detail }));
}

/** Returns the item `id` of the scene, or null. */
export function itemById(id) {
  if (id == null) return null;
  return app.scene.items.find((item) => item.id === id) ?? null;
}

/** Returns the selected line of the list OBJEKTE, or null. */
export function selectedLine() {
  return app.lines[app.line] ?? null;
}

/** Returns the item of the selected line, or null for the raster and no selection. */
export function selectedItem() {
  return itemById(selectedLine()?.item);
}

/** A colour for each new body, taken in turn, as `random_defcolor` of version 1.3 but visible on black and on white. */
export const PALETTE = ['#d94841', '#f2a33a', '#3a8fd9', '#4caf50', '#9c6ade', '#e0c341', '#26a69a', '#ec407a', '#8d6e63', '#5c7cfa'];

/** Returns the next colour of the palette. */
export function nextColor() {
  const color = PALETTE[app.palette % PALETTE.length];
  app.palette += 1;
  return color;
}

let statusTimer = 0;

/**
 * Writes `text` into the status field of F5, `TStatus` of version 1.3.
 * A text with `seconds` goes away again after that time.
 */
export function setStatus(text, seconds = 0) {
  const field = $('#tstatus');
  if (!field) return;
  clearTimeout(statusTimer);
  field.value = text;
  field.textContent = text;
  field.title = text;
  if (seconds > 0) statusTimer = setTimeout(() => setStatus(''), seconds * 1000);
}

let toastTimer = 0;

/** Shows `text` briefly at the bottom of the page in the modern look, in the status field in the classic look. */
export function toast(text) {
  if (app.look === 'classic') {
    setStatus(text, 4);
    return;
  }
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 3200);
}

/** Runs `action` and answers its result, or shows its error and answers null. */
export async function safe(action) {
  try {
    return await action();
  } catch (error) {
    toast(String(error?.message ?? error));
    return null;
  }
}

/** Returns a deep copy of the items of the scene. */
export function snapshotItems() {
  return app.scene.items.map((item) => structuredClone(item));
}

/** Rounds `value` to three places for the fields, without a trailing zero. */
export function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

/** Writes the number `value` as the fields of version 1.3 show it, with the decimal comma of the German locale. */
export function formatNumber(value) {
  if (value === '' || value == null || Number.isNaN(Number(value))) return '';
  return String(round(value)).replace('.', ',');
}

/** Reads a number typed with a comma or a point, or answers `fallback`. */
export function parseNumber(text, fallback = 0) {
  const value = Number(String(text ?? '').trim().replace(',', '.'));
  return Number.isFinite(value) && String(text ?? '').trim() !== '' ? value : fallback;
}

/** Escapes `text` for HTML. */
export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Offers `data` as a download named `name` of the media type `type`. */
export function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
