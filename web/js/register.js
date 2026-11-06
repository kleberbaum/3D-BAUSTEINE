// SPDX-License-Identifier: GPL-2.0-only
//
// 3D-Bausteine register.js: the register form Eingaben, F4 of version 1.3,
// with its six tabs in two rows, and the tabs other than Körper: Ausgabe
// with the text for POV-Ray, Kamera with the turn of the Schrägriss, and
// Einstellung with the paths behind the password of version 1.3.

import { closeShow, refreshPictures } from './bilder.js';
import { setZoom3dPercent, sendCamera } from './views.js';
import { $, $$, DEFAULT_PATHS, POV_CAMERA, app, download, emit, on, setStatus, store } from './state.js';

/** The tabs of the back row and of the front row. */
const BACK = ['bilder', 'kamera', 'einstellung'];

/** Brings the tab `name` to the front, `SSTab1.Tab`. */
export function showTab(name) {
  for (const tab of $$('#sstab1 .tab')) tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
  for (const page of $$('#sstab1 .tab-page')) page.hidden = page.dataset.page !== name;
  // A tab of the back row brings its whole row to the front, as the SSTab of Windows does.
  const back = BACK.includes(name);
  const rows = $$('#sstab1 .tab-row');
  const frontRow = rows.find((row) => row.querySelector(`[data-tab="${name}"]`));
  for (const row of rows) {
    row.classList.toggle('front', row === frontRow);
    row.classList.toggle('back', row !== frontRow);
  }
  $('#f4').dataset.tab = name;
  $('#f4').dataset.row = back ? 'back' : 'front';
  if (name === 'ausgabe' && !$('#text1').value) translate();
  if (name === 'bilder') refreshPictures();
  emit('tab', name);
}

// ---------------------------------------------------------------------------
// Ausgabe.

/** Returns the name of the file of the output without its folder and without `.pov`. */
function outputName() {
  const text = $('#tfname').value.trim() || app.paths.bspDef;
  const base = text.split(/[\\/]/).pop() || 'ausgabe';
  return base.replace(/\.pov$/i, '') || 'ausgabe';
}

/** Returns the date and the time as `Def_Pov` of version 1.3 writes them. */
function stamp() {
  const now = new Date();
  return {
    date: now.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    time: now.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  };
}

/** Builds the text for POV-Ray into Text1 and enables Ausgeben, `BPOV_Comp_Click`. */
export async function translate() {
  if (!app.ready || !app.scene.id) return '';
  const camera = app.povCamera ?? POV_CAMERA;
  const text = await app.store.pov(app.scene.id, { ...camera, classic: app.look === 'classic', ...stamp() }).catch((error) => {
    setStatus(String(error?.message ?? error), 4);
    return null;
  });
  if (text == null) return '';
  $('#text1').value = text;
  $('#bpov-save').disabled = false;
  showCommand();
  return text;
}

/** Offers Text1 as the file `<TfName>.pov` and disables Ausgeben again, `BPov_Save_Click`. */
export function save() {
  const name = `${outputName()}.pov`;
  download(name, $('#text1').value, 'text/plain');
  $('#bpov-save').disabled = true;
  setStatus(`${name} gespeichert`, 3);
}

/** Writes the command line with which version 1.3 starts POV-Ray, from the paths of the tab Einstellung. */
function showCommand() {
  const pov = app.paths.povHome;
  const file = `${app.paths.bspHome}${outputName()}`;
  $('#pov-command').textContent = `${pov}bin\\pvengine.exe +W400 +H300 +A +P +X +D -V -I${file}.pov -o${file}.bmp -L${pov}include\\`;
}

/** Sets the field TfName to the default of the tab Einstellung, `Def_Datei`. */
function defaultOutput() {
  $('#tfname').value = `${app.paths.bspHome}${app.paths.bspDef}`;
  showCommand();
}

// ---------------------------------------------------------------------------
// Kamera.

let timer = 0;

/** Shows the values of the sliders in their fields. */
function showTurnFields() {
  for (const n of [1, 2, 3, 4]) $(`#hst-${n}`).value = $(`#hs-${n}`).value;
}

/** Starts the turn: every 100 ms each axis turns by 2 degrees towards the value of its slider, `Timer2_Timer`. */
function startTurn() {
  if (timer) return;
  timer = setInterval(() => {
    let busy = false;
    for (const [n, axis] of [[1, 'x'], [2, 'y'], [3, 'z']]) {
      const slider = $(`#hs-${n}`);
      const left = Number(slider.value);
      if (left === 0) continue;
      const step = Math.sign(left) * Math.min(2, Math.abs(left));
      app.turn[axis] = (app.turn[axis] + step) % 360;
      slider.value = String(left - step);
      busy = true;
    }
    showTurnFields();
    sendCamera();
    if (!busy) stopTurn();
  }, 100);
}

/** Stops the turn and keeps the turned view. */
function stopTurn() {
  clearInterval(timer);
  timer = 0;
}

// ---------------------------------------------------------------------------
// Einstellung.

/** The password of version 1.3, a lock against curious pupils and no security. */
const PASSWORD = '2002';

/** What the user typed into the password field of the classic look, which shows a `#` for each character. */
let typed = '';

/** Returns the text of the password field. */
function passwordValue() {
  return app.look === 'classic' ? typed : $('#tpasswd').value;
}

/**
 * Masks the password field of the classic look with `#`, `PasswordChar` of
 * 1.3, which no browser offers: the field shows text, and the page keeps
 * what the user typed.
 */
function maskPassword(event) {
  if (app.look !== 'classic') return;
  event.preventDefault();
  const field = $('#tpasswd');
  const all = field.selectionStart === 0 && field.selectionEnd === field.value.length && field.value.length > 0;
  if (all) typed = '';
  if (event.inputType.startsWith('insert')) typed += event.data ?? event.dataTransfer?.getData('text/plain') ?? '';
  else if (event.inputType.startsWith('delete') && !all) typed = typed.slice(0, -1);
  field.value = '#'.repeat(typed.length);
  field.dispatchEvent(new Event('input'));
}

/** Sets the type of the password field for the look. */
function passwordLook() {
  typed = '';
  $('#tpasswd').value = '';
  $('#tpasswd').type = app.look === 'classic' ? 'text' : 'password';
}

/** Locks or unlocks the paths and their buttons. */
function lockSettings(locked) {
  for (const id of ['#tbau-home', '#tpov-home', '#tbsp-home', '#tbsp-def', '#bdatei-change', '#bdatei-def', '#bscreen']) $(id).disabled = locked;
}

/** Writes the paths into their fields. */
function showPaths() {
  $('#tbau-home').value = app.paths.bauHome;
  $('#tpov-home').value = app.paths.povHome;
  $('#tbsp-home').value = app.paths.bspHome;
  $('#tbsp-def').value = app.paths.bspDef;
}

/** Keeps the paths of the fields, `BDatei_Change_Click`, and locks again. */
function applyPaths() {
  app.paths = {
    bauHome: $('#tbau-home').value,
    povHome: $('#tpov-home').value,
    bspHome: $('#tbsp-home').value,
    bspDef: $('#tbsp-def').value || DEFAULT_PATHS.bspDef,
  };
  store('bausteine.einstellung', app.paths);
  defaultOutput();
  relock();
  emit('paths');
  setStatus('Einstellungen übernommen', 2);
}

/** Puts the paths back to the defaults, `BDatei_Def_Click`, and locks again. */
function defaultPaths() {
  app.paths = { ...DEFAULT_PATHS };
  store('bausteine.einstellung', app.paths);
  showPaths();
  defaultOutput();
  relock();
  emit('paths');
}

/** Empties the password and locks the settings. */
function relock() {
  $('#tpasswd').value = '';
  typed = '';
  lockSettings(true);
}

// ---------------------------------------------------------------------------
// Wiring.

/** Wires the tabs and the pages Ausgabe, Bilder, Kamera and Einstellung. */
export function wireRegister({ onScreenSettings }) {
  for (const tab of $$('#sstab1 .tab')) tab.addEventListener('click', () => showTab(tab.dataset.tab));
  $('#bpov-comp').addEventListener('click', translate);
  $('#bpov-save').addEventListener('click', save);
  $('#tfname').addEventListener('input', showCommand);
  $('#bbild-beenden').addEventListener('click', () => {
    closeShow();
    showTab('koerper');
    $('#f2').hidden = false;
    emit('layout');
  });
  for (const n of [1, 2, 3]) {
    $(`#hs-${n}`).addEventListener('input', showTurnFields);
    $(`#hst-${n}`).addEventListener('change', () => {
      $(`#hs-${n}`).value = String(Math.max(-360, Math.min(360, Number($(`#hst-${n}`).value) || 0)));
      showTurnFields();
    });
  }
  $('#hs-4').addEventListener('input', () => {
    showTurnFields();
    setZoom3dPercent(Number($('#hs-4').value));
  });
  $('#hst-4').addEventListener('change', () => {
    $('#hs-4').value = String(Math.max(50, Math.min(500, Number($('#hst-4').value) || 100)));
    showTurnFields();
    setZoom3dPercent(Number($('#hs-4').value));
  });
  $('#start').addEventListener('click', startTurn);
  $('#command2').addEventListener('click', stopTurn);
  $('#command2').addEventListener('dblclick', () => {
    stopTurn();
    app.turn = { x: 0, y: 0, z: 0 };
    sendCamera();
    setStatus('Drehung zurückgesetzt', 2);
  });
  $('#btn1-1').addEventListener('click', async () => {
    const yaw = (app.orbit.yaw * Math.PI) / 180;
    const pitch = (app.orbit.pitch * Math.PI) / 180;
    const d = app.orbit.distance / (app.d3zoomf / 10);
    const target = { x: app.orbit.x, y: app.orbit.y, z: app.orbit.z };
    const eye = {
      x: target.x + Math.cos(yaw) * Math.cos(pitch) * d,
      y: target.y + Math.sin(yaw) * Math.cos(pitch) * d,
      z: target.z + Math.sin(pitch) * d,
    };
    const round = (p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Math.round(v * 100) / 100]));
    app.povCamera = { eye: round(eye), target: round(target) };
    await translate();
    setStatus('Kamera des Schrägrisses für die Ausgabe übernommen', 3);
  });
  $('#btn2-1').addEventListener('click', async () => {
    app.povCamera = null;
    await translate();
    setStatus('Kamera der Ausgabe zurückgesetzt', 3);
  });
  on('zoom3d', (d3zoomf) => {
    $('#hs-4').value = String(Math.round(d3zoomf * 10));
    showTurnFields();
  });
  $('#tpasswd').addEventListener('beforeinput', maskPassword);
  $('#tpasswd').addEventListener('input', () => {
    if (passwordValue() === PASSWORD) lockSettings(false);
  });
  on('look', passwordLook);
  passwordLook();
  $('#bdatei-change').addEventListener('click', applyPaths);
  $('#bdatei-def').addEventListener('click', defaultPaths);
  $('#bscreen').addEventListener('click', onScreenSettings);
  showPaths();
  lockSettings(true);
  defaultOutput();
  showTurnFields();
  on('scene', () => {
    // The text of the output stays as the user edited it until the next Übersetzen, as in 1.3.
    $('#bpov-save').disabled = true;
  });
  showTab('koerper');
}
