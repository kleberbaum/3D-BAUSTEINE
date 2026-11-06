// SPDX-License-Identifier: GPL-2.0-only
//
// The file icons.js of 3D-Bausteine holds the modern icon set. The line icons
// of the bodies, the operations and the actions are drawn on a grid of 24 by
// 24 in the colour of the text, with round ends and a stroke of 1.6.
// The keys tool-1 to tool-13 are the thirteen buttons of the tool bar F3 of
// version 1.3 in their old order, and the body-* keys are the nine buttons of
// the body bar F2. The body icons carry the colour of their body from 1.3 as
// a light fill under the lines.
// The program icon app, the caption glyphs win-*, the message box icons
// msg-* and the padlock lock complete the set.
// The function icon() picks the classic drawing from icons-classic.js when
// the classic look is active and falls back to the other set when a key is
// missing in one of them.

import { CLASSIC_ICONS } from './icons-classic.js';

const svg = (body, size = 24, grid = 24) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${grid} ${grid}" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

// The tint is a light fill in the colour of a body of version 1.3 that lies
// under the lines.
const tint = (colour, opacity = 0.25) => `fill="${colour}" fill-opacity="${opacity}" stroke="none"`;

const BODY = {
  kugel: '#e03131',
  kegel: '#f5b700',
  zylinder: '#2f9e44',
  wuerfel: '#1c7ed6',
  quader: '#9c36b5',
  pyramide: '#0c8599',
  prisma: '#a0522d',
  disc: '#868e96',
  ebene: '#5c7cab',
};

const SHAPES = {
  SPHERE: '<circle cx="12" cy="12" r="8"/><ellipse cx="12" cy="12" rx="8" ry="3" stroke-dasharray="2 2"/>',
  CONE: '<path d="M12 3 4.5 18.5M12 3l7.5 15.5"/><ellipse cx="12" cy="18.5" rx="7.5" ry="2.5"/>',
  CYLINDER: '<ellipse cx="12" cy="5.5" rx="7" ry="2.5"/><path d="M5 5.5v13M19 5.5v13"/><path d="M5 18.5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/>',
  CUBE: '<path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="m4 7 8 4 8-4M12 11v10"/>',
  CUBOID: '<path d="M9 4 2.5 7.5v8L9 19l12.5-4v-8L15 4z"/><path d="m2.5 7.5 6.5 3.5 12.5-4M9 11v8"/>',
  PYRAMID: '<path d="M12 3 3 17l7 4 11-5z"/><path d="m12 3-2 18"/>',
  PRISM: '<path d="M3 19 8.5 8.5l9-4L23 15l-9 4z"/><path d="M8.5 8.5 14 19"/><path d="m3 19 9-4 5.5-10.5M12 15h11" stroke-opacity=".45" stroke-dasharray="1.5 2"/>',
  DISC: '<ellipse cx="12" cy="12" rx="9" ry="4.5"/><ellipse cx="12" cy="12" rx="3.5" ry="1.7"/>',
};

// The silhouettes of the bodies take the light tint.
const SILHOUETTES = {
  kugel: '<circle cx="12" cy="12" r="8"/>',
  kegel: '<path d="M12 3 4.5 18.5a7.5 2.5 0 0 0 15 0z"/>',
  zylinder: '<path d="M5 5.5a7 2.5 0 0 1 14 0v13a7 2.5 0 0 1-14 0z"/>',
  wuerfel: '<path d="M12 3 4 7v10l8 4 8-4V7z"/>',
  quader: '<path d="M9 4 2.5 7.5v8L9 19l12.5-4v-8L15 4z"/>',
  pyramide: '<path d="M12 3 3 17l7 4 11-5z"/>',
  prisma: '<path d="M3 19 8.5 8.5l9-4L23 15l-9 4z"/>',
  disc: '<path fill-rule="evenodd" d="M3 11a9 4.5 0 1 0 18 0 9 4.5 0 1 0-18 0zm5.5 0a3.5 1.7 0 1 0 7 0 3.5 1.7 0 1 0-7 0z"/><path d="M3 11v2c0 2.5 4 4.5 9 4.5s9-2 9-4.5v-2c0 2.5-4 4.5-9 4.5S3 13.5 3 11z"/>',
  ebene: '<path d="M2.5 17 8 7.5h13.5L16 17z"/>',
};

const BODY_LINES = {
  kugel: SHAPES.SPHERE,
  kegel: SHAPES.CONE,
  zylinder: SHAPES.CYLINDER,
  wuerfel: SHAPES.CUBE,
  quader: SHAPES.CUBOID,
  pyramide: SHAPES.PYRAMID,
  prisma: SHAPES.PRISM,
  disc: '<ellipse cx="12" cy="11" rx="9" ry="4.5"/><ellipse cx="12" cy="11" rx="3.5" ry="1.7"/><path d="M3 11v2c0 2.5 4 4.5 9 4.5s9-2 9-4.5v-2"/>',
  ebene: '<path d="M2.5 17 8 7.5h13.5L16 17z"/><path d="M5.25 12.25h13.5M14.75 7.5 9.25 17" stroke-opacity=".45" stroke-width="1.2"/>',
};

const body = (name) => {
  const tinted = SILHOUETTES[name].replace(/<path /g, `<path ${tint(BODY[name])} `).replace('<circle ', `<circle ${tint(BODY[name])} `);
  return svg(tinted + BODY_LINES[name]);
};

// The program motif shows a torus, a cube and a cone in the colours of the
// program icon of 1.3, with lines strong enough for 16 and 28 pixels.
const APP =
  '<path fill="#1c7ed6" fill-rule="evenodd" d="M2.5 6.8a5 3.3 0 1 0 10 0 5 3.3 0 1 0-10 0zm2.8-.4a2.2 1.1 0 1 0 4.4 0 2.2 1.1 0 1 0-4.4 0z"/>' +
  '<path fill="#ff6b6b" d="M7 12.6 10.9 14.8 7 17 3.1 14.8z"/><path fill="#e03131" d="M3.1 14.8 7 17v4.4l-3.9-2.2z"/><path fill="#a61e1e" d="M10.9 14.8 7 17v4.4l3.9-2.2z"/>' +
  '<path fill="#40c057" d="M17.5 2.8 13.2 19a4.3 1.6 0 0 0 4.3 1.6z"/><path fill="#2b8a3e" d="M17.5 2.8 21.8 19a4.3 1.6 0 0 1-4.3 1.6z"/>' +
  '<ellipse cx="7.5" cy="6.8" rx="5" ry="3.3"/><ellipse cx="7.5" cy="6.4" rx="2.2" ry="1.1"/>' +
  '<path d="M7 12.6 10.9 14.8v4.4L7 21.4l-3.9-2.2v-4.4zM3.1 14.8 7 17l3.9-2.2M7 17v4.4"/>' +
  '<path d="M17.5 2.8 13.2 19M17.5 2.8 21.8 19"/><path d="M13.2 19a4.3 1.6 0 0 0 8.6 0"/>';

const UNDO = '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>';
const REDO = '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>';
const HELP = '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/>';

export const ICONS = {
  SPHERE: svg(SHAPES.SPHERE),
  CONE: svg(SHAPES.CONE),
  CYLINDER: svg(SHAPES.CYLINDER),
  CUBE: svg(SHAPES.CUBE),
  CUBOID: svg(SHAPES.CUBOID),
  PYRAMID: svg(SHAPES.PYRAMID),
  PRISM: svg(SHAPES.PRISM),
  DISC: svg(SHAPES.DISC),
  UNION: svg('<path d="M9.5 5.5a6.5 6.5 0 1 0 2.5 12.5 6.5 6.5 0 1 0 0-12 6.5 6.5 0 0 0-2.5-.5z" fill="currentColor" fill-opacity=".18"/>'),
  DIFFERENCE: svg('<circle cx="9" cy="12" r="6.5" fill="currentColor" fill-opacity=".18"/><circle cx="15" cy="12" r="6.5" stroke-dasharray="2 2"/>'),
  INTERSECTION: svg('<circle cx="9" cy="12" r="6.5" stroke-dasharray="2 2"/><circle cx="15" cy="12" r="6.5" stroke-dasharray="2 2"/><path d="M12 6.3a6.5 6.5 0 0 1 0 11.4 6.5 6.5 0 0 1 0-11.4z" fill="currentColor" fill-opacity=".35"/>'),
  MERGE: svg('<circle cx="9" cy="12" r="6.5" fill="currentColor" fill-opacity=".18"/><circle cx="15" cy="12" r="6.5" fill="currentColor" fill-opacity=".18"/>'),
  undo: svg(UNDO),
  redo: svg(REDO),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  ray: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>'),
  fit: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><rect x="9" y="9" width="6" height="6" rx="1"/>'),
  expand: svg('<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>'),
  shrink: svg('<path d="M4 14h6v6M20 10h-6V4M10 14l-7 7M14 10l7-7"/>'),
  download: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  upload: svg('<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>'),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  help: svg(HELP),
  file: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
  folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),

  // The tool bar F3 of version 1.3 follows with its buttons 1 to 13.
  // Button 1 Position shows an arrow cursor and a text cursor.
  'tool-1': svg('<path d="M4 3v14l3.5-3.2 2.3 5.2 2.3-1-2.3-5.1H14.5z"/><path d="M17 5h4M17 19h4M19 5v14"/>'),
  // Button 2 Körper einfügen shows a torus, a cube and a cone.
  'tool-2': svg(
    '<ellipse cx="7.5" cy="6.8" rx="5" ry="3.3"/><ellipse cx="7.5" cy="6.4" rx="2.2" ry="1.1"/>' +
      '<path d="M7 12.6 10.9 14.8v4.4L7 21.4l-3.9-2.2v-4.4zM3.1 14.8 7 17l3.9-2.2M7 17v4.4"/>' +
      '<path d="M17.5 2.8 13.2 19M17.5 2.8 21.8 19"/><ellipse cx="17.5" cy="19" rx="4.3" ry="1.6"/>',
  ),
  // Button 3 Bearbeiten shows a hammer crossed with a saw.
  'tool-3': svg(
    '<path d="M7.6 1.9 10.1 4.4 4.4 10.1 1.9 7.6z"/><path d="m7.3 7.3 2.5 2.5M15.6 15.6l4.9 4.9"/>' +
      '<path d="M18.5 9.5 18.2 11.3 16.4 11.4 16.1 13.2 14.3 13.3 14 15.1 12.3 15.3 12 17 10.2 17.2 9.9 18.9 8.1 19.1 7.8 20.9 6 21 3 18 15.5 6.5z" fill="currentColor" fill-opacity=".12"/>' +
      '<path d="M15.5 6.5 19 3h1.5A1.5 1.5 0 0 1 22 4.5V6l-3.5 3.5M18.2 6.6l1.6-1.6"/>',
  ),
  // Button 4 Farbe ändern shows a painter's palette with three colours.
  'tool-4': svg(
    '<path d="M12 3a9 9 0 0 0 0 18c1.1 0 2-.8 2-1.9 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3z"/>' +
      '<circle cx="7.5" cy="11.5" r="1.4" fill="#e03131" stroke="none"/><circle cx="10" cy="7.3" r="1.4" fill="#f5b700" stroke="none"/><circle cx="15" cy="7.3" r="1.4" fill="#1c7ed6" stroke="none"/>',
  ),
  // Button 5 Raytrace shows a ray from a light that falls on a sphere.
  'tool-5': svg(
    '<circle cx="14.5" cy="14.5" r="6.5"/><path d="M11.4 12.6a3.6 3.6 0 0 1 2.4-1.9"/>' +
      '<circle cx="4.5" cy="4.5" r="1.6"/><path d="M4.5 1v.4M1 4.5h.4M2 2l.3.3M7 7l3.3 3.3M10.4 8.3v2.1H8.3"/>',
  ),
  // Button 6 3D-Zoom shows a magnifier over a cube.
  'tool-6': svg(
    '<circle cx="10" cy="10" r="6.8"/><path d="m15 15 5.5 5.5"/>' +
      '<path d="M10 6.6 13 8.3v3.4L10 13.4 7 11.7V8.3zM7 8.3 10 10l3-1.7M10 10v3.4"/>',
  ),
  // Button 7 Ausgabe shows a floppy disk.
  'tool-7': svg('<path d="M5 3h11l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a1 1 0 0 1 1-1z"/><path d="M8 3v5h7V3M7.5 21v-6h9v6"/>'),
  // Button 8 Beenden shows an open door and an arrow that leaves.
  'tool-8': svg('<path d="M13 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v17M13 16v5H3"/><path d="M3 3.4 8.5 5.5v16.3L3 21"/><path d="M6.8 13v.01M11 12h10.5M18.5 9l3 3-3 3"/>'),
  // Button 9 Dia-Show shows a framed landscape picture.
  'tool-9': svg('<rect x="2.5" y="3.5" width="19" height="17" rx="1.5"/><rect x="5.5" y="6.5" width="13" height="11"/><path d="m5.5 16 4-4.5 3 3 2-2 4 4"/><circle cx="15" cy="9.5" r="1.1"/>'),
  // Buttons 10 Rückgängig and 11 Wiederholen show the undo and redo arrows.
  'tool-10': svg(UNDO),
  'tool-11': svg(REDO),
  // Button 12 Darstellung modern oder klassisch shows a monitor with a split
  // screen.
  'tool-12': svg('<path d="M12 4H4.5A1.5 1.5 0 0 0 3 5.5v9A1.5 1.5 0 0 0 4.5 16H12z" fill="currentColor" fill-opacity=".3" stroke="none"/><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 4v12M9 20.5h6M12 16v4.5"/>'),
  // Button 13 Hilfe shows a question mark in a circle.
  'tool-13': svg(HELP),

  // The body bar F2 of version 1.3 follows.
  'body-kugel': body('kugel'),
  'body-kegel': body('kegel'),
  'body-zylinder': body('zylinder'),
  'body-wuerfel': body('wuerfel'),
  'body-quader': body('quader'),
  'body-pyramide': body('pyramide'),
  'body-prisma': body('prisma'),
  'body-disc': body('disc'),
  'body-ebene': body('ebene'),

  // The program icon comes at 24 pixels and as a 16 pixel variant.
  app: svg(APP),
  'app-16': svg(APP, 16),

  // The glyphs of the caption buttons sit on a grid of 16.
  'win-close': svg('<path d="m4 4 8 8M12 4l-8 8"/>', 16, 16),
  'win-min': svg('<path d="M4 12h8"/>', 16, 16),
  'win-max': svg('<rect x="3.5" y="3.5" width="9" height="9" rx="1.5"/>', 16, 16),
  'win-help': svg('<path d="M5.8 6a2.2 2.2 0 1 1 3.1 2c-.5.2-.9.7-.9 1.3v.7M8 12.5v.01"/>', 16, 16),

  // The message box icons sit on a grid of 32 as filled discs with white
  // signs.
  'msg-question': svg('<circle cx="16" cy="16" r="14" fill="#1c7ed6" stroke="none"/><path d="M12.2 12.5a4 4 0 1 1 5.5 3.7c-1 .4-1.7 1.4-1.7 2.5v.8M16 23.5v.01" stroke="#fff" stroke-width="3"/>', 32, 32),
  'msg-info': svg('<circle cx="16" cy="16" r="14" fill="#1c7ed6" stroke="none"/><path d="M16 14.5v9M16 9v.01" stroke="#fff" stroke-width="3"/>', 32, 32),
  'msg-critical': svg('<circle cx="16" cy="16" r="14" fill="#e03131" stroke="none"/><path d="m11 11 10 10M21 11 11 21" stroke="#fff" stroke-width="3"/>', 32, 32),

  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3M12 15v2"/>'),
};

// The function returns the SVG of an icon for the given look. The classic look
// takes the pixel drawing of icons-classic.js and any other look the line
// icon. When a key exists in only one set, that set answers, and an unknown
// key gives an empty string.
export function icon(name, look) {
  if (look === 'classic') return CLASSIC_ICONS[name] ?? ICONS[name] ?? '';
  return ICONS[name] ?? CLASSIC_ICONS[name] ?? '';
}
