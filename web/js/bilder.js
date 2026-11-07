// SPDX-License-Identifier: GPL-2.0-only
//
// 3D-Bausteine bilder.js: the pictures of the tab Bilder and the Dia-Show,
// F9 of version 1.3. Version 1.3 lists the files of the folder images of
// POV-Ray and shows one at a time on a black screen. The browser keeps the
// pictures of version 2.0 in its database, IndexedDB `bausteine` with the
// store `bilder`: the pictures of the views the user saved and the image
// files the user added with the small button `…`, each as a record
// `{id, name, type, blob, saved}`.
//
// The first picture is selected, where `Def_Bilder` of 1.3 meant to select
// it and selected nothing (F4-Q77). Anzeigen opens the show with the
// selected picture, the buttons `<` and `>` step and end the show at either
// end of the list, as in 1.3, and End closes it without moving a window.

import { $, app, escapeHtml, on, setStatus } from './state.js';

const DB = 'bausteine';
const STORE = 'bilder';

let pictures = [];
/** The id of the selected picture, null where the first one is meant. */
let selectedId = null;
let showing = -1;
let shownUrl = null;
/** The element that had the focus before the show opened, which gets it back. */
let opener = null;
let connection = null;

/** Opens the database of the pictures, once per visit. */
function openDb() {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    request.onsuccess = () => {
      const db = request.result;
      // Another tab that upgrades the database gets it, and this tab opens it again on its next request.
      db.onversionchange = () => {
        db.close();
        connection = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      connection = null;
      reject(request.error);
    };
  });
  return connection;
}

/** Runs `work` on the store of the pictures and answers what its request answers. */
async function withStore(mode, work) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = work(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Keeps the picture `blob` under `name`. */
export async function addPicture(name, blob) {
  try {
    await withStore('readwrite', (s) => s.add({ name, type: blob.type || 'image/png', blob, saved: Date.now() }));
  } catch {
    setStatus('Das Bild ließ sich im Browser nicht speichern', 4);
  }
  await refreshPictures();
}

/** Reads the list of the pictures again, `Def_Bilder` of version 1.3. */
export async function refreshPictures() {
  try {
    pictures = (await withStore('readonly', (s) => s.getAll())) ?? [];
  } catch {
    pictures = [];
  }
  if (!pictures.some((p) => p.id === selectedId)) selectedId = pictures[0]?.id ?? null;
  render();
}

/** Returns the index of the selected picture, the first one when none is chosen, or -1 for an empty list. */
function selectedIndex() {
  if (pictures.length === 0) return -1;
  const index = pictures.findIndex((p) => p.id === selectedId);
  return index >= 0 ? index : 0;
}

/** Returns `path` with a backslash at its end. */
function folder(path) {
  const text = String(path ?? '').trim();
  return text && !/[\\/]$/.test(text) ? `${text}\\` : text;
}

/** Writes the rows of the list File1 for the pictures, then marks the selected one. */
function render() {
  const list = $('#file1');
  if (pictures.length === 0) {
    list.innerHTML = '<div class="c-list-row empty" aria-disabled="true">(keine Bilder)</div>';
  } else {
    list.innerHTML = pictures
      .map((p, i) => `<div class="c-list-row" role="option" id="file1-${i}" data-index="${i}" aria-selected="false">${escapeHtml(p.name)}</div>`)
      .join('');
  }
  mark();
}

/**
 * Marks the selected picture in the rows of File1 and writes the field
 * TDatei, the path of 1.3 built from the settings. The rows stay the
 * elements they are, so the second click of a double click lands on the
 * row of the first and the browser reports the double click.
 */
function mark() {
  const list = $('#file1');
  const index = selectedIndex();
  for (const row of list.querySelectorAll('[data-index]')) row.setAttribute('aria-selected', String(Number(row.dataset.index) === index));
  if (index < 0) {
    list.removeAttribute('aria-activedescendant');
  } else {
    list.setAttribute('aria-activedescendant', `file1-${index}`);
    list.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }
  const name = pictures[index]?.name ?? '';
  $('#tdatei').value = `${folder(app.paths.povHome)}images\\${name}`;
}

/** Selects the picture `index` of the list. */
function select(index) {
  if (pictures.length === 0) return;
  selectedId = pictures[Math.max(0, Math.min(pictures.length - 1, index))].id;
  mark();
}

/** Shows the picture `index` in the Dia-Show, or closes it before the first and after the last, as 1.3 does. */
function show(index) {
  if (index < 0 || index >= pictures.length) {
    closeShow();
    return;
  }
  showing = index;
  selectedId = pictures[index].id;
  mark();
  if (shownUrl) URL.revokeObjectURL(shownUrl);
  shownUrl = URL.createObjectURL(pictures[index].blob);
  const img = $('#f9-picture');
  img.src = shownUrl;
  img.alt = pictures[index].name;
}

/**
 * Opens the Dia-Show with the selected picture, `BBildAnz_Click`. The
 * modern look asks the browser for the full screen, the classic look shows
 * the show over its virtual screen.
 */
export function openShow() {
  if (pictures.length === 0) {
    setStatus('Keine Bilder: „Bild speichern“ im Menü Ansicht oder … zum Hinzufügen', 5);
    return;
  }
  if ($('#f9').hidden) opener = document.activeElement;
  $('#f9').hidden = false;
  document.documentElement.classList.add('diashow');
  if (app.look !== 'classic' && !document.fullscreenElement) {
    // A show that ended before the browser granted the full screen leaves it at once.
    $('#f9').requestFullscreen?.().then(() => {
      if ($('#f9').hidden) document.exitFullscreen().catch(() => {});
    }).catch(() => {});
  }
  show(selectedIndex());
  $('#bbild-ende').focus();
}

/** Closes the Dia-Show, `BBildEnde_Click`, without moving any window. */
export function closeShow() {
  if ($('#f9').hidden) return;
  $('#f9').hidden = true;
  document.documentElement.classList.remove('diashow');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  showing = -1;
  $('#f9-picture').removeAttribute('src');
  if (shownUrl) URL.revokeObjectURL(shownUrl);
  shownUrl = null;
  opener?.focus?.();
  opener = null;
}

/** Adds the image files `files` to the list, the button `…` in the place of the stray PictureBox `Cmdia`. */
async function addFiles(files) {
  const all = [...(files ?? [])];
  const images = all.filter((file) => file.type.startsWith('image/'));
  for (const file of images) await addPicture(file.name, file);
  // The list holds pictures only, where 1.3 listed every file of the folder (F4-Q78).
  if (images.length < all.length) setStatus('Nur Bilder lassen sich hinzufügen', 4);
}

/** Wires the tab Bilder and the Dia-Show. */
export function wireBilder() {
  const list = $('#file1');
  list.addEventListener('click', (event) => {
    const row = event.target.closest('[data-index]');
    if (row) select(Number(row.dataset.index));
  });
  list.addEventListener('dblclick', (event) => {
    if (event.target.closest('[data-index]')) openShow();
  });
  list.addEventListener('keydown', (event) => {
    const index = selectedIndex();
    const keys = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: pictures.length - 1,
      PageDown: index + 10,
      PageUp: index - 10,
    };
    if (event.key === 'Enter') openShow();
    else if (event.key in keys) select(keys[event.key]);
    else return;
    // The keys stay in the list and never move the selected body of the scene.
    event.preventDefault();
    event.stopPropagation();
  });
  $('#bbild-anz').addEventListener('click', openShow);
  $('#cmdia').addEventListener('click', () => $('#cmdia-file').click());
  $('#cmdia-file').addEventListener('change', async (event) => {
    await addFiles(event.target.files);
    event.target.value = '';
  });
  $('#bbild-rueck').addEventListener('click', () => show(showing - 1));
  $('#bbild-weiter').addEventListener('click', () => show(showing + 1));
  $('#bbild-ende').addEventListener('click', closeShow);
  $('#f9-picture').addEventListener('error', () => {
    if (!$('#f9').hidden && $('#f9-picture').getAttribute('src')) setStatus('Das Bild lässt sich nicht anzeigen', 4);
  });
  // Inside the show: the arrows step, Space steps on, Enter, Esc and End end it, P-229.
  document.addEventListener('keydown', (event) => {
    if ($('#f9').hidden) return;
    if (event.key === 'ArrowLeft') show(showing - 1);
    else if (event.key === 'ArrowRight' || event.key === ' ') show(showing + 1);
    else if (event.key === 'Escape' || event.key === 'Enter' || event.key === 'End') closeShow();
    else return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  // The browser leaves the full screen on its own key, and the show ends with it.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && !$('#f9').hidden && app.look !== 'classic') closeShow();
  });
  on('paths', () => mark());
  refreshPictures();
}
