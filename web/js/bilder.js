// SPDX-License-Identifier: GPL-2.0-only
//
// 3D-Bausteine bilder.js: the pictures of the tab Bilder and the Dia-Show,
// F9 of version 1.3. Version 1.3 lists the files of the folder images of
// POV-Ray and shows one at a time on a black screen. The browser keeps the
// pictures of version 2.0 in its database: the pictures of the views the
// user saved and the image files the user added.

import { $, app, escapeHtml, on, setStatus } from './state.js';

const DB = 'bausteine';
const STORE = 'bilder';

let pictures = [];
let selected = 0;
let showing = -1;
let shownUrl = null;

/** Opens the database of the pictures. */
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Runs `work` on the store of the pictures and answers what its request answers. */
async function withStore(mode, work) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = work(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
  });
}

/** Keeps the picture `blob` under `name`. */
export async function addPicture(name, blob) {
  try {
    await withStore('readwrite', (s) => s.add({ name, blob, saved: Date.now() }));
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
  selected = Math.min(selected, Math.max(0, pictures.length - 1));
  render();
}

/** Writes the list File1 and the field TDatei. */
function render() {
  const list = $('#file1');
  if (pictures.length === 0) {
    list.innerHTML = '<div class="c-list-row empty" aria-disabled="true">(keine Bilder)</div>';
  } else {
    list.innerHTML = pictures
      .map((p, i) => `<div class="c-list-row" role="option" data-index="${i}" aria-selected="${i === selected}">${escapeHtml(p.name)}</div>`)
      .join('');
  }
  const name = pictures[selected]?.name ?? '';
  $('#tdatei').value = `${app.paths.povHome}images\\${name}`;
}

/** Shows the picture `index` in the Dia-Show, or closes it before the first and after the last, as 1.3 does. */
function show(index) {
  if (index < 0 || index >= pictures.length) {
    closeShow();
    return;
  }
  showing = index;
  if (shownUrl) URL.revokeObjectURL(shownUrl);
  shownUrl = URL.createObjectURL(pictures[index].blob);
  $('#f9-picture').src = shownUrl;
  $('#f9-picture').alt = pictures[index].name;
}

/** Opens the Dia-Show with the selected picture, `BBildAnz_Click`. */
export function openShow() {
  if (pictures.length === 0) {
    setStatus('Keine Bilder: „Bild speichern“ im Menü Ansicht oder … zum Hinzufügen', 5);
    return;
  }
  $('#f9').hidden = false;
  document.documentElement.classList.add('diashow');
  $('#f9').requestFullscreen?.().catch(() => {});
  show(selected);
  $('#bbild-ende').focus();
}

/** Closes the Dia-Show, `BBildEnde_Click`, without moving any window. */
export function closeShow() {
  if ($('#f9').hidden) return;
  $('#f9').hidden = true;
  document.documentElement.classList.remove('diashow');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  showing = -1;
}

/** Wires the tab Bilder and the Dia-Show. */
export function wireBilder() {
  $('#file1').addEventListener('click', (event) => {
    const row = event.target.closest('[data-index]');
    if (!row) return;
    selected = Number(row.dataset.index);
    render();
  });
  $('#file1').addEventListener('dblclick', openShow);
  $('#bbild-anz').addEventListener('click', openShow);
  $('#cmdia').addEventListener('click', () => $('#cmdia-file').click());
  $('#cmdia-file').addEventListener('change', async (event) => {
    for (const file of event.target.files ?? []) await addPicture(file.name, file);
    event.target.value = '';
  });
  $('#bbild-rueck').addEventListener('click', () => show(showing - 1));
  $('#bbild-weiter').addEventListener('click', () => show(showing + 1));
  $('#bbild-ende').addEventListener('click', closeShow);
  document.addEventListener('keydown', (event) => {
    if ($('#f9').hidden) return;
    if (event.key === 'ArrowLeft') show(showing - 1);
    else if (event.key === 'ArrowRight' || event.key === ' ') show(showing + 1);
    else if (event.key === 'Escape' || event.key === 'Enter') closeShow();
    else return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  on('paths', () => render());
  refreshPictures();
}
