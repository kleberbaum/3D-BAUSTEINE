// SPDX-License-Identifier: GPL-2.0-only
//
// 3D-Bausteine menus.js: the menu bar of Form1. Version 1.3 has the menus
// Datei, Bearbeiten, Objekte and Ansicht, of which only Datei holds entries.
// Version 2.0 fills the empty ones with the functions the thesis says are
// "auch in den Menüs vorhanden" and adds Hilfe at the end. The bar opens on
// a click or with Alt and the underlined letter, and a hover moves an open
// menu to its neighbour, as on Windows.
//
// The keys move inside a menu as on Windows: Up and Down step through the
// entries of the open popup, Right opens the submenu Beispiele and Left
// closes it again, Right and Left elsewhere move to the next menu, Enter
// and Space choose, and Esc closes one level and gives the focus back to
// the element that had it before the keys opened the menu.
//
// The check marks of the menu Ansicht follow the state of the page each
// time a menu opens. The new bodies of the scene, declared with `#Neu`,
// stand at the end of the menu Objekte, as they stand at the end of CB1:
// the same names, those Neu_Ende closed before the place of Einfügen, so
// the menu never offers a body inside its own open `#Neu`. `Alle Fenster
// zeigen` is enabled while a window is hidden. The entry
// `Dunkles Erscheinungsbild` is greyed in the classic look, which always
// shows the grey scheme of Windows 98.

import { OBLIQUE } from './bridge.js';
import { declaredNames } from './koerper.js';
import { $, $$, app, on } from './state.js';

let openItem = null;
/** The element that had the focus before the keys opened a menu, which gets it back on Esc. */
let returnFocus = null;

/** The windows that `Alle Fenster zeigen` brings back. */
const WINDOWS = ['#form1', '#f2', '#f3', '#f4', '#f5', '#f6'];

/** Closes the open menu. */
export function closeMenus() {
  if (!openItem) return;
  for (const row of openItem.querySelectorAll('.menu-entry.submenu')) row.setAttribute('aria-expanded', 'false');
  openItem.querySelector('.menu-popup').hidden = true;
  openItem.querySelector('.menu-title').setAttribute('aria-expanded', 'false');
  openItem.classList.remove('open');
  openItem = null;
}

/** Opens the menu `item` and focuses its first entry when `focus` is set. */
function openMenu(item, focus = false) {
  if (openItem === item) return;
  if (!openItem) {
    const active = document.activeElement;
    returnFocus = focus && active && !active.closest?.('#menubar') ? active : null;
  }
  closeMenus();
  syncEntries();
  openItem = item;
  item.classList.add('open');
  item.querySelector('.menu-title').setAttribute('aria-expanded', 'true');
  const popup = item.querySelector('.menu-popup');
  popup.hidden = false;
  if (focus) entries(popup)[0]?.focus();
}

/** Returns the popup that holds the focus: the submenu the focus is in, or else the popup of the open menu. */
function currentPopup() {
  if (!openItem) return null;
  const sub = document.activeElement?.closest?.('.submenu-popup');
  return sub && openItem.contains(sub) ? sub : openItem.querySelector(':scope > .menu-popup');
}

/** Returns whether the entry `entry` can be chosen. */
function enabled(entry) {
  return !entry.disabled && entry.getAttribute('aria-disabled') !== 'true';
}

/** Returns the entries of `popup` that take the focus, by default those of the popup that holds it. */
function entries(popup = currentPopup()) {
  return popup ? [...popup.querySelectorAll(':scope > .menu-entry')].filter(enabled) : [];
}

/** Opens the submenu of the entry `row` and focuses its first entry, the key Right or Enter on Beispiele. */
function openSubmenu(row) {
  const first = entries(row.querySelector(':scope > .submenu-popup'))[0];
  if (!first) return;
  row.setAttribute('aria-expanded', 'true');
  first.focus();
}

/** Closes the submenu `popup` and gives the focus back to its entry, the key Left or Esc inside Beispiele. */
function closeSubmenu(popup) {
  const row = popup.closest('.menu-entry.submenu');
  row.setAttribute('aria-expanded', 'false');
  row.focus();
}

/** Sets the check mark of the entry `entry`. */
export function check(entry, checked) {
  $(`#menubar [data-entry="${entry}"]`)?.setAttribute('aria-checked', String(Boolean(checked)));
}

/** Sets the check marks of the menu Ansicht to the state of the page. */
function syncChecks() {
  check('zoomed-d3', app.maximized === OBLIQUE);
  check('raytrace', app.raytrace);
  check('look-modern', app.look === 'modern');
  check('look-classic', app.look === 'classic');
  check('inverted', app.inverted);
  // The classic look always shows the grey scheme with purple captions, where the dark theme changes nothing.
  const classic = app.look === 'classic';
  check('dark', app.dark && !classic);
  const dark = $('#menubar [data-entry="dark"]');
  if (dark) {
    dark.disabled = classic;
    dark.setAttribute('aria-disabled', String(classic));
  }
}

/** Enables `Alle Fenster zeigen` while one of the windows of 1.3 is hidden. */
function syncWindows() {
  const entry = $('#menubar [data-entry="fenster-zeigen"]');
  if (!entry) return;
  const hidden = WINDOWS.some((selector) => $(selector)?.hidden);
  entry.disabled = !hidden;
  entry.setAttribute('aria-disabled', String(!hidden));
}

/** Brings the check marks and the enabled states up to date. */
function syncEntries() {
  syncChecks();
  syncWindows();
}

/**
 * Appends the new bodies CB1 offers to the menu Objekte behind a separator,
 * each as an entry `[data-body]` that places the body as its entry of CB1
 * does. The names are those of `declaredNames` of koerper.js, the
 * declarations of `#Neu` that Neu_Ende closed before the place of
 * Einfügen, each name once. That place follows the selected line, so the
 * list is written again for every change of the scene and of the selection.
 */
function fillDeclared() {
  const popup = $('[data-menu="objekte"] > .menu-popup');
  if (!popup) return;
  for (const el of popup.querySelectorAll('[data-declared]')) el.remove();
  const names = [...new Set(declaredNames())];
  if (names.length === 0) return;
  const separator = document.createElement('div');
  separator.className = 'menu-separator';
  separator.setAttribute('role', 'separator');
  separator.dataset.declared = '';
  popup.append(separator);
  for (const name of names) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-entry';
    button.setAttribute('role', 'menuitem');
    button.dataset.body = name;
    button.dataset.declared = '';
    const caption = document.createElement('span');
    caption.textContent = name;
    button.append(caption);
    popup.append(button);
  }
}

/**
 * Wires the menu bar. `act` is called with the entry that was chosen: its
 * `data-entry`, or its `data-body` for the menu Objekte, and the element.
 */
export function wireMenus(act) {
  const items = $$('#menubar .menu-item');
  // The entry of a submenu is no button, so it takes the focus of the keys through its tab index.
  for (const row of $$('#menubar .menu-entry.submenu')) {
    if (!row.hasAttribute('tabindex')) row.tabIndex = -1;
    row.setAttribute('aria-expanded', 'false');
  }
  for (const item of items) {
    const title = item.querySelector('.menu-title');
    title.addEventListener('click', () => (openItem === item ? closeMenus() : openMenu(item)));
    title.addEventListener('pointerenter', () => {
      if (openItem && openItem !== item) openMenu(item);
    });
    item.querySelector('.menu-popup').addEventListener('click', (event) => {
      const entry = event.target.closest('.menu-entry');
      if (!entry || entry.classList.contains('submenu') || entry.disabled || entry.getAttribute('aria-disabled') === 'true') return;
      closeMenus();
      act(entry.dataset.entry ?? null, entry);
    });
  }
  document.addEventListener('pointerdown', (event) => {
    if (openItem && !event.target.closest('#menubar')) closeMenus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.altKey && !event.ctrlKey && /^[a-zA-Z]$/.test(event.key)) {
      const letter = event.key.toLowerCase();
      const item = items.find((i) => i.querySelector('.menu-title').getAttribute('accesskey') === letter);
      if (item) {
        event.preventDefault();
        openMenu(item, true);
        return;
      }
    }
    if (!openItem) return;
    const popup = currentPopup();
    const inSubmenu = popup.classList.contains('submenu-popup');
    const list = entries(popup);
    const at = list.indexOf(document.activeElement);
    const current = list[at];
    const index = items.indexOf(openItem);
    switch (event.key) {
      case 'Escape':
        if (inSubmenu) {
          closeSubmenu(popup);
          break;
        }
        closeMenus();
        if (returnFocus?.isConnected) returnFocus.focus();
        returnFocus = null;
        break;
      case 'ArrowDown':
        list[(at + 1) % list.length]?.focus();
        break;
      case 'ArrowUp':
        list[(at - 1 + list.length) % list.length]?.focus();
        break;
      case 'Home':
        list[0]?.focus();
        break;
      case 'End':
        list.at(-1)?.focus();
        break;
      case 'ArrowRight':
        if (current?.classList.contains('submenu')) openSubmenu(current);
        else openMenu(items[(index + 1) % items.length], true);
        break;
      case 'ArrowLeft':
        if (inSubmenu) closeSubmenu(popup);
        else openMenu(items[(index - 1 + items.length) % items.length], true);
        break;
      case 'Enter':
      case ' ':
        if (!current) return;
        if (current.classList.contains('submenu')) openSubmenu(current);
        else current.click();
        break;
      case 'Tab':
        closeMenus();
        returnFocus = null;
        return;
      default: {
        // The underlined letter of an entry chooses it.
        const letter = event.key.toLowerCase();
        const entry = list.find((e) => e.querySelector('u')?.textContent.toLowerCase() === letter);
        if (!entry) return;
        if (entry.classList.contains('submenu')) openSubmenu(entry);
        else entry.click();
        break;
      }
    }
    event.preventDefault();
    event.stopPropagation();
  }, true);
  on('scene', fillDeclared);
  on('select', fillDeclared);
  on('window', syncWindows);
  on('layout', syncWindows);
  on('look', syncChecks);
  fillDeclared();
  syncEntries();
}

/** Fills the submenu Beispiele with the examples of the service. */
export function fillExamples(examples, open) {
  const popup = $('#menu-examples');
  popup.innerHTML = '';
  for (const example of examples) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-entry';
    button.setAttribute('role', 'menuitem');
    const caption = document.createElement('span');
    caption.textContent = example.title;
    button.append(caption);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      closeMenus();
      open(example.key);
    });
    popup.append(button);
  }
}
