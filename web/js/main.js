// SPDX-License-Identifier: GPL-2.0-only
//
// 3D-Bausteine main.js: the start of the page and the functions of its
// bars and menus. It starts the Web Worker, which runs the service of
// Aosabi and the renderer on WebGPU, opens the scene of the address, and
// gives every button of version 1.3 its function at its old place: the tool
// bar F3, the body bar F2, the menus of Form1 and the keys.

import { Bridge, OBLIQUE } from './bridge.js';
import { addPicture, refreshPictures, wireBilder } from './bilder.js';
import { closeSplash, msgbox, showAbout, wireDialogs, wireTooltips } from './dialogs.js';
import { changeColor, wireFarben } from './farben.js';
import { armedButtons, cancelMark, choose, insert, remove, wireKoerper } from './koerper.js';
import { applyScreen, arrangeWindows, fillIcons, setDark, setLook, showAllWindows, wireWindows } from './look.js';
import { check, closeMenus, fillExamples, wireMenus } from './menus.js';
import { save, showTab, translate, wireRegister } from './register.js';
import { commit, redo, selectLine, setScene, undo } from './scene.js';
import { $, $$, app, download, emit, on, safe, selectedItem, setStatus, store, toast } from './state.js';
import { Shelf, WorkerStore, cloneItems } from './store.js';
import { arrowAxes, drawOverlays, fit, layoutViews, lastView, maximize, modeHint, nudge, sendCamera, viewPicture, wireViews, zoom2d, zoom3d } from './views.js';

// ---------------------------------------------------------------------------
// Start.

async function boot() {
  fillIcons();
  wireTooltips();
  wireDialogs();
  wireWindows();
  if (app.look === 'classic') applyScreen();
  wireMenus(act);
  wireToolbars();
  wireKeys();
  wireViews();
  layoutViews();
  const params = new URLSearchParams(location.search);
  app.shelf = new Shelf();
  app.bridge = new Bridge();
  app.bridge.failure = (message) => fail(message);
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
    fail(String(error?.message ?? error));
    return;
  }
  app.ready = true;
  app.store = new WorkerStore(app.bridge);
  await app.store.load();
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
  await openFromHash();
  syncLookEntries();
  updateHistory();
  // The address ?debug hands the state to the console and to the test notebooks.
  if (params.has('debug')) {
    window.bausteine = {
      app,
      graphql: (query, variables) => app.bridge.graphql(query, variables),
      snapshot: () => app.bridge.snapshot(),
      act,
      setLook,
    };
  }
  closeSplash();
  setStatus('');
}

/** Shows why the views cannot draw. */
function fail(message) {
  $('#fallback').hidden = false;
  $('#fallback-text').textContent = `3D-Bausteine zeichnet mit WebGPU in einem Web Worker. Ein aktueller Chrome, Edge, Firefox oder Safari zeigt die Ansichten. (${message})`;
  closeSplash();
}

// ---------------------------------------------------------------------------
// Scenes.

/** Opens the scene the address names from the shelf, or a new one from the first example. */
async function openFromHash() {
  const match = location.hash.match(/^#\/szene\/([^/]+)$/);
  const key = match ? decodeURIComponent(match[1]) : null;
  const copy = key ? app.shelf.get(key) : null;
  let scene = null;
  if (copy) {
    scene = await safe(async () => {
      const created = await app.store.createScene(copy.name);
      return app.store.replaceItems(created.id, copy.items);
    });
  }
  if (!scene) scene = await safe(() => app.store.createScene(null, 'bausteine'));
  if (!scene) return;
  await showScene(scene, copy ? key : Shelf.key());
}

/** Shows `scene` under the key `key` of the shelf, with an empty history. */
async function showScene(scene, key) {
  app.sceneKey = key;
  history.replaceState(null, '', `${location.search}#/szene/${encodeURIComponent(key)}`);
  app.history = [];
  app.future = [];
  app.line = -1;
  app.bridge.state({ scene: scene.id });
  await setScene(scene);
  updateHistory();
  await fit();
}

/** Opens a new scene, empty or as a copy of the example `example`. */
async function newScene(example = null) {
  const scene = await safe(() => app.store.createScene(null, example));
  if (scene) await showScene(scene, Shelf.key());
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
  const clean = name.trim();
  if (!clean || clean === app.scene.name) {
    showCaption();
    return;
  }
  const scene = await safe(() => app.store.renameScene(app.scene.id, clean));
  if (scene) await setScene(scene);
}

/** Offers the scene as a file `<Name>.bausteine.json`, `Speichern unter`. */
function saveSceneFile() {
  const data = { format: '3d-bausteine', version: 2, name: app.scene.name, items: cloneItems(app.scene.items) };
  const name = (app.scene.name || 'szene').replace(/[\\/:*?"<>|]+/g, '_');
  download(`${name}.bausteine.json`, JSON.stringify(data, null, 2), 'application/json');
  setStatus(`${name}.bausteine.json gespeichert`, 3);
}

/** Opens the scene of the file `file`. */
async function openSceneFile(file) {
  const text = await file.text();
  const data = await safe(async () => JSON.parse(text));
  if (!data || !Array.isArray(data.items)) {
    await msgbox('Die Datei ist keine Szene von 3D-Bausteine.', { title: 'Problem', kind: 'critical' });
    return;
  }
  const scene = await safe(async () => {
    const created = await app.store.createScene(data.name ?? file.name.replace(/\.(bausteine\.)?json$/i, ''));
    return app.store.replaceItems(created.id, data.items);
  });
  if (scene) await showScene(scene, Shelf.key());
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

// ---------------------------------------------------------------------------
// The tool bars.

/** Sets the mode of the tool bar, and the body `armed` of the body bar in the mode Einfügen. */
function setMode(mode, armed = null) {
  app.mode = mode;
  for (const button of $$('#tb1 .tb-button')) {
    const tool = Number(button.dataset.tool);
    if (tool <= 3) button.setAttribute('aria-pressed', String(tool === { position: 1, einfuegen: 2, bearbeiten: 3 }[mode]));
  }
  armedButtons(mode === 'einfuegen' ? armed : null);
  $('#views').dataset.mode = mode;
  emit('mode', mode);
}

/** Does what the button `tool` of the tool bar F3 does, `TB1_ButtonClick`. */
async function tool(n) {
  switch (n) {
    case 1:
      // Position: the body bar goes away, as F2.Hide of 1.3.
      $('#f2').hidden = true;
      cancelMark();
      setMode('position');
      modeHint();
      emit('layout');
      break;
    case 2:
      $('#f2').hidden = false;
      showTab('koerper');
      setMode('einfuegen');
      setStatus('Einen Körper der Körperleiste wählen', 3);
      emit('layout');
      break;
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
  setStatus(on ? 'Raytracing im Schrägriss' : '', 2);
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
      if (app.mode === 'einfuegen' && button.getAttribute('aria-pressed') === 'true') {
        // A second click on the armed body disarms it.
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
  // Below 1024 pixels the right dock is a drawer over the views.
  $('#toggle-right').addEventListener('click', () => {
    const dock = $('.dock-right');
    const open = !dock.hasAttribute('data-open');
    dock.toggleAttribute('data-open', open);
    $('#toggle-right').setAttribute('aria-expanded', String(open));
  });
  on('tab', () => {
    if (window.innerWidth < 1024) $('.dock-right').setAttribute('data-open', '');
  });
  $('#form1 .win-close').addEventListener('click', quit);
}

/** Enables the buttons of the history. */
function updateHistory() {
  $('.tb-button[data-tool="10"]').disabled = app.history.length === 0;
  $('.tb-button[data-tool="11"]').disabled = app.future.length === 0;
  $('[data-entry="rueckgaengig"]').disabled = app.history.length === 0;
  $('[data-entry="wiederholen"]').disabled = app.future.length === 0;
}

/** Sets the check marks of the menu Ansicht to the look. */
function syncLookEntries() {
  check('look-modern', app.look === 'modern');
  check('look-classic', app.look === 'classic');
  check('dark', app.dark);
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
      await newScene(null);
      break;
    case 'umbenennen': {
      if (app.look === 'modern') {
        $('#scene-name').focus();
        $('#scene-name').select();
      } else {
        const name = prompt('Name der Szene', app.scene.name);
        if (name != null) await rename(name);
      }
      break;
    }
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
      selectLine(-1);
      break;
    case 'pov-kopieren': {
      const text = $('#text1').value || (await translate());
      await navigator.clipboard?.writeText(text).catch(() => {});
      toast('POV-Text kopiert');
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

/** Puts a copy of the selected item behind it. */
async function duplicate() {
  const item = selectedItem();
  if (!item || item.kind === 'DECLARE') return;
  const copy = { ...structuredClone(item), position: { ...item.position, x: item.position.x + 1, y: item.position.y + 1 } };
  const added = await commit(() => app.store.addItem(app.scene.id, copy, item.id));
  if (added) {
    const index = app.lines.findIndex((line) => line.item === added.id && !line.end);
    selectLine(index);
  }
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
  form.screen.value = app.settings.screen ?? 'window';
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
    if (typing(event)) return;
    if (key === 'Escape') {
      cancelMark();
      setMode('position');
      return;
    }
    if (key === 'Enter' && app.mode === 'einfuegen') {
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
