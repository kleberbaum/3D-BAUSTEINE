// SPDX-License-Identifier: GPL-2.0-only
//
// 3D-Bausteine dialogs.js: the message boxes of Visual Basic with the input
// line of `InputBox`, the tool tips of the page, the dialog Hilfe and the
// splash, frmSplash of version 1.3, which shows while WebAssembly and
// WebGPU start and again as the box "Über 3D-Bausteine". Any key or a click
// closes the card, as frmSplash unloads on a key or a click of its frame,
// and the end of the start closes it as well.
//
// The dialog Hilfe has three pages: the workflows of 1.3, the keys of the
// page, and the examples of the POV reference of the thesis in the spelling
// POV-Ray reads, since the thesis prints them with hyphens and blanks where
// POV-Ray needs underscores. What the thesis printed stands in quotation
// marks of the class `thesis`.

import { icon } from './icons.js';
import { $, $$, app, escapeHtml, on } from './state.js';

/** Settles the message box that is open, with the answer it is given, or null where none is open. */
let pendingBox = null;

/**
 * Answers the input line of the message box, `#msgbox-input` of the
 * skeleton, and makes it below the text where the skeleton has none.
 */
function inputLine() {
  let line = $('#msgbox-input');
  if (!line) {
    line = document.createElement('input');
    line.id = 'msgbox-input';
    line.className = 'c-text';
    line.type = 'text';
    line.hidden = true;
    line.spellcheck = false;
    line.setAttribute('aria-labelledby', 'msgbox-text');
    $('#msgbox .c-msgbox-body').after(line);
  }
  return line;
}

/**
 * Shows a message box, `MsgBox` of version 1.3, and answers the caption of
 * the button the user pressed, or null for the close button and Esc.
 *
 * `kind` is 'question', 'info', 'critical' or 'none' for no icon, `buttons`
 * the captions, the first one the default. With `input` the box is the
 * `InputBox` of Visual Basic: the line `#msgbox-input` shows the text
 * `input`, selected, Enter in it presses the first button, and it keeps
 * what the user typed after the box closed.
 */
export function msgbox(text, { title = '', kind = 'info', buttons = ['OK'], input } = {}) {
  const dialog = $('#msgbox');
  // A box that is still open answers null, and the new one takes its place.
  pendingBox?.(null);
  if (dialog.open) dialog.close();
  $('#msgbox-title').textContent = title;
  $('#msgbox-text').textContent = text;
  dialog.dataset.kind = kind;
  dialog.querySelector('.c-msgbox-icon').innerHTML = kind === 'none' ? '' : icon(`msg-${kind}`, app.look);
  const asks = input !== undefined;
  const line = asks ? inputLine() : $('#msgbox-input');
  if (line) {
    line.hidden = !asks;
    if (asks) line.value = String(input ?? '');
  }
  const row = $('#msgbox-buttons');
  row.innerHTML = '';
  return new Promise((resolve) => {
    let answer = null;
    let done = false;
    const enter = (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      row.firstElementChild?.click();
    };
    const settle = (value) => {
      if (done) return;
      done = true;
      dialog.removeEventListener('close', finish);
      line?.removeEventListener('keydown', enter);
      if (pendingBox === settle) pendingBox = null;
      resolve(value);
    };
    // The event close comes a task after the box closed, so one that arrives while a newer box is open is stale.
    const finish = () => {
      if (!dialog.open) settle(answer);
    };
    pendingBox = settle;
    buttons.forEach((caption, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = i === 0 ? 'c-button c-default' : 'c-button';
      button.textContent = caption;
      button.addEventListener('click', () => {
        answer = caption;
        dialog.close();
      });
      row.append(button);
    });
    dialog.addEventListener('close', finish);
    if (asks) line.addEventListener('keydown', enter);
    dialog.showModal();
    if (asks) {
      line.focus();
      line.select();
    } else {
      row.firstElementChild?.focus();
    }
  });
}

// ---------------------------------------------------------------------------
// Hilfe.

/** The keys of the page, section 5.5 of the plan, as rows of the key and what it does. */
const KEYS = [
  ['<kbd>Strg</kbd>+<kbd>N</kbd>', 'Datei › Neu: alle Objekte entfernen'],
  ['<kbd>Strg</kbd>+<kbd>O</kbd>', 'Datei › Öffnen'],
  ['<kbd>Strg</kbd>+<kbd>S</kbd>', 'Datei › Speichern: Übersetzen und Ausgeben wie in Version 1.3'],
  ['<kbd>Strg</kbd>+<kbd>Umschalt</kbd>+<kbd>S</kbd>', 'Datei › Speichern unter: die Szene als Datei'],
  ['<kbd>Strg</kbd>+<kbd>Z</kbd>', 'Rückgängig'],
  ['<kbd>Strg</kbd>+<kbd>Y</kbd> oder <kbd>Strg</kbd>+<kbd>Umschalt</kbd>+<kbd>Z</kbd>', 'Wiederholen'],
  ['<kbd>Strg</kbd>+<kbd>D</kbd>', 'Das gewählte Objekt verdoppeln'],
  ['<kbd>Entf</kbd>', 'Das gewählte Objekt löschen'],
  ['<kbd>Esc</kbd>', 'Das Markieren abbrechen und den Körper abwählen, Menüs und Dialoge schließen'],
  ['<kbd>Enter</kbd>', 'Den gewählten Körper einfügen'],
  ['<kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd>', 'Kreuzriss, Aufriss, Grundriss oder Schrägriss allein zeigen'],
  ['<kbd>0</kbd>', 'Alle vier Risse zeigen'],
  ['<kbd>F</kbd>', 'Alles zeigen'],
  ['<kbd>R</kbd>', 'Raytracing ein und aus'],
  ['<kbd>+</kbd> und <kbd>−</kbd>', '2D-Zoom hinein und heraus'],
  ['<kbd>Alt</kbd>+<kbd>+</kbd> und <kbd>Alt</kbd>+<kbd>−</kbd>', '3D-Zoom hinein und heraus'],
  ['Pfeiltasten', 'Das gewählte Objekt im Riss verschieben'],
  ['<kbd>Bild↑</kbd> <kbd>Bild↓</kbd>', 'Das gewählte Objekt in der Höhe verschieben'],
  ['<kbd>?</kbd> oder <kbd>F1</kbd>', 'Diese Hilfe'],
  ['<kbd>Alt</kbd>+<kbd>D</kbd> <kbd>B</kbd> <kbd>O</kbd> <kbd>A</kbd> <kbd>H</kbd>', 'Die Menüs Datei, Bearbeiten, Objekte, Ansicht und Hilfe'],
  ['Dia-Show: <kbd>←</kbd> <kbd>→</kbd>', 'Das vorige und das nächste Bild'],
  ['Dia-Show: <kbd>Leertaste</kbd>', 'Das nächste Bild'],
  ['Dia-Show: <kbd>Enter</kbd> <kbd>Esc</kbd>', 'Die Dia-Show beenden'],
];

/**
 * The examples of the POV reference of the thesis, chapter 9, as POV-Ray
 * reads them. Each note says what the thesis printed, in a quotation of the
 * class `thesis`, and the code is the corrected sample.
 */
const POV_SAMPLES = [
  {
    title: 'Lichtquelle (9.3)',
    note: 'Gedruckt steht <q class="thesis">light-source</q> und <q class="thesis">point-at</q>, im Beispiel des Spotlichts auch <q class="thesis">Light-source</q> und <q class="thesis">TIGHTNESS</q>. POV-Ray kennt nur die kleinen Schlüsselwörter mit dem Unterstrich.',
    code: 'light_source { <-100, 200, -50> color red 0.5 green 0.5 blue 0.5 }\n\nlight_source {\n  <0, 10, 0> color White\n  spotlight\n  point_at <0, 0, 0>\n  radius 10\n  falloff 20\n  tightness 10\n}',
  },
  {
    title: 'Zylinder (9.1.3)',
    note: 'Das gedruckte Beispiel hat zwei gleiche Endpunkte, <q class="thesis">&lt;0, 2,0&gt;, &lt;0,2,0&gt;</q>. Die Zahl nach den Endpunkten ist der Radius und nicht der Durchmesser.',
    code: 'cylinder { <0, -2, 0>, <0, 2, 0>, 2 open }',
  },
  {
    title: 'Glattes Dreieck (9.1.6)',
    note: 'Gedruckt steht <q class="thesis">smooth-triangel</q>. Zu jedem Eckpunkt gehört seine Normale. In einer Vereinigung dürfen Dreiecke stehen, als Körper einer Differenz oder eines Durchschnitts taugen sie nicht.',
    code: 'smooth_triangle {\n  <0, 0, 0>, <0, 1, 0>,\n  <1, 0, 0>, <0, 1, 0>,\n  <0, 0, 1>, <0, 1, 0>\n}',
  },
  {
    title: 'Ebene (9.1.8)',
    note: 'Ohne das Komma, wie gedruckt <q class="thesis">plane { &lt;0,1,0&gt; -5 }</q>, rechnet POV-Ray den Vektor minus 5 und vermisst den Abstand.',
    code: 'plane { <0,1,0>, -5 }',
  },
  {
    title: 'Höhenfeld (9.1.9)',
    note: 'Gedruckt steht <q class="thesis">height-field</q>. Das Bild liegt in der Ebene aus X und Z, die Helligkeit gibt die Höhe in Y.',
    code: 'height_field { tga "testbild.tga" water_level 0.1 smooth }',
  },
  {
    title: 'Durchschnitt und Summe (9.2.2, 9.2.4)',
    note: 'Die gedruckten Beispiele sind im Satz verstümmelt, etwa <q class="thesis">sphere I &lt;0.5,0,0&gt;,1 }</q>. So lauten sie.',
    code: 'intersection {\n  sphere { <0, 0, 0>, 1 }\n  sphere { <0.5, 0, 0>, 1 }\n}\n\nmerge {\n  sphere { <0, 0, 0>, 1 }\n  sphere { <0.5, 0, 0>, 1 }\n}',
  },
  {
    title: 'Farbverläufe (9.4.2.5 bis 9.4.2.9)',
    note: 'Gedruckt steht <q class="thesis">color-map</q> und <q class="thesis">color map</q>, ohne die geschweiften Klammern und beim Muster onion in Großbuchstaben. Die Namen der Farben aus colors.inc beginnen groß, also Blue und nicht blue. Beim Muster mandel brauchen die Einträge verschiedene Stellen zwischen 0 und 1.',
    code: 'pigment {\n  gradient y\n  color_map { [0.0 color Red] [0.25 color Green] [0.75 color Green] [1.0 color Blue] }\n}\n\npigment { wood color_map { [0.5 color Brown] [1 color Black] } }\n\npigment { onion color_map { [0.5 color Brown] [1 color Black] } }\n\npigment { mandel 25 color_map { [0 color Red] [0.5 color Yellow] [1 color Green] } }',
  },
  {
    title: 'Bild als Pigment (9.4.2.10)',
    note: 'Gedruckt steht <q class="thesis">image map</q> und <q class="thesis">map type 0 OF1Ce</q>, wo once gemeint ist.',
    code: 'pigment {\n  image_map { gif "bild.gif" map_type 0 once }\n}',
  },
  {
    title: 'Bild als Normale (9.4.3.5)',
    note: 'Gedruckt steht <q class="thesis">bum map</q> und <q class="thesis">bump size</q>, und das Beispiel bricht ab.',
    code: 'normal {\n  bump_map { gif "mandel.gif" bump_size 2 }\n}',
  },
  {
    title: 'Glanzpunkt (9.4.4.5)',
    note: 'Gedruckt steht <q class="thesis">phong size</q>.',
    code: 'finish { phong 0.9 phong_size 60 }',
  },
  {
    title: 'Kamera (9.5)',
    note: 'Gedruckt steht <q class="thesis">look at</q>, und der Vektor des Himmels steht in geschweiften Klammern, <q class="thesis">sky {0,1,0}</q>.',
    code: 'camera { location <1, 1, 1> look_at <0, 0, 0> sky <0, 1, 0> }',
  },
  {
    title: 'Hintergrund (9.6.2)',
    note: 'Die gedruckten Klammern passen nicht zueinander, <q class="thesis">background ( color SkyBlue }</q>. Einen Himmel mit Textur gibt sky_sphere, das Version 1.3 selbst schreibt.',
    code: 'background { color SkyBlue }\n\nsky_sphere { pigment { Bright_Blue_Sky } }',
  },
  {
    title: 'Animation (9.7.2)',
    note: 'Der gedruckten Szene fehlen die Zeichen &lt;. POV-Ray 3.1 lässt clock von selbst von 0 bis 1 laufen, etwa über 20 Bilder mit dem Schalter +KFF20, so dass die Ebene eine Einheit weit wandert.',
    code: 'object {\n  plane { <0, 1, 0>, 0\n    texture { pigment { checker color White color Black } }\n    translate <clock, 0, clock>\n  }\n}\ncamera { location <0, 2, -3> look_at <0, 1, 0> }\nlight_source { <0, 10, -4> color red 1 green 1 blue 1 }',
  },
];

/** The pages of the dialog Hilfe in their order. */
const HELP_PAGES = [
  { name: 'bedienung', caption: 'Bedienung' },
  { name: 'tasten', caption: 'Tasten' },
  { name: 'pov', caption: 'POV-Referenz' },
];

/** Returns the HTML of the page `name` of the dialog Hilfe. */
function helpPage(name) {
  if (name === 'tasten') {
    const rows = KEYS.map(([key, does]) => `<tr><td>${key}</td><td>${does}</td></tr>`).join('');
    return `<h2>Tasten</h2><table class="keys help-keys">${rows}</table><p>In einem Textfeld gelten nur <kbd>Esc</kbd>, <kbd>Enter</kbd> und die Tasten mit <kbd>Strg</kbd>.</p>`;
  }
  const samples = POV_SAMPLES.map((s) => `<h3>${s.title}</h3><p>${s.note}</p><pre class="help-code"><code>${escapeHtml(s.code)}</code></pre>`).join('');
  return `<h2>POV-Referenz</h2><p>Die Beispiele der POV-Referenz in Kapitel 9 der Diplomarbeit lassen sich so, wie sie gedruckt sind, nicht übersetzen. Hier stehen sie so, wie POV-Ray sie liest, und bei jedem steht, wie die Arbeit es gedruckt hat.</p>${samples}`;
}

/** Shows the page `name` of the dialog Hilfe. */
function showHelpPage(name) {
  const dialog = $('#help-dialog');
  for (const tab of dialog.querySelectorAll('[data-help-tab]')) {
    const chosen = tab.dataset.helpTab === name;
    tab.setAttribute('aria-selected', String(chosen));
    tab.tabIndex = chosen ? 0 : -1;
  }
  for (const page of dialog.querySelectorAll('[data-help-page]')) page.hidden = page.dataset.helpPage !== name;
}

/**
 * Builds the pages of the dialog Hilfe: the text of the skeleton becomes
 * the page Bedienung, and the pages Tasten and POV-Referenz follow, each
 * behind a tab of its own above them.
 */
function buildHelp() {
  const client = $('#help-dialog .help-client');
  if (!client || client.querySelector('[data-help-tab]')) return;
  const buttons = client.querySelector(':scope > .dialog-buttons');
  const pages = [];
  for (const { name } of HELP_PAGES) {
    let page = client.querySelector(`[data-help-page="${name}"]`);
    if (!page) {
      page = document.createElement('section');
      page.className = 'help-page';
      page.dataset.helpPage = name;
      if (name === 'bedienung') {
        for (const child of [...client.children]) if (child !== buttons && !child.dataset.helpPage) page.append(child);
      } else {
        page.innerHTML = helpPage(name);
      }
    }
    page.id = `help-page-${name}`;
    page.setAttribute('role', 'tabpanel');
    pages.push(page);
  }
  const tabs = document.createElement('div');
  tabs.className = 'help-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Seiten der Hilfe');
  for (const { name, caption } of HELP_PAGES) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'c-button help-tab';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `help-page-${name}`);
    tab.dataset.helpTab = name;
    tab.textContent = caption;
    tab.addEventListener('click', () => showHelpPage(name));
    tabs.append(tab);
  }
  tabs.addEventListener('keydown', (event) => {
    const list = [...tabs.querySelectorAll('[data-help-tab]')];
    const at = list.indexOf(document.activeElement);
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (at < 0 || !step) return;
    event.preventDefault();
    const next = list[(at + step + list.length) % list.length];
    showHelpPage(next.dataset.helpTab);
    next.focus();
  });
  client.prepend(tabs, ...pages);
  if (buttons) client.append(buttons);
  showHelpPage(HELP_PAGES[0].name);
}

/** Opens the dialog Hilfe, at the page `page` where one is named. */
export function showHelp(page = null) {
  const dialog = $('#help-dialog');
  if (!dialog) return;
  if (page) showHelpPage(page);
  if (!dialog.open) dialog.showModal();
}

/**
 * Wires the close buttons of every dialog, the help buttons of the
 * captions, the pages of the dialog Hilfe and the card of the start.
 */
export function wireDialogs() {
  for (const dialog of $$('dialog')) {
    for (const button of dialog.querySelectorAll('.win-close, [data-close]')) {
      button.addEventListener('click', () => dialog.close());
    }
  }
  // The card of the start shows from the first paint, and a key or a click removes it before the start ends.
  if (!$('#splash').hidden) closeOnInput(false);
  buildHelp();
  // The button `?` of a caption opens the help, as the help button of a dialog of Windows does.
  for (const button of $$('dialog .win-help')) button.addEventListener('click', () => showHelp());
  on('win-help', () => showHelp());
}

// ---------------------------------------------------------------------------
// Tool tips.

let tipTimer = 0;
let tipTarget = null;

/** Returns the delay of a tool tip: half a second in the classic look as on Windows 98, 400 ms in the modern one. */
function tipDelay() {
  return app.look === 'classic' ? 500 : 400;
}

/**
 * Shows the tool tip of an element with `data-tip` after a short delay
 * below the pointer, as the tool tips of version 1.3 appear, "beim
 * Verweilen" in the words of the thesis. The modern look also shows it
 * below an element that the keyboard focuses.
 */
export function wireTooltips() {
  const tip = $('#tooltip');
  const hide = () => {
    clearTimeout(tipTimer);
    tipTarget = null;
    tip.hidden = true;
  };
  const place = (x, y) => {
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    const left = Math.min(x, window.innerWidth - width - 4);
    const top = y + height > window.innerHeight - 4 ? y - height - 28 : y;
    tip.style.left = `${Math.max(4, left)}px`;
    tip.style.top = `${Math.max(4, top)}px`;
  };
  const later = (target, x, y) => {
    tipTarget = target;
    tipTimer = setTimeout(() => {
      if (!target.isConnected || !target.dataset.tip) return;
      tip.textContent = target.dataset.tip;
      tip.hidden = false;
      place(x, y);
    }, tipDelay());
  };
  document.addEventListener('pointerover', (event) => {
    const target = event.target.closest?.('[data-tip]');
    if (target === tipTarget) return;
    hide();
    if (target) later(target, event.clientX + 12, event.clientY + 20);
  });
  document.addEventListener('focusin', (event) => {
    if (app.look === 'classic') return;
    const target = event.target.closest?.('[data-tip]');
    if (!target || target === tipTarget || !target.matches(':focus-visible')) return;
    hide();
    const r = target.getBoundingClientRect();
    later(target, r.left, r.bottom + 6);
  });
  document.addEventListener('focusout', (event) => {
    if (event.target === tipTarget && !event.target.matches(':hover')) hide();
  });
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('keydown', hide, true);
  window.addEventListener('blur', hide);
  on('look', hide);
}

// ---------------------------------------------------------------------------
// Splash.

/** Removes the listeners of the card that shows, or is null while none listens. */
let releaseSplash = null;

/**
 * Lets a click on the card or any key hide the splash. The box Über keeps
 * the key from the browser where `about` is set. During the start the key
 * reaches no handler of the page but keeps its meaning for the browser, so
 * F5 still reloads a start that hangs.
 */
function closeOnInput(about) {
  releaseSplash?.();
  const splash = $('#splash');
  const release = () => {
    splash.removeEventListener('click', close);
    document.removeEventListener('keydown', close, true);
    if (releaseSplash === release) releaseSplash = null;
  };
  const close = (event) => {
    if (about) event.preventDefault();
    else if (event.type === 'keydown') event.stopImmediatePropagation();
    splash.hidden = true;
    release();
  };
  releaseSplash = release;
  splash.addEventListener('click', close);
  document.addEventListener('keydown', close, true);
}

/** Hides the splash at the end of the start, or keeps it with `text` where the start failed. */
export function closeSplash(text = null) {
  const splash = $('#splash');
  if (text) {
    $('#splash-state').textContent = text;
    return;
  }
  releaseSplash?.();
  splash.hidden = true;
}

/** Shows the splash as the box "Über 3D-Bausteine" until a click or a key. */
export function showAbout() {
  releaseSplash?.();
  $('#splash-state').textContent = 'Klicken oder eine Taste drücken';
  $('#splash').hidden = false;
  // The card listens once the click or the key that chose the entry has passed.
  setTimeout(() => closeOnInput(true), 0);
}
