// SPDX-License-Identifier: GPL-2.0-only
//
// 3D-Bausteine look.js: the two looks of the page and the windows of the
// classic one. The modern look docks the six windows of version 1.3 into a
// grid. The classic look floats them as Windows 98 did, at the places
// `Form_Set` of 3D_bau.frm gives them on a virtual screen, lets the user drag
// them by their caption and size them by their edges, raises the window
// clicked last and hides a tool window on its close button, from where the
// menu Ansicht brings it back.
//
// The caption buttons announce themselves through the events win-min,
// win-max, win-help and win-close with the id of their window, and every
// window that hides or shows again announces itself through the event
// window with its id and its state. Places and sizes the user gives a window
// hold for the visit alone, as in version 1.3, where Form_Set ran at every
// start.
//
// The classic look needs a window of at least 800 pixels width, the smallest
// screen of version 1.3. Below it the switch to the classic look is refused
// and its controls are disabled.

import { icon } from './icons.js';
import { $, $$, app, emit, on, toast } from './state.js';

/** The windows of version 1.3 that float in the classic look. */
const WINDOWS = ['#form1', '#f2', '#f3', '#f4', '#f5', '#f6'];

/** The windows the user may size by their edges, all but the borderless F5. */
const SIZABLE = ['#form1', '#f2', '#f3', '#f4', '#f6'];

/** The tool windows whose close button hides them. Form1 ends the program instead. */
const TOOL_WINDOWS = new Set(['f2', 'f3', 'f4', 'f6']);

/** The windows that stay above the others, HWND_TOPMOST of F2 and F3. */
const TOPMOST = new Set(['f2', 'f3']);

/** The eight edges of a window that can be sized, named by the compass. */
const EDGES = ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'];

/** The smallest outer size of a window in the classic look, a caption and its frame. */
const MIN_WIDTH = 40;
const MIN_HEIGHT = 24;

/** The height of the task bar of Windows 98, which `Form_Set` leaves free at the bottom. */
const TASK_BAR = 27;

/** The smallest width of the browser window that offers the classic look, the 800 pixels of the smallest screen of 1.3. */
const CLASSIC_MIN_WIDTH = 800;

/** The lowest z-index of the windows below F2 and F3, and the lowest of F2 and F3, as classic.css starts them. */
const Z_WINDOWS = 100;
const Z_TOPMOST = 300;

/**
 * The behaviour toggles of the classic look, item D-19 of the plan. The
 * root element lists them in `data-look-toggle` while the classic look is
 * active and lists none in the modern look, and `setLook` flips them
 * together.
 */
export const LOOK_TOGGLES = [
  'raw-zoom', 'empty-status', 'label-clip', 'unscaled-slide', 'no-orbit', 'snap-whole',
  'classic-captions', 'cavalier', 'origin-13', 'windows', 'vga-icons',
];

/** Puts the icon of every element with `data-icon`, every tool button and every body button inside `root`. */
export function fillIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    el.innerHTML = icon(el.dataset.icon, app.look);
  }
  for (const el of root.querySelectorAll('.tb-button[data-tool]')) {
    el.innerHTML = icon(`tool-${el.dataset.tool}`, app.look);
  }
  for (const el of root.querySelectorAll('.tb-button[data-body]')) {
    el.innerHTML = icon(`body-${bodyKey(el.dataset.body)}`, app.look);
  }
  for (const kind of ['close', 'min', 'max', 'help']) {
    for (const el of root.querySelectorAll(`.win-${kind}`)) el.innerHTML = icon(`win-${kind}`, app.look);
  }
}

/** Returns the key of the icon of the body `name`: lower case with the umlauts spelt out. */
export function bodyKey(name) {
  return name.toLowerCase().replace(/ü/g, 'ue').replace(/ä/g, 'ae').replace(/ö/g, 'oe');
}

/** Writes `value` under `key` into the storage of the browser, where it can. */
function remember(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The setting holds for this visit alone.
  }
}

/**
 * Puts the captions of the look on the elements with
 * `data-classic-caption`: the captions of version 1.3 (`3D`, `Frame6`,
 * `Command1`, `Command2` and the empty caption of F3) in the classic look,
 * the captions of version 2.0 in the modern one. The modern caption waits in
 * `data-modern-caption` while the classic one shows.
 */
function swapCaptions() {
  for (const el of $$('[data-classic-caption]')) {
    if (el.dataset.modernCaption === undefined) el.dataset.modernCaption = el.textContent;
    el.textContent = app.look === 'classic' ? el.dataset.classicCaption : el.dataset.modernCaption;
  }
}

/** Puts the program icon of the tab, the tooltip of the switch and the captions of the look in place. */
function dressLook() {
  const favicon = $('#favicon');
  if (favicon) favicon.href = app.look === 'classic' ? 'icons/favicon-classic.svg' : 'icons/favicon.svg';
  const button = $('#look');
  if (button) button.title = app.look === 'classic' ? 'Darstellung: Modern' : 'Darstellung: Klassisch wie Version 1.3';
  swapCaptions();
}

/** Clears what the user and the window manager gave a window inline in the classic look. */
function clearPlace(el) {
  el.style.left = el.style.top = el.style.width = el.style.height = el.style.zIndex = '';
  el.classList.remove('minimized', 'maximized');
  delete el.dataset.restore;
}

/** Answers whether the browser window is wide enough for the classic look. */
export function classicOffered() {
  return window.innerWidth >= CLASSIC_MIN_WIDTH;
}

/**
 * Disables the controls that switch to the classic look while the window is
 * too narrow for it: the entry of the menu Ansicht, the tool button 12, the
 * button of the caption strip and the choice of Bildschirmeinstellungen. In
 * the classic look they stay enabled, since they lead back to the modern one.
 */
function offerClassic() {
  const refused = app.look === 'modern' && !classicOffered();
  const entry = $('#menubar [data-entry="look-classic"]');
  if (entry) {
    entry.disabled = refused;
    entry.setAttribute('aria-disabled', String(refused));
  }
  for (const el of $$('#tb1 [data-tool="12"], #look, #screen-dialog input[name="look"][value="classic"]')) el.disabled = refused;
}

/**
 * Switches the look to `look`, 'modern' or 'classic'. With `persist` the
 * choice is kept in the storage of the browser for the next visit, and
 * without it the look holds for this visit alone, as the parameter look of
 * the address asks. A window narrower than 800 pixels keeps the modern look
 * and leaves the stored choice as it was.
 */
export function setLook(look, { persist = true } = {}) {
  if (look === 'classic' && app.look !== 'classic' && !classicOffered()) {
    toast('Die klassische Darstellung braucht ein Fenster von mindestens 800 Pixel Breite');
    offerClassic();
    return;
  }
  app.look = look === 'classic' ? 'classic' : 'modern';
  const root = document.documentElement;
  root.dataset.look = app.look;
  root.dataset.lookToggle = app.look === 'classic' ? LOOK_TOGGLES.join(' ') : '';
  if (persist) remember('bausteine.look', app.look);
  dressLook();
  fillIcons();
  offerClassic();
  if (app.look === 'classic') {
    applyScreen();
  } else {
    // The docked grid knows no closed tool windows, so every window but the
    // body bar, which the tool bar shows and hides in both looks, comes back.
    for (const selector of WINDOWS) {
      const el = $(selector);
      clearPlace(el);
      if (el.id !== 'f2') reveal(el);
    }
  }
  emit('look', app.look);
  emit('layout');
}

/** Switches the dark theme of the modern look, kept for the next visit when `persist` holds. */
export function setDark(dark, { persist = true } = {}) {
  app.dark = Boolean(dark);
  document.documentElement.dataset.theme = app.dark ? 'dark' : 'light';
  if (persist) remember('bausteine.theme', app.dark ? 'dark' : 'light');
  emit('look', app.look);
}

/**
 * Sets the size of the virtual screen of the classic look, from which the
 * stylesheet computes the places of `Form_Set`: the browser window, or one
 * of the resolutions of the thesis, never less than 800 by 600. It also
 * hands the colour of the frame GEOMETRIEDATEN to the stylesheet, as the
 * custom property --c-geo and as the attribute data-geo, on which the
 * colour of the legend depends. F5 follows a Form1 that the user sized.
 */
export function applyScreen() {
  const root = document.documentElement;
  let [width, height] = [window.innerWidth, window.innerHeight];
  const match = /^(\d+)x(\d+)$/.exec(app.settings.screen ?? '');
  if (match) [width, height] = [Number(match[1]), Number(match[2])];
  width = Math.max(800, width);
  height = Math.max(600, height);
  const geo = app.settings.geo === '#00c0c0' ? '#00c0c0' : '#008080';
  root.style.setProperty('--screen-w', `${width}px`);
  root.style.setProperty('--screen-h', `${height}px`);
  root.style.setProperty('--c-geo', geo);
  root.dataset.geo = geo;
  followForm1();
}

/** Shows the window `el` again, and tells the menus when it was hidden. */
function reveal(el) {
  if (!el.hidden) return;
  el.hidden = false;
  emit('window', { id: el.id, hidden: false });
}

/** Hides the window `el`, and tells the menus. */
function conceal(el) {
  if (el.hidden) return;
  el.hidden = true;
  if (el.classList.contains('active')) el.classList.remove('active');
  emit('window', { id: el.id, hidden: true });
}

/** Answers whether a window of version 1.3 is hidden, for the entry Alle Fenster zeigen. */
export function anyWindowHidden() {
  return WINDOWS.some((selector) => $(selector).hidden);
}

/** Puts every window of the classic look back to its place of `Form_Set` and shows it, `Form_Set` of 1.3. */
export function arrangeWindows() {
  for (const selector of WINDOWS) {
    const el = $(selector);
    clearPlace(el);
    reveal(el);
  }
  applyScreen();
  emit('layout');
}

/** Shows every window again that its close button or the tool bar hid. */
export function showAllWindows() {
  for (const selector of WINDOWS) reveal($(selector));
  emit('layout');
}

/**
 * Raises the window `el` above the others and marks it as the active one.
 * The windows keep their order among themselves and `el` goes to the top of
 * its layer: F2 and F3 in the layer from 301 up, which stays above every
 * other window, and Form1, F4, F5 and F6 in the layer from 101 up. Each
 * raise numbers the layer anew from its bottom, so the window clicked last
 * is always the top one, whatever z-index the stylesheet started it at, and
 * the numbers never leave 101 to 199. F5 stays right above Form1, since
 * version 1.3 showed F5 again whenever Form1 changed its size.
 */
function raise(el) {
  for (const other of $$('.c-win.active')) if (other !== el) other.classList.remove('active');
  if (el.classList.contains('c-win')) el.classList.add('active');
  if (app.look !== 'classic') return;
  const topmost = TOPMOST.has(el.id);
  const layer = WINDOWS.map((selector) => $(selector)).filter((w) => TOPMOST.has(w.id) === topmost);
  const below = (a, b) => (a.w.compareDocumentPosition(b.w) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  const order = layer
    .map((w) => ({ w, z: Number(getComputedStyle(w).zIndex) || 0 }))
    .sort((a, b) => a.z - b.z || below(a, b))
    .map(({ w }) => w);
  const last = el.id === 'form1' ? [el, $('#f5')] : [el];
  const stack = [...order.filter((w) => !last.includes(w)), ...last];
  const base = topmost ? Z_TOPMOST : Z_WINDOWS;
  stack.forEach((w, i) => {
    w.style.zIndex = String(base + 1 + i);
  });
}

/**
 * Gives F5 the width of Form1 in the classic look, `F5.Width = Form1.Width`
 * of `Form_Resize` in version 1.3. F5 keeps its place, so a wider Form1
 * pushes the end of F5 past the screen, which clips it as the screen of 1.3
 * did. A minimised Form1 leaves F5 as it was, and a Form1 at its place of
 * `Form_Set` leaves the width to the stylesheet.
 */
function followForm1() {
  const form1 = $('#form1');
  const f5 = $('#f5');
  if (app.look !== 'classic' || form1.classList.contains('minimized')) return;
  f5.style.width = form1.style.width ? `${form1.offsetWidth}px` : '';
}

/** Requests one event `layout` per animation frame while the user drags. */
let layoutQueued = false;
function queueLayout() {
  if (layoutQueued) return;
  layoutQueued = true;
  requestAnimationFrame(() => {
    layoutQueued = false;
    emit('layout');
  });
}

/** Freezes the current box of `el` into inline styles, so a drag starts from what the user sees. */
function freeze(el) {
  const box = { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
  el.style.left = `${box.left}px`;
  el.style.top = `${box.top}px`;
  el.style.width = `${box.width}px`;
  el.style.height = `${box.height}px`;
  return box;
}

/** Lets the window `el` follow the pointer while its caption is held, in the classic look. */
function wireDrag(el, title) {
  title.addEventListener('pointerdown', (event) => {
    if (app.look !== 'classic' || event.button !== 0 || event.target.closest('button, input, select')) return;
    if (el.classList.contains('maximized')) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, left: el.offsetLeft, top: el.offsetTop };
    title.setPointerCapture(event.pointerId);
    const move = (e) => {
      el.style.left = `${start.left + e.clientX - start.x}px`;
      el.style.top = `${start.top + e.clientY - start.y}px`;
    };
    const up = () => {
      title.removeEventListener('pointermove', move);
      title.removeEventListener('pointerup', up);
      title.removeEventListener('pointercancel', up);
      emit('layout');
    };
    title.addEventListener('pointermove', move);
    title.addEventListener('pointerup', up);
    title.addEventListener('pointercancel', up);
  });
}

/**
 * Gives the window `el` its eight sizing edges. The edges exist in both
 * looks, so a switch creates and removes nothing, and only the classic
 * stylesheet shows them. A drag of an edge sizes the window, never below
 * a caption and its frame, and Form1 lays out its views again as it goes,
 * as `ViewControl` ran on every `Form_Resize`.
 */
function wireEdges(el) {
  for (const edge of EDGES) {
    const handle = document.createElement('div');
    handle.className = 'win-edge';
    handle.dataset.edge = edge;
    handle.setAttribute('aria-hidden', 'true');
    el.append(handle);
    handle.addEventListener('pointerdown', (event) => {
      if (app.look !== 'classic' || event.button !== 0 || el.classList.contains('maximized')) return;
      event.preventDefault();
      event.stopPropagation();
      raise(el);
      const box = freeze(el);
      const start = { x: event.clientX, y: event.clientY };
      handle.setPointerCapture(event.pointerId);
      const move = (e) => {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        let { left, top, width, height } = box;
        if (edge.includes('e')) width = Math.max(MIN_WIDTH, box.width + dx);
        if (edge.includes('s')) height = Math.max(MIN_HEIGHT, box.height + dy);
        if (edge.includes('w')) {
          width = Math.max(MIN_WIDTH, box.width - dx);
          left = box.left + box.width - width;
        }
        if (edge.includes('n')) {
          height = Math.max(MIN_HEIGHT, box.height - dy);
          top = box.top + box.height - height;
        }
        Object.assign(el.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
        if (el.id === 'form1') {
          followForm1();
          queueLayout();
        }
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        emit('layout');
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  }
}

/**
 * Minimises or restores Form1. Without a task bar the minimised window
 * keeps its caption, 160 pixels wide, at the place of the window, where
 * the same button restores it.
 */
function toggleMinimized(el) {
  if (app.look !== 'classic') return;
  if (el.classList.contains('minimized')) {
    restore(el);
  } else {
    if (!el.dataset.restore) el.dataset.restore = JSON.stringify(inlineBox(el));
    el.classList.remove('maximized');
    el.classList.add('minimized');
    Object.assign(el.style, { left: `${el.offsetLeft}px`, top: `${el.offsetTop}px`, width: '160px', height: '26px' });
  }
  followForm1();
  emit('layout');
}

/** Maximises Form1 to the virtual screen above the task bar, or restores it. */
function toggleMaximized(el) {
  if (app.look !== 'classic') return;
  if (el.classList.contains('maximized')) {
    restore(el);
  } else {
    if (!el.dataset.restore) el.dataset.restore = JSON.stringify(inlineBox(el));
    el.classList.remove('minimized');
    el.classList.add('maximized');
    Object.assign(el.style, { left: '0px', top: '0px', width: 'var(--screen-w)', height: `calc(var(--screen-h) - ${TASK_BAR}px)` });
  }
  followForm1();
  emit('layout');
}

/** Answers the inline box of `el`, empty strings where the stylesheet places it. */
function inlineBox(el) {
  return { left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height };
}

/** Puts a minimised or maximised window back to the box it had before. */
function restore(el) {
  const box = el.dataset.restore ? JSON.parse(el.dataset.restore) : { left: '', top: '', width: '', height: '' };
  Object.assign(el.style, box);
  el.classList.remove('minimized', 'maximized');
  delete el.dataset.restore;
}

/** Lets the dialog `dialog` follow the pointer while its caption is held, in the classic look, and centres it again on close. */
function wireDialogDrag(dialog) {
  const title = dialog.querySelector(':scope > .win-title');
  if (!title) return;
  title.addEventListener('pointerdown', (event) => {
    if (app.look !== 'classic' || event.button !== 0 || event.target.closest('button, input, select')) return;
    event.preventDefault();
    const rect = dialog.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    title.setPointerCapture(event.pointerId);
    const move = (e) => {
      Object.assign(dialog.style, {
        margin: '0',
        left: `${start.left + e.clientX - start.x}px`,
        top: `${start.top + e.clientY - start.y}px`,
      });
    };
    const up = () => {
      title.removeEventListener('pointermove', move);
      title.removeEventListener('pointerup', up);
      title.removeEventListener('pointercancel', up);
    };
    title.addEventListener('pointermove', move);
    title.addEventListener('pointerup', up);
    title.addEventListener('pointercancel', up);
  });
  dialog.addEventListener('close', () => {
    dialog.style.margin = dialog.style.left = dialog.style.top = '';
  });
}

/**
 * Wires the window manager: raising, dragging by the caption, sizing by
 * the edges, the caption buttons and their events, and the size of the
 * virtual screen, which follows the browser window.
 */
export function wireWindows() {
  dressLook();
  for (const selector of WINDOWS) {
    const el = $(selector);
    el.addEventListener('pointerdown', () => raise(el), true);
    const title = el.querySelector(':scope > .win-title');
    if (title) wireDrag(el, title);
  }
  for (const selector of SIZABLE) wireEdges($(selector));
  for (const dialog of $$('dialog.c-win')) wireDialogDrag(dialog);

  // Every caption button announces itself with the id of its window, as
  // `win-min`, `win-max`, `win-help` or `win-close`.
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('.win-buttons > button');
    const win = button?.closest('.c-win');
    if (!win) return;
    const kind = ['min', 'max', 'help', 'close'].find((k) => button.classList.contains(`win-${k}`));
    if (kind) emit(`win-${kind}`, win.id);
  });
  on('win-close', (id) => {
    if (TOOL_WINDOWS.has(id)) {
      conceal($(`#${id}`));
      emit('layout');
    }
  });
  on('win-min', (id) => {
    if (id === 'form1') toggleMinimized($('#form1'));
  });
  on('win-max', (id) => {
    if (id === 'form1') toggleMaximized($('#form1'));
  });
  // A double click on the caption of Form1 maximises it, as on Windows 98. Tool windows have no maximum.
  $('#form1 > .win-title').addEventListener('dblclick', (event) => {
    if (!event.target.closest('button, input')) toggleMaximized($('#form1'));
  });

  offerClassic();
  window.addEventListener('resize', () => {
    if (app.look === 'classic') applyScreen();
    offerClassic();
    emit('layout');
  });
}
