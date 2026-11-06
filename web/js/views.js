// SPDX-License-Identifier: GPL-2.0-only
//
// 3D-Bausteine views.js: the four views of Form1 and the bar F5 under them.
//
// The views sit as version 1.3 places them in `ViewControl`: Kreuzriss top
// left, Aufriss top right, Schrägriss bottom left and Grundriss bottom
// right. The modern look lets the grid size them and centres the scene. The
// classic look makes each view a square of half the shorter side of Form1
// and puts the origin a fifth of that side from the edges, so the first
// octant fills the view as in 1.3.
//
// The mouse does what 1.3 does: a left click in a normal view marks a point
// for the body in the making, `mark_point`, a click in the Schrägriss zooms
// it in and a right click out, the middle button shows it over all four
// fields. Version 2.0 adds what 1.3 left empty: dragging a body moves it,
// dragging empty space pans, the wheel zooms, a drag in the Schrägriss turns
// its camera, and a click on a body selects it.

import { OBLIQUE, VIEWS, unproject } from './bridge.js';
import { commit, remember, reloadScene, selectItem, selectLine } from './scene.js';
import { $, $$, app, emit, formatNumber, itemById, on, round, safe, selectedItem, setStatus, snapshotItems } from './state.js';

/** The names of the views for the field at the end of F5, as `View().name` of version 1.3 stores them. */
const SHORT_NAMES = ['Auf', 'Kreuz', 'Grund', '3D'];

/** The width of the design scale of a picture box of version 1.3, `ScaleWidth`. */
const SCALE_WIDTH = 328.27;

/** The steps of the zoom ladders: times 1.2 below 50, divided by 1.2 above 5. */
const ZOOM_MAX = 50;
const ZOOM_MIN = 5;

/** The ortho state the renderer drew with last, for turning a pixel into a point. */
let ortho = { x: 0, y: 0, z: 0, ppu: 20 };

/** The size of a view of the classic look, half of `F`. */
let classicSide = 0;

/** The offset the user panned the classic views by, in units of the scene. */
const classicPan = { x: 0, y: 0, z: 0 };

let frame = 0;
let drag = null;
let hoverView = -1;
const lastPoint = { x: null, y: null, z: null };

/** Returns the box of the view `view`. */
function viewBox(view) {
  return $(`.view[data-view="${view}"]`);
}

// ---------------------------------------------------------------------------
// Layout and cameras.

/** Sets the boxes of the views, the size of the canvas and the viewport of each view. */
export function layoutViews() {
  const views = $('#views');
  views.classList.toggle('zoomed-d3', app.maximized === OBLIQUE);
  for (const n of [0, 1, 2]) views.classList.toggle(`max-${n}`, app.maximized === n);
  const box = views.getBoundingClientRect();
  if (app.look === 'classic') {
    const side = Math.floor(Math.min(box.width, box.height) / 2);
    classicSide = side;
    const places = { 1: [0, 0], 0: [side, 0], 3: [0, side], 2: [side, side] };
    for (const el of $$('.view')) {
      const view = Number(el.dataset.view);
      const shown = app.maximized == null || app.maximized === view;
      el.hidden = !shown;
      if (app.maximized === view) {
        Object.assign(el.style, { left: '0px', top: '0px', width: `${box.width}px`, height: `${box.height}px` });
      } else {
        const [left, top] = places[view];
        Object.assign(el.style, { left: `${left}px`, top: `${top}px`, width: `${side}px`, height: `${side}px` });
      }
    }
  } else {
    for (const el of $$('.view')) {
      el.hidden = false;
      el.style.left = el.style.top = el.style.width = el.style.height = '';
    }
  }
  if (!app.ready) return;
  const scale = window.devicePixelRatio || 1;
  const size = {
    width: Math.max(1, Math.round(box.width * scale)),
    height: Math.max(1, Math.round(box.height * scale)),
    scale,
  };
  const viewports = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (const el of $$('.view')) {
    const view = Number(el.dataset.view);
    const rect = el.getBoundingClientRect();
    const shown = !el.hidden && el.offsetParent !== null && rect.width > 0;
    viewports[view] = [rect.left - box.left, rect.top - box.top, shown ? rect.width : 0, shown ? rect.height : 0];
  }
  app.bridge.state({ size, viewports });
  sendCamera();
}

/** Returns the pixels one unit spans in the normal views. */
function pixelsPerUnit() {
  if (app.look === 'classic') return (app.zoomf * classicSide) / SCALE_WIDTH;
  const rect = viewBox(0).getBoundingClientRect();
  const short = Math.max(120, Math.min(rect.width, rect.height));
  return (app.zoomf * short) / SCALE_WIDTH;
}

/** Sends the cameras of the four views to the renderer and asks for a frame. */
export function sendCamera() {
  if (!app.ready) return;
  const ppu = pixelsPerUnit();
  if (app.look === 'classic') {
    // The centre that puts the origin a fifth of F from the edges the
    // positive axes point away from: (F/4 - F/5) / ppu = 328.27 / (10 zoomf).
    const c = SCALE_WIDTH / (10 * app.zoomf);
    ortho = { x: c + classicPan.x, y: c + classicPan.y, z: c + classicPan.z, ppu };
  } else {
    ortho = { ...app.center, ppu };
  }
  app.bridge.state({
    ortho,
    orbit: app.orbit,
    obliqueZoom: app.d3zoomf / 10,
    turn: app.turn,
    raytrace: app.raytrace,
    classic: app.look === 'classic',
    dark: app.dark,
    inverted: app.inverted,
  });
  showZoom();
}

/** Shows the 2D zoom in F5: the raw `zoomf / 10` with a comma in the classic look, a percentage in the modern one. */
function showZoom() {
  const field = $('#tzoom');
  const value = app.zoomf / 10;
  field.value = app.look === 'classic' ? String(Number(value.toPrecision(7))).replace('.', ',') : `${Math.round(value * 100)} %`;
}

/** Steps the 2D zoom of the three normal views in, `D2_ZoomIn`, or out for a negative `direction`. */
export function zoom2d(direction, anchor = null) {
  const before = pixelsPerUnit();
  if (direction > 0 && app.zoomf < ZOOM_MAX) app.zoomf *= 1.2;
  else if (direction < 0 && app.zoomf > ZOOM_MIN) app.zoomf /= 1.2;
  else return;
  if (anchor && app.look !== 'classic') {
    // The point under the pointer stays where it is.
    const after = pixelsPerUnit();
    for (const axis of ['x', 'y', 'z']) {
      if (anchor[axis] == null) continue;
      app.center[axis] = anchor[axis] + ((app.center[axis] - anchor[axis]) * before) / after;
    }
  }
  sendCamera();
}

/** Steps the 3D zoom of the Schrägriss in, `D3_ZoomIn`, or out for a negative `direction`. */
export function zoom3d(direction) {
  if (direction > 0 && app.d3zoomf < ZOOM_MAX) app.d3zoomf *= 1.2;
  else if (direction < 0 && app.d3zoomf > ZOOM_MIN) app.d3zoomf /= 1.2;
  else return;
  sendCamera();
  emit('zoom3d', app.d3zoomf);
}

/** Sets the 3D zoom to `percent` of the start, the slider HS(4) of the tab Kamera. */
export function setZoom3dPercent(percent) {
  app.d3zoomf = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, percent / 10));
  sendCamera();
}

/** Shows the view `view` over the whole area, or all four for null; the Schrägriss alone is `Zoomed_d3`. */
export function maximize(view) {
  app.maximized = view;
  $('[data-entry="zoomed-d3"]')?.setAttribute('aria-checked', String(view === OBLIQUE));
  $('.tb-button[data-tool="6"]')?.setAttribute('aria-pressed', String(view === OBLIQUE));
  layoutViews();
}

/** Shows the whole scene in every view, `Alles zeigen`. */
export async function fit() {
  if (!app.ready) return;
  const bounds = await app.bridge.bounds();
  let lo = [0, 0, 0];
  let hi = [10, 10, 6];
  if (bounds?.length === 6) {
    lo = bounds.slice(0, 3).map((v) => Math.min(v, 0));
    hi = bounds.slice(3, 6).map((v, i) => Math.max(v, lo[i] + 2));
  }
  const center = lo.map((v, i) => (v + hi[i]) / 2);
  const extent = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  // The largest zoom of the ladder at which the scene fits the view.
  const rect = viewBox(0).getBoundingClientRect();
  const short = app.look === 'classic' ? classicSide : Math.max(120, Math.min(rect.width, rect.height));
  let zoomf = 10;
  const fits = (z) => (extent * 1.25 * z * short) / SCALE_WIDTH <= short;
  while (zoomf * 1.2 < ZOOM_MAX && fits(zoomf * 1.2)) zoomf *= 1.2;
  while (zoomf / 1.2 > ZOOM_MIN && !fits(zoomf)) zoomf /= 1.2;
  app.zoomf = zoomf;
  if (app.look === 'classic') {
    Object.assign(classicPan, { x: 0, y: 0, z: 0 });
    // The cavalier view of 1.3 spans 40 points a unit at the 3D zoom 10 in
    // a view of 328 points, so the 3D ladder steps until the scene fits.
    let d3 = 10;
    const fits3d = (z) => extent * 1.3 * 40 * (z / 10) <= SCALE_WIDTH;
    while (d3 * 1.2 < ZOOM_MAX && fits3d(d3 * 1.2)) d3 *= 1.2;
    while (d3 / 1.2 > ZOOM_MIN && !fits3d(d3)) d3 /= 1.2;
    app.d3zoomf = d3;
    emit('zoom3d', d3);
  } else {
    app.center = { x: center[0], y: center[1], z: center[2] };
  }
  app.orbit = { ...app.orbit, x: center[0], y: center[1], z: center[2] * 0.6, distance: Math.max(8, extent * 2.1) };
  sendCamera();
}

/** Pans the normal views by `dx`, `dy` CSS pixels of the view `view`. */
function panParallel(view, dx, dy) {
  const v = VIEWS[view];
  const target = app.look === 'classic' ? classicPan : app.center;
  target[v.right[0]] -= (dx / ortho.ppu) * v.right[1];
  target[v.up[0]] += (dy / ortho.ppu) * v.up[1];
  sendCamera();
}

/** Turns the camera of the Schrägriss by a drag of `dx`, `dy` CSS pixels. */
function orbit(dx, dy) {
  app.orbit.yaw -= dx * 0.4;
  app.orbit.pitch = Math.max(-89, Math.min(89, app.orbit.pitch + dy * 0.35));
  sendCamera();
}

/** Moves the target of the camera of the Schrägriss by a drag of `dx`, `dy` CSS pixels. */
function panOblique(dx, dy) {
  const yaw = (app.orbit.yaw * Math.PI) / 180;
  const scale = app.orbit.distance / 500 / (app.d3zoomf / 10);
  const right = [-Math.sin(yaw), Math.cos(yaw)];
  app.orbit.x -= right[0] * dx * scale;
  app.orbit.y -= right[1] * dx * scale;
  app.orbit.z += dy * scale;
  sendCamera();
}

// ---------------------------------------------------------------------------
// The mouse.

/** Returns the step the coordinates of a click snap to, `snap` of version 1.3: the setting, a tenth with Alt, none with Shift. */
function snapStep(event) {
  if (app.look === 'classic') return app.settings.snap || 0;
  if (event.shiftKey) return 0;
  if (event.altKey) return 0.1;
  return app.settings.snap || 0;
}

/** Rounds `value` to the step `step`, half away from zero as `snap` of version 1.3. */
function snap(value, step) {
  if (!step) return round(value);
  const n = Math.abs(value) / step;
  return round(Math.sign(value) * Math.floor(n + 0.5) * step);
}

/** Returns the point under the pointer of `event` in the normal view `view`, unsnapped, the hidden axis null. */
function rawPoint(view, event) {
  const rect = viewBox(view).getBoundingClientRect();
  return unproject(view, event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height, ortho);
}

/** Returns the point under the pointer snapped to the grid. */
function snappedPoint(view, event) {
  const point = rawPoint(view, event);
  if (!point) return null;
  const step = snapStep(event);
  for (const axis of ['x', 'y', 'z']) if (point[axis] != null) point[axis] = snap(point[axis], step);
  return point;
}

/** Writes the coordinates of the pointer into F5: the two of the view, the third empty, as the `MouseMove` handlers of 1.3. */
function showCoords(view, event) {
  const point = view === OBLIQUE ? null : snappedPoint(view, event);
  $('#label1-f5').textContent = SHORT_NAMES[view];
  if (!point) return;
  for (const axis of ['x', 'y', 'z']) {
    const field = $(`#t${axis}`);
    if (point[axis] == null) {
      field.value = app.look === 'classic' || lastPoint[axis] == null ? '' : formatNumber(lastPoint[axis]);
      field.classList.add('dim');
    } else {
      field.value = formatNumber(point[axis]);
      field.classList.remove('dim');
      lastPoint[axis] = point[axis];
    }
  }
}

/** Returns whether a press is far enough from where it started to count as a drag. */
function moved(event) {
  return drag && Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y) > 4;
}

async function onPointerDown(view, el, event) {
  if (!app.ready || event.target.closest('.view-head button')) return;
  el.setPointerCapture(event.pointerId);
  const rect = el.getBoundingClientRect();
  const start = { x: event.clientX, y: event.clientY };
  const local = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  drag = { view, button: event.button, start, last: start, local, kind: 'pending', item: null, event };
  if (event.button === 1) event.preventDefault();
  if (view === OBLIQUE) {
    drag.kind = 'oblique';
    return;
  }
  if (event.button !== 0) {
    drag.kind = 'pan';
    return;
  }
  const placing = app.mode === 'einfuegen' || event.altKey;
  if (placing) {
    drag.kind = 'mark';
    drag.point = snappedPoint(view, event);
    return;
  }
  // Position and Bearbeiten: a press on a body takes it, a press on empty space marks or pans.
  const current = drag;
  const id = await app.bridge.pick(view, local.x, local.y);
  if (drag !== current) return;
  const item = itemById(id || null);
  if (item) {
    drag.kind = app.mode === 'bearbeiten' ? 'size' : 'move';
    drag.item = item;
    drag.origin = rawPoint(view, event);
    drag.before = snapshotItems();
    drag.base = { position: { ...item.position }, size: { ...item.size } };
  } else {
    drag.kind = 'empty';
    drag.point = snappedPoint(view, event);
  }
}

function onPointerMove(view, el, event) {
  hoverView = view;
  showCoords(view, event);
  if (!drag || drag.view !== view) {
    emit('hover', { view, point: view === OBLIQUE ? null : snappedPoint(view, event) });
    return;
  }
  const dx = event.clientX - drag.last.x;
  const dy = event.clientY - drag.last.y;
  drag.last = { x: event.clientX, y: event.clientY };
  if (!moved(event) && !drag.dragging) return;
  drag.dragging = true;
  switch (drag.kind) {
    case 'oblique':
      if (drag.button === 0 && app.look !== 'classic') orbit(dx, dy);
      else if (drag.button !== 0) panOblique(dx, dy);
      break;
    case 'pan':
    case 'empty':
      panParallel(view, dx, dy);
      break;
    case 'mark':
      drag.band = snappedPoint(view, event);
      invalidateOverlays();
      break;
    case 'move':
    case 'size':
      dragItem(view, event);
      break;
    default:
      break;
  }
}

/** Moves or sizes the body of the drag in the plane of the view, snapped, one undo step for the whole drag. */
function dragItem(view, event) {
  const point = rawPoint(view, event);
  if (!point || !drag.origin) return;
  const step = snapStep(event);
  const patch = {};
  const v = VIEWS[view];
  if (drag.kind === 'move') {
    const position = { ...drag.base.position };
    for (const axis of v.axes) position[axis] = snap(drag.base.position[axis] + point[axis] - drag.origin[axis], step);
    patch.position = position;
  } else {
    const size = { ...drag.base.size };
    for (const axis of v.axes) size[axis] = Math.max(step || 0.1, snap(drag.base.size[axis] + point[axis] - drag.origin[axis], step));
    patch.size = size;
  }
  const key = JSON.stringify(patch);
  if (key === drag.patchKey) return;
  drag.patchKey = key;
  drag.pending = (drag.pending ?? Promise.resolve()).then(async () => {
    await safe(() => app.store.updateItem(app.scene.id, drag.item.id, patch));
    await reloadScene();
  });
}

async function onPointerUp(view, el, event) {
  const current = drag;
  if (!current || current.view !== view) return;
  drag = null;
  const wasDrag = current.dragging;
  if (current.kind === 'oblique') {
    if (!wasDrag) obliqueClick(view, current.button, event);
    return;
  }
  if (current.kind === 'pan' || (current.kind === 'empty' && wasDrag)) return;
  if (current.kind === 'empty') {
    emit('mark', { view, point: current.point });
    return;
  }
  if (current.kind === 'mark') {
    emit('mark', { view, point: current.point });
    if (wasDrag && current.band) emit('mark', { view, point: current.band, band: true });
    invalidateOverlays();
    return;
  }
  if (current.kind === 'move' || current.kind === 'size') {
    if (wasDrag) {
      await current.pending;
      remember(current.before);
    } else {
      selectItem(current.item.id);
    }
  }
}

/** Does what a click into the Schrägriss does in 1.3: zoom in, zoom out, or show it over all four fields. */
async function obliqueClick(view, button, event) {
  if (button === 0 && event.shiftKey) {
    const rect = viewBox(view).getBoundingClientRect();
    const id = await app.bridge.pick(view, event.clientX - rect.left, event.clientY - rect.top);
    if (id) selectItem(id);
    else selectLine(-1);
    return;
  }
  if (button === 0) zoom3d(1);
  else if (button === 2) zoom3d(-1);
  else if (button === 1) maximize(app.maximized === OBLIQUE ? null : OBLIQUE);
}

function onWheel(view, event) {
  event.preventDefault();
  const direction = event.deltaY < 0 ? 1 : -1;
  if (view === OBLIQUE) zoom3d(direction);
  else zoom2d(direction, rawPoint(view, event));
}

// ---------------------------------------------------------------------------
// The overlays: the crosses of `mark`, `mark3` and of the selection.

/** Asks for the overlays to be drawn again with the next frame. */
export function invalidateOverlays() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    drawOverlays();
  });
}

/** Returns the colours of the crosses, the light ones on the black of the classic look and of the dark theme. */
function markColors() {
  const bright = app.look === 'classic' ? !app.inverted : app.dark;
  return bright
    ? { green: '#00ff00', yellow: '#ffff00', red: '#ff0000', band: '#8b84ff' }
    : { green: '#00a844', yellow: '#c79a00', red: '#e0102e', band: '#4f46e5' };
}

/** Draws the crosses and the labels of the axes into the overlay of every view. */
export function drawOverlays() {
  const colors = markColors();
  const marks = app.marks ?? { green: null, yellow: [], red: null };
  const scale = window.devicePixelRatio || 1;
  for (const el of $$('.view')) {
    const view = Number(el.dataset.view);
    const canvas = el.querySelector('.view-overlay');
    const { width, height } = el.getBoundingClientRect();
    if (!canvas || width === 0) continue;
    if (canvas.width !== Math.round(width * scale) || canvas.height !== Math.round(height * scale)) {
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
    }
    const g = canvas.getContext('2d');
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.clearRect(0, 0, width, height);
    if (app.look !== 'classic') drawAxisLabels(g, view, width, height);
    if (view === OBLIQUE) continue;
    const cross = (p, color) => {
      if (!p) return;
      const a = app.bridge.project(view, p.x ?? 0, p.y ?? 0, p.z ?? 0);
      if (!a) return;
      const half = Math.max(4, 0.5 * ortho.ppu);
      g.strokeStyle = color;
      g.lineWidth = app.look === 'classic' ? 1 : 1.5;
      g.beginPath();
      g.moveTo(Math.round(a[0] - half) + 0.5, Math.round(a[1]) + 0.5);
      g.lineTo(Math.round(a[0] + half) + 0.5, Math.round(a[1]) + 0.5);
      g.moveTo(Math.round(a[0]) + 0.5, Math.round(a[1] - half) + 0.5);
      g.lineTo(Math.round(a[0]) + 0.5, Math.round(a[1] + half) + 0.5);
      g.stroke();
    };
    cross(marks.red, colors.red);
    for (const p of marks.yellow ?? []) cross(p, colors.yellow);
    if (marks.green && (marks.greenView == null || marks.greenView === view)) cross(marks.green, colors.green);
    if (drag?.kind === 'mark' && drag.band && drag.point && drag.view === view) {
      const a = app.bridge.project(view, drag.point.x ?? 0, drag.point.y ?? 0, drag.point.z ?? 0);
      const b = app.bridge.project(view, drag.band.x ?? 0, drag.band.y ?? 0, drag.band.z ?? 0);
      if (a && b) {
        g.setLineDash([5, 4]);
        g.strokeStyle = colors.band;
        g.lineWidth = 1.5;
        g.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
        g.setLineDash([]);
      }
    }
  }
}

/** Writes the letters of the axes at the edge of the view where each positive axis leaves it. */
function drawAxisLabels(g, view, width, height) {
  const origin = app.bridge.project(view, 0, 0, 0);
  if (!origin) return;
  const colors = app.dark ? { x: '#ff6b6b', y: '#f5c242', z: '#4ade80' } : { x: '#c8102e', y: '#9a6700', z: '#1a7f37' };
  g.font = '600 12px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const [axis, v] of [['x', [1, 0, 0]], ['y', [0, 1, 0]], ['z', [0, 0, 1]]]) {
    if (VIEWS[view].hidden === axis || (view === OBLIQUE && app.raytrace)) continue;
    const unit = app.bridge.project(view, ...v);
    if (!unit) continue;
    let at = edgePoint(origin, unit, width, height);
    if (view === OBLIQUE) {
      const tip = { x: 13.9, y: 12.9, z: 8.9 }[axis];
      const p = app.bridge.project(view, v[0] * tip, v[1] * tip, v[2] * tip);
      if (p && p[0] > 12 && p[0] < width - 12 && p[1] > 36 && p[1] < height - 12) at = p;
    }
    if (!at) continue;
    g.fillStyle = colors[axis];
    g.fillText(axis, at[0], at[1]);
  }
}

/** Returns the point near the edge of a view of `width` by `height` on the ray from `origin` through `unit`. */
function edgePoint(origin, unit, width, height) {
  const dx = unit[0] - origin[0];
  const dy = unit[1] - origin[1];
  const length = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / length, dy / length];
  const margin = 14;
  let t = Infinity;
  if (ux > 1e-6) t = Math.min(t, (width - margin - origin[0]) / ux);
  if (ux < -1e-6) t = Math.min(t, (margin - origin[0]) / ux);
  if (uy > 1e-6) t = Math.min(t, (height - margin - origin[1]) / uy);
  if (uy < -1e-6) t = Math.min(t, (34 - origin[1]) / uy);
  if (!(t > 0) || !Number.isFinite(t)) return null;
  return [origin[0] + ux * t, origin[1] + uy * t];
}

// ---------------------------------------------------------------------------
// Pictures of the views.

/** Returns the picture of the view `view` as a PNG, cut from a snapshot of the canvas. */
export async function viewPicture(view) {
  const shot = await app.bridge.snapshot();
  const box = $('#views').getBoundingClientRect();
  const rect = viewBox(view).getBoundingClientRect();
  const scale = shot.width / Math.max(1, box.width);
  const sx = Math.round((rect.left - box.left) * scale);
  const sy = Math.round((rect.top - box.top) * scale);
  const sw = Math.max(1, Math.round(rect.width * scale));
  const sh = Math.max(1, Math.round(rect.height * scale));
  const full = new ImageData(new Uint8ClampedArray(shot.pixels.buffer), shot.width, shot.height);
  const canvas = new OffscreenCanvas(sw, sh);
  canvas.getContext('2d').putImageData(full, -sx, -sy);
  return canvas.convertToBlob({ type: 'image/png' });
}

/** Answers the view under the pointer last, the Schrägriss when none. */
export function lastView() {
  return hoverView >= 0 ? hoverView : OBLIQUE;
}

// ---------------------------------------------------------------------------
// Wiring.

/** Wires the views and the buttons of F5. */
export function wireViews() {
  for (const el of $$('.view')) {
    const view = Number(el.dataset.view);
    el.addEventListener('contextmenu', (event) => event.preventDefault());
    el.addEventListener('pointerdown', (event) => onPointerDown(view, el, event));
    el.addEventListener('pointermove', (event) => onPointerMove(view, el, event));
    el.addEventListener('pointerup', (event) => onPointerUp(view, el, event));
    el.addEventListener('pointercancel', () => {
      drag = null;
    });
    el.addEventListener('auxclick', (event) => event.preventDefault());
    el.addEventListener('wheel', (event) => onWheel(view, event), { passive: false });
    el.querySelector('.view-max')?.addEventListener('click', () => maximize(app.maximized === view ? null : view));
    el.querySelector('.view-save')?.addEventListener('click', () => emit('save-picture', view));
  }
  $('#d3-zoomin').addEventListener('click', () => zoom3d(1));
  $('#d3-zoomout').addEventListener('click', () => zoom3d(-1));
  $('#d2-zoomin').addEventListener('click', () => zoom2d(1));
  $('#d2-zoomout').addEventListener('click', () => zoom2d(-1));
  new ResizeObserver(() => layoutViews()).observe($('#views'));
  on('layout', () => layoutViews());
  on('look', () => {
    layoutViews();
    invalidateOverlays();
  });
  on('scene', () => invalidateOverlays());
  on('select', () => invalidateOverlays());
  on('marks', () => invalidateOverlays());
  showZoom();
}

/** Returns the selected item's reference point for the red crosses, or null. */
export function selectionMark() {
  const item = selectedItem();
  return item ? { ...item.position } : null;
}

/** Sets the status of the mode for a view, used by the tool bar. */
export function modeHint() {
  if (app.mode === 'position') setStatus('Position: Körper anklicken oder ziehen', 3);
  else if (app.mode === 'bearbeiten') setStatus('Bearbeiten: Körper ziehen ändert die Maße', 3);
}

/** Commits a change through the scene module, for the keys that nudge a body. */
export async function nudge(axis, delta) {
  const item = selectedItem();
  if (!item) return;
  const position = { ...item.position, [axis]: round(item.position[axis] + delta) };
  await commit(() => app.store.updateItem(app.scene.id, item.id, { position }));
}

/** Returns the axis the arrow keys move along in the view under the pointer last. */
export function arrowAxes() {
  const view = hoverView >= 0 && hoverView !== OBLIQUE ? hoverView : 2;
  return VIEWS[view];
}
