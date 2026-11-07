// SPDX-License-Identifier: GPL-2.0-only
//
// 3D-Bausteine main.js: the start of the page and the functions of its
// bars and menus. It starts the Web Worker, which runs the service of
// Aosabi and the renderer on WebGPU, opens the scene of the address, and
// gives every button of version 1.3 its function at its old place: the tool
// bar F3, the body bar F2, the menus of Form1 and the keys.
//
// The address names the scene. `#/szene/<key>` opens the copy the shelf of
// the browser keeps under that key, `#s=<key>` is the same, and `#d=<data>`
// opens a copy of a scene that travels in the address itself, base64url of
// the deflated JSON `{name, items}`. The parameters `look`, `theme` and
// `screen` of the address override the stored settings for one visit and
// are never written back, and `?debug` opens the door `window.bausteine`
// for the console and the test notebooks. The root element carries
// `data-mode` with the mode of the tool bar and `data-ready="1"` once the
// first frame of the opened scene is drawn.

import { Bridge, OBLIQUE } from './bridge.js';
import { addPicture, refreshPictures, wireBilder } from './bilder.js';
import { closeSplash, msgbox, showAbout, wireDialogs, wireTooltips } from './dialogs.js';
import { changeColor, wireFarben } from './farben.js';
import { armableEntry, armedButtons, cancelMark, choose, insert, markState, remove, wireKoerper } from './koerper.js';
import { applyScreen, arrangeWindows, fillIcons, setDark, setLook, showAllWindows, wireWindows } from './look.js';
import { check, closeMenus, fillExamples, wireMenus } from './menus.js';
import { save, showTab, translate, wireRegister } from './register.js';
import { commit, redo, selectLine, setScene, subtreeIds, undo } from './scene.js';
import { $, $$, DEBUG, app, download, emit, itemById, on, safe, selectedItem, selectedLine, setStatus, store, toast } from './state.js';
import { Shelf, WorkerStore, cloneItems } from './store.js';
import { arrowAxes, drawOverlays, fit, layoutViews, lastView, maximize, modeHint, nudge, sendCamera, viewPicture, wireViews, zoom2d, zoom3d } from './views.js';

// ---------------------------------------------------------------------------
// Start.

async function boot() {
  const params = new URLSearchParams(location.search);
  applyOverrides(params);
  // The tool button of the mode of the start is pressed from the first frame, as 1.3 draws it sunken.
  paintMode(app.mode);
  if (DEBUG) openDebugDoor();
  fillIcons();
  wireTooltips();
  wireDialogs();
  wireWindows();
  if (app.look === 'classic') applyScreen();
  wireMenus(act);
  wireToolbars();
  wireOpenFile();
  wireKeys();
  wireViews();
  layoutViews();
  app.shelf = new Shelf();
  // The note waits until the status of the change that filled the storage has gone, then stays.
  app.shelf.onFull = () => setTimeout(() => setStatus('Speicher des Browsers voll, Szene nur für diesen Besuch'), 2500);
  app.bridge = new Bridge();
  app.bridge.failure = (message, detail) => fail(message, detail);
  $('#fallback-reload')?.addEventListener('click', () => location.reload());
  const box = $('#views').getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  try {
    await app.bridge.init($('#canvas'), {
      width: Math.max(1, Math.round(box.width * scale)),
      height: Math.max(1, Math.round(box.height * scale)),
      scale,
      offscreen: params.has('offscreen'),
    });
  } catch (error) {
    fail(String(error?.message ?? error), error?.detail);
    return;
  }
  app.ready = true;
  app.store = new WorkerStore(app.bridge, { log: DEBUG ? app.log : null });
  try {
    await app.store.load();
  } catch (error) {
    fail(String(error?.message ?? error), error?.detail);
    return;
  }
  app.textures = app.store.textures.map((t) => t.name);
  app.examples = app.store.examples;
  fillExamples(app.examples, (key) => newScene(key));
  wireKoerper();
  wireFarben();
  wireRegister({ onScreenSettings: openScreenDialog });
  wireBilder();
  app.bridge.onFrame(() => drawOverlays());
  on('history', updateHistory);
  on('armed', (name) => setMode(name ? 'einfuegen' : app.mode === 'einfuegen' ? 'position' : app.mode, name));
  on('save-picture', (view) => savePicture(view));
  on('scene', showCaption);
  on('look', syncLookEntries);
  layoutViews();
  window.addEventListener('hashchange', openFromHash);
  // Leaving the page keeps the camera of the export with the copy of the scene.
  window.addEventListener('pagehide', keepCamera);
  await openFromHash();
  booted = true;
  syncLookEntries();
  updateHistory();
  closeSplash();
  setStatus('');
  await firstFrame();
  document.documentElement.dataset.ready = '1';
}

/**
 * Opens the door `window.bausteine` for the console and the test notebooks:
 * the state, a GraphQL request, the pixels of the views, the commands, the
 * look, the log of the requests of the page and a copy of the state of the
 * handshake of the mouse.
 */
function openDebugDoor() {
  window.bausteine = {
    app,
    graphql: (query, variables) => app.bridge.graphql(query, variables),
    snapshot: () => app.bridge.snapshot(),
    act,
    setLook,
    get log() {
      return app.log;
    },
    mark: () => markState(),
  };
}

/** Waits for the first frame after the scene opened, at most five seconds, which a frame of the worker or its answer to `render` ends. */
async function firstFrame() {
  const frame = new Promise((resolve) => app.bridge.onFrame(resolve));
  const drawn = typeof app.bridge.render === 'function' ? app.bridge.render().catch(() => frame) : frame;
  await Promise.race([drawn, new Promise((resolve) => setTimeout(resolve, 5000))]);
}

/** The values the parameters of the address may give, section 5.7 of the plan. */
const OVERRIDES = {
  look: ['modern', 'classic'],
  theme: ['light', 'dark'],
  screen: ['window', '800x600', '1024x768', '1280x1024'],
};

/**
 * Applies the parameters `look`, `theme` and `screen` of the address for
 * this visit. The stored settings stay as they were, so the next visit
 * without the parameters starts as before.
 */
function applyOverrides(params) {
  const wanted = (name) => (OVERRIDES[name].includes(params.get(name)) ? params.get(name) : null);
  const screen = wanted('screen');
  if (screen) app.settings = { ...app.settings, screen };
  const theme = wanted('theme');
  if (theme) unstored('bausteine.theme', () => setDark(theme === 'dark'));
  const look = wanted('look');
  if (look) unstored('bausteine.look', () => setLook(look));
}

/** Runs `apply` and puts the value of `key` in the storage of the browser back as it was before. */
function unstored(key, apply) {
  let before = null;
  try {
    before = localStorage.getItem(key);
  } catch {
    // A blocked storage has nothing to put back.
  }
  apply();
  try {
    if (before == null) localStorage.removeItem(key);
    else localStorage.setItem(key, before);
  } catch {
    // A blocked storage took nothing either.
  }
}

/**
 * Shows why the views cannot draw: the German `message` over the views and
 * the text `detail` of the worker below it, with the button Neu laden.
 */
function fail(message, detail = null) {
  $('#fallback').hidden = false;
  $('#fallback-text').textContent = `3D-Bausteine zeichnet mit WebGPU in einem Web Worker. Ein aktueller Chrome, Edge, Firefox oder Safari zeigt die Ansichten. (${message})`;
  const more = $('#fallback-detail');
  if (more) {
    more.textContent = detail ? String(detail) : '';
    more.hidden = !detail;
  }
  closeSplash();
}

// ---------------------------------------------------------------------------
// Scenes.

/** Returns what the address names: `{key}` for a scene of the shelf, `{data}` for a scene in the address, or `{}`. */
function route(hash) {
  const named = hash.match(/^#\/szene\/([^/]+)$/) ?? hash.match(/^#s=([^&]+)$/);
  if (named) return { key: decodeURIComponent(named[1]) };
  const packed = hash.match(/^#d=([A-Za-z0-9_-]+={0,2})$/);
  if (packed) return { data: packed[1] };
  return {};
}

/**
 * Opens the scene the address names: the copy of the shelf, a copy of the
 * scene the address carries, or else a new scene from the first example.
 */
async function openFromHash() {
  const { key, data } = route(location.hash);
  if (key && key === app.sceneKey && app.scene.id) {
    history.replaceState(null, '', `${location.search}#/szene/${encodeURIComponent(key)}`);
    return;
  }
  if (data) {
    const shared = await unpackScene(data);
    if (shared) {
      await openCopy(shared.name ?? 'Szene', shared.items, shared.povCamera ?? null);
      return;
    }
    msgbox('Die Adresse enthält keine Szene von 3D-Bausteine.', { title: 'Problem', kind: 'critical' });
  }
  const copy = key ? app.shelf.get(key) : null;
  let scene = null;
  if (copy) {
    scene = await safe(async () => {
      const created = await app.store.createScene(copy.name);
      return app.store.replaceItems(created.id, copy.items);
    });
  }
  if (scene) {
    await showScene(scene, key, copy.povCamera ?? null);
    return;
  }
  await newScene('bausteine');
}

/** Answers the scene `{name, items}` that the text `data` of an address `#d=` carries, or null. */
async function unpackScene(data) {
  let bytes;
  try {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    bytes = Uint8Array.from(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  let text = null;
  if (typeof DecompressionStream === 'function') {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      text = await new Response(stream).text();
    } catch {
      text = null;
    }
  }
  // Where the browser cannot inflate, the address carries the plain JSON.
  if (text == null) text = new TextDecoder().decode(bytes);
  try {
    const scene = JSON.parse(text);
    return scene && Array.isArray(scene.items) ? scene : null;
  } catch {
    return null;
  }
}

/** Opens a copy of the scene `name` with `items` under a new key of the shelf. */
async function openCopy(name, items, povCamera = null) {
  const scene = await safe(async () => {
    const created = await app.store.createScene(name);
    return app.store.replaceItems(created.id, items);
  });
  if (scene) await showScene(scene, Shelf.key(), povCamera);
}

/**
 * The scene as its file has it, `{key, revision}`: the revision the scene
 * had when it was opened or saved as a file. Schließen asks when the scene
 * has changed since.
 */
let clean = { key: null, revision: -1 };

/** Marks the shown scene as equal to its file. */
function markClean() {
  clean = { key: app.sceneKey, revision: app.scene.revision };
}

/** Answers whether the shown scene changed since it was opened or saved as a file. */
function changedSinceFile() {
  return clean.key !== app.sceneKey || clean.revision !== app.scene.revision;
}

/** Keeps the camera of the export with the copy of the shown scene on the shelf, where it changed. */
function keepCamera() {
  if (!app.sceneKey || !app.scene.id) return;
  const copy = app.shelf.get(app.sceneKey);
  if (copy && JSON.stringify(copy.povCamera ?? null) === JSON.stringify(app.povCamera ?? null)) return;
  app.shelf.put(app.sceneKey, app.scene, app.povCamera);
}

/** Whether the start is over. The scene of the start keeps the zoom of 1.3, `zoomf` 12, P-199. */
let booted = false;

/**
 * Shows `scene` under the key `key` of the shelf, with the camera of the
 * export `povCamera` and an empty history. A scene opened after the start
 * is fitted into the views, the scene of the start keeps the zoom of 1.3.
 */
async function showScene(scene, key, povCamera = null) {
  keepCamera();
  app.sceneKey = key;
  app.povCamera = povCamera;
  history.replaceState(null, '', `${location.search}#/szene/${encodeURIComponent(key)}`);
  app.history = [];
  app.future = [];
  app.line = -1;
  app.bridge.state({ scene: scene.id });
  await setScene(scene);
  markClean();
  updateHistory();
  if (booted && scene.items.length > 0) await fit();
}

/** Opens a new scene, empty or as a copy of the example `example`. */
async function newScene(example = null) {
  const scene = await safe(() => app.store.createScene(null, example));
  if (scene) await showScene(scene, Shelf.key());
}

/**
 * Schließen: asks where the scene changed since its file, then shows a new
 * empty scene. The file is the scene file of Speichern unter, since the POV
 * file of Speichern cannot be opened again, so the question names it.
 */
async function closeScene() {
  if (app.scene.items.length > 0 && changedSinceFile()) {
    const answer = await msgbox('Die Szene wurde verändert und seitdem nicht mit Speichern unter als Szenendatei gesichert. Wollen Sie sie trotzdem schließen?', {
      title: 'FRAGE',
      kind: 'question',
      buttons: ['Ja', 'Nein'],
    });
    if (answer !== 'Ja') return;
  }
  await newScene(null);
}

/** Writes the name of the scene into the caption of Form1. */
function showCaption() {
  const name = app.scene.name || 'Szene';
  $('#scene-name').value = name;
  $('#caption').textContent = app.look === 'classic' ? `3D-Baukasten - ${name}` : '3D-Baukasten';
  document.title = `3D-Baukasten – ${name}`;
}

/** Renames the scene. */
async function rename(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed || trimmed === app.scene.name) {
    showCaption();
    return;
  }
  const scene = await safe(() => app.store.renameScene(app.scene.id, trimmed));
  if (scene) await setScene(scene);
}

/**
 * Umbenennen: the field of the name in the caption of the modern look, or
 * the message box with its input line, which asks `Name der Szene`.
 */
async function askName() {
  const field = $('#scene-name');
  if (app.look === 'modern' && field && field.offsetParent !== null) {
    field.focus();
    field.select();
    return;
  }
  const input = msgboxInput();
  input.value = app.scene.name;
  input.hidden = false;
  const answer = msgbox('Name der Szene', { title: '3D-Baukasten', kind: 'none', buttons: ['OK', 'Abbrechen'], input: app.scene.name });
  // Enter in the line presses OK, unless the message box already took the key.
  const enter = (event) => {
    if (event.key !== 'Enter' || event.defaultPrevented) return;
    event.preventDefault();
    $('#msgbox-buttons .c-default')?.click();
  };
  input.addEventListener('keydown', enter);
  input.focus();
  input.select();
  const pressed = await answer;
  input.removeEventListener('keydown', enter);
  const name = input.value;
  input.hidden = true;
  if (pressed === 'OK') await rename(name);
}

/** Answers the input line of the message box, which the skeleton holds as `#msgbox-input`, and makes it where it is missing. */
function msgboxInput() {
  let input = $('#msgbox-input');
  if (!input) {
    input = document.createElement('input');
    input.id = 'msgbox-input';
    input.className = 'c-text';
    input.type = 'text';
    input.hidden = true;
    input.setAttribute('aria-labelledby', 'msgbox-text');
    $('#msgbox .c-msgbox-body').after(input);
  }
  return input;
}

/** The format of the scene file and the newest version this page writes and reads. */
const FILE_FORMAT = '3d-bausteine';
const FILE_VERSION = 3;

/** Offers the scene as a file `<Name>.bausteine.json`, `Speichern unter`, version 3 of the format. */
function saveSceneFile() {
  const data = {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    name: app.scene.name,
    items: cloneItems(app.scene.items),
    povCamera: app.povCamera ?? null,
    exported: new Date().toISOString(),
  };
  const name = (app.scene.name || 'szene').replace(/[\\/:*?"<>|]+/g, '_');
  download(`${name}.bausteine.json`, JSON.stringify(data, null, 2), 'application/json');
  markClean();
  setStatus(`${name}.bausteine.json gespeichert`, 3);
}

/**
 * Opens the scene of the file `file`, of the versions 1 to 3: the plain
 * `{name, items}` of the first page, the format with its version 2, and
 * version 3 with the camera of the export.
 */
async function openSceneFile(file) {
  const text = await file.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  const known = data && Array.isArray(data.items)
    && (data.format == null || data.format === FILE_FORMAT || data.format === 'bausteine')
    && (data.version == null || (Number.isInteger(data.version) && data.version >= 1 && data.version <= FILE_VERSION));
  if (!known) {
    await msgbox('Die Datei ist keine Szene von 3D-Bausteine.', { title: 'Problem', kind: 'critical' });
    return;
  }
  await openCopy(data.name ?? file.name.replace(/\.(bausteine\.)?json$/i, ''), data.items, data.povCamera ?? null);
}

/** Shows the dialog Öffnen with the examples and the scenes the browser keeps. */
function openDialog() {
  const dialog = $('#open-dialog');
  const examples = $('#open-examples');
  examples.innerHTML = '';
  for (const example of app.examples) {
    const row = document.createElement('div');
    row.className = 'c-list-row';
    row.setAttribute('role', 'option');
    row.textContent = example.title;
    row.addEventListener('click', () => {
      dialog.close();
      newScene(example.key);
    });
    examples.append(row);
  }
  const scenes = $('#open-scenes');
  scenes.innerHTML = '';
  const kept = app.shelf.list();
  if (kept.length === 0) scenes.innerHTML = '<div class="c-list-row empty">(keine)</div>';
  for (const copy of kept) {
    const row = document.createElement('div');
    row.className = 'c-list-row';
    row.setAttribute('role', 'option');
    row.textContent = `${copy.name} · ${copy.items.length} Objekte · ${new Date(copy.saved).toLocaleString('de-AT')}`;
    row.addEventListener('click', () => {
      dialog.close();
      location.hash = `#/szene/${encodeURIComponent(copy.key)}`;
    });
    scenes.append(row);
  }
  dialog.showModal();
}

/** Wires the file field of the dialog Öffnen, which opens a scene file. */
function wireOpenFile() {
  const input = $('#open-file');
  if (!input) return;
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    $('#open-dialog').close();
    await openSceneFile(file);
  });
}

// ---------------------------------------------------------------------------
// The tool bars.

/**
 * Shows the mode `mode` without telling the other modules: the attribute
 * `data-mode` of the root and of the views, and `aria-pressed` on exactly
 * one of the tool buttons 1, 2 and 3, which the classic look draws sunken.
 */
function paintMode(mode) {
  document.documentElement.dataset.mode = mode;
  for (const button of $$('#tb1 .tb-button')) {
    const tool = Number(button.dataset.tool);
    if (tool <= 3) button.setAttribute('aria-pressed', String(tool === { position: 1, einfuegen: 2, bearbeiten: 3 }[mode]));
  }
  $('#views').dataset.mode = mode;
}

/** Sets the mode of the tool bar, and the body `armed` of the body bar in the mode Einfügen. */
function setMode(mode, armed = null) {
  app.mode = mode;
  paintMode(mode);
  armedButtons(mode === 'einfuegen' ? armed : null);
  emit('mode', mode);
}

/** Does what the button `tool` of the tool bar F3 does, `TB1_ButtonClick`. */
async function tool(n) {
  switch (n) {
    case 1:
      // Position: the body bar goes away, as F2.Hide of 1.3.
      $('#f2').hidden = true;
      emit('window', { id: 'f2', hidden: true });
      cancelMark();
      setMode('position');
      modeHint();
      emit('layout');
      break;
    case 2: {
      // Körper einfügen: the body bar and the tab Körper, and the body of CB1 armed for the mouse.
      $('#f2').hidden = false;
      emit('window', { id: 'f2', hidden: false });
      showTab('koerper');
      const body = armableEntry();
      if (body) {
        emit('armed', body);
        setStatus('Bezugspunkt in einem Riss markieren');
      } else {
        setMode('einfuegen');
      }
      emit('layout');
      break;
    }
    case 3:
      setMode('bearbeiten');
      modeHint();
      break;
    case 4:
      await changeColor();
      break;
    case 5:
      await raytrace();
      break;
    case 6:
      maximize(app.maximized === OBLIQUE ? null : OBLIQUE);
      break;
    case 7:
      await output();
      break;
    case 8:
      await quit();
      break;
    case 9:
      showTab('bilder');
      await refreshPictures();
      break;
    case 10:
      await undo();
      break;
    case 11:
      await redo();
      break;
    case 12:
      setLook(app.look === 'classic' ? 'modern' : 'classic');
      break;
    case 13:
      $('#help-dialog').showModal();
      break;
    default:
      break;
  }
}

/** Raytrace of the tool bar: Übersetzen, the ray tracer of the Schrägriss on, the command line of POV-Ray in the tab Ausgabe. */
async function raytrace() {
  if (!app.raytrace) await translate();
  setRaytrace(!app.raytrace);
}

/** Switches the ray tracer of the Schrägriss. */
function setRaytrace(on) {
  app.raytrace = on;
  $('.tb-button[data-tool="5"]').setAttribute('aria-pressed', String(on));
  check('raytrace', on);
  sendCamera();
}

/** Ausgabe of the tool bar and Datei › Speichern: Übersetzen and Ausgeben. */
async function output() {
  await translate();
  save();
}

/** Beenden: asks, then closes the page where the browser allows it. */
async function quit() {
  const answer = await msgbox('Programm beenden?', { title: 'FRAGE', kind: 'question', buttons: ['Ja', 'Nein'] });
  if (answer !== 'Ja') return;
  window.close();
  // A page the user opened is closed by the user alone, so the splash says goodbye.
  $('#splash-state').textContent = 'Das Programm ist beendet. Neu laden startet es wieder.';
  $('#splash').hidden = false;
}

/** Wires the tool bar F3 and the body bar F2. */
function wireToolbars() {
  for (const button of $$('#tb1 .tb-button')) button.addEventListener('click', () => tool(Number(button.dataset.tool)));
  for (const button of $$('#tb2 .tb-button')) {
    button.addEventListener('click', () => {
      const name = button.dataset.body;
      const armed = app.mode === 'einfuegen' && button.getAttribute('aria-pressed') === 'true';
      if (armed && $('#f4').dataset.tab === 'koerper') {
        // A second click on the armed body disarms it, where its mask is in front (M-081).
        cancelMark();
        setMode('position');
        return;
      }
      // TB2_ButtonClick: tab Körper, CB1 = key, Start_Mark, CB1_Click.
      showTab('koerper');
      choose(name);
    });
  }
  $('#scene-name').addEventListener('change', () => rename($('#scene-name').value));
  $('#scene-name').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') event.target.blur();
    if (event.key === 'Escape') {
      showCaption();
      event.target.blur();
    }
  });
  $('#look').addEventListener('click', () => setLook(app.look === 'classic' ? 'modern' : 'classic'));
  $('#theme').addEventListener('click', () => setDark(!app.dark));
  wireDrawer();
  $('#form1 .win-close').addEventListener('click', quit);
}

/** The width below which the modern look turns the right dock into a drawer over the views (M-051). */
const NARROW = window.matchMedia('(max-width: 1023px)');

/** Answers whether the right dock with F4 and F6 is a drawer: the modern look below 1024 pixels. */
function drawerShown() {
  return app.look === 'modern' && NARROW.matches;
}

/**
 * Opens or closes the drawer of F4 and F6 and tells its toggle. The
 * stylesheet keeps the drawer open while the focus is inside it, so
 * closing it takes the focus out.
 */
function setDrawer(open) {
  const dock = $('.dock-right');
  if (!dock) return;
  dock.toggleAttribute('data-open', open);
  $('#toggle-right')?.setAttribute('aria-expanded', String(open));
  if (!open && dock.contains(document.activeElement)) document.activeElement.blur();
}

/** Answers whether the drawer of F4 and F6 stands open. */
function drawerOpen() {
  return $('.dock-right')?.hasAttribute('data-open') ?? false;
}

/**
 * Wires the drawer of the narrow modern look (M-051). It stays closed at
 * the start, opens whenever 1.3 brings F4 to the front, which every switch
 * of the tab after the start stands for, and closes on Esc, on a click
 * outside it and when the look or the width no longer makes it a drawer.
 * Its toggle in the caption strip opens and closes it.
 */
function wireDrawer() {
  setDrawer(false);
  $('#toggle-right').addEventListener('click', () => setDrawer(!drawerOpen()));
  on('tab', () => {
    if (booted && drawerShown()) setDrawer(true);
  });
  // The click outside closes the drawer before its target acts, so a target that brings F4 to the front opens it again.
  document.addEventListener('click', (event) => {
    if (!drawerOpen()) return;
    const target = event.target;
    if (target.closest?.('.dock-right, #toggle-right, dialog')) return;
    setDrawer(false);
  }, true);
  on('look', () => {
    if (!drawerShown()) setDrawer(false);
  });
  NARROW.addEventListener('change', () => setDrawer(false));
}

/** Enables the buttons of the history. */
function updateHistory() {
  $('.tb-button[data-tool="10"]').disabled = app.history.length === 0;
  $('.tb-button[data-tool="11"]').disabled = app.future.length === 0;
  $('[data-entry="rueckgaengig"]').disabled = app.history.length === 0;
  $('[data-entry="wiederholen"]').disabled = app.future.length === 0;
}

/**
 * Brings the page up to date after a change of the look or of the inverted
 * mouse. The check marks of the look and of the dark scheme belong to
 * menus.js, which greys Dunkles Erscheinungsbild in the classic look and
 * shows it unchecked there, so this sets the mark of the inverted mouse alone.
 */
function syncLookEntries() {
  check('inverted', app.inverted);
  $('#theme').innerHTML = '';
  $('#theme').dataset.icon = app.dark ? 'sun' : 'moon';
  fillIcons($('#form1 > .win-title'));
  showCaption();
  sendCamera();
}

// ---------------------------------------------------------------------------
// The menus.

/** Does what the menu entry `entry` does. */
async function act(entry, el) {
  if (el?.dataset.body) {
    showTab('koerper');
    choose(el.dataset.body);
    return;
  }
  switch (entry) {
    case 'neu':
      if (app.scene.items.length > 0) {
        const answer = await msgbox('Wollen Sie wirklich alle Objekte entfernen?', { title: 'FRAGE', kind: 'question', buttons: ['Ja', 'Nein'] });
        if (answer !== 'Ja') return;
        await commit(() => app.store.replaceItems(app.scene.id, []));
        selectLine(-1);
      }
      break;
    case 'oeffnen':
      openDialog();
      break;
    case 'speichern':
      await output();
      break;
    case 'speichern-unter':
      saveSceneFile();
      break;
    case 'schliessen':
      await closeScene();
      break;
    case 'umbenennen':
      await askName();
      break;
    case 'link':
      await navigator.clipboard?.writeText(location.href).catch(() => {});
      toast('Link kopiert: er öffnet die Szene in diesem Browser');
      break;
    case 'beenden':
      await quit();
      break;
    case 'rueckgaengig':
      await undo();
      break;
    case 'wiederholen':
      await redo();
      break;
    case 'verdoppeln':
      await duplicate();
      break;
    case 'loeschen':
      await remove();
      break;
    case 'nichts-waehlen':
      cancelMark();
      selectLine(-1);
      break;
    case 'pov-kopieren': {
      const text = $('#text1').value || (await translate());
      await navigator.clipboard?.writeText(text).catch(() => {});
      break;
    }
    case 'zoom2d-in':
      zoom2d(1);
      break;
    case 'zoom2d-out':
      zoom2d(-1);
      break;
    case 'zoom3d-in':
      zoom3d(1);
      break;
    case 'zoom3d-out':
      zoom3d(-1);
      break;
    case 'zoomed-d3':
      maximize(app.maximized === OBLIQUE ? null : OBLIQUE);
      break;
    case 'fit':
      await fit();
      break;
    case 'raytrace':
      await raytrace();
      break;
    case 'look-modern':
      setLook('modern');
      break;
    case 'look-classic':
      setLook('classic');
      break;
    case 'dark':
      setDark(!app.dark);
      break;
    case 'inverted':
      app.inverted = !app.inverted;
      store('bausteine.inverted', app.inverted);
      syncLookEntries();
      break;
    case 'bildschirm':
      openScreenDialog();
      break;
    case 'bild-speichern':
      await savePicture(app.raytrace ? OBLIQUE : lastView());
      break;
    case 'fenster-anordnen':
      arrangeWindows();
      break;
    case 'fenster-zeigen':
      showAllWindows();
      break;
    case 'hilfe':
      $('#help-dialog').showModal();
      break;
    case 'info':
      showAbout();
      break;
    default:
      break;
  }
}

/**
 * Verdoppeln: puts a copy of the selected item behind it, one unit further
 * in y, a group with copies of its members. A declaration is not copied,
 * since its name must stay unique.
 */
async function duplicate() {
  // The line decides here, since between the answers of a change before this
  // one the scene may already lack the item the old list still shows.
  const line = selectedLine();
  if (line?.item == null || line.end || (itemById(line.item) && !copyable(itemById(line.item)))) return;
  await commit(async () => {
    // The selection is read when the change runs, so a second Verdoppeln copies the first copy.
    const item = selectedItem();
    if (!copyable(item)) return null;
    const members = subtreeIds(item.id).slice(1).map(itemById);
    const copy = { ...structuredClone(item), position: { ...item.position, y: item.position.y + 1 } };
    const top = await app.store.addItem(app.scene.id, copy, item.id);
    // The members follow in the order of the scene, each into the copy of its group.
    const ids = new Map([[item.id, top.id]]);
    for (const member of members) {
      const made = await app.store.addItem(app.scene.id, { ...structuredClone(member), parent: ids.get(member.parent) }, null);
      ids.set(member.id, made.id);
    }
    return top;
  }, (top) => selectLine(app.lines.findIndex((line) => line.item === top.id && !line.end)));
}

/** Answers whether Verdoppeln copies `item`: an item that is no declaration and holds none. */
function copyable(item) {
  if (!item) return false;
  return item.kind !== 'DECLARE' && !subtreeIds(item.id).slice(1).some((id) => itemById(id)?.kind === 'DECLARE');
}

/** Saves the picture of the view `view` into the list of the tab Bilder and as a download. */
async function savePicture(view) {
  const blob = await safe(() => viewPicture(view));
  if (!blob) return;
  const names = ['Aufriss', 'Kreuzriss', 'Grundriss', app.raytrace ? 'Raytracing' : 'Schrägriss'];
  const name = `${app.scene.name || 'Szene'} ${names[view]} ${new Date().toLocaleTimeString('de-AT')}.png`;
  await addPicture(name, blob);
  download(name.replace(/[\\/:*?"<>|]+/g, '_'), blob, 'image/png');
  setStatus(`Bild gespeichert: ${name}`, 3);
}

/** Opens the dialog Bildschirmeinstellungen and applies it on OK. */
function openScreenDialog() {
  const dialog = $('#screen-dialog');
  const form = dialog.querySelector('form');
  form.look.value = app.look;
  form.dark.checked = app.dark;
  form.inverted.checked = app.inverted;
  form.screen.value = app.settings.screen ?? '1024x768';
  form.snap.value = String(app.settings.snap ?? 1);
  form.geo.value = app.settings.geo ?? '#008080';
  dialog.onclose = () => {
    if (dialog.returnValue !== 'ok') return;
    app.settings = { ...app.settings, screen: form.screen.value, snap: Number(form.snap.value), geo: form.geo.value };
    store('bausteine.display', app.settings);
    app.inverted = form.inverted.checked;
    store('bausteine.inverted', app.inverted);
    setDark(form.dark.checked);
    setLook(form.look.value);
    applyScreen();
    syncLookEntries();
    layoutViews();
  };
  dialog.showModal();
}

// ---------------------------------------------------------------------------
// Keys.

/** Returns whether the focus is in a field that takes text. */
function typing(event) {
  const el = event.target;
  return el.closest?.('input, textarea, select, [contenteditable="true"]') && !el.readOnly;
}

/**
 * Esc: the first press cancels the marking and disarms the body, back to
 * the mode Position, a press in the mode Position clears the selection.
 */
function escape() {
  const state = markState();
  if (app.mode !== 'position' || state.phase === 2 || state.locked.length > 0) {
    cancelMark();
    setMode('position');
    return;
  }
  if (app.line >= 0) selectLine(-1);
}

/** Wires the keys of section 5.5 of the plan. Inside a text field only Esc and the keys with Strg count. */
function wireKeys() {
  document.addEventListener('keydown', async (event) => {
    if ($('dialog[open]') || !$('#f9').hidden) return;
    const ctrl = event.ctrlKey || event.metaKey;
    const key = event.key;
    if (ctrl) {
      const map = { n: 'neu', o: 'oeffnen', s: event.shiftKey ? 'speichern-unter' : 'speichern', z: event.shiftKey ? 'wiederholen' : 'rueckgaengig', y: 'wiederholen', d: 'verdoppeln' };
      const entry = map[key.toLowerCase()];
      if (entry && !(typing(event) && ['z', 'y'].includes(key.toLowerCase()))) {
        event.preventDefault();
        closeMenus();
        await act(entry);
      }
      return;
    }
    if (key === 'Escape') {
      if (drawerOpen()) setDrawer(false);
      escape();
      return;
    }
    if (typing(event)) return;
    // Enter inserts the armed body, except where it presses a button or a tab outside the two bars.
    const control = event.target.closest?.('button, a, [role="option"], [role="tab"]') && !event.target.closest('#tb1, #tb2');
    if (key === 'Enter' && app.mode === 'einfuegen' && !control) {
      event.preventDefault();
      await insert();
      return;
    }
    if (key === 'Delete' || key === 'Backspace') {
      event.preventDefault();
      await remove();
      return;
    }
    if (key === '?' || key === 'F1') {
      event.preventDefault();
      $('#help-dialog').showModal();
      return;
    }
    const views = { 1: 1, 2: 0, 3: 2, 4: OBLIQUE };
    if (views[key] !== undefined) {
      maximize(app.maximized === views[key] ? null : views[key]);
      return;
    }
    if (key === '0') {
      maximize(null);
      return;
    }
    if (key === 'f' || key === 'F') {
      await fit();
      return;
    }
    if (key === 'r' || key === 'R') {
      await raytrace();
      return;
    }
    if (key === '+' || key === '=') {
      if (event.altKey) zoom3d(1);
      else zoom2d(1);
      return;
    }
    if (key === '-' || key === '−') {
      if (event.altKey) zoom3d(-1);
      else zoom2d(-1);
      return;
    }
    const step = app.settings.snap || 0.5;
    const v = arrowAxes();
    const arrows = {
      ArrowRight: [v.right[0], step * v.right[1]],
      ArrowLeft: [v.right[0], -step * v.right[1]],
      ArrowUp: [v.up[0], step * v.up[1]],
      ArrowDown: [v.up[0], -step * v.up[1]],
      PageUp: ['z', step],
      PageDown: ['z', -step],
    };
    if (arrows[key] && selectedItem()) {
      event.preventDefault();
      await nudge(...arrows[key]);
    }
  });
}

boot();
