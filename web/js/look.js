// SPDX-License-Identifier: GPL-2.0-only
//
// 3D-Bausteine look.js: the two looks of the page and the windows of the
// classic one. The modern look docks the six windows of version 1.3 into a
// grid. The classic look floats them as Windows 98 did, at the places
// `Form_Set` of 3D_bau.frm gives them, lets the user drag them by their
// caption, raises the window clicked last and hides a window on its close
// button, from where the menu Ansicht brings it back.

import { icon } from './icons.js';
import { $, $$, app, emit, store } from './state.js';

/** The windows of version 1.3 that float in the classic look. */
const WINDOWS = ['#form1', '#f2', '#f3', '#f4', '#f5', '#f6'];

/** The windows that stay above the others, HWND_TOPMOST of F2 and F3. */
const TOPMOST = new Set(['f2', 'f3']);

let zTop = 100;

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
  for (const el of root.querySelectorAll('.win-close')) el.innerHTML = icon('win-close', app.look);
  for (const el of root.querySelectorAll('.win-min')) el.innerHTML = icon('win-min', app.look);
  for (const el of root.querySelectorAll('.win-max')) el.innerHTML = icon('win-max', app.look);
  for (const el of root.querySelectorAll('.win-help')) el.innerHTML = icon('win-help', app.look);
}

/** Returns the key of the icon of the body `name`: lower case with the umlauts spelt out. */
export function bodyKey(name) {
  return name.toLowerCase().replace(/ü/g, 'ue').replace(/ä/g, 'ae').replace(/ö/g, 'oe');
}

/** Switches the look to `look`, 'modern' or 'classic', and remembers it. */
export function setLook(look) {
  app.look = look === 'classic' ? 'classic' : 'modern';
  document.documentElement.dataset.look = app.look;
  store('bausteine.look', app.look);
  try {
    localStorage.setItem('bausteine.look', app.look);
  } catch {
    // The look holds for this visit alone.
  }
  $('#favicon').href = app.look === 'classic' ? 'icons/favicon-classic.svg' : 'icons/favicon.svg';
  $('#look').title = app.look === 'classic' ? 'Darstellung: Modern' : 'Darstellung: Klassisch wie Version 1.3';
  fillIcons();
  if (app.look === 'classic') {
    applyScreen();
  } else {
    for (const selector of WINDOWS) {
      const el = $(selector);
      el.style.left = el.style.top = el.style.width = el.style.height = el.style.zIndex = '';
    }
  }
  emit('look', app.look);
}

/** Switches the dark theme of the modern look. */
export function setDark(dark) {
  app.dark = Boolean(dark);
  document.documentElement.dataset.theme = app.dark ? 'dark' : 'light';
  try {
    localStorage.setItem('bausteine.theme', app.dark ? 'dark' : 'light');
  } catch {
    // The theme holds for this visit alone.
  }
  emit('look', app.look);
}

/**
 * Sets the size of the virtual screen of the classic look, from which the
 * stylesheet computes the places of `Form_Set`: the browser window, or one
 * of the resolutions of the thesis.
 */
export function applyScreen() {
  const root = document.documentElement;
  let [width, height] = [window.innerWidth, window.innerHeight];
  const match = /^(\d+)x(\d+)$/.exec(app.settings.screen ?? '');
  if (match) [width, height] = [Number(match[1]), Number(match[2])];
  width = Math.max(800, width);
  height = Math.max(600, height);
  root.style.setProperty('--screen-w', `${width}px`);
  root.style.setProperty('--screen-h', `${height}px`);
  root.style.setProperty('--c-geo', app.settings.geo ?? '#008080');
}

/** Puts every window of the classic look back to its place of `Form_Set`. */
export function arrangeWindows() {
  for (const selector of WINDOWS) {
    const el = $(selector);
    el.hidden = false;
    el.style.left = el.style.top = el.style.width = el.style.height = el.style.zIndex = '';
  }
  applyScreen();
  emit('layout');
}

/** Shows every window again that its close button hid. */
export function showAllWindows() {
  for (const selector of WINDOWS) $(selector).hidden = false;
  emit('layout');
}

/** Raises the window `el` above the others, and marks it as the active one. */
function raise(el) {
  for (const other of $$('.c-win.active')) if (other !== el) other.classList.remove('active');
  el.classList.add('active');
  if (app.look !== 'classic') return;
  zTop += 1;
  el.style.zIndex = String(TOPMOST.has(el.id) ? 300 + (zTop % 100) : 100 + (zTop % 100));
}

/** Wires the window manager: raising, dragging by the caption and the close buttons. */
export function wireWindows() {
  for (const selector of WINDOWS) {
    const el = $(selector);
    el.addEventListener('pointerdown', () => raise(el), true);
    const title = el.querySelector(':scope > .win-title');
    if (!title) continue;
    title.addEventListener('pointerdown', (event) => {
      if (app.look !== 'classic' || event.button !== 0 || event.target.closest('button, input')) return;
      const start = { x: event.clientX, y: event.clientY, left: el.offsetLeft, top: el.offsetTop };
      title.setPointerCapture(event.pointerId);
      const move = (e) => {
        el.style.left = `${start.left + e.clientX - start.x}px`;
        el.style.top = `${start.top + e.clientY - start.y}px`;
      };
      const up = () => {
        title.removeEventListener('pointermove', move);
        title.removeEventListener('pointerup', up);
        emit('layout');
      };
      title.addEventListener('pointermove', move);
      title.addEventListener('pointerup', up);
    });
  }
  for (const id of ['f2', 'f3', 'f4', 'f6']) {
    $(`#${id} .win-close`).addEventListener('click', () => {
      $(`#${id}`).hidden = true;
      emit('layout');
    });
  }
  window.addEventListener('resize', () => {
    if (app.look === 'classic') applyScreen();
    emit('layout');
  });
}
