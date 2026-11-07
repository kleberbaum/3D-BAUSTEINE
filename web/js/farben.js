// SPDX-License-Identifier: GPL-2.0-only
//
// 3D-Bausteine farben.js: the window Farben/Texturen, F6 of version 1.3,
// and the colour dialog of Windows it opens. The frame FARBE shows the
// colour of the selected body, the button Farbe opens the dialog, and the
// list TEXTUR assigns one of the 43 standard textures of POV-Ray, which wins
// over the colour. The list is disabled while no body is selected, so a
// texture never lands on the raster as `CB3_Click` of 1.3 let it (M-64).
//
// The dialog has the 48 basic colours of Windows, the 16 custom colours of
// the thesis and the panel "Farben definieren" with hue, saturation and
// lightness from 0 to 240 as Windows counts them. It opens with the colour
// of the body, OK applies a colour and Abbrechen changes nothing, where 1.3
// loaded no colour and painted the body with the last one on a cancel (M-65).
//
// The tab Oberfläche of the modern look shows the material of the selected
// body as a sphere: its colour, or its texture in the pattern of its family
// and in the colours the ray tracer gives it, which the service answers as
// `Texture.material`, so Jade is a green marble and Gold_Metal a gold metal
// as they render.

import { commit } from './scene.js';
import { $, $$, app, escapeHtml, selectedItem, selectedLine, setStatus, on } from './state.js';

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

/** The swatches per row of both grids. */
const COLUMNS = 8;

let custom = [...CUSTOM];
let chosen = '#ffffff';
/** The swatch that holds the choice as `{set, i}`, or null where the colour came from the panel. */
let chosenSwatch = null;
let customSlot = 0;
let resolveDialog = null;
/** The field of hue and saturation, drawn once and copied before each marker. */
let hsImage = null;

/** Returns the item whose colour and texture F6 shows: the selected body or group, never the raster or a CSG-Ende line. */
function surfaceItem() {
  return selectedLine()?.end ? null : selectedItem();
}

/** Shows the colour and the texture of the selected body in F6. */
function showSurface() {
  const item = surfaceItem();
  const frame = $('#frame-farbe');
  // Without a body the stylesheet gives the frame its grey, #e0e0e0 in the classic look.
  frame.style.background = item ? item.color : '';
  frame.style.color = item ? contrast(item.color) : '';
  frame.toggleAttribute('data-textured', Boolean(item?.texture));
  const cb3 = $('#cb3');
  cb3.value = item?.texture ?? '';
  cb3.disabled = !item;
  paintSwatch(item);
}

/** The materials of the textures by name, `Texture.material` as the service answers it for its ray tracer. */
let materials = new Map();

/**
 * The family of surfaces of each group of textures. The swatch takes it
 * only while the answer of the service is missing, before it arrives or
 * where the request failed, and paints the family in greys.
 */
const GROUP_SURFACES = { Metall: 'metal', Stein: 'marble', Glas: 'glass', Holz: 'wood' };

/** Returns the colour `value`, a text #rrggbb or three channels from zero to one, as #rrggbb. */
function hexOf(value, fallback) {
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  if (Array.isArray(value) && value.length === 3) {
    return `#${value.map((c) => Math.round(Math.max(0, Math.min(1, Number(c) || 0)) * 255).toString(16).padStart(2, '0')).join('')}`;
  }
  return fallback;
}

/**
 * Returns the material of the texture `name` as `{surface, base, accent,
 * reflection}`: the one the service answers, its family lowercased from the
 * enum Surface of the schema. Without that answer it is the family of the
 * group in greys, so a metal, a stone, a glass and a wood still differ.
 */
function materialOf(name) {
  const known = materials.get(name);
  const group = app.store?.textures?.find((t) => t.name === name)?.group;
  return {
    surface: String(known?.surface ?? GROUP_SURFACES[group] ?? 'marble').toLowerCase(),
    base: hexOf(known?.base, '#b4b4b4'),
    accent: hexOf(known?.accent, '#767676'),
    reflection: Math.max(0, Math.min(1, Number(known?.reflection ?? 0.2) || 0)),
  };
}

/**
 * Returns the layers of the CSS background of a sphere of the surface
 * `surface` in the colours `base` and `accent`, the pattern of each family
 * as the ray tracer draws it: the rings of a wood, the veins of a marble,
 * the grains of a granite, the stripes of a candy cane, the mirrored sky
 * and ground of a metal and the light through a glass.
 */
function patternLayers({ surface, base, accent }) {
  switch (surface) {
    case 'metal':
      return [`linear-gradient(172deg, color-mix(in srgb, ${base} 55%, #fff) 0 34%, color-mix(in srgb, ${base} 70%, #000) 50%, ${base} 64%, color-mix(in srgb, ${base} 80%, #fff) 100%)`];
    case 'glass':
      return [`radial-gradient(circle at 62% 72%, color-mix(in srgb, ${base} 35%, #fff) 0 18%, transparent 58%)`];
    case 'wood':
      return [`repeating-radial-gradient(ellipse 150% 70% at 0% 115%, ${base} 0 5px, ${accent} 7px 9px, ${base} 11px 12px)`];
    case 'marble':
      return [
        `repeating-linear-gradient(118deg, transparent 0 9px, ${accent} 10px 11px, transparent 12px 21px)`,
        `repeating-linear-gradient(32deg, transparent 0 15px, color-mix(in srgb, ${accent} 70%, transparent) 16px 17px, transparent 18px 29px)`,
      ];
    case 'granite':
      return [
        `radial-gradient(${accent} 1px, transparent 1.6px) 0 0 / 5px 5px`,
        `radial-gradient(color-mix(in srgb, ${accent} 60%, ${base}) 1px, transparent 1.7px) 2px 3px / 7px 7px`,
      ];
    case 'stripes':
      return [`repeating-linear-gradient(45deg, ${base} 0 8px, ${accent} 8px 16px)`];
    default:
      return [];
  }
}

/**
 * Paints the material swatch of the tab Oberfläche for `item`: a sphere in
 * its colour, or in its texture where it has one, which wins over the
 * colour as it does for the ray tracer. The light and the shade of the
 * sphere lie over the colour, so the swatch stays a sphere. Without an
 * item the stylesheet paints the empty sphere.
 */
function paintSwatch(item) {
  const swatch = $('#surface-swatch');
  if (!swatch) return;
  if (!item) {
    swatch.style.background = '';
    delete swatch.dataset.surface;
    return;
  }
  const material = item.texture ? materialOf(item.texture) : { surface: 'plain', base: hexOf(item.color, '#ffffff'), accent: '#000000', reflection: 0 };
  const shine = 0.7 + 0.3 * material.reflection;
  const light = `radial-gradient(circle at 35% 30%, rgb(255 255 255 / ${shine.toFixed(2)}), transparent ${material.surface === 'glass' ? 30 : 45}%)`;
  const shade = 'radial-gradient(circle at 40% 35%, transparent 42%, rgb(0 0 0 / 0.38) 100%)';
  const color = material.surface === 'glass' ? `color-mix(in srgb, ${material.base} 55%, transparent)` : material.base;
  swatch.style.background = [light, shade, ...patternLayers(material), color].join(', ');
  swatch.dataset.surface = material.surface;
}

/**
 * Reads the materials of the textures, `Texture.material`, and paints the
 * swatch again. The lists the store loads at the start answer them where
 * their query asks for the field, and else farben.js asks the service for
 * them itself. A request that fails leaves the swatch in the greys of the
 * families.
 */
async function loadMaterials() {
  let list = (app.store?.textures ?? []).filter((t) => t.material);
  if (list.length === 0) {
    try {
      const data = await app.store.request('{ textures { name material { surface base accent reflection } } }');
      list = (data?.textures ?? []).filter((t) => t.material);
    } catch {
      return;
    }
  }
  materials = new Map(list.map((t) => [t.name, t.material]));
  paintSwatch(surfaceItem());
}

/** Returns black or white, whichever reads on the colour `hex`. */
function contrast(hex) {
  const v = parseInt(String(hex).slice(1), 16) || 0;
  const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  return r * 0.299 + g * 0.587 + b * 0.114 > 140 ? '#000000' : '#ffffff';
}

/** Fills the list TEXTUR with Keine and the textures of the service, `Fill_CB3_Texi`. */
function fillTextures() {
  $('#cb3').innerHTML = ['<option value="">Keine</option>', ...app.textures.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)].join('');
}

/** Writes the swatches of the dialog. */
function renderSwatches() {
  const swatch = (color, i, set) => `<button type="button" class="farben-swatch" role="option" data-set="${set}" data-i="${i}" data-color="${color}" style="background:${color}" aria-label="${color}" aria-selected="false" tabindex="-1"></button>`;
  $('.farben-grund').innerHTML = BASIC.map((c, i) => swatch(c, i, 'grund')).join('');
  $('.farben-custom').innerHTML = custom.map((c, i) => swatch(c, i, 'custom')).join('');
  markSwatch();
}

/**
 * Marks the swatch of the choice, the one that was clicked or else the
 * first one of the colour, and gives each grid one stop for the Tab key.
 */
function markSwatch() {
  const all = $$('.farben-swatch');
  let mark = chosenSwatch ? all.find((el) => el.dataset.set === chosenSwatch.set && Number(el.dataset.i) === chosenSwatch.i) : null;
  if (!mark || mark.dataset.color.toLowerCase() !== chosen) mark = all.find((el) => el.dataset.color.toLowerCase() === chosen) ?? null;
  for (const el of all) el.setAttribute('aria-selected', String(el === mark));
  for (const grid of $$('.farben-grund, .farben-custom')) {
    const swatches = [...grid.querySelectorAll('.farben-swatch')];
    const stop = swatches.includes(mark) ? mark : swatches[0];
    for (const el of swatches) el.tabIndex = el === stop ? 0 : -1;
  }
}

/**
 * Chooses the colour `hex` in the dialog, from the swatch `swatch` where
 * one was clicked, and shows it in the panel. `hsl` holds the hue,
 * saturation and lightness where they were typed or picked, which the
 * fields keep as the dialog of Windows keeps them.
 */
function choose(hex, swatch = null, hsl = null) {
  chosen = String(hex).toLowerCase();
  chosenSwatch = swatch ? { set: swatch.dataset.set, i: Number(swatch.dataset.i) } : null;
  markSwatch();
  const v = parseInt(chosen.slice(1), 16) || 0;
  const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  const [h, s, l] = hsl ? hsl.map(Math.round) : rgbToHsl(r, g, b);
  $('#farben-r').value = r;
  $('#farben-g').value = g;
  $('#farben-b').value = b;
  $('#farben-h').value = h;
  $('#farben-s').value = s;
  $('#farben-l').value = l;
  $('#farben-preview').style.background = chosen;
  $('#farben-picker').value = chosen;
  drawHs(h, s);
  drawLum(h, s, l);
}

/**
 * The scale of hue, saturation and lightness in the colour dialog of
 * Windows, HLSMAX. The circle of hues has 240 steps, so its fields count
 * the hue from 0 to 239 and the other two from 0 to 240.
 */
const HLSMAX = 240;
/** The largest value of a colour channel, RGBMAX. */
const RGBMAX = 255;
/** The hue Windows shows for a grey, which has none, two thirds of the circle. */
const GREY_HUE = (HLSMAX * 2) / 3;

/** Divides as C divides integers, cutting the fraction off. */
const div = (a, b) => Math.trunc(a / b);

/**
 * Returns the hue, saturation and lightness of Windows for the colour
 * (r, g, b), in the integer steps of the conversion Windows publishes for
 * its colour dialog, so pure blue reads 160 and magenta 200.
 */
function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = div((max + min) * HLSMAX + RGBMAX, 2 * RGBMAX);
  if (max === min) return [GREY_HUE, 0, l];
  const d = max - min;
  const s = l <= HLSMAX / 2
    ? div(d * HLSMAX + div(max + min, 2), max + min)
    : div(d * HLSMAX + div(2 * RGBMAX - max - min, 2), 2 * RGBMAX - max - min);
  const delta = (c) => div((max - c) * (HLSMAX / 6) + div(d, 2), d);
  let h;
  if (r === max) h = delta(b) - delta(g);
  else if (g === max) h = HLSMAX / 3 + delta(r) - delta(b);
  else h = (HLSMAX * 2) / 3 + delta(g) - delta(r);
  if (h < 0) h += HLSMAX;
  if (h >= HLSMAX) h -= HLSMAX;
  return [h, s, l];
}

/** Returns one channel of the conversion of Windows from the two magic values and the hue `hue`. */
function hueToChannel(n1, n2, hue) {
  if (hue < 0) hue += HLSMAX;
  if (hue > HLSMAX) hue -= HLSMAX;
  if (hue < HLSMAX / 6) return n1 + div((n2 - n1) * hue + HLSMAX / 12, HLSMAX / 6);
  if (hue < HLSMAX / 2) return n2;
  if (hue < (HLSMAX * 2) / 3) return n1 + div((n2 - n1) * ((HLSMAX * 2) / 3 - hue) + HLSMAX / 12, HLSMAX / 6);
  return n1;
}

/** Returns the colour #rrggbb of the hue, saturation and lightness of Windows, each rounded to its integer step. */
function hslToHex(h, s, l) {
  const [H, S, L] = [Math.round(h), Math.round(s), Math.round(l)];
  let rgb;
  if (S === 0) {
    const v = div(L * RGBMAX, HLSMAX);
    rgb = [v, v, v];
  } else {
    const m2 = L <= HLSMAX / 2 ? div(L * (HLSMAX + S) + HLSMAX / 2, HLSMAX) : L + S - div(L * S + HLSMAX / 2, HLSMAX);
    const m1 = 2 * L - m2;
    const channel = (hue) => div(hueToChannel(m1, m2, hue) * RGBMAX + HLSMAX / 2, HLSMAX);
    rgb = [channel(H + HLSMAX / 3), channel(H), channel(H - HLSMAX / 3)];
  }
  return `#${rgb.map((c) => Math.max(0, Math.min(RGBMAX, c)).toString(16).padStart(2, '0')).join('')}`;
}

/** Draws the field of hue and saturation of the panel "Farben definieren" with the cross of the colour at (h, s). */
function drawHs(h = null, s = null) {
  const canvas = $('#farben-hs');
  const g = canvas.getContext('2d');
  if (!g) return;
  if (!hsImage) {
    for (let x = 0; x < canvas.width; x += 1) {
      for (let y = 0; y < canvas.height; y += 2) {
        g.fillStyle = hslToHex((x / canvas.width) * HLSMAX, (1 - y / canvas.height) * HLSMAX, HLSMAX / 2);
        g.fillRect(x, y, 1, 2);
      }
    }
    hsImage = g.getImageData(0, 0, canvas.width, canvas.height);
  } else {
    g.putImageData(hsImage, 0, 0);
  }
  if (h == null || s == null) return;
  // The cross of the dialog of Windows: four black bars around the point, the point itself left free.
  const x = Math.min(canvas.width - 1, Math.round((h / HLSMAX) * canvas.width));
  const y = Math.round((1 - s / HLSMAX) * (canvas.height - 1));
  g.fillStyle = '#000000';
  g.fillRect(x - 9, y - 1, 6, 3);
  g.fillRect(x + 4, y - 1, 6, 3);
  g.fillRect(x - 1, y - 9, 3, 6);
  g.fillRect(x - 1, y + 4, 3, 6);
}

/** Draws the bar of the lightness for the hue `h` and the saturation `s`, with a mark at the lightness `l`. */
function drawLum(h, s, l = null) {
  const canvas = $('#farben-lum');
  const g = canvas.getContext('2d');
  if (!g) return;
  for (let y = 0; y < canvas.height; y += 1) {
    g.fillStyle = hslToHex(h, s, (1 - y / canvas.height) * HLSMAX);
    g.fillRect(0, y, canvas.width, 1);
  }
  if (l == null) return;
  const y = Math.round((1 - l / HLSMAX) * (canvas.height - 1));
  g.fillStyle = l > HLSMAX / 2 ? '#000000' : '#ffffff';
  g.fillRect(0, y, canvas.width, 1);
}

/** Opens the colour dialog with `initial` and answers the colour chosen with OK, or null. */
export function colorDialog(initial) {
  const dialog = $('#farben');
  if (dialog.open) return Promise.resolve(null);
  chosen = String(initial ?? '#ffffff').toLowerCase();
  chosenSwatch = null;
  renderSwatches();
  choose(chosen);
  dialog.showModal();
  ($('.farben-swatch[aria-selected="true"]') ?? $('#farben-ok')).focus();
  return new Promise((resolve) => {
    resolveDialog = resolve;
  });
}

/** Closes the dialog with `result`. */
function finish(result) {
  const resolve = resolveDialog;
  resolveDialog = null;
  if ($('#farben').open) $('#farben').close();
  resolve?.(result);
}

/** Opens the colour dialog for the selected body and applies the colour, `F6.BColor_Click`. */
export async function changeColor() {
  const item = surfaceItem();
  if (!item) {
    setStatus('Zuerst ein Objekt in der Liste OBJEKTE wählen', 3);
    return;
  }
  const color = await colorDialog(item.color);
  if (!color || color === String(item.color).toLowerCase()) return;
  await commit(() => app.store.updateItem(app.scene.id, item.id, { color }));
}

/** Moves the choice with the arrow keys inside a grid of swatches, and Enter on a swatch is OK, as in the dialog of Windows. */
function swatchKeys(event) {
  const swatch = event.target.closest('.farben-swatch');
  if (!swatch) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    choose(swatch.dataset.color, swatch);
    finish(chosen);
    return;
  }
  const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNS, ArrowUp: -COLUMNS };
  if (!(event.key in moves)) return;
  event.preventDefault();
  const all = [...swatch.parentElement.querySelectorAll('.farben-swatch')];
  const next = all[all.indexOf(swatch) + moves[event.key]];
  if (!next) return;
  choose(next.dataset.color, next);
  if (next.dataset.set === 'custom') customSlot = Number(next.dataset.i);
  next.focus();
}

/** Wires F6 and the colour dialog. */
export function wireFarben() {
  fillTextures();
  renderSwatches();
  drawHs();
  const cb3 = $('#cb3');
  // The only tool tip of 1.3 outside the two bars shows through the tool tips of the page, the title stays for the browser.
  if (!cb3.dataset.tip) cb3.dataset.tip = cb3.title || 'Textur auswählen';
  $('#bcolor').addEventListener('click', changeColor);
  cb3.addEventListener('change', async () => {
    const item = surfaceItem();
    if (!item) {
      showSurface();
      return;
    }
    const texture = cb3.value || null;
    if (texture === (item.texture ?? null)) return;
    await commit(() => app.store.updateItem(app.scene.id, item.id, { texture }));
  });
  $('#farben').addEventListener('click', (event) => {
    const swatch = event.target.closest('.farben-swatch');
    if (!swatch) return;
    choose(swatch.dataset.color, swatch);
    if (swatch.dataset.set === 'custom') customSlot = Number(swatch.dataset.i);
  });
  $('#farben').addEventListener('dblclick', (event) => {
    const swatch = event.target.closest('.farben-swatch');
    if (!swatch) return;
    choose(swatch.dataset.color, swatch);
    finish(chosen);
  });
  $('#farben').addEventListener('keydown', swatchKeys);
  $('#farben-ok').addEventListener('click', () => finish(chosen));
  $('#farben-cancel').addEventListener('click', () => finish(null));
  $('#farben').addEventListener('cancel', (event) => {
    event.preventDefault();
    finish(null);
  });
  $('#farben').addEventListener('close', () => {
    // A dialog closed from outside, by the page or the browser, answers as Abbrechen does.
    if (resolveDialog) finish(null);
  });
  $('#farben .win-close')?.addEventListener('click', () => finish(null));
  $('#farben-define').addEventListener('click', () => {
    const panel = $('.farben-full');
    panel.hidden = !panel.hidden;
    $('#farben').classList.toggle('full', !panel.hidden);
    if (!panel.hidden) choose(chosen, $('.farben-swatch[aria-selected="true"]'));
  });
  $('#farben-hs').addEventListener('pointerdown', (event) => {
    const canvas = $('#farben-hs');
    const pick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const h = Math.max(0, Math.min(HLSMAX - 1, Math.round(((e.clientX - rect.left) / rect.width) * HLSMAX)));
      const s = Math.max(0, Math.min(HLSMAX, Math.round((1 - (e.clientY - rect.top) / rect.height) * HLSMAX)));
      const l = Number($('#farben-l').value) || HLSMAX / 2;
      choose(hslToHex(h, s, l), null, [h, s, l]);
    };
    pick(event);
    canvas.setPointerCapture(event.pointerId);
    canvas.onpointermove = (e) => e.buttons && pick(e);
  });
  $('#farben-lum').addEventListener('pointerdown', (event) => {
    const canvas = $('#farben-lum');
    const pick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const l = Math.max(0, Math.min(HLSMAX, Math.round((1 - (e.clientY - rect.top) / rect.height) * HLSMAX)));
      const [h, s] = [Number($('#farben-h').value) || 0, Number($('#farben-s').value) || 0];
      choose(hslToHex(h, s, l), null, [h, s, l]);
    };
    pick(event);
    canvas.setPointerCapture(event.pointerId);
    canvas.onpointermove = (e) => e.buttons && pick(e);
  });
  const clamp = (id, max) => Math.max(0, Math.min(max, Math.round(Number($(`#farben-${id}`).value) || 0)));
  for (const id of ['h', 's', 'l']) {
    $(`#farben-${id}`).addEventListener('change', () => {
      const hsl = [clamp('h', HLSMAX - 1), clamp('s', HLSMAX), clamp('l', HLSMAX)];
      choose(hslToHex(...hsl), null, hsl);
    });
  }
  for (const id of ['r', 'g', 'b']) {
    $(`#farben-${id}`).addEventListener('change', () => {
      const c = ['r', 'g', 'b'].map((k) => clamp(k, 255));
      choose(`#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`);
    });
  }
  $('#farben-picker').addEventListener('input', () => choose($('#farben-picker').value));
  $('#farben-add').addEventListener('click', () => {
    const slot = customSlot;
    custom[slot] = chosen;
    customSlot = (customSlot + 1) % custom.length;
    renderSwatches();
    choose(chosen, $(`.farben-custom [data-i="${slot}"]`));
  });
  on('scene', showSurface);
  on('select', showSurface);
  showSurface();
  loadMaterials();
}
