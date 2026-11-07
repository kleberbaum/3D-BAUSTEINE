// SPDX-License-Identifier: GPL-2.0-only
//
// 3D-Bausteine views.js: the four views of Form1 and the bar F5 under them.
//
// The views sit as version 1.3 places them in `ViewControl`: Kreuzriss top
// left, Aufriss top right, Schrägriss bottom left and Grundriss bottom
// right. The modern look lets the grid size them and centres the origin in
// a new scene, so that every octant shows (see HOME). The classic look
// makes each view a square of half the shorter side of the client of
// Form1, draws the sunken edge of Windows 98 around it and puts
// the origin where the arithmetic of 1.3 puts it, which is where the thesis
// pictures show it (see CLASSIC_ORIGIN). Each viewport the renderer gets is
// the view inside its edge, so the edge never covers the drawing.
//
// The mouse does what 1.3 does: a left click in a normal view marks a point
// for the body in the making, `mark_point`, a left click in the Schrägriss
// zooms it in and a right click out, the middle button shows it over all
// four fields, `Zoomed_d3`. A click in the Schrägriss zooms the Schrägriss
// alone, where 1.3 zoomed the normal views along with it. Version 2.0 adds
// what 1.3 left empty: dragging a body moves it, the eight handles of the
// selected body size it in the mode Bearbeiten, dragging empty space pans,
// the wheel steps the ladders, a left drag in the Schrägriss turns its
// camera in the modern look, a right or a middle drag pans it in both
// looks, a click on a body selects it, and the body under the pointer
// shows its outline in the modern look.
//
// F5 shows the two coordinates of the view under the pointer, the third one
// empty in the classic look and dimmed with its last value in the modern
// one, the 2D zoom as the raw number of 1.3 or as a percentage, and the
// name of the view in the modern look. Over the Schrägriss the classic bar
// keeps its values as 1.3 does, and the modern one shows the point of the
// ground plane under the pointer.

import { OBLIQUE, VIEWS, unproject } from './bridge.js';
import { icon } from './icons.js';
import { commit, remember, reloadScene, selectItem, selectLine } from './scene.js';
import { $, $$, app, emit, formatNumber, itemById, on, round, safe, selectedItem, setStatus, snapshotItems } from './state.js';

/** The names of the views for the field at the end of F5, as `View().name` of version 1.3 stores them. */
const SHORT_NAMES = ['Auf', 'Kreuz', 'Grund', '3D'];

/** The width of the design scale of a picture box of version 1.3, `ScaleWidth`. */
const SCALE_WIDTH = 328.27;

/** The ladders of the 2D and the 3D zoom: times 1.2 while below 50, divided by 1.2 while above 5. */
const ZOOM_STEP = 1.2;
const ZOOM_MAX = 50;
const ZOOM_MIN = 5;

/** The zoom the program starts at: `zoomf` 10 and one step of `ZoomIn_Click`, `d3zoomf` 10. */
const ZOOM_START = 12;
const D3ZOOM_START = 10;

/** The width of the sunken edge of a view in the classic look, the 3D border of a picture box. */
const CLASSIC_BEVEL = 2;

/**
 * Where the classic look puts the origin of the three normal views.
 *
 * `ViewControl` of version 1.3 computes `x0 = y0 = F/5` in pixels, F the
 * shorter outer side of Form1, and applies the number in the user scale
 * 328.27 of the picture boxes, so the origin sits at the fraction
 * (F/5) / 328.27 of the view: 30.5 percent at 800 by 600 (F 500), 43.7
 * percent at 1024 by 768 (F 718) and 59.3 percent at 1280 by 1024 (F 974).
 * The normal views of 2.0 share one centre, so the origin lies that far from
 * the edge each positive axis points away from: the left and the bottom
 * edge of the Aufriss, the right and the bottom edge of the Kreuzriss, the
 * left and the top edge of the Grundriss. With the scale `ppu = zoomf * w /
 * 328.27` of a view w pixels wide this is the centre
 *
 *     c = (328.27 / 2 - F/5) / zoomf
 *
 * units on every axis, the value `'picture'`. The thesis pictures readme-1
 * and readme-2 show the origin at 47.4 to 48.4 percent of every view from
 * its top left corner. `'picture'` at 1024 by 768 misses them by 6.2
 * percent of the view on average, the value `'pixels'` by 10.0 percent.
 * `'pixels'` reads `F/5` as pixels of a view of F/2 pixels, as C-077 of the
 * plan does, which puts the origin at 40 percent at every screen, the centre
 * c = 328.27 / (10 zoomf).
 */
const CLASSIC_ORIGIN = 'picture';

/**
 * The shared centre of the normal views of the modern look at the start and
 * in every new empty scene: the origin, so that it sits in the middle of
 * each view and all octants show (R-13, P-003, P-036, M-092). The user pans
 * away from it, and `Alles zeigen` centres the bodies instead.
 */
const HOME = Object.freeze({ x: 0, y: 0, z: 0 });

/** How far a press may move, in CSS pixels, and still count as a click. */
const CLICK_SLOP = 4;

/** The side of a handle of the selected body in CSS pixels, in the modern and in the classic look. */
const HANDLE_MODERN = 8;
const HANDLE_CLASSIC = 6;

/** The height of a prism of version 1.3 over its edge, `Prisma3_dat`. */
const PRISM_HEIGHT = 0.8660254;

/** How deep the groups of a scene nest at most, MAX_DEPTH of bausteine-core. */
const MAX_DEPTH = 16;

/** The ortho state the renderer drew with last, for turning a pixel into a point. */
let ortho = { x: 0, y: 0, z: 0, ppu: 20 };

/** The size of a view of the classic look, half of the shorter side of the client of Form1. */
let classicSide = 0;

/** The shorter side of a normal view of the modern look while all four show. */
let modernShort = 0;

/** The offset the user panned the classic views by, in units of the scene. */
const classicPan = { x: 0, y: 0, z: 0 };

/**
 * The offset the user panned the classic Schrägriss by, in CSS pixels to
 * the right and down from where `D3_Refresh` of 1.3 puts its origin, half
 * the width and 70 percent of the height. It goes to the renderer as the
 * field `obliquePan` of the message `state`.
 */
const cavalierPan = { x: 0, y: 0 };

/** The id of the scene the views showed last, to tell a new scene from a change of the same one. */
let shownScene = null;

let frame = 0;
let drag = null;
let hoverView = -1;
let wheelRest = 0;
const lastPoint = { x: null, y: null, z: null };

/** The body under the pointer, which the modern look outlines, and the pick that finds it. */
const hover = { item: null, handle: null, view: -1, x: 0, y: 0, scheduled: false, busy: false, again: false };

/** Returns the box of the view `view`. */
function viewBox(view) {
  return $(`.view[data-view="${view}"]`);
}

/**
 * Answers whether the classic look holds the behaviour toggle `name` of
 * D-19 of the plan: `raw-zoom`, `snap-whole`, `no-orbit` or `origin-13`.
 * The root element lists the toggles of the look in `data-look-toggle`, and
 * where it lists none, the classic look holds them all.
 */
function classicToggle(name) {
  if (app.look !== 'classic') return false;
  const list = document.documentElement.dataset.lookToggle;
  return list == null || list.split(/\s+/).includes(name);
}

/** Returns the width of the edge inside each view, which the viewport leaves out. */
function inset() {
  return app.look === 'classic' ? CLASSIC_BEVEL : 0;
}

/** Returns the box of the viewport of the view `view` in CSS pixels of the page, the view inside its edge. */
function innerRect(view) {
  const rect = viewBox(view).getBoundingClientRect();
  const b = rect.width > 2 * inset() && rect.height > 2 * inset() ? inset() : 0;
  return { left: rect.left + b, top: rect.top + b, width: rect.width - 2 * b, height: rect.height - 2 * b, inset: b };
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
    if (app.maximized == null) {
      const rect = viewBox(0).getBoundingClientRect();
      if (rect.width > 0) modernShort = Math.min(rect.width, rect.height);
    }
  }
  if (!app.ready) return;
  const scale = window.devicePixelRatio || 1;
  const size = {
    width: Math.max(1, Math.round(box.width * scale)),
    height: Math.max(1, Math.round(box.height * scale)),
    scale,
  };
  // A hidden view gets a viewport of width zero, so Zoomed_d3 sends three of them.
  const viewports = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (const el of $$('.view')) {
    const view = Number(el.dataset.view);
    const outer = el.getBoundingClientRect();
    const shown = !el.hidden && el.offsetParent !== null && outer.width > 0;
    if (!shown) continue;
    const r = innerRect(view);
    viewports[view] = [r.left - box.left, r.top - box.top, r.width, r.height];
  }
  app.bridge.state({ size, viewports });
  sendCamera();
  invalidateOverlays();
}

/** Returns the pixels one unit spans in the normal views, `zoomf` units of the design scale. */
function pixelsPerUnit() {
  if (app.look === 'classic') return (app.zoomf * Math.max(1, classicSide - 2 * CLASSIC_BEVEL)) / SCALE_WIDTH;
  let short = modernShort;
  if (app.maximized == null || !short) {
    const rect = viewBox(0).getBoundingClientRect();
    if (rect.width > 0) short = Math.min(rect.width, rect.height);
  }
  if (!short) {
    const box = $('#views').getBoundingClientRect();
    short = Math.min(box.width, box.height) / 2;
  }
  return (app.zoomf * Math.max(120, short)) / SCALE_WIDTH;
}

/**
 * Answers the fraction of a classic view between the origin and the edge
 * each positive axis points away from, by CLASSIC_ORIGIN.
 */
function classicOriginFraction() {
  if (!classicToggle('origin-13')) return 0.5;
  if (CLASSIC_ORIGIN === 'pixels') return 0.4;
  const form = $('#form1')?.getBoundingClientRect();
  let f = form ? Math.min(form.width, form.height) : 0;
  if (!(f > 0)) f = 2 * classicSide;
  return Math.min(0.95, Math.max(0.05, f / 5 / SCALE_WIDTH));
}

/**
 * Returns the shared centre of the classic normal views in units, the same
 * on every axis: half the design scale less the place of the origin, in
 * units of `zoomf` points.
 */
function classicCentre() {
  return ((0.5 - classicOriginFraction()) * SCALE_WIDTH) / app.zoomf;
}

/**
 * Returns the centre `c` of one axis of the classic views moved by less
 * than half a device pixel, so that the origin falls on the middle of a
 * pixel in every normal view, where `PSet` of 1.3 put its dots, and the
 * white dots of the raster near it stay single pixels.
 */
function pixelAligned(c, ppu) {
  const scale = window.devicePixelRatio || 1;
  const side = Math.max(1, classicSide - 2 * CLASSIC_BEVEL) * scale;
  const k = ppu * scale;
  if (!(k > 0)) return c;
  const rest = (((side / 2 - 0.5) % 1) + 1) % 1;
  return (rest + Math.round(c * k - rest)) / k;
}

/** Sends the cameras of the four views to the renderer and asks for a frame. */
export function sendCamera() {
  showZoom();
  if (!app.ready) return;
  const ppu = pixelsPerUnit();
  if (app.look === 'classic') {
    const c = classicCentre();
    ortho = { x: pixelAligned(c + classicPan.x, ppu), y: pixelAligned(c + classicPan.y, ppu), z: pixelAligned(c + classicPan.z, ppu), ppu };
  } else {
    ortho = { ...app.center, ppu };
  }
  app.bridge.state({
    ortho,
    orbit: app.orbit,
    obliquePan: { ...cavalierPan },
    obliqueZoom: app.d3zoomf / 10,
    turn: app.turn,
    raytrace: app.raytrace,
    classic: app.look === 'classic',
    dark: app.dark,
    inverted: app.inverted,
  });
}

/** Shows the 2D zoom in F5: the raw `zoomf / 10` with a comma in the classic look (`raw-zoom`), a percentage in the modern one. */
function showZoom() {
  const field = $('#tzoom');
  if (!field) return;
  const value = app.zoomf / 10;
  field.value = classicToggle('raw-zoom') ? String(Number(value.toPrecision(7))).replace('.', ',') : `${Math.round(value * 100)} %`;
}

/** Tells the page that a ladder moved. */
function announceZoom() {
  emit('zoom', { zoomf: app.zoomf, d3zoomf: app.d3zoomf });
}

/**
 * Answers the value of a ladder one step from `value`, in for a positive
 * `direction`, or `value` itself at the limit. A value of the ladder of 10
 * times a power of 1.2 lands on the next one exactly, so the steps never
 * drift from the values 1.3 shows.
 */
function stepLadder(value, direction) {
  if (direction > 0 ? !(value < ZOOM_MAX) : !(value > ZOOM_MIN)) return value;
  const next = direction > 0 ? value * ZOOM_STEP : value / ZOOM_STEP;
  const n = Math.round(Math.log(next / 10) / Math.log(ZOOM_STEP));
  const rung = Number((10 * ZOOM_STEP ** n).toPrecision(12));
  return Math.abs(rung - next) <= 1e-9 * next ? rung : next;
}

/** Steps the 2D zoom of the three normal views in, `D2_ZoomIn`, or out for a negative `direction`. */
export function zoom2d(direction, anchor = null) {
  const before = pixelsPerUnit();
  const zoomf = stepLadder(app.zoomf, direction);
  if (zoomf === app.zoomf) return;
  app.zoomf = zoomf;
  if (anchor && app.look !== 'classic') {
    // The point under the pointer stays where it is.
    const after = pixelsPerUnit();
    for (const axis of ['x', 'y', 'z']) {
      if (anchor[axis] == null) continue;
      app.center[axis] = anchor[axis] + ((app.center[axis] - anchor[axis]) * before) / after;
    }
  }
  sendCamera();
  announceZoom();
  invalidateOverlays();
}

/** Steps the 3D zoom of the Schrägriss in, `D3_ZoomIn`, or out for a negative `direction`. The 2D zoom stays. */
export function zoom3d(direction) {
  const d3zoomf = stepLadder(app.d3zoomf, direction);
  if (d3zoomf === app.d3zoomf) return;
  app.d3zoomf = d3zoomf;
  sendCamera();
  announceZoom();
  invalidateOverlays();
}

/** Sets the 3D zoom to `percent` of the start, the slider HS(4) of the tab Kamera. */
export function setZoom3dPercent(percent) {
  const d3zoomf = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(percent) / 10 || D3ZOOM_START));
  if (d3zoomf === app.d3zoomf) return;
  app.d3zoomf = d3zoomf;
  sendCamera();
  announceZoom();
  invalidateOverlays();
}

/**
 * Shows the view `view` over the whole area, or all four for null. The
 * Schrägriss alone is `Zoomed_d3`: the three normal views get viewports of
 * width zero, the Schrägriss fills the area, centred and scaled by the
 * renderer, and the state holds over every resize.
 */
export function maximize(view) {
  app.maximized = view == null ? null : Number(view);
  drag = null;
  $('[data-entry="zoomed-d3"]')?.setAttribute('aria-checked', String(app.maximized === OBLIQUE));
  $('.tb-button[data-tool="6"]')?.setAttribute('aria-pressed', String(app.maximized === OBLIQUE));
  for (const el of $$('.view')) {
    const button = el.querySelector('.view-max');
    if (!button) continue;
    const big = app.maximized === Number(el.dataset.view);
    button.setAttribute('aria-pressed', String(big));
    button.title = big ? 'Alle vier Ansichten zeigen' : 'Vergrößern';
    button.dataset.icon = big ? 'shrink' : 'expand';
    button.innerHTML = icon(button.dataset.icon, app.look);
  }
  layoutViews();
}

/**
 * Shows the whole scene, `Alles zeigen`. The modern look centres the normal
 * views and the camera of the Schrägriss on the scene, and the normal views
 * of a scene without a body on the origin (HOME). The classic look keeps the
 * origin of 1.3 and undoes the panning. Both take the largest zoom
 * of the ladder up to the start zoom 1,2 at which the scene fits, so a
 * scene of the lesson shows at the zoom 1.3 starts with.
 */
export async function fit() {
  if (!app.ready) return;
  const bounds = await app.bridge.bounds();
  const empty = bounds?.length !== 6;
  let lo = [0, 0, 0];
  let hi = [10, 10, 6];
  if (!empty) {
    lo = bounds.slice(0, 3).map((v) => Math.min(v, 0));
    hi = bounds.slice(3, 6).map((v, i) => Math.max(v, lo[i] + 2));
  }
  const center = lo.map((v, i) => (v + hi[i]) / 2);
  const extent = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  let fits;
  if (app.look === 'classic') {
    // The room on the positive and the negative side of the fixed origin.
    const f = classicOriginFraction();
    fits = (z) => [0, 1, 2].every((i) => hi[i] * 1.1 <= ((1 - f) * SCALE_WIDTH) / z && -lo[i] * 1.1 <= (f * SCALE_WIDTH) / z);
  } else {
    fits = (z) => extent * 1.25 <= SCALE_WIDTH / z;
  }
  let zoomf = ZOOM_START;
  while (zoomf > ZOOM_MIN && !fits(zoomf)) zoomf = stepLadder(zoomf, -1);
  app.zoomf = zoomf;
  if (app.look === 'classic') {
    Object.assign(classicPan, { x: 0, y: 0, z: 0 });
    Object.assign(cavalierPan, { x: 0, y: 0 });
    // The cavalier view of 1.3 spans 40 points a unit at the 3D zoom 10 in
    // a view of 328 points, so the 3D ladder steps down until the scene fits.
    const fits3d = (z) => extent * 1.3 * 40 * (z / 10) <= SCALE_WIDTH;
    let d3 = D3ZOOM_START;
    while (d3 > ZOOM_MIN && !fits3d(d3)) d3 = stepLadder(d3, -1);
    app.d3zoomf = d3;
  } else {
    // A scene without a body has nothing to fit, so the origin goes back to the middle.
    app.center = empty ? { ...HOME } : { x: center[0], y: center[1], z: center[2] };
  }
  app.orbit = { ...app.orbit, x: center[0], y: center[1], z: center[2] * 0.6, distance: Math.max(8, extent * 2.1) };
  sendCamera();
  announceZoom();
  invalidateOverlays();
}

/**
 * Puts the views where a new scene starts them: the modern look centres
 * the origin in the normal views (HOME), and the classic look undoes the
 * panning of its normal views and of its Schrägriss, so the origin sits
 * where 1.3 puts it. The zoom stays.
 */
function home() {
  app.center = { ...HOME };
  Object.assign(classicPan, { x: 0, y: 0, z: 0 });
  Object.assign(cavalierPan, { x: 0, y: 0 });
}

/**
 * Follows the scene of the page: a scene other than the one shown before
 * that holds no body starts at HOME, as the one `Datei › Schließen` leaves.
 * A scene with bodies opened after the start is fitted by main.js. A change
 * of the same scene, `Datei › Neu` among them, which empties the scene as
 * 1.3 does and can be undone, keeps the views where the user put them.
 */
function followScene(scene) {
  const id = scene?.id ?? app.scene?.id ?? null;
  if (id === shownScene) return;
  shownScene = id;
  if ((app.scene?.items?.length ?? 0) > 0) return;
  home();
  sendCamera();
  invalidateOverlays();
}

/** Pans the normal views by `dx`, `dy` CSS pixels of the view `view`. */
function panParallel(view, dx, dy) {
  const v = VIEWS[view];
  const target = app.look === 'classic' ? classicPan : app.center;
  target[v.right[0]] -= (dx / ortho.ppu) * v.right[1];
  target[v.up[0]] += (dy / ortho.ppu) * v.up[1];
  sendCamera();
  invalidateOverlays();
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

/**
 * Moves the origin of the classic Schrägriss by a drag of `dx`, `dy` CSS
 * pixels. The cavalier camera of 1.3 has no target to move, so the picture
 * shifts with the pointer as a whole.
 */
function panCavalier(dx, dy) {
  cavalierPan.x += dx;
  cavalierPan.y += dy;
  sendCamera();
}

// ---------------------------------------------------------------------------
// Points under the pointer.

/**
 * Returns the step the coordinates of a click snap to, `snap` of version
 * 1.3: the setting, and in the modern look a tenth with Alt and none with
 * Shift. The classic look knows no modifier (`snap-whole`).
 */
function snapStep(event) {
  const step = app.settings.snap ?? 1;
  if (classicToggle('snap-whole')) return step || 0;
  if (event?.shiftKey) return 0;
  if (event?.altKey) return 0.1;
  return step || 0;
}

/** Rounds `value` to the step `step`, half away from zero as `snap` of version 1.3. */
function snap(value, step) {
  if (!step) return round(value);
  const n = Math.abs(value) / step;
  return round(Math.sign(value) * Math.floor(n + 0.5) * step);
}

/** Returns the pointer of `event` in CSS pixels of the viewport of the view `view`. */
function localPoint(view, event) {
  const r = innerRect(view);
  return { x: event.clientX - r.left, y: event.clientY - r.top, width: r.width, height: r.height };
}

/** Returns the point under the pointer of `event` in the normal view `view`, unsnapped, the hidden axis null. */
function rawPoint(view, event) {
  const p = localPoint(view, event);
  return unproject(view, p.x, p.y, p.width, p.height, ortho);
}

/** Returns the point under the pointer snapped to the grid. */
function snappedPoint(view, event) {
  const point = rawPoint(view, event);
  if (!point) return null;
  const step = snapStep(event);
  for (const axis of ['x', 'y', 'z']) if (point[axis] != null) point[axis] = snap(point[axis], step);
  return point;
}

/**
 * Returns the point of the ground plane z = 0 under the pointer of `event`
 * in the Schrägriss, snapped as in a normal view, or null where the pointer
 * misses the plane, above its horizon. The camera of the last frame maps
 * the plane to the viewport by a homography, so the point solves two linear
 * equations in x and y. The turn of the tab Kamera is part of that camera,
 * so the point is one of the scene.
 */
function groundPoint(event) {
  const c = app.bridge?.cameras;
  if (!c) return null;
  const o = OBLIQUE * 18;
  const m = c.subarray(o, o + 16);
  const width = c[o + 16];
  const height = c[o + 17];
  if (!width || !height) return null;
  const p = localPoint(OBLIQUE, event);
  const nx = (2 * p.x) / width - 1;
  const ny = 1 - (2 * p.y) / height;
  const [a, b, e] = [m[0] - nx * m[3], m[4] - nx * m[7], nx * m[15] - m[12]];
  const [d, f, g] = [m[1] - ny * m[3], m[5] - ny * m[7], ny * m[15] - m[13]];
  const det = a * f - b * d;
  if (!(Math.abs(det) > 1e-12)) return null;
  const x = (e * f - b * g) / det;
  const y = (a * g - d * e) / det;
  const w = m[3] * x + m[7] * y + m[15];
  if (!(w > 1e-4) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const step = snapStep(event);
  return { x: snap(x, step), y: snap(y, step), z: 0 };
}

/**
 * Returns the point F5 shows for the pointer of `event` over the view
 * `view`: the snapped point of a normal view, and over the Schrägriss the
 * point of the ground plane in the modern look (P-040, Q-51) and none in the
 * classic one, whose fields keep the values of the last normal view.
 */
function hoverPoint(view, event) {
  if (view !== OBLIQUE) return snappedPoint(view, event);
  return app.look === 'classic' ? null : groundPoint(event);
}

/**
 * Writes the coordinates of the point `point` of the view `view` into F5,
 * as the `MouseMove` handlers of 1.3 do: the two of the view, and the third
 * empty in the classic look or dimmed with its last value in the modern
 * one. Over the Schrägriss the modern look writes all three of the point
 * on the ground plane, and the classic look, which passes no point, leaves
 * the fields as they are. The field at the end names the view in the
 * modern look and stays empty in the classic one.
 */
function showCoords(view, point) {
  const label = $('#label1-f5');
  if (label) label.textContent = app.look === 'classic' ? '' : SHORT_NAMES[view];
  if (!point) return;
  const modern = app.look !== 'classic';
  for (const axis of ['x', 'y', 'z']) {
    const field = $(`#t${axis}`);
    if (!field) continue;
    const dim = point[axis] == null && modern;
    if (point[axis] == null) {
      field.value = modern && lastPoint[axis] != null ? formatNumber(lastPoint[axis]) : '';
    } else {
      field.value = formatNumber(point[axis]);
      lastPoint[axis] = point[axis];
    }
    field.classList.toggle('dim', dim);
    field.style.opacity = dim ? '0.45' : '';
  }
}

// ---------------------------------------------------------------------------
// The geometry of an item, for its outline and its handles.

/** Returns the product of the matrices `a` and `b`, both of 16 numbers by columns. */
function mul(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

/** Returns the rotation by `degrees` about the axis `axis`, as Mat4 of bausteine-core turns. */
function rotation(axis, degrees) {
  const t = (Number(degrees) || 0) * (Math.PI / 180);
  const [s, c] = [Math.sin(t), Math.cos(t)];
  if (axis === 'x') return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
  if (axis === 'y') return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** Returns the point `p` moved by the matrix `m`. */
function apply(m, p) {
  return {
    x: m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12],
    y: m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13],
    z: m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14],
  };
}

/** Returns the scaling of the unit body of `item`, `Body::scale` of bausteine-core, or the size of a group. */
function scaling(item) {
  const s = item.size ?? { x: 1, y: 1, z: 1 };
  switch (item.kind) {
    case 'SPHERE':
    case 'CUBE':
      return { x: s.x, y: s.x, z: s.x };
    case 'CONE':
    case 'CYLINDER':
      return { x: s.x, y: s.x, z: s.z };
    case 'DISC':
      return { x: s.x, y: s.x, z: 1 };
    default:
      return s;
  }
}

/** Returns the matrix of `item` in its group: translation, rotation x, y, z and scaling, `FillTM` of `M2.bas`. */
function localMatrix(item) {
  const p = item.position ?? { x: 0, y: 0, z: 0 };
  const r = item.rotation ?? { x: 0, y: 0, z: 0 };
  const s = scaling(item);
  const turn = mul(mul(rotation('x', r.x), rotation('y', r.y)), rotation('z', r.z));
  const move = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, p.x, p.y, p.z, 1];
  const size = [s.x, 0, 0, 0, 0, s.y, 0, 0, 0, 0, s.z, 0, 0, 0, 0, 1];
  return mul(mul(move, turn), size);
}

/** Returns the matrix of the groups above `item` up to, and without, the item `stop`. */
function groupMatrix(item, stop = null) {
  let m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  let parent = itemById(item.parent);
  for (let depth = 0; parent && parent.id !== stop && depth < MAX_DEPTH; depth += 1) {
    m = mul(localMatrix(parent), m);
    parent = itemById(parent.parent);
  }
  return m;
}

/** The corners of the box around the unit body of each kind. */
const UNIT_BOXES = {
  SPHERE: [[-1, -1, -1], [1, 1, 1]],
  CONE: [[-1, -1, 0], [1, 1, 1]],
  CYLINDER: [[-1, -1, 0], [1, 1, 1]],
  CUBE: [[0, 0, 0], [1, 1, 1]],
  CUBOID: [[0, 0, 0], [1, 1, 1]],
  PYRAMID: [[0, 0, 0], [1, 1, 1]],
  PRISM: [[0, 0, 0], [1, PRISM_HEIGHT, 1]],
  DISC: [[-1, -1, 0], [1, 1, 0]],
};

/** Returns the eight corners of the unit box of `kind` moved by `matrix`. */
function boxCorners(kind, matrix) {
  const [lo, hi] = UNIT_BOXES[kind];
  const corners = [];
  for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) corners.push(apply(matrix, { x, y, z }));
  return corners;
}

/** Returns the boxes of the bodies `item` stands for, each as its eight corners in the scene. */
function bodyBoxes(item, matrix = null, depth = 0) {
  if (!item || depth > MAX_DEPTH) return [];
  const own = mul(matrix ?? groupMatrix(item), localMatrix(item));
  if (UNIT_BOXES[item.kind]) return [boxCorners(item.kind, own)];
  const children = item.kind === 'INSTANCE' ? app.scene.items.filter((c) => c.parent === item.source) : app.scene.items.filter((c) => c.parent === item.id);
  return children.flatMap((child) => bodyBoxes(child, own, depth + 1));
}

/** Returns the box around the points `points`, as `{min, max}`. */
function boxAround(points) {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of points) {
    for (const axis of ['x', 'y', 'z']) {
      min[axis] = Math.min(min[axis], p[axis]);
      max[axis] = Math.max(max[axis], p[axis]);
    }
  }
  return { min, max };
}

/**
 * Returns the box of the body `item` in the scene where its handles can
 * size it exactly, or null: the body is not turned and every group above it
 * moves it without turning or scaling. `offset` is the move of the groups.
 */
function editableBox(item) {
  if (!item || !UNIT_BOXES[item.kind]) return null;
  const turned = (it) => ['x', 'y', 'z'].some((a) => Math.abs(it.rotation?.[a] ?? 0) > 1e-9);
  if (turned(item)) return null;
  const offset = { x: 0, y: 0, z: 0 };
  let parent = itemById(item.parent);
  for (let depth = 0; parent && depth < MAX_DEPTH; depth += 1) {
    const s = parent.size ?? { x: 1, y: 1, z: 1 };
    if (turned(parent) || ['x', 'y', 'z'].some((a) => Math.abs(s[a] - 1) > 1e-9)) return null;
    for (const a of ['x', 'y', 'z']) offset[a] += parent.position?.[a] ?? 0;
    parent = itemById(parent.parent);
  }
  const box = boxAround(bodyBoxes(item).flat());
  return { min: box.min, max: box.max, offset };
}

/**
 * Returns the position and the size of the body `item` that fill the box
 * `box` of its group, for the axes `axes` a handle moved, with `sides`
 * naming the side of each axis that moved, the other staying in place.
 */
function boxToPatch(item, box, axes, sides) {
  const p = { ...item.position };
  const s = { ...item.size };
  const extent = (a) => box.max[a] - box.min[a];
  const centred = (a, r) => (sides[a] === 'max' ? box.min[a] + r : box.max[a] - r);
  switch (item.kind) {
    case 'SPHERE':
    case 'DISC': {
      const radial = item.kind === 'DISC' ? axes.filter((a) => a !== 'z') : axes;
      if (!radial.length) return null;
      const r = Math.max(...radial.map((a) => extent(a) / 2));
      for (const a of radial) p[a] = centred(a, r);
      Object.assign(s, { x: r, y: r, z: r });
      break;
    }
    case 'CUBE': {
      const e = Math.max(...axes.map(extent));
      for (const a of axes) p[a] = sides[a] === 'max' ? box.min[a] : box.max[a] - e;
      Object.assign(s, { x: e, y: e, z: e });
      break;
    }
    case 'CONE':
    case 'CYLINDER': {
      const radial = axes.filter((a) => a !== 'z');
      if (radial.length) {
        const r = Math.max(...radial.map((a) => extent(a) / 2));
        for (const a of radial) p[a] = centred(a, r);
        s.x = r;
        s.y = r;
      }
      if (axes.includes('z')) {
        p.z = s.z >= 0 ? box.min.z : box.max.z;
        s.z = (s.z >= 0 ? 1 : -1) * extent('z');
      }
      break;
    }
    default: {
      for (const a of axes) {
        const e = extent(a) / (item.kind === 'PRISM' && a === 'y' ? PRISM_HEIGHT : 1);
        p[a] = s[a] >= 0 ? box.min[a] : box.max[a];
        s[a] = (s[a] >= 0 ? 1 : -1) * e;
      }
    }
  }
  for (const a of ['x', 'y', 'z']) {
    p[a] = round(p[a]);
    s[a] = round(s[a]);
  }
  return { position: p, size: s };
}

/**
 * Returns the eight handles of the selected body in the normal view `view`
 * in the mode Bearbeiten, each with its place in CSS pixels of the
 * viewport and the side it moves on the screen, `sx` and `sy` of -1, 0 or 1.
 */
function handlesOf(view) {
  if (app.mode !== 'bearbeiten' || view === OBLIQUE) return [];
  const box = editableBox(selectedItem());
  if (!box) return [];
  const a = app.bridge.project(view, box.min.x, box.min.y, box.min.z);
  const b = app.bridge.project(view, box.max.x, box.max.y, box.max.z);
  if (!a || !b) return [];
  const [left, right] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const [top, bottom] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  const handles = [];
  for (const sy of [-1, 0, 1]) {
    for (const sx of [-1, 0, 1]) {
      if (!sx && !sy) continue;
      handles.push({ sx, sy, x: sx < 0 ? left : sx > 0 ? right : (left + right) / 2, y: sy < 0 ? top : sy > 0 ? bottom : (top + bottom) / 2 });
    }
  }
  return handles;
}

/** Returns the handle under the point (x, y) of the viewport of `view`, or null. */
function handleAt(view, x, y) {
  const reach = (app.look === 'classic' ? HANDLE_CLASSIC : HANDLE_MODERN) / 2 + 2;
  return handlesOf(view).find((h) => Math.abs(h.x - x) <= reach && Math.abs(h.y - y) <= reach) ?? null;
}

/** Returns the cursor of a handle. */
function handleCursor(h) {
  if (!h.sx) return 'ns-resize';
  if (!h.sy) return 'ew-resize';
  return h.sx === h.sy ? 'nwse-resize' : 'nesw-resize';
}

/** Answers whether the point (x, y) of the viewport of `view` lies on the red cross of the selected item. */
function onSelectionMark(view, x, y) {
  const red = app.marks?.red;
  if (!red || !selectedItem()) return false;
  const p = app.bridge.project(view, red.x ?? 0, red.y ?? 0, red.z ?? 0);
  return Boolean(p) && Math.hypot(p[0] - x, p[1] - y) <= Math.max(6, 0.5 * ortho.ppu);
}

// ---------------------------------------------------------------------------
// The body under the pointer.

/** Answers whether the modern look outlines the body under the pointer now. */
function hovering() {
  return app.look !== 'classic' && app.ready && app.mode !== 'einfuegen' && !drag;
}

/** Asks once per animation frame which body lies under the pointer of the view `view`. */
function requestHover(view, x, y) {
  Object.assign(hover, { view, x, y });
  if (!hovering()) {
    setHoverItem(null);
    return;
  }
  if (hover.busy) {
    hover.again = true;
    return;
  }
  if (hover.scheduled) return;
  hover.scheduled = true;
  requestAnimationFrame(runHover);
}

async function runHover() {
  hover.scheduled = false;
  if (!hovering() || hover.view < 0) return;
  hover.busy = true;
  const id = await app.bridge.pick(hover.view, hover.x, hover.y).catch(() => '');
  hover.busy = false;
  setHoverItem(hovering() ? id || null : null);
  if (hover.again) {
    hover.again = false;
    requestHover(hover.view, hover.x, hover.y);
  }
}

/** Sets the body under the pointer and draws its outline. */
function setHoverItem(id) {
  if (hover.item !== id) {
    hover.item = id;
    invalidateOverlays();
  }
  updateCursor(hover.view);
}

/**
 * Sets the cursor of the view `view` in the modern look: the cross while a
 * body is armed, the arrows of a handle, the cross of four arrows over a
 * body. The classic look keeps the arrow of 1.3.
 */
function updateCursor(view) {
  const el = view >= 0 ? viewBox(view) : null;
  if (!el) return;
  if (app.look === 'classic' || view === OBLIQUE) {
    el.style.cursor = '';
    return;
  }
  let cursor = '';
  if (drag?.kind === 'handle') cursor = handleCursor(drag.handle);
  else if (drag?.kind === 'move' || drag?.kind === 'pan' || (drag?.kind === 'empty' && drag.dragging)) cursor = drag.kind === 'move' ? 'move' : 'grabbing';
  else if (app.mode === 'einfuegen') cursor = 'crosshair';
  else if (hover.handle && hover.view === view) cursor = handleCursor(hover.handle);
  else if (hover.item && hover.view === view) cursor = 'move';
  el.style.cursor = cursor;
}

// ---------------------------------------------------------------------------
// The mouse.

/** Returns whether the pointer of `event` is far enough from the press of the drag `current` to count as a drag. */
function moved(current, event) {
  return current && Math.hypot(event.clientX - current.start.x, event.clientY - current.start.y) > CLICK_SLOP;
}

function onPointerDown(view, el, event) {
  if (!app.ready || event.target.closest('.view-head button')) return;
  if (drag && drag.pointer !== event.pointerId) return;
  el.setPointerCapture(event.pointerId);
  const local = localPoint(view, event);
  const start = { x: event.clientX, y: event.clientY };
  drag = { view, pointer: event.pointerId, button: event.button, start, last: start, local, kind: 'pending', item: null, event };
  if (event.button === 1) event.preventDefault();
  setHoverItem(null);
  if (view === OBLIQUE) {
    drag.kind = 'oblique';
    return;
  }
  if (event.button !== 0) {
    drag.kind = 'pan';
    return;
  }
  // A body armed, or Alt, means the user places: every left press marks a point.
  if (app.mode === 'einfuegen' || event.altKey) {
    drag.kind = 'mark';
    drag.point = snappedPoint(view, event);
    return;
  }
  const handle = handleAt(view, local.x, local.y);
  if (handle) {
    const item = selectedItem();
    Object.assign(drag, { kind: 'handle', handle, item, box: editableBox(item), origin: rawPoint(view, event), before: snapshotItems() });
    el.classList.add('dragging');
    updateCursor(view);
    return;
  }
  if (onSelectionMark(view, local.x, local.y)) {
    startMove(drag, view, selectedItem(), event);
    return;
  }
  // Position and Bearbeiten: a press on a body takes it, a press on empty space marks or pans.
  drag.picking = resolvePress(drag, view, el, event);
}

/**
 * Answers what a press of the drag `current` in a normal view takes, a body
 * or empty space. The pointer can move, and even let go, before the worker
 * answers the pick. The drag keeps the last pointer of that time in
 * `latest`, and once the press knows what it takes, that pointer moves the
 * body or pans the view by the whole distance from the press. A drag that
 * was cancelled in the meantime replays nothing.
 */
async function resolvePress(current, view, el, event) {
  const id = await app.bridge.pick(view, current.local.x, current.local.y).catch(() => '');
  const item = itemById(id || null);
  if (item) {
    startMove(current, view, item, event);
  } else {
    current.kind = 'empty';
    current.point = snappedPoint(view, event);
  }
  if (current.latest && (drag === current || current.released)) applyMove(current, view, el, current.latest);
}

/** Lets the drag `current` move the body `item` in the plane of the view. */
function startMove(current, view, item, event) {
  Object.assign(current, {
    kind: 'move',
    item,
    origin: rawPoint(view, event),
    before: snapshotItems(),
    base: { position: { ...item.position }, size: { ...item.size } },
  });
}

function onPointerMove(view, el, event) {
  hoverView = view;
  if (drag && drag.pointer !== event.pointerId) return;
  emit('hover', { view, point: hoverPoint(view, event) });
  if (!drag || drag.view !== view) {
    const local = localPoint(view, event);
    hover.handle = view !== OBLIQUE && app.mode === 'bearbeiten' ? handleAt(view, local.x, local.y) : null;
    hover.view = view;
    updateCursor(view);
    requestHover(view, local.x, local.y);
    return;
  }
  if (drag.kind === 'pending') {
    // The pick of the press has not answered yet, so the pointer waits for resolvePress.
    drag.latest = event;
    return;
  }
  applyMove(drag, view, el, event);
}

/**
 * Applies the pointer of `event` to the drag `current` in the view `view`
 * once it has left the press by more than CLICK_SLOP: it pans or turns the
 * view, moves the body or pulls a handle. The element `el` of the view
 * shows the class `dragging` only while `current` is the drag of the page,
 * since a drag replayed after the release has already ended. The last
 * pointer stays at the press until the drag begins, so the first step of a
 * pan or a turn covers the whole way from the press and the picture keeps
 * up with the pointer.
 */
function applyMove(current, view, el, event) {
  if (!moved(current, event) && !current.dragging) return;
  const dx = event.clientX - current.last.x;
  const dy = event.clientY - current.last.y;
  current.last = { x: event.clientX, y: event.clientY };
  if (!current.dragging) {
    current.dragging = true;
    if (current.kind !== 'mark' && drag === current) el.classList.add('dragging');
    if (current.kind === 'move' && current.item && selectedItem()?.id !== current.item.id) selectItem(current.item.id);
  }
  switch (current.kind) {
    case 'oblique':
      // A right or a middle drag pans in both looks (P-044, M-152). A left
      // drag turns the camera of the modern look, and the cavalier camera of
      // the classic look has none to turn (`no-orbit`).
      if (current.button !== 0) {
        if (app.look === 'classic') panCavalier(dx, dy);
        else panOblique(dx, dy);
      } else if (app.look !== 'classic') {
        orbit(dx, dy);
      }
      break;
    case 'pan':
    case 'empty':
      panParallel(view, dx, dy);
      break;
    case 'move':
      dragItem(current, view, event);
      break;
    case 'handle':
      dragHandle(current, view, event);
      break;
    default:
      break;
  }
  updateCursor(view);
}

/** Sends the patch `patch` of the item of the drag `current`, one request after the other. */
function sendPatch(current, patch) {
  const key = JSON.stringify(patch);
  if (key === current.patchKey) return;
  current.patchKey = key;
  const { item } = current;
  current.pending = (current.pending ?? Promise.resolve()).then(async () => {
    await safe(() => app.store.updateItem(app.scene.id, item.id, patch));
    await reloadScene();
  });
}

/** Moves the body of the drag `current` in the plane of the view, snapped, one undo step for the whole drag. */
function dragItem(current, view, event) {
  const point = rawPoint(view, event);
  if (!point || !current.origin) return;
  const step = snapStep(event);
  const position = { ...current.base.position };
  for (const axis of VIEWS[view].axes) position[axis] = snap(current.base.position[axis] + point[axis] - current.origin[axis], step);
  sendPatch(current, { position });
}

/**
 * Sizes the body of the drag `current` by its handle: the sides of the
 * handle follow the pointer, snapped, and the opposite sides stay. Shift on
 * a corner keeps the proportion of the two sides of the view.
 */
function dragHandle(current, view, event) {
  const point = rawPoint(view, event);
  if (!point || !current.origin || !current.box || !current.item) return;
  const v = VIEWS[view];
  const step = snapStep(event);
  const least = Math.max(step || 0, 0.1);
  const box = { min: { ...current.box.min }, max: { ...current.box.max } };
  const sides = {};
  const axes = [];
  const pull = (axis, side) => {
    const value = snap(current.box[side][axis] + point[axis] - current.origin[axis], step);
    box[side][axis] = side === 'max' ? Math.max(value, box.min[axis] + least) : Math.min(value, box.max[axis] - least);
    sides[axis] = side;
    axes.push(axis);
  };
  const { sx, sy } = current.handle;
  if (sx) pull(v.right[0], (sx > 0) === (v.right[1] > 0) ? 'max' : 'min');
  if (sy) pull(v.up[0], (sy < 0) === (v.up[1] > 0) ? 'max' : 'min');
  if (event.shiftKey && axes.length === 2) {
    const ratio = (a) => (box.max[a] - box.min[a]) / Math.max(1e-9, current.box.max[a] - current.box.min[a]);
    const k = Math.max(ratio(axes[0]), ratio(axes[1]));
    for (const a of axes) {
      const e = (current.box.max[a] - current.box.min[a]) * k;
      if (sides[a] === 'max') box.max[a] = box.min[a] + e;
      else box.min[a] = box.max[a] - e;
    }
  }
  const local = { min: {}, max: {} };
  for (const a of ['x', 'y', 'z']) {
    local.min[a] = box.min[a] - current.box.offset[a];
    local.max[a] = box.max[a] - current.box.offset[a];
  }
  const patch = boxToPatch(current.item, local, axes, sides);
  if (patch) sendPatch(current, patch);
}

async function onPointerUp(view, el, event) {
  const current = drag;
  if (!current || current.view !== view || current.pointer !== event.pointerId) return;
  drag = null;
  el.classList.remove('dragging');
  // A press whose pick is still open takes the pointer of the release as its
  // last move, and resolvePress applies it before the release goes on.
  if (current.kind === 'pending') {
    current.released = true;
    current.latest = event;
  }
  if (current.picking) await current.picking;
  const wasDrag = current.dragging;
  updateCursor(view);
  if (current.kind === 'oblique') {
    // A left drag of the classic look stays the click of 1.3, which acts on
    // the press (`no-orbit`, M-152). Every other drag pans or turns and clicks nothing.
    if (!wasDrag || (current.button === 0 && classicToggle('no-orbit'))) obliqueClick(view, current.button, event);
    return;
  }
  if (current.kind === 'pan' || (current.kind === 'empty' && wasDrag)) return;
  if (current.kind === 'empty' || current.kind === 'mark') {
    emit('mark', { view, point: current.point });
    return;
  }
  if (current.kind === 'move' || current.kind === 'handle') {
    if (wasDrag) {
      await current.pending;
      if (current.pending) remember(current.before);
    } else if (current.kind === 'move') {
      selectItem(current.item.id);
    }
  }
}

/** Does what a click into the Schrägriss does in 1.3: zoom in, zoom out, or show it over all four fields. */
async function obliqueClick(view, button, event) {
  if (button === 0 && event.shiftKey) {
    const p = localPoint(view, event);
    const id = await app.bridge.pick(view, p.x, p.y).catch(() => '');
    if (id) selectItem(id);
    else selectLine(-1);
    return;
  }
  if (button === 0) zoom3d(1);
  else if (button === 2) zoom3d(-1);
  else if (button === 1) maximize(app.maximized === OBLIQUE ? null : OBLIQUE);
}

/**
 * Steps a ladder by the wheel, one step for a notch of a mouse, the small
 * steps of a touch pad gathered until they make one. Shift pans a normal
 * view sideways, and Ctrl is left to the browser.
 */
function onWheel(view, event) {
  if (event.ctrlKey) return;
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1;
  if (event.shiftKey && view !== OBLIQUE) {
    const dx = (event.deltaX || event.deltaY) * unit;
    panParallel(view, -dx, 0);
    return;
  }
  wheelRest += event.deltaY * unit;
  if (Math.abs(wheelRest) < 50) return;
  const direction = wheelRest < 0 ? 1 : -1;
  wheelRest = 0;
  if (view === OBLIQUE) zoom3d(direction);
  else zoom2d(direction, rawPoint(view, event));
}

// ---------------------------------------------------------------------------
// The overlays: the crosses of `mark`, `mark3` and of the selection, the
// outline of the body under the pointer and the handles.

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
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || (bright ? '#8b84ff' : '#4f46e5');
  return bright
    ? { green: '#00ff00', yellow: '#ffff00', red: '#ff0000', accent, handle: app.look === 'classic' ? '#ffffff' : accent, edge: '#000000' }
    : { green: '#00a844', yellow: '#c79a00', red: '#e0102e', accent, handle: app.look === 'classic' ? '#000080' : accent, edge: '#ffffff' };
}

/** The twelve edges of a box of eight corners in the order of `boxCorners`. */
const BOX_EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

/**
 * Returns the eight corners of the outline of `item`: the box of a body as
 * it is turned, the box around the bodies of a group or an instance, or
 * null for a group without a body.
 */
function outlineCorners(item) {
  const boxes = bodyBoxes(item);
  if (boxes.length === 0) return null;
  if (boxes.length === 1) return boxes[0];
  const { min, max } = boxAround(boxes.flat());
  const corners = [];
  for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) corners.push({ x, y, z });
  return corners;
}

/** Draws the outline of the body under the pointer into the view `view`, at half the strength of the accent. */
function drawHover(g, view, colors) {
  const item = itemById(hover.item);
  if (!item || item.id === selectedItem()?.id) return;
  const corners = outlineCorners(item);
  if (!corners) return;
  const points = corners.map((p) => app.bridge.project(view, p.x, p.y, p.z));
  if (points.some((p) => !p)) return;
  g.save();
  g.globalAlpha = 0.5;
  g.strokeStyle = colors.accent;
  g.lineWidth = 1;
  g.beginPath();
  for (const [a, b] of BOX_EDGES) {
    g.moveTo(points[a][0], points[a][1]);
    g.lineTo(points[b][0], points[b][1]);
  }
  g.stroke();
  g.restore();
}

/** Draws the eight handles of the selected body into the normal view `view` in the mode Bearbeiten. */
function drawHandles(g, view, colors) {
  const size = app.look === 'classic' ? HANDLE_CLASSIC : HANDLE_MODERN;
  for (const h of handlesOf(view)) {
    const x = Math.round(h.x - size / 2);
    const y = Math.round(h.y - size / 2);
    g.fillStyle = colors.handle;
    g.fillRect(x, y, size, size);
    g.strokeStyle = colors.edge;
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  }
}

/** Draws the crosses, the outline, the handles and the labels of the axes into the overlay of every view. */
export function drawOverlays() {
  const colors = markColors();
  const marks = app.marks ?? { green: null, yellow: [], red: null };
  const scale = window.devicePixelRatio || 1;
  for (const el of $$('.view')) {
    const view = Number(el.dataset.view);
    const canvas = el.querySelector('.view-overlay');
    const { width: outerWidth, height: outerHeight } = el.getBoundingClientRect();
    if (!canvas || outerWidth === 0) continue;
    if (canvas.width !== Math.round(outerWidth * scale) || canvas.height !== Math.round(outerHeight * scale)) {
      canvas.width = Math.round(outerWidth * scale);
      canvas.height = Math.round(outerHeight * scale);
    }
    const g = canvas.getContext('2d');
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.clearRect(0, 0, outerWidth, outerHeight);
    // The overlay draws in the coordinates of the viewport, inside the edge of the view.
    const { width, height, inset: b } = innerRect(view);
    g.save();
    g.translate(b, b);
    g.beginPath();
    g.rect(0, 0, width, height);
    g.clip();
    if (app.look !== 'classic') {
      drawAxisLabels(g, view, width, height);
      if (hover.item) drawHover(g, view, colors);
    }
    if (view !== OBLIQUE) {
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
      drawHandles(g, view, colors);
    }
    g.restore();
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

/** Returns the picture of the view `view` as a PNG, cut from a snapshot of the canvas inside the edge of the view. */
export async function viewPicture(view) {
  const shot = await app.bridge.snapshot();
  const box = $('#views').getBoundingClientRect();
  const rect = innerRect(view);
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

/** Wires the views and the buttons of F5, and puts the views where a new scene starts them. */
export function wireViews() {
  home();
  for (const el of $$('.view')) {
    const view = Number(el.dataset.view);
    el.style.touchAction = 'none';
    el.addEventListener('contextmenu', (event) => event.preventDefault());
    el.addEventListener('pointerdown', (event) => onPointerDown(view, el, event));
    el.addEventListener('pointermove', (event) => onPointerMove(view, el, event));
    el.addEventListener('pointerup', (event) => onPointerUp(view, el, event));
    // A cancelled press, or one whose capture the browser took away, ends the drag without a click.
    const cancel = (event) => {
      if (!drag || drag.pointer !== event.pointerId || drag.view !== view) return;
      drag = null;
      el.classList.remove('dragging');
      updateCursor(view);
    };
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('lostpointercapture', cancel);
    el.addEventListener('pointerleave', () => {
      if (drag) return;
      hover.handle = null;
      setHoverItem(null);
      hover.view = -1;
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
    for (const el of $$('.view')) el.style.cursor = '';
    for (const axis of ['x', 'y', 'z']) $(`#t${axis}`).style.opacity = '';
    $('#label1-f5').textContent = '';
    setHoverItem(null);
    layoutViews();
    showZoom();
    invalidateOverlays();
  });
  on('hover', ({ view, point }) => showCoords(view, point));
  on('zoom', () => showZoom());
  on('mode', () => {
    setHoverItem(null);
    invalidateOverlays();
  });
  on('armed', () => invalidateOverlays());
  on('scene', (scene) => {
    followScene(scene);
    invalidateOverlays();
  });
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
  else if (app.mode === 'bearbeiten') setStatus('Bearbeiten: Griffe ziehen ändert die Maße', 3);
}

/**
 * Moves the selected body by `delta` along `axis` through the scene module,
 * for the keys that nudge a body. The new place is read inside the change,
 * which waits for the changes before it, so two quick presses move the body
 * two steps.
 */
export async function nudge(axis, delta) {
  if (!selectedItem()) return;
  await commit(() => {
    const item = selectedItem();
    if (!item) return null;
    const position = { ...item.position, [axis]: round(item.position[axis] + delta) };
    return app.store.updateItem(app.scene.id, item.id, { position });
  });
}

/** Returns the axis the arrow keys move along in the view under the pointer last. */
export function arrowAxes() {
  const view = hoverView >= 0 && hoverView !== OBLIQUE ? hoverView : 2;
  return VIEWS[view];
}
