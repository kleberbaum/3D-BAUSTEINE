// SPDX-License-Identifier: GPL-2.0-only
//
// The file icons-classic.js of 3D-Bausteine holds the classic icon set, which
// recreates the look of the Windows 98 tool bars of 3D-Baukasten 1.3 as new
// pixel art.
// Every drawing is described below as a few shapes on a pixel grid. A small
// rasteriser samples each shape at the pixel centres, so the result is a grid
// of whole pixels that only uses the sixteen colours of the VGA palette.
// Shading uses a checkerboard of two palette colours, resolved to single
// pixels, so no icon needs a pattern id or a gradient and several copies of
// one icon can share a page.
// The output of every drawing is a string that holds a complete SVG element
// made of one path per colour with integer coordinates and crisp edges.
// The keys follow the modern set in icons.js. The keys tool-1 to tool-13 name
// the tool bar F3, the body-* keys the body bar F2, app and app-16 the program
// icon, win-* the caption buttons, msg-* the message boxes, and lock names the
// padlock.

// Each of the sixteen colours of the VGA palette has one letter. A paint of one
// letter is a solid colour, a paint of two letters is a checkerboard of both,
// and a dot leaves the pixel transparent.
const VGA = {
  k: '#000000', m: '#800000', g: '#008000', o: '#808000',
  n: '#000080', p: '#800080', t: '#008080', s: '#c0c0c0',
  d: '#808080', r: '#ff0000', l: '#00ff00', y: '#ffff00',
  b: '#0000ff', f: '#ff00ff', c: '#00ffff', w: '#ffffff',
};

// Shapes are tests on pixel indices. A pixel belongs to a shape when its
// centre lies inside the outline that the integer coordinates describe.
const rect = (x, y, w, h) => (px, py) => px >= x && px < x + w && py >= y && py < y + h;

const poly = (...pts) => (px, py) => {
  const X = px + 0.5;
  const Y = py + 0.5;
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const [xi, yi, xj, yj] = [pts[i], pts[i + 1], pts[j], pts[j + 1]];
    if ((yi > Y) !== (yj > Y) && X < ((xj - xi) * (Y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const ellipse = (cx, cy, rx, ry = rx) => (px, py) =>
  ((px + 0.5 - cx) / rx) ** 2 + ((py + 0.5 - cy) / ry) ** 2 <= 1;

// A band is a straight stroke of the given width between two points. The
// handles, the blades and the strokes of glyphs use it.
const band = (x0, y0, x1, y1, w) => {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ox = (-(y1 - y0) / len) * (w / 2);
  const oy = ((x1 - x0) / len) * (w / 2);
  return poly(x0 + ox, y0 + oy, x1 + ox, y1 + oy, x1 - ox, y1 - oy, x0 - ox, y0 - oy);
};

const or = (...s) => (x, y) => s.some((f) => f(x, y));
const and = (...s) => (x, y) => s.every((f) => f(x, y));
const not = (s) => (x, y) => !s(x, y);

const clamp = (v) => Math.min(1, Math.max(0, v));

// A ramp picks a paint from a row of colours ordered from light to dark. The
// value runs from 0 to 1 and every second step between two colours is their
// checkerboard, so a smooth light turns into bands of solid and dithered
// pixels as a 16 colour renderer would have drawn it.
const ramp = (levels, v) => {
  const steps = (levels.length - 1) * 2;
  const i = Math.round(clamp(v) * steps);
  return i % 2 === 0 ? levels[i / 2] : levels[(i - 1) / 2] + levels[(i + 1) / 2];
};

// The light comes from the upper left and a little from the front.
const LIGHT = (() => {
  const v = [-0.55, -0.62, 0.56];
  const n = Math.hypot(...v);
  return v.map((c) => c / n);
})();

// The shading of a sphere follows the diffuse light along the ramp and puts a
// white spot where the reflection of the light lands.
const sphereLight = (cx, cy, r, levels, spot = 0.965, bias = 1) => (x, y) => {
  const nx = (x + 0.5 - cx) / r;
  const ny = (y + 0.5 - cy) / r;
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  const d = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
  if (d > spot) return 'w';
  if (d > spot - 0.03) return 'w' + levels[0];
  return ramp(levels, (1 - d) ** bias);
};

// The shading of an upright surface of revolution such as a cylinder or a
// cone depends on the horizontal position across the body. The
// half width may vary with the row, which gives the narrowing of a cone.
const roundLight = (cx, halfWidth, levels, tilt = 0) => (x, y) => {
  const hw = typeof halfWidth === 'function' ? halfWidth(y) : halfWidth;
  const nx = Math.max(-1, Math.min(1, (x + 0.5 - cx) / Math.max(hw, 0.5)));
  const nz = Math.sqrt(1 - nx * nx);
  const d = Math.max(0, (nx * LIGHT[0] + nz * LIGHT[2]) * (1 - tilt) - LIGHT[1] * tilt);
  return ramp(levels, 1 - d * 1.15);
};

// The painter collects pixels on a square grid and hands out the drawing
// operations that the icons below use.
function painter(size) {
  const px = new Array(size * size).fill('');
  const paintAt = (paint, x, y) => {
    const p = typeof paint === 'function' ? paint(x, y) : paint;
    if (!p) return null;
    return p.length === 1 ? p : p[(x + y) % 2];
  };
  const put = (x, y, paint) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const c = paintAt(paint, x, y);
    if (c !== null) px[y * size + x] = c === '.' ? '' : c;
  };
  const each = (fn) => {
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) fn(x, y);
  };
  // The sampler stores a shape once in a grid, so that the edge tests below
  // look up neighbours without calling the shape again.
  const sample = (shape) => {
    const m = new Uint8Array(size * size);
    each((x, y) => { m[y * size + x] = shape(x, y) ? 1 : 0; });
    return (x, y) => x >= 0 && y >= 0 && x < size && y < size && m[y * size + x] === 1;
  };
  const DIRS = { l: [-1, 0], r: [1, 0], t: [0, -1], b: [0, 1] };
  const g = {
    size,
    fill(shape, paint) {
      each((x, y) => shape(x, y) && put(x, y, paint));
    },
    // The inner edge paints the pixels of the shape that have a neighbour
    // outside it on one of the given sides (left, top, right, bottom).
    edge(shape, paint, sides = 'ltrb') {
      const inside = sample(shape);
      const marks = [];
      each((x, y) => {
        if (!inside(x, y)) return;
        for (const s of sides) {
          const [dx, dy] = DIRS[s];
          if (!inside(x + dx, y + dy)) {
            marks.push([x, y]);
            break;
          }
        }
      });
      for (const [x, y] of marks) put(x, y, paint);
    },
    // The outer edge paints the pixels just outside the shape on the given
    // sides.
    halo(shape, paint, sides = 'ltrb') {
      const inside = sample(shape);
      const marks = [];
      each((x, y) => {
        if (inside(x, y)) return;
        for (const s of sides) {
          const [dx, dy] = DIRS[s];
          if (inside(x - dx, y - dy)) {
            marks.push([x, y]);
            break;
          }
        }
      });
      for (const [x, y] of marks) put(x, y, paint);
    },
    rect(x, y, w, h, paint) {
      for (let j = y; j < y + h; j += 1) for (let i = x; i < x + w; i += 1) put(i, j, paint);
    },
    dot(x, y, paint) {
      put(x, y, paint);
    },
    // A line runs as single pixels between two pixel indices.
    line(x0, y0, x1, y1, paint) {
      const dx = Math.abs(x1 - x0);
      const dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        put(x0, y0, paint);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    },
    // A bitmap glyph is a list of rows in which any letter is a pixel in the
    // given paint and a dot leaves the pixel alone.
    glyph(x, y, rows, paint) {
      rows.forEach((row, j) => {
        for (let i = 0; i < row.length; i += 1) if (row[i] !== '.') put(x + i, y + j, paint);
      });
    },
    // The bevel draws raised and sunken frames in the manner of Windows 98.
    bevel(x, y, w, h, light, dark) {
      g.rect(x, y, w, 1, light);
      g.rect(x, y, 1, h, light);
      g.rect(x, y + h - 1, w, 1, dark);
      g.rect(x + w - 1, y, 1, h, dark);
    },
    flipX() {
      for (let y = 0; y < size; y += 1) {
        const row = px.slice(y * size, y * size + size).reverse();
        for (let x = 0; x < size; x += 1) px[y * size + x] = row[x];
      }
    },
    pixels: px,
  };
  return g;
}

// This function turns the pixel grid into one path per colour, and each run
// of pixels in a row becomes a rectangle with integer corners.
function toSvg(size, px, width) {
  const runs = {};
  for (let y = 0; y < size; y += 1) {
    let x = 0;
    while (x < size) {
      const c = px[y * size + x];
      let end = x + 1;
      while (end < size && px[y * size + end] === c) end += 1;
      if (c) (runs[c] ||= []).push(`M${x} ${y}h${end - x}v1h${x - end}z`);
      x = end;
    }
  }
  const paths = Object.keys(VGA)
    .filter((c) => runs[c])
    .map((c) => `<path fill="${VGA[c]}" d="${runs[c].join('')}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${width}" height="${width}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${paths}</svg>`;
}

// A drawing is kept as a recipe and rendered the first time its key is read,
// so a page in the modern look never spends time on the classic pixels.
const draw = (size, fn, width = size) => () => {
  const g = painter(size);
  fn(g);
  return toSvg(size, g.pixels, width);
};

// This function turns a table of recipes into a frozen table of strings that
// renders each entry once, on first use.
const lazy = (recipes) => {
  const table = {};
  for (const [key, recipe] of Object.entries(recipes)) {
    let svg;
    Object.defineProperty(table, key, { enumerable: true, get: () => (svg ??= recipe()) });
  }
  return Object.freeze(table);
};

// The program motif shows a torus, a cube and a cone. The 32 pixel drawing
// serves as the tool button "Körper einfügen" and as the program icon, as
// Form1.Icon and the second tool button were one picture in version 1.3.
function bodiesMotif(g) {
  // The torus at the upper left, seen from above and in front. The light
  // falls on the upper left of the ring and on the far wall inside the hole.
  const outer = ellipse(10, 8.5, 8, 6.2);
  const hole = ellipse(10.5, 8, 3.4, 1.9);
  const ring = and(outer, not(hole));
  g.fill(ring, (x, y) => {
    const t = ((x + 0.5 - 10) / 8 + (y + 0.5 - 8.5) / 6.2) / 2;
    return ramp('bbnk', 0.2 + t * 0.95);
  });
  g.edge(outer, 'k');
  g.rect(5, 4, 3, 1, 'w');
  g.dot(4, 5, 'w');
  g.fill(hole, '.');
  g.halo(hole, 'n', 'lt');
  g.halo(hole, 'w', 'r');
  g.halo(hole, 'c', 'b');

  // The cube stands at the lower left, a little turned to the right.
  const front = rect(2, 19, 9, 10);
  const top = poly(2, 19, 6, 15, 15, 15, 11, 19);
  const side = poly(11, 19, 15, 15, 15, 25, 11, 29);
  g.fill(top, 'r');
  g.fill(front, 'rm');
  g.fill(side, 'm');
  g.rect(9, 16, 2, 1, 'w');
  g.edge(or(front, top, side), 'k');

  // The cone at the right is light green where the light falls and dark green
  // on the far side, with a white gleam and a black outline.
  const cone = or(poly(24, 2, 17.6, 27.5, 30.4, 27.5), ellipse(24, 27.5, 6.4, 2.6));
  g.fill(cone, (x, y) => {
    const hw = Math.max(0.6, ((y + 0.5 - 2) / 25.5) * 6.4);
    const u = (x + 0.5 - 24) / hw;
    if (u < -0.62) return 'l';
    if (u < -0.32) return y > 8 && y < 26 ? 'w' : 'l';
    if (u < -0.12) return y > 9 && y < 25 ? 'lw' : 'l';
    if (u < 0.12) return 'l';
    if (u < 0.38) return 'lg';
    if (u < 0.8) return 'g';
    return 'gk';
  });
  g.edge(cone, 'k');
}

function bodiesMotif16(g) {
  const outer = ellipse(5, 4.5, 4.4, 3.4);
  const hole = rect(5, 4, 1, 1);
  g.fill(outer, (x, y) => (x + y > 10 ? 'n' : 'b'));
  g.dot(3, 3, 'w');
  g.fill(hole, '.');
  g.halo(outer, 'k', 'rb');
  g.edge(outer, 'k', 'lt');
  const front = rect(0, 10, 5, 5);
  const top = poly(0, 10, 2, 8, 7, 8, 5, 10);
  const side = poly(5, 10, 7, 8, 7, 13, 5, 15);
  g.fill(top, 'r');
  g.fill(front, 'r');
  g.fill(side, 'm');
  g.edge(or(front, top, side), 'k');
  const cone = poly(12, 0, 8.5, 15.5, 15.5, 15.5);
  g.fill(cone, (x) => (x < 12 ? 'l' : 'g'));
  g.edge(cone, 'k');
}

// The body bar renders stand on two kinds of floor. The round bodies have a
// blue sky over a navy floor and the angular ones a grey room with a
// chequered floor.
function blueScene(g, horizon = 15) {
  g.rect(0, 0, 32, horizon, 'b');
  g.rect(0, horizon, 32, 2, 'bn');
  g.rect(0, horizon + 2, 32, 32 - horizon - 2, 'n');
}

function roomScene(g, floor = 20) {
  g.rect(0, 0, 11, floor, 'd');
  g.rect(11, 0, 3, floor, 'ds');
  g.rect(14, 0, 6, floor, 's');
  g.rect(20, 0, 3, floor, 'sw');
  g.rect(23, 0, 9, floor, 'w');
  // A chequered floor whose squares grow towards the front, centred on the
  // middle of the picture so that the rows converge as in a perspective.
  const bands = [
    [1, 1, 'd', 's'], [1, 1, 's', 'd'], [2, 2, 'k', 's'], [2, 2, 'k', 's'],
    [2, 3, 'k', 'w'], [3, 3, 'k', 'w'], [3, 4, 'k', 'w'], [4, 4, 'k', 'w'],
  ];
  for (let y = floor, row = 0; y < 32; row += 1) {
    const [h, w, a, b] = bands[Math.min(row, bands.length - 1)];
    for (let j = y; j < Math.min(32, y + h); j += 1) {
      for (let x = 0; x < 32; x += 1) {
        const cell = Math.floor((x - 16) / w) + row;
        g.dot(x, j, ((cell % 2) + 2) % 2 ? a : b);
      }
    }
    y += h;
  }
}

// A soft shadow lies on the floor under a body.
const floorShadow = (g, cx, cy, rx, ry, paint = 'nk') => g.fill(ellipse(cx, cy, rx, ry), paint);

// The curved arrow of Rückgängig points to the left. Wiederholen is the same
// drawing mirrored.
function undoArrow(g) {
  const head = poly(1, 10, 11, 1, 11, 19);
  const upper = rect(10, 7, 10, 6);
  const arc = and(ellipse(19.5, 17, 10.5, 10), not(ellipse(19.5, 17, 4.5, 4)), (x) => x >= 19);
  const lower = rect(11, 21, 9, 6);
  const arrow = or(head, upper, arc, lower);
  g.fill(arrow, 'b');
  g.fill(and(arrow, (x, y) => y >= 17 || (x >= 19 && (x - 19.5) > 17 - y)), 'bn');
  g.fill(and(arrow, (x, y) => y >= 24 || (x >= 26 && y >= 19)), 'n');
  g.edge(arrow, 'c', 'tl');
  g.halo(arrow, 'k');
  g.halo(or(arrow, (x, y) => false), 'd', 'rb');
  g.edge(arrow, 'k', 'rb');
}

// The help button and the message boxes share this thick question mark.
const QUESTION = [
  '..XXXXX..',
  '.XXXXXXX.',
  'XXX...XXX',
  'XXX...XXX',
  '.....XXX.',
  '....XXX..',
  '...XXX...',
  '...XXX...',
  '.........',
  '...XXX...',
  '...XXX...',
];

export const CLASSIC_ICONS = lazy({
  // The button tool-1 Position shows an arrow cursor next to a text cursor.
  'tool-1': draw(32, (g) => {
    const arrow = poly(2, 1, 2, 23, 7, 18, 11, 26, 14, 25, 10, 17, 17, 17);
    g.fill(arrow, 'w');
    g.edge(arrow, 'k');
    const beam = or(rect(20, 3, 9, 2), rect(20, 27, 9, 2), rect(23, 5, 3, 22));
    g.fill(beam, 'd');
    g.edge(beam, 'k', 'ltrb');
    g.rect(24, 5, 1, 22, 'd');
  }),

  // The button tool-2 Körper einfügen shows the torus, cube and cone of the
  // program icon.
  'tool-2': draw(32, bodiesMotif),

  // The button tool-3 Bearbeiten shows a hammer crossed with a saw.
  'tool-3': draw(32, (g) => {
    const blade = poly(1.5, 25.5, 18.5, 8.5, 25, 15, 8, 32);
    g.fill(blade, 'w');
    g.fill(and(blade, (x, y) => x + y === 32), 'd');
    g.fill(and(blade, (x, y) => x + y >= 37), 's');
    g.edge(blade, 'k');
    g.halo(blade, (x) => (x % 2 === 0 ? 'k' : ''), 'rb');
    const grip = poly(17, 7, 22, 1, 29, 1, 31, 3, 31, 10, 27, 14, 23, 14);
    const gripHole = rect(23, 5, 4, 4);
    g.fill(grip, 'r');
    g.edge(grip, 'm', 'rb');
    g.edge(grip, 'k');
    g.fill(gripHole, '.');
    g.halo(gripHole, 'k');
    g.rect(20, 9, 2, 2, 'o');
    g.rect(28, 10, 2, 2, 'o');
    const handle = band(7, 7, 25, 25, 3.6);
    g.fill(handle, (x, y) => (x - y > 0 ? 'g' : 't'));
    g.fill(handle, 't');
    g.edge(handle, 'k');
    const head = band(1.5, 10.5, 10.5, 1.5, 5.8);
    g.fill(head, 'd');
    g.edge(head, 'w', 'lt');
    g.edge(head, 'k');
    g.fill(and(head, (x, y) => y <= 3 && x <= 10 && x >= 7 && x - y >= 6), '.');
  }),

  // The button tool-4 Farbe ändern shows three paint bottles upside down that
  // pour magenta, yellow and cyan.
  'tool-4': draw(32, (g) => {
    [
      [0, 'f', 'p'],
      [11, 'y', 'o'],
      [22, 'c', 't'],
    ].forEach(([x0, pure, dark]) => {
      const pour = poly(
        x0 + 3, 13, x0 + 7, 13, x0 + 7, 17, x0 + 9, 21, x0 + 10, 26, x0 + 10, 32,
        x0, 32, x0, 26, x0 + 2, 22, x0 + 3, 18,
      );
      g.fill(pour, (x) => (x >= x0 + 7 ? dark : pure));
      g.fill(and(pour, (x) => x === x0 + 6 || x === x0 + 7), pure + dark);
      g.edge(pour, 'k', 'lr');
      g.rect(x0 + 2, 22, 1, 3, 'w');
      g.rect(x0 + 1, 1, 8, 6, pure);
      g.rect(x0 + 6, 1, 3, 6, dark);
      g.rect(x0 + 2, 2, 2, 2, 'w');
      g.edge(rect(x0 + 1, 0, 8, 7), 'k', 'ltr');
      g.rect(x0, 7, 10, 4, 's');
      g.rect(x0 + 1, 7, 8, 1, 'w');
      g.edge(rect(x0, 7, 10, 4), 'k');
      g.rect(x0 + 3, 8, 1, 2, 'k');
      g.rect(x0 + 6, 8, 1, 2, 'k');
      g.rect(x0 + 2, 11, 6, 2, 'w');
      g.edge(rect(x0 + 2, 11, 6, 2), 'k', 'lr');
    });
  }),

  // The button tool-5 Raytrace shows a small window with a rendered cube and
  // sphere.
  'tool-5': draw(32, (g) => {
    g.rect(1, 1, 30, 30, 's');
    g.bevel(1, 1, 30, 30, 'w', 'k');
    g.bevel(2, 2, 28, 28, 's', 'd');
    g.rect(3, 3, 26, 6, 'n');
    g.rect(4, 4, 2, 2, 'r');
    g.rect(6, 4, 2, 2, 'l');
    g.rect(4, 6, 2, 2, 'b');
    g.rect(6, 6, 2, 2, 'y');
    [18, 21, 25].forEach((x) => {
      g.rect(x, 4, 3, 4, 's');
      g.dot(x + 1, 6, 'k');
    });
    g.rect(3, 10, 26, 19, 'w');
    g.rect(3, 10, 26, 1, 'd');
    g.rect(3, 10, 1, 19, 'd');
    // The cube casts a grey shadow on the white client area.
    const front = rect(16, 15, 7, 7);
    const top = poly(16, 15, 19, 12, 26, 12, 23, 15);
    const side = poly(23, 15, 26, 12, 26, 19, 23, 22);
    g.fill(poly(17, 22, 23, 22, 28, 19, 28, 22, 24, 24, 18, 24), 's');
    g.fill(front, 'l');
    g.fill(top, 'lw');
    g.fill(side, 'g');
    g.edge(or(front, top, side), 'k');
    // The sphere casts its shadow in front of the cube.
    g.fill(ellipse(12.5, 26.5, 6, 1.6), 's');
    const ball = ellipse(11.5, 21, 5.6);
    g.fill(ball, sphereLight(11.5, 21, 5.6, 'rrm', 0.93, 1.3));
    g.edge(ball, 'k');
  }),

  // The button tool-6 3D-Zoom shows a raised panel with a grid of cells, as in
  // version 1.3.
  'tool-6': draw(32, (g) => {
    g.rect(1, 1, 30, 30, 'k');
    g.rect(2, 2, 28, 28, 's');
    g.bevel(2, 2, 28, 28, 'w', 'd');
    g.bevel(3, 3, 26, 26, 's', 'd');
    g.rect(5, 7, 23, 18, 'k');
    g.rect(5, 25, 23, 1, 'w');
    g.rect(28, 7, 1, 19, 'w');
    for (const y of [9, 12, 15, 18, 21]) {
      for (const x of [7, 12, 17, 22]) g.rect(x, y, 4, 2, 's');
    }
  }),

  // The button tool-7 Ausgabe shows a floppy disk.
  'tool-7': draw(32, (g) => {
    const body = poly(1, 1, 26, 1, 29, 4, 29, 29, 1, 29);
    g.fill(poly(3, 3, 28, 3, 31, 6, 31, 31, 3, 31), 'k');
    g.fill(body, 't');
    g.edge(body, 'k');
    g.rect(5, 1, 18, 12, 't');
    g.rect(5, 1, 1, 12, 'k');
    g.rect(22, 1, 1, 12, 'c');
    g.rect(5, 12, 18, 1, 'c');
    g.rect(2, 2, 2, 2, 'k');
    g.rect(26, 4, 2, 2, 'k');
    const shutter = rect(9, 18, 15, 11);
    g.fill(shutter, 's');
    g.edge(shutter, 'k', 'ltr');
    g.rect(10, 19, 13, 1, 'w');
    const slot = rect(12, 21, 5, 7);
    g.fill(slot, 't');
    g.edge(slot, 'k');
    g.rect(13, 22, 1, 5, 'c');
    g.rect(21, 20, 1, 8, 'c');
  }),

  // The button tool-8 Beenden shows an arrow that walks through an open door.
  'tool-8': draw(32, (g) => {
    g.fill(rect(0, 25, 32, 7), 'sw');
    g.rect(0, 24, 13, 1, 'k');
    const opening = rect(12, 2, 13, 23);
    g.fill(opening, 'd');
    g.edge(opening, 'k', 'lt');
    g.rect(13, 3, 1, 21, 'k');
    const arrow = or(rect(1, 12, 11, 6), poly(11, 6.5, 19.5, 15, 11, 23.5));
    g.fill(arrow, 'c');
    g.fill(and(arrow, (x, y) => y >= 16 || x + y >= 34 && x > 11), 't');
    g.edge(arrow, 'w', 't');
    g.edge(arrow, 'k');
    const leaf = poly(19, 7, 25, 1, 25, 26, 19, 32);
    g.fill(leaf, 'c');
    g.fill(and(leaf, (x) => x >= 23), 't');
    g.edge(leaf, 'k');
    g.rect(20, 16, 2, 3, 'w');
    g.rect(20, 16, 1, 3, 'k');
    g.halo(leaf, 'd', 'r');
  }),

  // The button tool-9 Dia-Show shows a framed landscape picture.
  'tool-9': draw(32, (g) => {
    g.rect(0, 0, 32, 32, 'n');
    g.rect(1, 1, 30, 30, 'm');
    for (let i = 2; i < 30; i += 3) {
      for (const [x, y] of [[i, 2], [i, 29], [2, i], [29, i]]) g.dot(x, y, 'o');
    }
    g.rect(4, 4, 24, 24, 'w');
    g.rect(5, 5, 22, 22, 't');
    g.rect(6, 6, 20, 7, 'cw');
    g.rect(6, 13, 20, 7, 'c');
    const m1 = poly(6, 20, 11, 13, 17, 20);
    const m2 = poly(12, 20, 18, 11, 25, 20);
    g.fill(m1, 'd');
    g.fill(m2, 'd');
    g.fill(and(or(m1, m2), not(rect(0, 0, 32, 20))), 'd');
    g.fill(and(m1, rect(0, 0, 32, 15)), 'w');
    g.fill(and(m2, rect(0, 0, 32, 14)), 'w');
    g.edge(m2, 'k', 'r');
    g.rect(6, 20, 20, 6, 's');
    g.rect(6, 24, 20, 1, 'o');
    g.rect(6, 25, 20, 1, 'g');
    const fir = or(
      poly(21, 6.5, 17.5, 12, 24.5, 12),
      poly(21, 9, 16.5, 16, 25.5, 16),
      poly(21, 12, 15.5, 21, 26.5, 21),
    );
    g.fill(fir, (x) => (x < 21 ? 'l' : 'g'));
    g.edge(fir, 'k');
    g.rect(20, 21, 2, 4, 'm');
  }),

  // The button tool-10 Rückgängig shows a curved arrow back to the left.
  'tool-10': draw(32, undoArrow),

  // The button tool-11 Wiederholen shows the same arrow mirrored.
  'tool-11': draw(32, (g) => {
    undoArrow(g);
    g.flipX();
  }),

  // The button tool-12 Darstellung shows a monitor whose screen is half
  // classic and half modern.
  'tool-12': draw(32, (g) => {
    g.rect(1, 1, 30, 23, 's');
    g.bevel(1, 1, 30, 23, 'w', 'k');
    g.bevel(2, 2, 28, 21, 's', 'd');
    g.rect(4, 4, 24, 16, 'k');
    // The classic half holds a teal desktop with a small window.
    g.rect(5, 5, 11, 14, 't');
    g.rect(7, 8, 9, 9, 's');
    g.rect(7, 8, 9, 2, 'n');
    g.bevel(7, 8, 9, 9, 'w', 'k');
    g.rect(8, 9, 7, 1, 'n');
    g.rect(14, 9, 1, 1, 's');
    // The modern half holds a white surface with a blue bar and two cards.
    g.rect(16, 5, 11, 14, 'w');
    g.rect(16, 5, 11, 2, 'b');
    g.rect(18, 9, 7, 3, 's');
    g.rect(18, 13, 7, 4, 'c');
    g.rect(24, 20, 2, 1, 'l');
    g.rect(11, 24, 10, 3, 'd');
    g.rect(11, 24, 1, 3, 's');
    g.rect(6, 27, 20, 4, 's');
    g.bevel(6, 27, 20, 4, 'w', 'k');
  }),

  // The button tool-13 Hilfe shows a white question mark on a blue disc.
  'tool-13': draw(32, (g) => {
    const disc = ellipse(15.5, 15.5, 13.6);
    g.fill(ellipse(17.5, 17.5, 13.6), 'd');
    g.fill(disc, sphereLight(15.5, 15.5, 13.6, 'bbn', 2));
    g.edge(disc, 'k');
    g.glyph(11, 9, QUESTION, 'w');
  }),

  // The body bar F2 shows the bodies of 1.3 as small scenes in 16 colours.
  'body-kugel': draw(32, (g) => {
    blueScene(g, 14);
    floorShadow(g, 18, 27.5, 9, 2.6);
    const ball = ellipse(15.5, 15, 11.6);
    g.fill(ball, sphereLight(15.5, 15, 11.6, 'rrmmk', 0.975, 1.35));
    g.halo(ball, 'k', 'b');
  }),

  'body-kegel': draw(32, (g) => {
    blueScene(g, 14);
    floorShadow(g, 19, 28, 10, 2.6);
    const top = 3;
    const base = 26;
    const half = (y) => ((y + 0.5 - top) / (base - top)) * 10.5;
    const cone = or(poly(16, top, 5.5, base, 26.5, base), ellipse(16, base, 10.5, 3));
    g.fill(cone, roundLight(16, (y) => half(Math.min(y, base)), 'yyok', 0.25));
    g.fill(and(cone, (x, y) => y > 8 && y < 27 && Math.abs(x + 0.5 - (16 - half(y) * 0.42)) < 0.6), 'wy');
  }),

  'body-zylinder': draw(32, (g) => {
    g.rect(0, 0, 32, 32, 'n');
    g.rect(0, 20, 32, 12, 'nk');
    floorShadow(g, 18, 27.5, 12, 2.6, 'k');
    const side = or(rect(6, 9, 20, 16), ellipse(16, 25, 10, 3.5));
    g.fill(side, roundLight(16, 10, 'llgk'));
    g.fill(and(side, (x, y) => x === 9 && y > 11 && y < 26), 'lw');
    const top = ellipse(16, 9, 10, 3.5);
    g.fill(top, 'g');
    g.edge(top, 'l', 'b');
    g.edge(top, 'l', 'lt');
    g.fill(and(top, ellipse(16.5, 8.4, 7, 2)), 'gk');
    g.edge(or(side, top), 'k', 'r');
  }),

  'body-wuerfel': draw(32, (g) => {
    g.rect(0, 0, 32, 32, 'r');
    g.fill(not(ellipse(16, 16, 21, 21)), 'rm');
    g.fill(not(ellipse(16, 16, 23.5, 23.5)), 'm');
    g.fill(poly(26, 10, 31, 15, 31, 28, 20, 30, 14, 27, 26, 24), 'rm');
    const top = poly(7, 9, 19, 5, 26, 10, 14, 14);
    const front = poly(7, 9, 14, 14, 14, 28, 7, 22);
    const side = poly(14, 14, 26, 10, 26, 24, 14, 28);
    g.fill(top, 'bn');
    g.fill(front, 'b');
    g.fill(side, 'n');
    g.fill(and(side, (x, y) => x < 17), 'bn');
    g.edge(top, 'w', 'lt');
    g.edge(or(top, front, side), 'k', 'rb');
  }),

  'body-quader': draw(32, (g) => {
    roomScene(g);
    g.fill(poly(22, 28, 29, 25, 32, 26, 32, 30, 24, 30), 'dk');
    const front = poly(4, 9, 21, 11, 21, 29, 4, 26);
    const top = poly(4, 9, 11, 5, 28, 7, 21, 11);
    const side = poly(21, 11, 28, 7, 28, 25, 21, 29);
    g.fill(top, 'fp');
    g.fill(front, 'p');
    g.fill(side, 'pk');
    g.edge(or(front, top, side), 'k');
  }),

  'body-pyramide': draw(32, (g) => {
    roomScene(g);
    g.fill(poly(17, 30, 28, 28, 32, 29, 32, 31, 20, 31), 'dk');
    const left = poly(16, 2, 3, 27, 16, 30);
    const right = poly(16, 2, 16, 30, 29, 27);
    g.fill(left, 'c');
    g.fill(and(left, (x, y) => x + 0.5 > 3 + (y - 2) * 0.1 + 9), 'ct');
    g.fill(right, 't');
    g.fill(and(right, (x) => x >= 23), 'tk');
    g.edge(or(left, right), 'k');
  }),

  'body-prisma': draw(32, (g) => {
    roomScene(g);
    g.fill(poly(17, 28, 30, 24, 32, 25, 32, 29, 20, 30), 'dk');
    const end = poly(1, 28, 8, 11, 16, 28);
    const slope = poly(8, 11, 22, 6, 30, 23, 16, 28);
    g.fill(end, 'om');
    g.fill(slope, 'm');
    g.fill(and(slope, (x, y) => (y - 6) * 14 + (x - 22) * 5 > 150), 'mk');
    g.edge(slope, 'o', 'lt');
    g.edge(end, 'o', 'l');
    g.edge(or(end, slope), 'k');
  }),

  // The disc and the plane had blank buttons in 1.3. They get drawings in
  // the same manner (R-05 of the plan). The disc is a grey ring with a hole
  // that floats over the navy floor under the blue sky of the sphere, and
  // the plane is a cyan parallelogram with a teal edge that lies in the grey
  // room of the cuboid.
  'body-disc': draw(32, (g) => {
    blueScene(g, 12);
    floorShadow(g, 18, 26, 12, 3.6);
    const rim = ellipse(16, 17.5, 13.5, 6.5);
    const face = ellipse(16, 15.5, 13.5, 6.5);
    const hole = ellipse(16, 15.5, 4.2, 1.9);
    g.fill(and(rim, not(face)), 'dk');
    g.fill(face, (x, y) => {
      const t = ((x + 0.5 - 16) / 13.5 + (y + 0.5 - 15.5) / 6.5) / 2;
      return ramp('wssdd', 0.35 + t * 0.9);
    });
    g.edge(face, 'w', 't');
    g.fill(hole, 'n');
    g.fill(and(hole, not(ellipse(16, 17, 4.2, 1.9))), 'd');
    g.edge(or(rim, face), 'k', 'rb');
  }),

  'body-ebene': draw(32, (g) => {
    roomScene(g);
    const top = poly(1, 25, 9, 14, 31, 14, 23, 25);
    const thick = poly(1, 25, 23, 25, 23, 27, 1, 27);
    const side = poly(23, 25, 31, 14, 31, 16, 23, 27);
    g.fill(poly(2, 27, 24, 27, 31, 17, 32, 17, 32, 29, 24, 29, 2, 29), 'dk');
    // The face is cyan, a little lighter towards the light at the upper left.
    g.fill(top, (x, y) => ramp('wcc', 0.55 + ((x + 0.5) / 32) * 0.35 + ((y - 14) / 11) * 0.2));
    g.edge(top, 't', 'rb');
    g.edge(top, 'w', 'lt');
    g.fill(thick, 't');
    g.fill(side, 'tk');
    g.edge(or(top, thick, side), 'k');
  }),

  // The program icon comes at 32 and at 16 pixels.
  app: draw(32, bodiesMotif),
  'app-16': draw(16, bodiesMotif16),

  // The glyphs of the caption buttons are black on a 16 pixel grid.
  'win-close': draw(16, (g) => {
    g.glyph(4, 4, [
      'XX....XX',
      '.XX..XX.',
      '..XXXX..',
      '...XX...',
      '..XXXX..',
      '.XX..XX.',
      'XX....XX',
    ], 'k');
  }),
  'win-min': draw(16, (g) => {
    g.rect(4, 10, 6, 2, 'k');
  }),
  'win-max': draw(16, (g) => {
    g.rect(3, 3, 9, 2, 'k');
    g.edge(rect(3, 3, 9, 9), 'k');
  }),
  'win-help': draw(16, (g) => {
    g.glyph(5, 3, [
      '.XXXX.',
      'XX..XX',
      '....XX',
      '...XX.',
      '..XX..',
      '..XX..',
      '......',
      '..XX..',
      '..XX..',
    ], 'k');
  }),

  // The message box icons redraw those of Windows 98. They show a speech
  // bubble with a question mark, a bubble with an i, and a red disc with a
  // cross.
  'msg-question': draw(32, (g) => {
    const bubble = or(ellipse(16, 13.5, 14.5, 12.5), poly(6, 21, 4, 31, 14, 25));
    g.fill(or(ellipse(18, 15.5, 14.5, 12.5), poly(8, 23, 6, 32, 16, 27)), 'd');
    g.fill(bubble, 'w');
    g.edge(bubble, 'k');
    g.glyph(12, 7, QUESTION, 'b');
  }),
  'msg-info': draw(32, (g) => {
    const bubble = or(ellipse(16, 13.5, 14.5, 12.5), poly(6, 21, 4, 31, 14, 25));
    g.fill(or(ellipse(18, 15.5, 14.5, 12.5), poly(8, 23, 6, 32, 16, 27)), 'd');
    g.fill(bubble, 'w');
    g.edge(bubble, 'k');
    g.rect(14, 5, 4, 3, 'b');
    g.rect(12, 10, 6, 2, 'b');
    g.rect(14, 12, 4, 8, 'b');
    g.rect(12, 20, 8, 2, 'b');
  }),
  'msg-critical': draw(32, (g) => {
    const disc = ellipse(15, 15, 14);
    g.fill(ellipse(17, 17, 14), 'd');
    g.fill(disc, 'r');
    g.edge(disc, 'm', 'rb');
    g.edge(disc, 'k');
    g.fill(or(band(9, 9, 21, 21, 4), band(21, 9, 9, 21, 4)), 'w');
  }),

  // A padlock in brass and grey marks locked objects.
  lock: draw(16, (g) => {
    g.rect(5, 1, 6, 1, 'k');
    g.rect(4, 2, 1, 5, 'k');
    g.rect(11, 2, 1, 5, 'k');
    g.rect(5, 2, 6, 1, 's');
    g.rect(5, 3, 1, 4, 's');
    g.rect(10, 3, 1, 4, 'd');
    g.rect(6, 3, 4, 1, 'k');
    g.rect(6, 4, 1, 3, 'k');
    g.rect(9, 4, 1, 3, 'k');
    const body = rect(2, 7, 12, 8);
    g.fill(body, 'y');
    g.fill(and(body, (x) => x >= 10), 'o');
    g.rect(3, 8, 7, 1, 'w');
    g.edge(body, 'k');
    g.rect(7, 9, 2, 2, 'k');
    g.rect(7, 11, 2, 2, 'k');
  }),
});
