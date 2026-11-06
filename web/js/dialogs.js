// SPDX-License-Identifier: GPL-2.0-only
//
// 3D-Bausteine dialogs.js: the message boxes of Visual Basic, the tool tips
// of the bars, the dialogs Öffnen, Bildschirmeinstellungen and Hilfe, and
// the splash, frmSplash of version 1.3, which shows while WebAssembly and
// WebGPU start.

import { icon } from './icons.js';
import { $, $$, app } from './state.js';

/**
 * Shows a message box, `MsgBox` of version 1.3, and answers the caption of
 * the button the user pressed, or null for the close button and Esc.
 *
 * `kind` is 'question', 'info' or 'critical', `buttons` the captions, the
 * first one the default.
 */
export function msgbox(text, { title = '', kind = 'info', buttons = ['OK'] } = {}) {
  const dialog = $('#msgbox');
  $('#msgbox-title').textContent = title;
  $('#msgbox-text').textContent = text;
  dialog.querySelector('.c-msgbox-icon').innerHTML = icon(`msg-${kind}`, app.look);
  const row = $('#msgbox-buttons');
  row.innerHTML = '';
  return new Promise((resolve) => {
    let answer = null;
    const finish = () => {
      dialog.removeEventListener('close', finish);
      resolve(answer);
    };
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
    dialog.showModal();
    row.firstElementChild?.focus();
  });
}

/** Wires the close buttons of every dialog and window caption that closes a dialog. */
export function wireDialogs() {
  for (const dialog of $$('dialog')) {
    for (const button of dialog.querySelectorAll('.win-close, [data-close]')) {
      button.addEventListener('click', () => dialog.close());
    }
  }
}

let tipTimer = 0;
let tipTarget = null;

/**
 * Shows the tool tip of an element with `data-tip` after half a second
 * below the pointer, as the tool tips of version 1.3 appear, "beim
 * Verweilen" in the words of the thesis.
 */
export function wireTooltips() {
  const tip = $('#tooltip');
  const hide = () => {
    clearTimeout(tipTimer);
    tipTarget = null;
    tip.hidden = true;
  };
  document.addEventListener('pointerover', (event) => {
    const target = event.target.closest?.('[data-tip]');
    if (target === tipTarget) return;
    hide();
    if (!target) return;
    tipTarget = target;
    const { clientX, clientY } = event;
    tipTimer = setTimeout(() => {
      tip.textContent = target.dataset.tip;
      tip.hidden = false;
      const width = tip.offsetWidth;
      const height = tip.offsetHeight;
      const x = Math.min(clientX + 12, window.innerWidth - width - 4);
      const y = clientY + 20 + height > window.innerHeight ? clientY - height - 8 : clientY + 20;
      tip.style.left = `${Math.max(4, x)}px`;
      tip.style.top = `${Math.max(4, y)}px`;
    }, 500);
  });
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('keydown', hide, true);
  window.addEventListener('blur', hide);
}

/** Hides the splash, or keeps it with `text` where the start failed. */
export function closeSplash(text = null) {
  const splash = $('#splash');
  if (text) {
    $('#splash-state').textContent = text;
    return;
  }
  splash.hidden = true;
}

/** Shows the splash as the box "Über 3D-Bausteine" until a click or a key. */
export function showAbout() {
  const splash = $('#splash');
  $('#splash-state').textContent = 'Klicken oder eine Taste drücken';
  splash.hidden = false;
  const close = () => {
    splash.hidden = true;
    splash.removeEventListener('click', close);
    document.removeEventListener('keydown', close, true);
  };
  setTimeout(() => {
    splash.addEventListener('click', close);
    document.addEventListener('keydown', close, true);
  }, 0);
}
