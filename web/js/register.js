// SPDX-License-Identifier: GPL-2.0-only
//
// 3D-Bausteine register.js: the register form Eingaben, F4 of version 1.3,
// with its six tabs in two rows, and the tabs other than Körper: Ausgabe
// with the text for POV-Ray, Kamera with the turn of the Schrägriss, and
// Einstellung with the paths behind the password of version 1.3.
//
// The tabs behave as the SSTab of Windows in its style 0: a tab of the back
// row brings its whole row to the front. Übersetzen first closes the open
// groups of the CSG, those at whose end the next insert would land, as
// `End_Check` of 1.3 appends the missing CSG-Ende, and says so in the
// message box of 1.3 in the classic look and in a toast in the modern one. Ausgeben offers the text as a file
// named after the field TfName, and the tab shows the command line with
// which version 1.3 starts POV-Ray, with its paths in quotes.

import { closeShow, refreshPictures } from './bilder.js';
import { msgbox } from './dialogs.js';
import { selectItem } from './scene.js';
import { KINDS } from './store.js';
import { setZoom3dPercent, sendCamera } from './views.js';
import {
  $,
  $$,
  DEFAULT_PATHS,
  POV_CAMERA,
  app,
  download,
  emit,
  itemById,
  on,
  parseNumber,
  selectedItem,
  selectedLine,
  setStatus,
  store,
  toast,
} from './state.js';

/** The tabs of the back row. */
const BACK = ['bilder', 'kamera', 'einstellung'];

/** Brings the tab `name` to the front, `SSTab1.Tab`. */
export function showTab(name) {
  for (const tab of $$('#sstab1 .tab')) {
    const chosen = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(chosen));
    tab.tabIndex = chosen ? 0 : -1;
  }
  for (const page of $$('#sstab1 .tab-page')) page.hidden = page.dataset.page !== name;
  // A tab of the back row brings its whole row to the front, as the SSTab of Windows does.
  const rows = $$('#sstab1 .tab-row');
  const frontRow = rows.find((row) => row.querySelector(`[data-tab="${name}"]`));
  for (const row of rows) {
    row.classList.toggle('front', row === frontRow);
    row.classList.toggle('back', row !== frontRow);
  }
  $('#f4').dataset.tab = name;
  $('#f4').dataset.row = BACK.includes(name) ? 'back' : 'front';
  if (name === 'ausgabe' && !$('#text1').value) fillText();
  if (name === 'bilder') refreshPictures();
  emit('tab', name);
}

/**
 * Moves between the tabs with the keys: the arrows left and right inside a
 * row, up and down to the tab at the same place of the other row, Home and
 * End to the ends of the row. The tab takes the focus and shows its page.
 */
function tabKeys(event) {
  const tab = event.target.closest('.tab');
  if (!tab) return;
  const row = [...tab.parentElement.querySelectorAll('.tab')];
  const index = row.indexOf(tab);
  let next = null;
  switch (event.key) {
    case 'ArrowRight':
      next = row[(index + 1) % row.length];
      break;
    case 'ArrowLeft':
      next = row[(index - 1 + row.length) % row.length];
      break;
    case 'Home':
      next = row[0];
      break;
    case 'End':
      next = row.at(-1);
      break;
    case 'ArrowUp':
    case 'ArrowDown': {
      const other = $$('#sstab1 .tab-row').find((r) => r !== tab.parentElement);
      next = other ? [...other.querySelectorAll('.tab')][index] ?? null : null;
      break;
    }
    default:
      return;
  }
  // The arrows must not reach the keys of the page, which move the selected body.
  event.preventDefault();
  event.stopPropagation();
  if (!next) return;
  showTab(next.dataset.tab);
  next.focus();
}

// ---------------------------------------------------------------------------
// Ausgabe.

/** Returns `path` with a backslash at its end, as the paths of tab Einstellung end. */
function folder(path) {
  const text = String(path ?? '').trim();
  return text && !/[\\/]$/.test(text) ? `${text}\\` : text;
}

/** Returns the file of the output with its folder and without `.pov`, the field TfName, so a typed `.pov` is not doubled. */
function outputFile() {
  const text = $('#tfname').value.trim() || `${folder(app.paths.bspHome)}${app.paths.bspDef || DEFAULT_PATHS.bspDef}`;
  return text.replace(/\.pov$/i, '') || DEFAULT_PATHS.bspDef;
}

/** Returns the name of the file of the output without its folder and without `.pov`. */
function outputName() {
  return outputFile().split(/[\\/]/).pop() || DEFAULT_PATHS.bspDef;
}

/** Returns the date and the time as `Def_Pov` of version 1.3 writes them, `TT.MM.JJJJ` and `HH:MM:SS`. */
function stamp() {
  const now = new Date();
  const two = (n) => String(n).padStart(2, '0');
  return {
    date: `${two(now.getDate())}.${two(now.getMonth() + 1)}.${now.getFullYear()}`,
    time: `${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`,
  };
}

/** The kinds of the groups of the CSG, which `End_Check` closes, and of every group. */
const CSG_KINDS = new Set(KINDS.filter((k) => k.group && k.kind !== 'DECLARE').map((k) => k.kind));
const GROUP_KINDS = new Set(KINDS.filter((k) => k.group).map((k) => k.kind));

/**
 * Returns the groups of the CSG that are open, the innermost first. A group
 * is open where the next insert would land at its end, just before its
 * CSG-Ende, as the open group of 1.3 stands at the end of its flat list:
 * after the opener of an empty group, after the last member, or after the
 * CSG-Ende of an inner group that is the last member. The walk outwards
 * stops at a new body of `#Neu`, which a CSG-Ende never crosses.
 */
function openGroups() {
  const line = selectedLine();
  const item = selectedItem();
  if (!line || !item) return [];
  let group = line.end ? itemById(item.parent) : GROUP_KINDS.has(item.kind) ? item : itemById(item.parent);
  let at = app.line;
  const out = [];
  while (group && CSG_KINDS.has(group.kind) && out.length < 64) {
    const end = app.lines.findIndex((l) => l.item === group.id && l.end);
    if (end !== at + 1) break;
    out.push(group);
    at = end;
    group = itemById(group.parent);
  }
  return out;
}

/**
 * Closes the open groups of the CSG before an export, `End_Check` of 1.3.
 * The tree of 2.0 has no group without its end, so nothing is added to the
 * scene: the selection moves to the CSG-Ende of the outermost open group,
 * and the next insert lands behind it, as after the CSG-Ende 1.3 appends.
 */
async function endCheck() {
  const open = openGroups();
  if (open.length === 0) return;
  if (app.look === 'classic') {
    // The text of 1.3 with its underscore and its trailing blank, the information icon and an empty title.
    await msgbox('CSG_Ende fehlt - wird angefügt ', { title: '', kind: 'info', buttons: ['OK'] });
  } else {
    toast('CSG-Ende fehlt, wird angefügt');
  }
  selectItem(open.at(-1).id, true);
}

/** Answers the text for POV-Ray of the scene, or null where the service refused it. */
async function povText() {
  const camera = app.povCamera ?? POV_CAMERA;
  return app.store.pov(app.scene.id, { ...camera, classic: app.look === 'classic', ...stamp() }).catch((error) => {
    setStatus(String(error?.message ?? error), 4);
    return null;
  });
}

/**
 * Builds the text for POV-Ray into Text1 and enables Ausgeben,
 * `BPOV_Comp_Click`, after `End_Check` closed the open groups.
 */
export async function translate() {
  if (!app.ready || !app.scene.id) return '';
  await endCheck();
  const text = await povText();
  if (text == null) return '';
  $('#text1').value = text;
  $('#bpov-save').disabled = false;
  showCommand();
  return text;
}

/**
 * Fills Text1 the first time the tab shows, as `Def_Pov` fills it at the
 * start of 1.3. Ausgeben stays disabled until Übersetzen.
 */
async function fillText() {
  if (!app.ready || !app.scene.id) return;
  const text = await povText();
  if (text != null && !$('#text1').value) $('#text1').value = text;
  showCommand();
}

/** Offers Text1 as the file `<TfName>.pov` and disables Ausgeben again, `BPov_Save_Click`. */
export function save() {
  const name = `${outputName()}.pov`;
  download(name, $('#text1').value, 'text/plain');
  $('#bpov-save').disabled = true;
  setStatus(`${name} gespeichert`, 3);
}

/** Returns `path` in quotes, without the backslash at its end that would escape the closing quote. */
function quoted(path) {
  return `"${String(path).replace(/[\\/]+$/, '')}"`;
}

/**
 * Writes the command line with which `RayTrace` of version 1.3 starts
 * POV-Ray, from the paths of tab Einstellung and the field TfName. The
 * files stand in quotes and the folder of the includes has one backslash,
 * where 1.3 wrote the paths bare and `POV31\\include\`. The program stands
 * in quotes where its path holds a blank.
 */
function showCommand() {
  const pov = folder(app.paths.povHome);
  const file = outputFile();
  const program = `${pov}bin\\pvengine.exe`;
  const start = /\s/.test(program) ? quoted(program) : program;
  $('#pov-command').textContent = `${start} +W400 +H300 +A +P +X +D -V -I${quoted(`${file}.pov`)} -o${quoted(`${file}.bmp`)} -L${quoted(`${pov}include`)}`;
}

/** Sets the field TfName to the default of the tab Einstellung, `Def_Datei`. */
function defaultOutput() {
  $('#tfname').value = `${folder(app.paths.bspHome)}${app.paths.bspDef}`;
  showCommand();
}

// ---------------------------------------------------------------------------
// Kamera.

/** The range of each slider HS(n) of the tab, from F4.frm. */
const RANGES = { 1: [-360, 360], 2: [-360, 360], 3: [-360, 360], 4: [50, 500] };

let timer = 0;

/** Shows the values of the sliders in their fields, from the start on (F4-Q9) and while a thumb moves (F4-Q10). */
function showTurnFields() {
  for (const n of [1, 2, 3, 4]) $(`#hst-${n}`).value = $(`#hs-${n}`).value;
}

/**
 * Takes the value typed into the field HST(n): a number moves its slider,
 * clamped to the range, and text is refused with a status line where 1.3
 * raised the errors 13 and 380 (F4-Q91).
 */
function takeField(n) {
  const field = $(`#hst-${n}`);
  const [min, max] = RANGES[n];
  const text = field.value.trim();
  const value = parseNumber(text, Number.NaN);
  if (!Number.isFinite(value)) {
    if (text !== '') setStatus(`Bitte eine Zahl von ${min} bis ${max} eingeben`, 3);
    showTurnFields();
    return;
  }
  $(`#hs-${n}`).value = String(Math.round(Math.max(min, Math.min(max, value))));
  showTurnFields();
  if (n === 4) setZoom3dPercent(Number($('#hs-4').value));
}

/** Starts the turn: every 100 ms each axis turns by 2 degrees towards the value of its slider, `Timer2_Timer`. */
function startTurn() {
  if (timer) return;
  $('#start').setAttribute('aria-pressed', 'true');
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
  $('#start').setAttribute('aria-pressed', 'false');
}

/** Takes the camera of the Schrägriss for the export, the button Einfügen of the tab, new in 2.0. */
async function takeCamera() {
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
}

// ---------------------------------------------------------------------------
// Einstellung.

/** The password of version 1.3, a lock against curious pupils and no security. */
const PASSWORD = '2002';

/** What the user typed into the password field of the classic look, which shows the mask character for each character. */
let typed = '';

/** Returns the mask character of the field, `PasswordChar` of 1.3, which the skeleton names in `data-password-char`. */
function maskChar() {
  return [...($('#tpasswd').dataset.passwordChar || '#')][0];
}

/** Returns whether the page masks the field itself, which the classic look does since no browser offers `#` as the mask. */
function masking() {
  return app.look === 'classic';
}

/** Returns the text of the password field. */
function passwordValue() {
  return masking() ? typed : $('#tpasswd').value;
}

/**
 * Masks the password field of the classic look with the character of
 * `PasswordChar`: the field shows one mask character for each typed one,
 * and the page keeps what the user typed, with the selection and the caret
 * of the field applied to it.
 */
function maskPassword(event) {
  if (!masking()) return;
  event.preventDefault();
  const field = $('#tpasswd');
  const type = event.inputType ?? '';
  let start = Math.min(field.selectionStart ?? typed.length, typed.length);
  let end = Math.min(field.selectionEnd ?? typed.length, typed.length);
  let insert = '';
  if (type === 'insertLineBreak' || type === 'insertParagraph') return;
  if (type.startsWith('insert')) {
    insert = event.data ?? event.dataTransfer?.getData('text/plain') ?? '';
    insert = insert.replace(/[\r\n]/g, '');
  } else if (type.startsWith('delete')) {
    if (start === end) {
      const backward = type.includes('Backward');
      const whole = /Word|Line/.test(type);
      if (backward) start = whole ? 0 : Math.max(0, start - 1);
      else end = whole ? typed.length : Math.min(typed.length, end + 1);
    }
  } else {
    return;
  }
  typed = typed.slice(0, start) + insert + typed.slice(end);
  field.value = maskChar().repeat(typed.length);
  const caret = start + insert.length;
  field.setSelectionRange(caret, caret);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Checks the password after every change, `Tpasswd_Change`. A value that
 * arrived without the masking, from the browser or a script, is taken as
 * typed and masked.
 */
function passwordInput() {
  const field = $('#tpasswd');
  if (masking() && field.value !== maskChar().repeat(field.value.length)) {
    typed = field.value;
    field.value = maskChar().repeat(typed.length);
  }
  // Any text after the right password keeps the tab unlocked, as in 1.3 (F4-Q82).
  if (passwordValue() === PASSWORD) lockSettings(false);
}

/** Sets the type of the password field for the look. */
function passwordLook() {
  typed = '';
  const field = $('#tpasswd');
  field.value = '';
  field.type = masking() ? 'text' : 'password';
  field.spellcheck = false;
}

/** Locks or unlocks the paths and their buttons, the seven controls of `Lock_Datei_Def`. */
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

/** Keeps the paths of the fields, `BDatei_Change_Click`, rebuilds TfName from them and locks again. */
function applyPaths() {
  app.paths = {
    bauHome: $('#tbau-home').value.trim(),
    povHome: $('#tpov-home').value.trim(),
    bspHome: $('#tbsp-home').value.trim(),
    bspDef: $('#tbsp-def').value.trim() || DEFAULT_PATHS.bspDef,
  };
  store('bausteine.einstellung', app.paths);
  relock();
  emit('paths');
  setStatus('Einstellungen übernommen', 2);
}

/** Puts the paths back to the defaults, `BDatei_Def_Click`, and locks again. */
function defaultPaths() {
  app.paths = { ...DEFAULT_PATHS };
  store('bausteine.einstellung', app.paths);
  relock();
  emit('paths');
}

/** Empties the password and locks the settings, `Lock_Datei_Def`. */
function relock() {
  $('#tpasswd').value = '';
  typed = '';
  lockSettings(true);
}

// ---------------------------------------------------------------------------
// Wiring.

/** Wires the tabs and the pages Ausgabe, Bilder, Kamera and Einstellung. */
export function wireRegister({ onScreenSettings }) {
  for (const tab of $$('#sstab1 .tab')) {
    tab.addEventListener('click', () => showTab(tab.dataset.tab));
    tab.addEventListener('keydown', tabKeys);
  }
  $('#bpov-comp').addEventListener('click', () => translate());
  $('#bpov-save').addEventListener('click', save);
  $('#tfname').addEventListener('input', showCommand);
  $('#bbild-beenden').addEventListener('click', () => {
    // Beenden of tab Bilder also closes the Dia-Show, which 1.3 left open (F4-Q81).
    closeShow();
    showTab('koerper');
    $('#f2').hidden = false;
    emit('window', { id: 'f2', hidden: false });
    emit('layout');
  });
  for (const n of [1, 2, 3]) {
    $(`#hs-${n}`).addEventListener('input', showTurnFields);
    $(`#hst-${n}`).addEventListener('change', () => takeField(n));
  }
  $('#hs-4').addEventListener('input', () => {
    showTurnFields();
    setZoom3dPercent(Number($('#hs-4').value));
  });
  $('#hst-4').addEventListener('change', () => takeField(4));
  $('#start').addEventListener('click', startTurn);
  $('#command2').addEventListener('click', stopTurn);
  $('#command2').addEventListener('dblclick', () => {
    stopTurn();
    app.turn = { x: 0, y: 0, z: 0 };
    sendCamera();
    setStatus('Drehung zurückgesetzt', 2);
  });
  $('#btn1-1').addEventListener('click', takeCamera);
  $('#btn2-1').addEventListener('click', async () => {
    app.povCamera = null;
    await translate();
    setStatus('Kamera der Ausgabe zurückgesetzt', 3);
  });
  // The slider of the zoom follows the 3D zoom wherever it changes, in percent of the start.
  on('zoom', ({ d3zoomf } = {}) => {
    if (!Number.isFinite(d3zoomf)) return;
    $('#hs-4').value = String(Math.round(d3zoomf * 10));
    $('#hst-4').value = $('#hs-4').value;
  });
  $('#tpasswd').addEventListener('beforeinput', maskPassword);
  $('#tpasswd').addEventListener('input', passwordInput);
  on('look', passwordLook);
  passwordLook();
  $('#bdatei-change').addEventListener('click', applyPaths);
  $('#bdatei-def').addEventListener('click', defaultPaths);
  // Bildschirmeinstellungen locks the tab again before it opens the dialog, as `BScreen_Click` does.
  $('#bscreen').addEventListener('click', () => {
    relock();
    showPaths();
    onScreenSettings();
  });
  on('paths', () => {
    showPaths();
    defaultOutput();
  });
  showPaths();
  lockSettings(true);
  defaultOutput();
  showTurnFields();
  $('#start').setAttribute('aria-pressed', 'false');
  showTab('koerper');
}
