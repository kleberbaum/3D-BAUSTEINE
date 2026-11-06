// SPDX-License-Identifier: GPL-2.0-only
//
// 3D-Bausteine farben.js: the window Farben/Texturen, F6 of version 1.3,
// and the colour dialog of Windows it opens. The frame of the colour shows
// the colour of the selected body, the button Farbe opens the dialog, and
// the list TEXTUR assigns one of the 43 standard textures of POV-Ray, which
// wins over the colour. The dialog has the 48 basic colours of Windows, the
// 16 custom colours and the panel "Farben definieren".

import { commit } from './scene.js';
import { $, $$, app, escapeHtml, on, selectedItem, selectedLine, setStatus } from './state.js';

/** The basic colours of the colour dialog of Windows, row by row. */
const BASIC = [
  '#FF8080', '#FFFF80', '#80FF80', '#00FF80', '#80FFFF', '#0080FF', '#FF80C0', '#FF80FF',
  '#FF0000', '#FFFF00', '#80FF00', '#00FF40', '#00FFFF', '#0080C0', '#8080C0', '#FF00FF',
  '#804040', '#FF8040', '#00FF00', '#008080', '#004080', '#8080FF', '#800040', '#FF0080',
  '#800000', '#FF8000', '#008000', '#008040', '#0000FF', '#0000A0', '#800080', '#8000FF',
  '#400000', '#804000', '#004000', '#004040', '#000080', '#000040', '#400040', '#400080',
  '#000000', '#808000', '#808040', '#808080', '#408080', '#C0C0C0', '#400040', '#FFFFFF',
];

/** The custom colours the thesis shows, a wedge of greys. */
const CUSTOM = [
  '#FFFFFF', '#EFEFEF', '#DFDFDF', '#CFCFCF', '#BFBFBF', '#AFAFAF', '#9F9F9F', '#8F8F8F',
  '#7F7F7F', '#6F6F6F', '#5F5F5F', '#4F4F4F', '#3F3F3F', '#2F2F2F', '#1F1F1F', '#0F0F0F',
];

let custom = [...CUSTOM];
let chosen = '#ffffff';
let customSlot = 0;
let resolveDialog = null;

/** Shows the colour and the texture of the selected body in F6. */
function showSurface() {
  const item = selectedLine()?.end ? null : selectedItem();
  const color = item?.color ?? '#ffffff';
  $('#frame-farbe').style.background = color;
  $('#frame-farbe').style.color = contrast(color);
  $('#cb3').value = item?.texture ?? '';
  $('#cb3').disabled = !item;
  $('#surface-swatch').style.background = item?.texture ? 'repeating-linear-gradient(45deg, #888 0 6px, #bbb 6px 12px)' : color;
}

/** Returns black or white, whichever reads on the colour `hex`. */
function contrast(hex) {
  const v = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  return r * 0.299 + g * 0.587 + b * 0.114 > 140 ? '#000000' : '#ffffff';
}

/** Fills the list TEXTUR with Keine and the textures of the service. */
function fillTextures() {
  $('#cb3').innerHTML = ['<option value="">Keine</option>', ...app.textures.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)].join('');
}

/** Writes the swatches of the dialog. */
function renderSwatches() {
  const swatch = (color, i, set) => `<button type="button" class="farben-swatch" role="option" data-set="${set}" data-i="${i}" data-color="${color}" style="background:${color}" aria-label="${color}" aria-selected="${color.toLowerCase() === chosen.toLowerCase()}"></button>`;
  $('.farben-grund').innerHTML = BASIC.map((c, i) => swatch(c, i, 'grund')).join('');
  $('.farben-custom').innerHTML = custom.map((c, i) => swatch(c, i, 'custom')).join('');
}

/** Chooses the colour `hex` in the dialog and shows it in the panel. */
function choose(hex) {
  chosen = hex.toLowerCase();
  for (const el of $$('.farben-swatch')) el.setAttribute('aria-selected', String(el.dataset.color.toLowerCase() === chosen));
  const v = parseInt(chosen.slice(1), 16);
  const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  const [h, s, l] = rgbToHsl(r, g, b);
  $('#farben-r').value = r;
  $('#farben-g').value = g;
  $('#farben-b').value = b;
  $('#farben-h').value = h;
  $('#farben-s').value = s;
  $('#farben-l').value = l;
  $('#farben-preview').style.background = chosen;
  $('#farben-picker').value = chosen;
  drawLum(h, s, l);
}

/** Returns the hue, saturation and lightness of Windows, 0 to 239 and 0 to 240, for the colour (r, g, b). */
function rgbToHsl(r, g, b) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h /= 6;
  }
  return [Math.round(h * 239), Math.round(s * 240), Math.round(l * 240)];
}

/** Returns the colour #rrggbb of the hue, saturation and lightness of Windows. */
function hslToHex(h, s, l) {
  const H = h / 239;
  const S = s / 240;
  const L = l / 240;
  const f = (n) => {
    const k = (n + H * 12) % 12;
    const a = S * Math.min(L, 1 - L);
    return Math.round((L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  return `#${[f(0), f(8), f(4)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Draws the field of hue and saturation of the panel "Farben definieren". */
function drawHs() {
  const canvas = $('#farben-hs');
  const g = canvas.getContext('2d');
  for (let x = 0; x < canvas.width; x += 1) {
    for (let y = 0; y < canvas.height; y += 2) {
      g.fillStyle = hslToHex((x / canvas.width) * 239, (1 - y / canvas.height) * 240, 120);
      g.fillRect(x, y, 1, 2);
    }
  }
}

/** Draws the bar of the lightness for the hue `h` and the saturation `s`. */
function drawLum(h, s) {
  const canvas = $('#farben-lum');
  const g = canvas.getContext('2d');
  for (let y = 0; y < canvas.height; y += 1) {
    g.fillStyle = hslToHex(h, s, (1 - y / canvas.height) * 240);
    g.fillRect(0, y, canvas.width, 1);
  }
}

/** Opens the colour dialog with `initial` and answers the colour chosen with OK, or null. */
export function colorDialog(initial) {
  chosen = (initial ?? '#ffffff').toLowerCase();
  renderSwatches();
  choose(chosen);
  const dialog = $('#farben');
  dialog.showModal();
  return new Promise((resolve) => {
    resolveDialog = resolve;
  });
}

/** Closes the dialog with `result`. */
function finish(result) {
  const resolve = resolveDialog;
  resolveDialog = null;
  $('#farben').close();
  resolve?.(result);
}

/** Opens the colour dialog for the selected body and applies the colour, `F6.BColor_Click`. */
export async function changeColor() {
  const item = selectedLine()?.end ? null : selectedItem();
  if (!item) {
    setStatus('Zuerst ein Objekt in der Liste OBJEKTE wählen', 3);
    return;
  }
  const color = await colorDialog(item.color);
  if (!color || color === item.color) return;
  await commit(() => app.store.updateItem(app.scene.id, item.id, { color }));
}

/** Wires F6 and the colour dialog. */
export function wireFarben() {
  fillTextures();
  renderSwatches();
  drawHs();
  $('#bcolor').addEventListener('click', changeColor);
  $('#cb3').addEventListener('change', async () => {
    const item = selectedItem();
    if (!item) return;
    const texture = $('#cb3').value || null;
    await commit(() => app.store.updateItem(app.scene.id, item.id, { texture }));
  });
  $('#farben').addEventListener('click', (event) => {
    const swatch = event.target.closest('.farben-swatch');
    if (swatch) {
      choose(swatch.dataset.color);
      if (swatch.dataset.set === 'custom') customSlot = Number(swatch.dataset.i);
    }
  });
  $('#farben').addEventListener('dblclick', (event) => {
    if (event.target.closest('.farben-swatch')) finish(chosen);
  });
  $('#farben-ok').addEventListener('click', () => finish(chosen));
  $('#farben-cancel').addEventListener('click', () => finish(null));
  $('#farben').addEventListener('cancel', (event) => {
    event.preventDefault();
    finish(null);
  });
  $('#farben .win-close').addEventListener('click', () => finish(null));
  $('#farben-define').addEventListener('click', () => {
    const panel = $('.farben-full');
    panel.hidden = !panel.hidden;
    $('#farben').classList.toggle('full', !panel.hidden);
  });
  $('#farben-hs').addEventListener('pointerdown', (event) => {
    const canvas = $('#farben-hs');
    const pick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const h = Math.max(0, Math.min(239, ((e.clientX - rect.left) / rect.width) * 239));
      const s = Math.max(0, Math.min(240, (1 - (e.clientY - rect.top) / rect.height) * 240));
      choose(hslToHex(h, s, Number($('#farben-l').value) || 120));
    };
    pick(event);
    canvas.setPointerCapture(event.pointerId);
    canvas.onpointermove = (e) => e.buttons && pick(e);
  });
  $('#farben-lum').addEventListener('pointerdown', (event) => {
    const canvas = $('#farben-lum');
    const pick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const l = Math.max(0, Math.min(240, (1 - (e.clientY - rect.top) / rect.height) * 240));
      choose(hslToHex(Number($('#farben-h').value), Number($('#farben-s').value), l));
    };
    pick(event);
    canvas.setPointerCapture(event.pointerId);
    canvas.onpointermove = (e) => e.buttons && pick(e);
  });
  for (const id of ['h', 's', 'l']) {
    $(`#farben-${id}`).addEventListener('change', () => choose(hslToHex(Number($('#farben-h').value), Number($('#farben-s').value), Number($('#farben-l').value))));
  }
  for (const id of ['r', 'g', 'b']) {
    $(`#farben-${id}`).addEventListener('change', () => {
      const c = ['r', 'g', 'b'].map((k) => Math.max(0, Math.min(255, Number($(`#farben-${k}`).value) || 0)));
      choose(`#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`);
    });
  }
  $('#farben-picker').addEventListener('input', () => choose($('#farben-picker').value));
  $('#farben-add').addEventListener('click', () => {
    custom[customSlot] = chosen;
    customSlot = (customSlot + 1) % custom.length;
    renderSwatches();
  });
  on('scene', showSurface);
  on('select', showSurface);
  on('textures', fillTextures);
  showSurface();
}
