// SPDX-License-Identifier: GPL-2.0-only
//
// 3D-Bausteine koerper.js: the tab Körper of the window Eingaben, F4 of
// version 1.3. It holds the list OBJEKTE, CB2, whose lines the service
// writes in the format of 1.3, and the input mask GEOMETRIEDATEN: the list
// of bodies CB1, the fields T1 with their captions, and the buttons
// Einfügen, Ändern and Löschen.
//
// It also runs the handshake between the mouse and the fields, `mark_point`
// of 3D_bau.frm: a click in a normal view writes the two coordinates of that
// view into the fields and locks them, which turns their digits from yellow
// to green, a click in a second view gives the third coordinate. The size
// follows the same way, as the difference to the point. Nothing is inserted
// until the user presses Einfügen. While the handshake runs, the preview in
// the views shows what a click at the point under the pointer would give,
// and the fields change only with the click.
//
// Version 1.3 keeps its objects in one flat list, where a CSG opener holds
// the lines up to its CSG-Ende. Version 2.0 keeps a tree, and the line that
// is selected decides where a new item goes: behind a body into its group,
// behind an opener into that group as its first member, behind a CSG-Ende
// behind the whole group, behind `0 Raster` at the top of the list. With no
// line selected it goes last. Inserting CSG-Ende selects the end of the open
// group, so the next body lands behind it, as in 1.3.
//
// The status field shows the texts of section 5.8 of the plan and no other:
// the prompts of the handshake, the arming, `Eingefügt`, `Unbekannter Körper`
// and the note on Ebene.

import { CB1_ENTRIES, ENDS, KINDS, pack } from './store.js';
import { commit, groupsOf, selectItem, selectLine, subtreeIds } from './scene.js';
import {
  $,
  $$,
  app,
  emit,
  escapeHtml,
  formatNumber,
  itemById,
  nextColor,
  on,
  parseNumber,
  selectedItem,
  selectedLine,
  setStatus,
} from './state.js';
import { icon } from './icons.js';

/** The text of `Drehung um X,Y,Z - Achse`, L1(7) of every mask. */
const ROTATION_CAPTION = 'Drehung um X,Y,Z - Achse';

/**
 * The captions of `CB1_Click` for each kind of body: row 1, the size on the
 * left and on the right, the fields the mask hides, and which sizes a
 * click of the mouse gives.
 */
const CAPTIONS = {
  SPHERE: { l1: 'Kugelmittelpunkt (x,y,z)', l4: 'Radius', l6: '', hide: [5, 6], sizes: 'single' },
  CONE: { l1: 'Mittelpunkt der Grundfläche (x,y,z)', l4: 'Radius', l6: 'Höhe', hide: [5], sizes: 'round' },
  CYLINDER: { l1: 'Mittelpunkt der Grundfläche (x,y,z)', l4: 'Radius', l6: 'Höhe', hide: [5], sizes: 'round' },
  CUBE: { l1: 'Eckpunkt (hinten,unten,links) (x,y,z)', l4: 'Kantenlänge', l6: '', hide: [5, 6], sizes: 'single' },
  CUBOID: { l1: 'Eckpunkt (hinten,unten,links)(x,y,z)', l4: 'Kantenlängen x y z', l6: '', hide: [], sizes: 'box' },
  PYRAMID: { l1: 'Eckpunkt (hinten,unten,links)(x,y,z)', l4: 'Kantenlängen x y', l6: 'Höhe', hide: [], sizes: 'box' },
  PRISM: { l1: 'Eckpunkt (hinten,unten,links)(x,y,z)', l4: 'Kantenlängen x y', l6: 'Höhe', hide: [], sizes: 'box' },
  DISC: { l1: 'Mittelpunkt (x,y,z)', l4: 'Radius', l6: '', hide: [5, 6], sizes: 'single', inner: true },
};

/**
 * The masks of `CB1_Click` by their text, which the table KINDS of
 * store.js gives with ENDS, plus Ebene of the body bar, which inserts
 * nothing in this version.
 */
const MASKS = Object.fromEntries([
  ...KINDS.filter((k) => k.kind !== 'INSTANCE').map((k) => [k.label, k.group ? { kind: k.kind, group: true } : { kind: k.kind, ...CAPTIONS[k.kind] }]),
  ...ENDS.map((e) => [e.label, { end: e.end }]),
  ['Ebene', { kind: null, plane: true }],
]);

/** The texts a typed name is matched against, whatever their case. */
const NAMES = Object.keys(MASKS);

/** The kinds of the groups, with their entry of CB1. */
const GROUP_LABELS = Object.fromEntries(KINDS.filter((k) => k.group).map((k) => [k.kind, k.label]));

/** The entry of CB1 of each kind of body. */
const BODY_LABELS = Object.fromEntries(KINDS.filter((k) => !k.group && k.kind !== 'INSTANCE').map((k) => [k.kind, k.label]));

/** The text of the entry that closes a group of the CSG, and the one that closes a new body. */
const [CSG_END, DECLARE_END] = ['csg', 'declare'].map((end) => ENDS.find((e) => e.end === end).label);

/**
 * The state of the handshake: the phase, `pcount` of 1.3, the locked
 * fields, the view of the last click and the point it gave. `shown` holds
 * once the marks of a body are complete or a field was typed, so the
 * preview stays and follows the fields until Einfügen.
 */
const mark = { phase: 1, locked: new Set(), view: null, point: null, shown: false };

/** Answers a copy of the state of the handshake for the debug door, `window.bausteine.mark()`. */
export function markState() {
  return {
    phase: mark.phase,
    locked: [...mark.locked].sort((a, b) => a - b),
    view: mark.view,
    point: mark.point ? { ...mark.point } : null,
  };
}

/** Answers whether a handshake is under way: a field locked by a click, or the phase of the size. */
function marking() {
  return mark.phase === 2 || mark.locked.size > 0;
}

/** Returns the field T1(n). */
const field = (n) => $(`#t1-${n}`);

/** Returns the number in the field T1(n). */
const value = (n, fallback = 0) => parseNumber(field(n).value, fallback);

/**
 * Answers the first field of the mask that holds no number, or 0 when
 * every field shown holds one. A field the mask hides counts not.
 */
function badField() {
  for (let n = 1; n <= 10; n += 1) {
    const f = field(n);
    if (f.hidden || f.disabled) continue;
    if (Number.isNaN(parseNumber(f.value, Number.NaN))) return n;
  }
  return 0;
}

/**
 * Refuses the fields where one holds no number, F4-Q63: the status line
 * names the text, the field takes the focus, and nothing goes to the
 * service. Answers whether the fields are refused.
 */
function refuseFields() {
  const n = badField();
  if (n === 0) return false;
  const text = field(n).value.trim();
  setStatus(text === '' ? 'Ein Feld ist leer' : `Keine Zahl: ${text}`, 4);
  field(n).focus();
  field(n).select();
  return true;
}

/** Writes `v` into the field T1(n). */
function setValue(n, v) {
  field(n).value = formatNumber(v);
}

/** Returns the declarations of the scene, the new bodies of `#Neu`. */
function declarations() {
  return app.scene.items.filter((item) => item.kind === 'DECLARE');
}

/**
 * Returns the declarations a new item may place where Einfügen puts it:
 * those that Neu_Ende closed before that place. A declaration that holds
 * the place is still open, and the service refuses to place a new body
 * inside itself, so CB1 offers its name only after Neu_Ende, as 1.3 does.
 */
function placeable() {
  const { parent } = insertionPoint();
  const open = new Set([parent, ...groupsOf(itemById(parent)).map((g) => g.id)].filter(Boolean));
  return declarations().filter((d) => !open.has(d.id));
}

/**
 * Returns the mask of the entry `text` of CB1, or null for an unknown text.
 * A name of a new body counts where `open` allows every declaration, as
 * for showing an item, and else only once Neu_Ende closed it.
 */
function maskOf(text, { open = false } = {}) {
  const name = String(text ?? '').trim();
  if (MASKS[name]) return { name, ...MASKS[name] };
  const lower = name.toLowerCase();
  const entry = NAMES.find((e) => e.toLowerCase() === lower);
  if (entry) return { name: entry, ...MASKS[entry] };
  const declared = (open ? declarations() : placeable()).find((d) => d.name.toLowerCase() === lower);
  if (declared) {
    return { name: declared.name, kind: 'INSTANCE', source: declared.id, l1: 'Bezugspunkt (x,y,z)', l4: 'Skalierung x y z', l6: '', hide: [], sizes: 'box' };
  }
  return null;
}

/** Returns the mask that shows `item`. */
function maskOfItem(item) {
  if (item.kind === 'INSTANCE') {
    const source = itemById(item.source);
    return maskOf(source?.name, { open: true }) ?? { name: item.name, kind: 'INSTANCE', source: item.source, l1: 'Bezugspunkt (x,y,z)', l4: 'Skalierung x y z', l6: '', hide: [], sizes: 'box' };
  }
  return maskOf(BODY_LABELS[item.kind] ?? GROUP_LABELS[item.kind]);
}

// ---------------------------------------------------------------------------
// The mask.

/** The mask that CB1 shows. */
let current = maskOf('Quader');

/**
 * Sets the mask of `mask`, `CB1_Click`: the captions, the visible fields,
 * and for `defaults` the values of `Obj_Def_Werte`, 0 0 0, 1 1 1 and 0 0 0.
 */
function applyMask(mask, { defaults = true } = {}) {
  current = mask;
  $('#cb1-edit').value = mask?.name ?? '';
  const body = mask && !mask.group && !mask.end && !mask.plane;
  const group = Boolean(mask?.group);
  const editable = body || group;
  const hint = $('#geo-hint');
  let l1 = mask?.l1 ?? '';
  let l4 = mask?.l4 ?? '';
  let l6 = mask?.l6 ?? '';
  let hide = mask?.hide ?? [];
  if (group) {
    l1 = 'Verschiebung der Glieder (x,y,z)';
    l4 = 'Skalierung x y z';
    l6 = '';
    hide = [];
    hint.textContent = mask.kind === 'DECLARE'
      ? 'Neuer Körper: alles bis Neu_Ende gehört dazu. Den Namen im Feld Name ändern.'
      : 'Gruppe: alles bis CSG-Ende gehört dazu. Die Werte bewegen, skalieren und drehen die Glieder.';
  } else if (mask?.end) {
    hint.textContent = mask.end === 'csg' ? 'CSG-Ende schließt die offene Gruppe.' : 'Neu_Ende schließt den neuen Körper ab. Sein Name steht danach in dieser Liste.';
  } else if (mask?.plane) {
    hint.textContent = 'Ebene ist in dieser Version nicht einfügbar.';
  } else {
    hint.textContent = '';
  }
  hint.hidden = hint.textContent === '';
  $('#l1-1').textContent = editable ? l1 : '';
  $('#l1-4').textContent = editable ? l4 : '';
  $('#l1-6').textContent = editable ? l6 : '';
  $('#l1-7').textContent = editable ? ROTATION_CAPTION : '';
  for (let n = 1; n <= 9; n += 1) {
    const f = field(n);
    f.hidden = !editable || hide.includes(n);
    f.disabled = !editable;
  }
  const inner = Boolean(mask?.inner);
  $('#l1-10').hidden = !inner;
  field(10).hidden = !inner;
  for (const id of ['#l1-11', '#t1-11', '#l1-12', '#t1-12']) $(id).hidden = !editable;
  if (defaults && editable) {
    for (const n of [1, 2, 3]) setValue(n, 0);
    for (const n of [4, 5, 6]) setValue(n, 1);
    for (const n of [7, 8, 9]) setValue(n, 0);
    // Version 1.3 keeps T1(10) when the mask changes, F4-Q61. 2.0 resets it.
    setValue(10, 0);
    $('#t1-11').value = '';
  }
  startMark();
  updatePreview();
}

/** Starts a new handshake, `Start_Mark`: every field free, the phase of the position. */
function startMark() {
  mark.phase = 1;
  mark.locked.clear();
  mark.view = null;
  mark.point = null;
  mark.shown = false;
  paintLocks();
}

/** Colours the fields by their state: yellow free, green locked, the turns red. */
function paintLocks() {
  for (let n = 1; n <= 10; n += 1) {
    const f = field(n);
    if (n >= 7 && n <= 9) continue;
    f.classList.toggle('locked', mark.locked.has(n));
    f.classList.toggle('free', !mark.locked.has(n));
    f.title = mark.locked.has(n) ? 'durch Mausklick festgelegt' : '';
  }
}

/** The field of each axis for the position and for the size. */
const POSITION_FIELD = { x: 1, y: 2, z: 3 };
const SIZE_FIELD = { x: 4, y: 5, z: 6 };

/** Returns the size fields a mask needs. */
function neededSizes(mask) {
  if (mask.sizes === 'single') return [4];
  if (mask.sizes === 'round') return [4, 6];
  return [4, 5, 6];
}

/**
 * Answers what a click at `point` in the normal view `view` would give in
 * the present phase of the handshake: `values`, the numbers by their field,
 * and `locks`, the fields the click locks. It changes nothing, so markPoint
 * applies its answer and the hover shows it as the preview before the click.
 */
function clickValues(view, point) {
  const axes = ['x', 'y', 'z'].filter((axis) => point[axis] != null);
  const values = {};
  const locks = [];
  const put = (n, v, lock = true) => {
    values[n] = v;
    if (lock) locks.push(n);
  };
  if (mark.phase === 1) {
    // A second view writes only the coordinate the first one left free.
    for (const axis of axes) {
      const n = POSITION_FIELD[axis];
      if (mark.view != null && mark.view !== view && mark.locked.has(n)) continue;
      put(n, point[axis]);
    }
    return { values, locks };
  }
  // The phase of the size: the differences to the point, by axis.
  const origin = { x: value(1), y: value(2), z: value(3) };
  const diff = {};
  for (const axis of axes) diff[axis] = point[axis] - origin[axis];
  if (current.sizes === 'single') {
    const r = Math.max(...axes.map((axis) => Math.abs(diff[axis])));
    if (r > 0) put(4, r);
  } else if (current.sizes === 'round') {
    const flat = axes.filter((axis) => axis !== 'z');
    if (flat.length) {
      const r = Math.max(...flat.map((axis) => Math.abs(diff[axis])));
      if (r > 0) {
        put(4, r);
        put(5, r, false);
      }
    }
    if (diff.z != null && diff.z !== 0) put(6, diff.z);
  } else {
    for (const axis of axes) {
      if (diff[axis] !== 0) put(SIZE_FIELD[axis], diff[axis]);
    }
  }
  return { values, locks };
}

/** Writes the answer of clickValues into the fields and locks the fields it names. */
function applyClick({ values, locks }) {
  for (const [n, v] of Object.entries(values)) setValue(Number(n), v);
  for (const n of locks) mark.locked.add(n);
}

/**
 * Takes a click at `point` in the normal view `view` into the handshake,
 * `mark_point` of 3D_bau.frm. `band` marks the second end of a drag in the
 * same view, which gives the size at once.
 */
function markPoint(view, point, band = false) {
  if (!point || !current || current.end || current.plane) return;
  const hidden = ['x', 'y', 'z'].find((axis) => point[axis] == null);
  mark.point = { ...point };
  if (band && mark.phase === 1) {
    // The press of the drag gave two coordinates, the third stays as typed.
    finishPosition();
  }
  if (mark.phase === 1) {
    const click = clickValues(view, point);
    // A second click in the same view places the point anew.
    if (mark.view === view) mark.locked.clear();
    applyClick(click);
    const wrote = click.locks.length;
    app.marks = { ...app.marks, green: { x: value(1), y: value(2), z: value(3) }, greenView: view, yellow: [] };
    mark.view = view;
    paintLocks();
    if ([1, 2, 3].every((n) => mark.locked.has(n)) || (wrote === 0 && mark.view !== view)) {
      finishPosition();
    } else {
      setStatus(`${hidden}-Koordinate markieren`);
    }
    emit('marks');
    updatePreview();
    return;
  }
  const origin = { x: value(1), y: value(2), z: value(3) };
  applyClick(clickValues(view, point));
  app.marks = { ...app.marks, green: { ...point, [hidden]: origin[hidden] }, greenView: view };
  paintLocks();
  const missing = neededSizes(current).filter((n) => !mark.locked.has(n));
  if (missing.length === 0) {
    // Both clicks are in: yellow crosses at the far corner, a new handshake.
    const far = { x: origin.x + value(4), y: origin.y + value(5), z: origin.z + value(6) };
    app.marks = { ...app.marks, green: null, yellow: [origin, far] };
    startMark();
    // The body is complete and stays armed, so its preview stays and follows the fields (Q-49).
    mark.shown = true;
    setStatus(app.look === 'classic' ? '' : 'Einfügen drücken (Enter)');
  } else {
    const axis = { 4: 'x', 5: 'y', 6: 'z' }[missing[0]];
    setStatus({ x: 'Tiefe markieren', y: 'Breite markieren', z: 'Höhe markieren' }[axis]);
  }
  emit('marks');
  updatePreview();
}

/** Ends the phase of the position: yellow crosses at the point, the fields free again, the phase of the size. */
function finishPosition() {
  const point = { x: value(1), y: value(2), z: value(3) };
  mark.phase = 2;
  mark.locked.clear();
  mark.view = null;
  app.marks = { ...app.marks, green: null, yellow: [point] };
  paintLocks();
  setStatus('Grösse angeben oder markieren');
}

/**
 * Returns the item the mask describes, for `addItem`, `updateItem` and the
 * preview. The numbers of `over`, by their field, stand in for the fields,
 * as the hover shows a click before it happens.
 */
function itemFromFields(mask, base = null, over = {}) {
  const read = (n, fallback = 0) => over[n] ?? value(n, fallback);
  const a = read(4, 1);
  const b = read(5, 1);
  const c = read(6, 1);
  let size;
  if (mask.group || mask.sizes === 'box') size = { x: a, y: b, z: c };
  else if (mask.sizes === 'round') size = { x: Math.abs(a), y: Math.abs(a), z: c };
  else size = { x: Math.abs(a), y: Math.abs(a), z: Math.abs(a) };
  const name = $('#t1-11').value.trim();
  return {
    ...(base ?? {}),
    name: name || base?.name || defaultName(mask),
    kind: mask.kind,
    position: { x: read(1), y: read(2), z: read(3) },
    size,
    rotation: { x: read(7), y: read(8), z: read(9) },
    innerRadius: mask.inner ? Math.max(0, read(10)) : 0,
    source: mask.source ?? null,
  };
}

/** Returns the name a new item of `mask` gets: the entry of CB1, `Werkstück<n>` for a new body. */
function defaultName(mask) {
  if (mask.kind === 'DECLARE') {
    const names = new Set(declarations().map((d) => d.name));
    let n = declarations().length + 1;
    while (names.has(`Werkstück${n}`)) n += 1;
    return `Werkstück${n}`;
  }
  return mask.name;
}

/**
 * The preview the renderer holds: the scene it was packed with and the
 * text of its item, so that a hover that changes nothing sends nothing.
 */
const sent = { scene: null, key: null };

/**
 * Hands the body in the making to the renderer, which draws it faint in
 * every view. The numbers of `over` stand in for the fields, as for
 * itemFromFields.
 */
function updatePreview(over = {}) {
  if (!app.ready) return;
  const body = current && !current.group && !current.end && !current.plane && current.kind;
  const active = body && app.mode === 'einfuegen' && (marking() || mark.shown);
  const item = active ? { ...itemFromFields(current, null, over), id: '__preview', parent: null, color: '#808080', texture: null } : null;
  const key = item ? JSON.stringify(item) : null;
  if (sent.scene === app.scene && sent.key === key) return;
  sent.scene = app.scene;
  sent.key = key;
  if (!item) {
    app.bridge.state({ preview: null });
    return;
  }
  const all = pack([...app.scene.items, item], app.textures);
  app.bridge.state({ preview: all.slice(all.length - 20) });
}

/**
 * Shows the click a hover at `point` in the view `view` would make, while
 * a handshake is under way: in the phase of the size the preview takes the
 * size that point gives, and after the first click of the position it
 * stands where that point puts it (M-096, P-258). The fields and their
 * locks stay as they are. The hover of the Schrägriss names all three
 * coordinates, and since a click there marks nothing, it shows nothing new.
 */
function hoverPreview(view, point) {
  if (!point || !armableEntry() || app.mode !== 'einfuegen' || !marking()) return;
  if (['x', 'y', 'z'].every((axis) => point[axis] != null)) return;
  updatePreview(clickValues(view, point).values);
}

// ---------------------------------------------------------------------------
// The list OBJEKTE.

/** Writes the lines of the list OBJEKTE into CB2, `CB2_ADD` of version 1.3. */
function renderList() {
  const list = $('#cb2');
  list.innerHTML = app.lines
    .map((line, i) => {
      const item = itemById(line.item);
      const kind = line.end ? 'END' : item?.kind ?? 'RASTER';
      // The icon stands in both looks and the classic stylesheet hides it, so the switch of the look changes styles alone.
      const glyph = !item || line.end ? '' : `<span class="row-icon">${icon(item.kind, 'modern')}</span>`;
      return `<div class="c-list-row" role="option" data-line="${i}" data-kind="${kind}" aria-selected="${i === app.line}">${glyph}${escapeHtml(line.text)}</div>`;
    })
    .join('');
  list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

/** Shows the selected line: the mask and the values of its item, the red crosses, the selection in the views. */
function showSelection() {
  renderList();
  const line = selectedLine();
  const item = selectedItem();
  app.bridge?.state({ selected: item?.id ?? '' });
  const editable = Boolean(item) && !line?.end;
  $('#btn-change').disabled = !editable;
  $('#btn-clear').disabled = !editable;
  if (!line || line.item == null) {
    app.marks = { ...app.marks, red: null };
    emit('marks');
    return;
  }
  if (line.end) {
    applyMask(maskOf(item?.kind === 'DECLARE' ? DECLARE_END : CSG_END), { defaults: false });
    app.marks = { ...app.marks, red: null };
    emit('marks');
    return;
  }
  const mask = maskOfItem(item);
  applyMask(mask, { defaults: false });
  setValue(1, item.position.x);
  setValue(2, item.position.y);
  setValue(3, item.position.z);
  setValue(4, item.size.x);
  setValue(5, item.size.y);
  setValue(6, item.size.z);
  setValue(7, item.rotation.x);
  setValue(8, item.rotation.y);
  setValue(9, item.rotation.z);
  setValue(10, item.innerRadius ?? 0);
  $('#t1-11').value = item.name;
  fillGroups(item);
  app.marks = { green: null, yellow: [], red: { ...item.position } };
  emit('marks');
}

/** Fills the list Gruppe with the groups `item` may move into. */
function fillGroups(item) {
  const select = $('#t1-12');
  const inside = new Set(item ? subtreeIds(item.id) : []);
  const groups = app.scene.items.filter((g) => GROUP_LABELS[g.kind] && !inside.has(g.id));
  select.innerHTML = ['<option value="">(oberste Ebene)</option>', ...groups.map((g) => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`)].join('');
  select.value = item?.parent ?? '';
}

/** Fills the drop-down list of CB1 with its fifteen entries and the names of the new bodies Neu_Ende closed. */
function renderCombo() {
  const list = $('#cb1 .c-combo-list');
  const names = [...CB1_ENTRIES, ...placeable().map((d) => d.name)];
  list.innerHTML = names.map((name) => `<div class="c-list-row" role="option" data-entry="${escapeHtml(name)}">${escapeHtml(name)}</div>`).join('');
}

// ---------------------------------------------------------------------------
// Einfügen, Ändern, Löschen.

/**
 * Returns where a new item goes for the selected line: its group, the item
 * it follows, and `front` where it goes to the top of the list. Behind
 * `0 Raster` it goes to the top, as `BtnEinf_Click` of 1.3 inserts there.
 */
function insertionPoint() {
  const line = selectedLine();
  const item = selectedItem();
  const top = app.scene.items.filter((i) => i.parent == null);
  if (line && line.item == null && app.line === 0) {
    return { parent: null, after: null, front: top.length > 0 };
  }
  if (!line || !item) return { parent: null, after: top.at(-1)?.id ?? null, front: false };
  if (line.end) return { parent: item.parent ?? null, after: item.id, front: false };
  if (GROUP_LABELS[item.kind]) return { parent: item.id, after: item.id, front: false };
  return { parent: item.parent ?? null, after: item.id, front: false };
}

/** Inserts what the mask describes, `BtnEinf_Click`. */
export async function insert() {
  const text = $('#cb1-edit').value;
  // An empty text names no body and inserts nothing, F4-Q58.
  const mask = text.trim() === '' ? null : maskOf(text);
  if (!mask) {
    setStatus(`Unbekannter Körper: ${text.trim()}`, 4);
    return;
  }
  if (mask.plane) {
    setStatus('Ebene ist in dieser Version nicht einfügbar', 4);
    return;
  }
  if (mask.end) {
    closeGroup(mask.end);
    return;
  }
  if (refuseFields()) return;
  const fields = itemFromFields(mask);
  const typed = $('#t1-11').value.trim();
  const color = mask.group ? '#d9d9d9' : nextColor();
  const added = await commit(async () => {
    // The place and a new name are read when the change runs, after the
    // selection that an insertion before it left, so a double click
    // inserts two items, one behind the other, with names of their own.
    const { parent, after, front } = insertionPoint();
    const item = { ...fields, name: typed || defaultName(mask), parent, color, texture: null };
    const made = await app.store.addItem(app.scene.id, item, after);
    // Behind the raster the new item moves to the front of the list.
    if (front) await app.store.moveItem(app.scene.id, made.id, null);
    return made;
  }, (made) => selectItem(made.id));
  if (!added) return;
  setStatus(`Eingefügt: ${added.name}`, 2);
  // The next body may follow at once: a new handshake with the same body.
  if (!mask.group) {
    applyMask(mask, { defaults: false });
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) field(n).disabled = false;
  }
  startMark();
  app.marks = { ...app.marks, green: null, yellow: [] };
  emit('marks');
  updatePreview();
}

/** Closes the innermost open group, `CSG-Ende`, or the open new body, `Neu_Ende`, by selecting its end. */
function closeGroup(kind) {
  const { parent } = insertionPoint();
  const open = [itemById(parent), ...groupsOf(itemById(parent))].filter(Boolean);
  const csg = open.findIndex((g) => g.kind !== 'DECLARE' && GROUP_LABELS[g.kind]);
  const declare = open.findIndex((g) => g.kind === 'DECLARE');
  // A CSG-Ende closes the innermost group of the CSG, never across an open #Neu.
  const index = kind === 'csg' ? (declare >= 0 && declare < csg ? -1 : csg) : declare;
  const target = open[index] ?? null;
  // Without an open group the entry does nothing, F4-Q49.
  if (!target) return;
  selectItem(target.id, true);
  renderCombo();
}

/** Applies the fields to the selected item, `BtnChange_Click`, and keeps the selection. */
export async function change() {
  const item = selectedItem();
  const line = selectedLine();
  if (!item || line?.end) return;
  if (refuseFields()) return;
  const mask = maskOf($('#cb1-edit').value) ?? maskOfItem(item);
  // A body may become another body and a group another group, never one the other.
  const patchMask = Boolean(mask.group) === Boolean(GROUP_LABELS[item.kind]) && !mask.end && !mask.plane ? mask : maskOfItem(item);
  const next = itemFromFields(patchMask, item);
  // A body that takes another kind takes its name too, unless the user named it, F4-Q37.
  const typed = $('#t1-11').value.trim();
  if (next.kind !== item.kind && (!typed || typed === item.name) && item.name === labelOf(item)) {
    next.name = defaultName(patchMask);
  }
  const parent = $('#t1-12').value;
  const patch = {
    name: next.name,
    kind: next.kind,
    position: next.position,
    size: next.size,
    rotation: next.rotation,
    innerRadius: next.innerRadius,
    parent: parent === (item.parent ?? '') ? undefined : parent,
  };
  if (next.kind === 'INSTANCE') patch.source = next.source;
  if (patch.parent === undefined) delete patch.parent;
  // The changed item stays selected, and the list shows its new line, F4-Q36.
  await commit(() => app.store.updateItem(app.scene.id, item.id, patch), () => selectItem(item.id));
}

/** Returns the entry of CB1 that names the kind of `item`: the label of a body or group, the name of a declaration. */
function labelOf(item) {
  if (item.kind === 'INSTANCE') return itemById(item.source)?.name ?? '';
  return BODY_LABELS[item.kind] ?? GROUP_LABELS[item.kind] ?? '';
}

/** Removes the selected item with everything in its groups, `BtnClear_Click`. */
export async function remove() {
  // The line alone decides here, since between the answers of a change before
  // this one the scene may already lack the item the old list still shows.
  const line = selectedLine();
  if (!line || line.item == null || line.end) return;
  let before = -1;
  await commit(async () => {
    // The selection is read when the change runs, after the line a removal before it selected.
    const item = selectedItem();
    if (!item || selectedLine()?.end) return null;
    before = app.line;
    return app.store.removeItem(app.scene.id, item.id);
  }, () => {
    if (app.scene.items.length === 0) {
      // After the last object version 1.3 shows the Würfel, F4-Q27.
      selectLine(-1);
      applyMask(maskOf('Würfel'));
      return;
    }
    selectLine(Math.min(Math.max(1, before - 1), app.lines.length - 1));
  });
}

/** Sets the entry `name` of CB1 with its mask and arms it for the mouse, as a click on the body bar does. */
export function choose(name) {
  const mask = maskOf(name);
  if (!mask) return;
  // The selection stays: it decides where Einfügen puts the body, as akto of 1.3.
  applyMask(mask);
  emit('armed', mask.group || mask.end || mask.plane ? null : mask.name);
  if (mask.plane) setStatus('Ebene ist in dieser Version nicht einfügbar', 4);
  else if (!mask.group && !mask.end) setStatus('Bezugspunkt in einem Riss markieren');
}

/** Cancels the handshake and the preview, as Esc does. */
export function cancelMark() {
  startMark();
  app.marks = { ...app.marks, green: null, yellow: [] };
  setStatus('');
  emit('marks');
  updatePreview();
}

/** Answers the entry of CB1 that the mask shows. */
export function currentEntry() {
  return current?.name ?? '';
}

/** Answers the entry of CB1 when it is a body the mouse can mark, else null. */
export function armableEntry() {
  return current && current.kind && !current.group && !current.end && !current.plane ? current.name : null;
}

// ---------------------------------------------------------------------------
// Wiring.

/** Wires the tab Körper. */
export function wireKoerper() {
  renderCombo();
  applyMask(maskOf('Quader'));
  $('#cb2').addEventListener('click', (event) => {
    const row = event.target.closest('[data-line]');
    if (row) selectLine(Number(row.dataset.line));
  });
  $('#cb2').addEventListener('keydown', (event) => {
    const list = event.currentTarget;
    const row = list.querySelector('[data-line]');
    const page = Math.max(1, Math.floor(list.clientHeight / Math.max(1, row?.offsetHeight ?? 1)) - 1);
    const step = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page }[event.key];
    const last = app.lines.length - 1;
    let next = null;
    if (step !== undefined) next = app.line < 0 ? (step > 0 ? 0 : last) : app.line + step;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else return;
    // The keys stay in the list and never move the selected body, as the page keys of the scene would (P-112, P-249).
    event.preventDefault();
    event.stopPropagation();
    selectLine(Math.min(last, Math.max(0, next)));
  });
  const combo = $('#cb1');
  const list = combo.querySelector('.c-combo-list');
  combo.querySelector('.c-combo-arrow').addEventListener('click', () => {
    renderCombo();
    list.hidden = !list.hidden;
  });
  list.addEventListener('click', (event) => {
    const row = event.target.closest('[data-entry]');
    if (!row) return;
    list.hidden = true;
    choose(row.dataset.entry);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!combo.contains(event.target)) list.hidden = true;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') list.hidden = true;
  }, true);
  const edit = $('#cb1-edit');
  // Typing a known name sets its mask at once, as a choice from the list does, F4-Q42.
  edit.addEventListener('input', () => {
    const mask = edit.value.trim() === '' ? null : maskOf(edit.value);
    if (mask && mask.name !== current?.name) choose(mask.name);
  });
  edit.addEventListener('change', () => {
    const text = edit.value.trim();
    const mask = text === '' ? null : maskOf(text);
    if (!mask) {
      setStatus(`Unbekannter Körper: ${text}`, 4);
      return;
    }
    // The change that follows typing and a click into a view keeps the marking the click began.
    if (mask.name === current?.name && marking()) {
      edit.value = mask.name;
      return;
    }
    choose(mask.name);
  });
  for (let n = 1; n <= 10; n += 1) {
    field(n).addEventListener('input', () => {
      // Typing over a locked field frees it, the user overrides the click, and the preview follows the field.
      mark.locked.delete(n);
      mark.shown = true;
      paintLocks();
      updatePreview();
    });
    field(n).addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (selectedItem() && !selectedLine()?.end && app.mode !== 'einfuegen') change();
        else insert();
      }
    });
  }
  $('#btn-einf').addEventListener('click', insert);
  $('#btn-change').addEventListener('click', change);
  $('#btn-clear').addEventListener('click', remove);
  on('scene', () => {
    renderCombo();
    showSelection();
  });
  on('select', () => {
    // The place of Einfügen follows the selection, and with it the new bodies CB1 offers.
    renderCombo();
    showSelection();
  });
  on('mark', ({ view, point, band }) => markPoint(view, point, band));
  on('hover', ({ view, point }) => hoverPreview(view, point));
  // Outside the views the preview follows the fields again.
  $('#views')?.addEventListener('pointerleave', () => updatePreview());
  on('mode', () => updatePreview());
  showSelection();
}

/** Returns the names of the new bodies CB1 offers, those Neu_Ende closed, for the menu Objekte. */
export function declaredNames() {
  return placeable().map((d) => d.name);
}

/** Selects the body bar entry in the tool bar F2, for the look. */
export function armedButtons(name) {
  for (const button of $$('#tb2 .tb-button')) button.classList.toggle('armed', button.dataset.body === name);
  for (const button of $$('#tb2 .tb-button')) button.setAttribute('aria-pressed', String(button.dataset.body === name));
}
