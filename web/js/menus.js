// SPDX-License-Identifier: GPL-2.0-only
//
// 3D-Bausteine menus.js: the menu bar of Form1. Version 1.3 has the menus
// Datei, Bearbeiten, Objekte and Ansicht, of which only Datei holds entries.
// Version 2.0 fills the empty ones with the functions the thesis says are
// "auch in den Menüs vorhanden" and adds Hilfe at the end. The bar opens on
// a click or with Alt and the underlined letter, and a hover moves an open
// menu to its neighbour, as on Windows.

import { $, $$ } from './state.js';

let openItem = null;

/** Closes the open menu. */
export function closeMenus() {
  if (!openItem) return;
  openItem.querySelector('.menu-popup').hidden = true;
  openItem.querySelector('.menu-title').setAttribute('aria-expanded', 'false');
  openItem.classList.remove('open');
  openItem = null;
}

/** Opens the menu `item` and focuses its first entry when `focus` is set. */
function openMenu(item, focus = false) {
  if (openItem === item) return;
  closeMenus();
  openItem = item;
  item.classList.add('open');
  item.querySelector('.menu-title').setAttribute('aria-expanded', 'true');
  const popup = item.querySelector('.menu-popup');
  popup.hidden = false;
  if (focus) popup.querySelector('.menu-entry')?.focus();
}

/** Returns the entries of the open menu that take the focus. */
function entries() {
  return openItem ? [...openItem.querySelectorAll(':scope > .menu-popup > .menu-entry')] : [];
}

/**
 * Wires the menu bar. `act` is called with the entry that was chosen: its
 * `data-entry`, or its `data-body` for the menu Objekte, and the element.
 */
export function wireMenus(act) {
  const items = $$('#menubar .menu-item');
  for (const item of items) {
    const title = item.querySelector('.menu-title');
    title.addEventListener('click', () => (openItem === item ? closeMenus() : openMenu(item)));
    title.addEventListener('pointerenter', () => {
      if (openItem && openItem !== item) openMenu(item);
    });
    item.querySelector('.menu-popup').addEventListener('click', (event) => {
      const entry = event.target.closest('.menu-entry');
      if (!entry || entry.classList.contains('submenu') || entry.disabled) return;
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
    const list = entries();
    const at = list.indexOf(document.activeElement);
    const index = items.indexOf(openItem);
    switch (event.key) {
      case 'Escape':
        closeMenus();
        break;
      case 'ArrowDown':
        list[(at + 1) % list.length]?.focus();
        break;
      case 'ArrowUp':
        list[(at - 1 + list.length) % list.length]?.focus();
        break;
      case 'ArrowRight':
        openMenu(items[(index + 1) % items.length], true);
        break;
      case 'ArrowLeft':
        openMenu(items[(index - 1 + items.length) % items.length], true);
        break;
      default: {
        // The underlined letter of an entry chooses it.
        const letter = event.key.toLowerCase();
        const entry = list.find((e) => e.querySelector('u')?.textContent.toLowerCase() === letter);
        if (!entry) return;
        entry.click();
        break;
      }
    }
    event.preventDefault();
    event.stopPropagation();
  }, true);
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
    button.innerHTML = `<span></span>`;
    button.firstChild.textContent = example.title;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      closeMenus();
      open(example.key);
    });
    popup.append(button);
  }
}

/** Sets the check mark of the entry `entry`. */
export function check(entry, on) {
  $(`#menubar [data-entry="${entry}"]`)?.setAttribute('aria-checked', String(Boolean(on)));
}
