# SPDX-License-Identifier: GPL-2.0-only
"""
The harness of the test notebooks of 3D-Bausteine.

Every test is a Jupyter notebook under tests/notebooks/, run by papermill
through tests/run.py, as the tests of Aosabi are. A notebook imports this
module for the few doors it needs: the devtool, which answers one primitive
of the geometry per call, the GraphQL engine of the Web Worker, booted on
the build host by the binary bausteine-graphql, a static site of web/, and
a page in headless Chromium with WebGPU. Each door captures what the
process it drives writes, so a failing run explains itself.

Two readers of the repository serve the notebooks of the interface and of
the register: INVENTORY, the parity inventory of tests/fixtures/parity.json,
and quirks_table(), the rows of Documentation/quirks.md.
"""

import json
import math
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEVTOOL = ROOT / "target" / "debug" / "bausteine-devtool"
ENGINE = ROOT / "crates" / "bausteine-web" / "target" / "debug" / "bausteine-graphql"
OUT = ROOT / "tests" / "notebooks" / "out"
FIXTURES = ROOT / "tests" / "fixtures"
QUIRKS = ROOT / "Documentation" / "quirks.md"

#: The views in the order of View::ALL of bausteine-core.
FRONT, SIDE, TOP, OBLIQUE = 0, 1, 2, 3

#: The values of one packed item, ITEM_STRIDE of bausteine-core.
STRIDE = 20

#: The type codes of the kinds, those of version 1.3.
CODES = {
    "SPHERE": 1, "CONE": 2, "CYLINDER": 3, "CUBE": 4, "CUBOID": 5,
    "PYRAMID": 6, "PRISM": 7, "DISC": 8,
    "UNION": 101, "DIFFERENCE": 102, "INTERSECTION": 103, "MERGE": 104,
    "DECLARE": 105, "INSTANCE": 200,
}


#: The values of zoomf on the ladder of the 2D zoom of version 1.3, and of
#: d3zoomf on the ladder of the 3D zoom, rounded to three places as the
#: notes list them `[forms §2.6.5]`. The program starts at 12 and 10.
ZOOM_LADDER = [4.823, 5.787, 6.944, 8.333, 10, 12, 14.4, 17.28, 20.736, 24.883, 29.86, 35.832, 42.998, 51.598]


def ladder(start=10.0, step=1.2, top=50.0, bottom=5.0):
    """
    Answers the exact values of a ladder of the zoom of version 1.3 from
    `start`: `ZoomIn_Click` multiplies by `step` while the zoom is below
    `top`, `ZoomOut_Click` divides by it while the zoom is above `bottom`.
    """
    up, down = [float(start)], [float(start)]
    while up[-1] < top:
        up.append(up[-1] * step)
    while down[-1] > bottom:
        down.append(down[-1] / step)
    return sorted(set(down + up))


def zoom_text(zoomf, look="classic"):
    """
    Answers the text the field #tzoom of F5 shows for the 2D zoom `zoomf`:
    in the classic look the number zoomf / 10 with up to seven digits and a
    comma, as Timer1 of version 1.3 writes the Single, in the modern look
    the percentage.
    """
    value = zoomf / 10
    if look == "classic":
        return f"{value:.7g}".replace(".", ",")
    return f"{math.floor(value * 100 + 0.5)} %"


class Failure(AssertionError):
    """A check that did not hold, with what the process wrote."""


def check(condition, message, *context):
    """Raises a Failure with `message` and `context` unless `condition` holds."""
    if not condition:
        details = "\n".join(str(c) for c in context)
        raise Failure(f"{message}\n{details}" if details else message)
    print(f"ok   {message}")


def build_devtool():
    """Builds the devtool, once per notebook."""
    result = subprocess.run(
        ["cargo", "build", "--locked", "-q", "-p", "bausteine-devtool"],
        cwd=ROOT, capture_output=True, text=True,
    )
    check(result.returncode == 0, "the devtool builds", result.stderr)
    return DEVTOOL


def devtool(*args, env=None, raw=False):
    """Runs one subcommand of the devtool and answers its JSON."""
    full_env = dict(os.environ, **(env or {}))
    result = subprocess.run(
        [str(DEVTOOL), *map(str, args)], capture_output=True, text=True, env=full_env,
    )
    if result.returncode != 0:
        raise Failure(f"devtool {' '.join(map(str, args))} failed\n{result.stderr}")
    return result.stdout if raw else json.loads(result.stdout)


def devtool_error(*args):
    """Runs a subcommand that must fail and answers its exit code and error."""
    result = subprocess.run([str(DEVTOOL), *map(str, args)], capture_output=True, text=True)
    return result.returncode, result.stderr


def item(kind, position=(0, 0, 0), size=(1, 1, 1), rotation=(0, 0, 0),
         color=(0.8, 0.8, 0.8), parent=-1, inner=0.0, texture=-1, source=-1):
    """Returns the packed numbers of one item, see bausteine_core::packed."""
    return [
        CODES[kind], parent, *position, *size, *rotation, *color, inner, texture, source, 0, 0, 0,
    ]


def packed(*items):
    """Returns the packed numbers of `items` as the devtool reads them."""
    return ",".join(repr(float(v)) for it in items for v in it)


def close(a, b, eps=1e-4):
    """Answers whether the numbers or lists `a` and `b` agree within `eps`."""
    if isinstance(a, (list, tuple)):
        return len(a) == len(b) and all(close(x, y, eps) for x, y in zip(a, b))
    return abs(a - b) <= eps


def free_port():
    """Answers a free TCP port of the loopback."""
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def load_inventory(path=None):
    """
    Answers the parity inventory of tests/fixtures/parity.json, one record
    per element of version 1.3, or None while the file does not exist.
    """
    path = Path(path) if path else FIXTURES / "parity.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


#: The parity inventory, read once when a notebook imports the harness.
INVENTORY = load_inventory()


def _cells(line):
    """Answers the cells of one row of a Markdown table, `\\|` kept as a bar."""
    body = line.strip()
    if body.startswith("|"):
        body = body[1:]
    if body.endswith("|") and not body.endswith("\\|"):
        body = body[:-1]
    return [c.strip().replace("\\|", "|") for c in re.split(r"(?<!\\)\|", body)]


def quirks_table(path=None):
    """
    Answers every row of the register Documentation/quirks.md as a dict.

    A row holds the cells of its table under the names of the header, such
    as "ID", "Version 1.3", "Version 2.0", "Status" and "Test", and three
    more keys: "ids", the IDs of the cell ID split at the commas, "section",
    the heading of the section the table stands in, and "line", the number
    of its line in the file. Only tables whose first column is ID count.
    """
    path = Path(path) if path else QUIRKS
    rows = []
    section = None
    header = None
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if line.startswith("## "):
            section = line[3:].strip()
            header = None
            continue
        if not line.lstrip().startswith("|"):
            header = None
            continue
        cells = _cells(line)
        if header is None:
            header = cells if cells and cells[0] == "ID" else []
            continue
        if not header or all(re.fullmatch(r":?-{3,}:?", c) for c in cells):
            continue
        row = dict(zip(header, cells))
        row["ids"] = [i.strip() for i in row.get("ID", "").split(",") if i.strip()]
        row["section"] = section
        row["line"] = number
        rows.append(row)
    return rows


#: The head of Documentation/parity.md, which parity_markdown() writes.
PARITY_INTRO = """\
# The parity inventory of version 1.3

This page lists every element and behaviour of 3D-Baukasten 1.3 that version 2.0 keeps at its
place, one record per number `P-nnn` of the parity plan, with the record of the window F6 that the
EXE holds (`P-200a`) and the tool tip of its combo CB3 (`P-203b`). Notebook 80 writes the page from
[tests/fixtures/parity.json](../tests/fixtures/parity.json), and a change goes into that file and
not into this page. The notebook walks every record in both looks: an element must exist once, lie
inside its container, keep its order among its group and show its text, and in the classic look at
1024 by 768 its place must equal the twips of 1.3 within 2 px.

The column Kind says how a record is checked. An `element` is a control at a place, a
`menu-entry` an entry of a menu or of a drop-down list, a `tooltip` the tool tip of a control, a
`state` a value of the page that the expression of the fixture tests, a `message` a text of a
message box or of the status field, a `key` a key and what it does, a `behaviour` a behaviour that
the notebook section in the column Checked in proves, and `absent` an element of 1.3 that 2.0 does
not build on purpose. The column Twips gives left, top, width and height of 1.3 relative to the
client of the container, 15 twips to the pixel. Where a decision stands in
[quirks.md](quirks.md), the note names its ID.
"""


def _parity_cell(value):
    """Answers one cell of the table of parity_markdown() for a value of a record."""
    if value is None:
        return ""
    if isinstance(value, dict):
        value = ", ".join(f"{k}: {v}" for k, v in value.items())
    elif isinstance(value, list):
        value = " ".join(str(v) for v in value)
    return str(value).replace("|", "\\|").replace("\n", " ")


def _parity_code(value):
    """Answers a cell of parity_markdown() that holds code, in backticks, or an empty cell."""
    text = _parity_cell(value)
    return f"`{text}`" if text else ""


def parity_markdown(inventory=None):
    """
    Answers the text of Documentation/parity.md for the parsed inventory
    `inventory`, by default INVENTORY: the head, the counts of the records
    by kind and by look, and one row of the table per record. Section 19 of
    notebook 80 compares the page in the repository with it.
    """
    from collections import Counter

    records = (inventory if inventory is not None else INVENTORY)["records"]
    kinds = Counter(r["kind"] for r in records)
    looks = Counter(" and ".join(r["looks"]) for r in records)
    lines = [PARITY_INTRO.rstrip("\n"), "", f"The inventory holds {len(records)} records. By kind:", "",
             "| Kind | Records |", "| --- | --- |"]
    lines += [f"| `{kind}` | {count} |" for kind, count in sorted(kinds.items())]
    lines += ["", "By look:", "", "| Looks | Records |", "| --- | --- |"]
    lines += [f"| {look} | {count} |" for look, count in sorted(looks.items())]
    lines += ["", "## Records", "",
              "| ID | Name | Kind | Selector | Container | Tab | Order | Group | Text | Looks | Twips "
              "| Trigger | Effect | Checked in | Note |",
              "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- "
              "| --- |"]
    cell, code = _parity_cell, _parity_code
    for r in records:
        cells = [r["id"], cell(r["name"]), f"`{r['kind']}`", code(r["selector"]), code(r["container"]),
                 cell(r["tab"]), cell(r["order"]), code(r["group"]), cell(r["text"]), cell(r["looks"]),
                 cell(r["twips"]), code(r["trigger"]), code(r["effect"]), cell(r["checkedIn"]), cell(r["note"])]
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines) + "\n"


class Engine:
    """The GraphQL engine of the Web Worker, booted on the build host.

    The binary bausteine-graphql boots the service through aosabi::embed as
    the worker does and answers one GraphQL request body per line.
    """

    def __init__(self, binary=None):
        self.binary = Path(binary) if binary else ENGINE
        check(self.binary.exists(), f"the engine is built at {self.binary}")
        self.process = subprocess.Popen(
            [str(self.binary)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True, bufsize=1,
        )

    def graphql(self, query, variables=None, operation_name=None):
        """Sends one GraphQL request and answers its whole response body."""
        body = {"query": query, "variables": variables or {}}
        if operation_name:
            body["operationName"] = operation_name
        return self.raw(json.dumps(body))

    def raw(self, line):
        """Sends one line as it stands and answers the response body."""
        self.process.stdin.write(line + "\n")
        self.process.stdin.flush()
        answer = self.process.stdout.readline()
        if not answer:
            raise Failure(f"the engine ended\n{self.process.stderr.read()}")
        return json.loads(answer)

    def data(self, query, variables=None):
        """Sends one GraphQL request and answers its data, failing on an error."""
        body = self.graphql(query, variables)
        check("errors" not in body, f"no error for {query.split('{')[0].strip() or 'query'}",
              json.dumps(body, ensure_ascii=False)[:2000])
        return body["data"]

    def schema(self):
        """Answers the schema text the engine prints."""
        return subprocess.run([str(self.binary), "--schema"], capture_output=True, text=True).stdout

    def stop(self):
        """Ends the engine."""
        self.process.stdin.close()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()


class Site:
    """
    A static site of a folder on the loopback, as any static host serves web/.

    `mounts` maps a prefix of the address such as "/images/" to a further
    folder, which the site serves beside the folder without writing into it.
    """

    def __init__(self, folder=None, mounts=None):
        import threading

        sys.path.insert(0, str(ROOT / "tests"))
        from serve import server

        self.images = []
        self.temporary = None
        self.httpd = server(folder or ROOT / "web", mounts=mounts)
        self.url = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    @classmethod
    def with_images(cls, files, folder=None):
        """
        Returns a site of web/ that serves copies of the pictures `files`
        under /images/, for the slide show of the tab Bilder.

        An entry of `files` is the path of a picture, or a pair of a file
        name and its bytes. The copies lie in a temporary folder that stop()
        removes, so nothing is written under web/. The list `images` of the
        site holds the address of each copy, such as "/images/haus.png".
        """
        temporary = tempfile.mkdtemp(prefix="bausteine-images-")
        names = []
        for entry in files:
            if isinstance(entry, (tuple, list)):
                name, data = entry
                (Path(temporary) / name).write_bytes(data)
            else:
                name = Path(entry).name
                shutil.copyfile(entry, Path(temporary) / name)
            names.append(name)
        site = cls(folder, mounts={"/images/": temporary})
        site.temporary = temporary
        site.images = [f"/images/{urllib.parse.quote(n)}" for n in names]
        return site

    def get(self, path):
        """Answers the response of a GET of `path`."""
        import requests

        return requests.get(f"{self.url}{path}", timeout=30)

    def stop(self):
        """Stops the site and removes the folder of its pictures."""
        self.httpd.shutdown()
        self.httpd.server_close()
        if self.temporary:
            shutil.rmtree(self.temporary, ignore_errors=True)
            self.temporary = None


#: Paints the pixels the worker reads back over the canvas, so a screenshot
#: shows them. The page hands its canvas to the Web Worker, which draws into
#: an offscreen texture with the address ?offscreen, since the headless
#: SwiftShader loses its device on the first present to a canvas.
PAINT_SNAPSHOT = """
async () => {
  const shot = await bausteine.snapshot();
  const px = new Uint8ClampedArray(shot.pixels.buffer);
  const img = new ImageData(px, shot.width, shot.height);
  const out = document.createElement('canvas');
  out.width = shot.width; out.height = shot.height;
  out.getContext('2d').putImageData(img, 0, 0);
  out.id = 'snapshot-overlay';
  out.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
  document.querySelector('#snapshot-overlay')?.remove();
  document.querySelector('#canvas').after(out);
  let lit = 0;
  for (let i = 0; i < px.length; i += 4 * 97) if (px[i] + px[i + 1] + px[i + 2] > 0) lit++;
  return { width: shot.width, height: shot.height, lit };
}
"""


class _Remote:
    """
    An object of Playwright that lives on the thread of the browser.

    The synchronous API of Playwright refuses to run on a thread with an
    event loop of asyncio, and the kernel of a notebook runs one. Every call
    therefore goes to one thread of its own, in order, and a result that is
    again an object of Playwright comes back wrapped the same way.
    """

    def __init__(self, pool, obj):
        self._pool = pool
        self._obj = obj

    def __getattr__(self, name):
        value = self._pool.submit(getattr, self._obj, name).result()
        if callable(value):
            def call(*args, **kwargs):
                return _wrap(self._pool, self._pool.submit(value, *args, **kwargs).result())
            return call
        return _wrap(self._pool, value)

    def __enter__(self):
        return _wrap(self._pool, self._pool.submit(self._obj.__enter__).result())

    def __exit__(self, *exc):
        return self._pool.submit(self._obj.__exit__, *exc).result()


def hex_colors(value):
    """Answers `value` with every colour rgb() or rgba() of it written as #rrggbb, #rrggbbaa or transparent."""
    def one(match):
        parts = [p.strip() for p in re.split(r"[,/\s]+", match.group(1).strip()) if p.strip()]
        rgb = [round(float(p[:-1]) * 2.55) if p.endswith("%") else round(float(p)) for p in parts[:3]]
        alpha = parts[3] if len(parts) > 3 else "1"
        alpha = float(alpha[:-1]) / 100 if alpha.endswith("%") else float(alpha)
        if alpha <= 0:
            return "transparent"
        text = "#" + "".join(f"{max(0, min(255, c)):02x}" for c in rgb)
        return text if alpha >= 1 else text + f"{round(alpha * 255):02x}"
    return re.sub(r"rgba?\(([^)]*)\)", one, value)


def _wrap(pool, value):
    """Wraps `value` as a _Remote where it is an object of Playwright."""
    if type(value).__module__.startswith("playwright"):
        return _Remote(pool, value)
    return value


#: The looks of the page, `html[data-look]`.
LOOKS = ("modern", "classic")

#: The themes of the modern look, `html[data-theme]`.
THEMES = ("light", "dark")

#: The virtual screens of the classic look, the parameter `screen` of the address.
SCREENS = ("window", "800x600", "1024x768", "1280x1024")


def chromium():
    """Answers the Chromium that Browser launches, None for the one Playwright brings."""
    named = os.environ.get("BAUSTEINE_CHROMIUM")
    if named:
        return named
    return "/opt/pw-browsers/chromium" if Path("/opt/pw-browsers/chromium").exists() else None


def choose_look(look=None, theme=None, appearance=None):
    """
    Answers the look and the theme of the arguments of Browser.

    The argument `theme` once carried the look and `appearance` the theme.
    Both meanings stay: a `theme` of "modern" or "classic" names the look,
    one of "light" or "dark" the theme, and `appearance` names the theme.
    """
    if theme in LOOKS:
        if look not in (None, theme):
            raise ValueError(f"the look {look!r} and the look {theme!r} given as theme disagree")
        look, theme = theme, None
    if appearance is not None:
        if theme not in (None, appearance):
            raise ValueError(f"the theme {theme!r} and the appearance {appearance!r} disagree")
        theme = appearance
    look = look or "modern"
    theme = theme or "light"
    if look not in LOOKS:
        raise ValueError(f"no look {look!r}, the looks are {LOOKS}")
    if theme not in THEMES:
        raise ValueError(f"no theme {theme!r}, the themes are {THEMES}")
    return look, theme


#: Answers the histogram of the colours of the read back canvas inside a
#: box given in CSS pixels of the page.
SAMPLE_BOX = """
async ([x, y, w, h]) => {
  const shot = await bausteine.snapshot();
  const canvas = document.querySelector('#canvas').getBoundingClientRect();
  const sx = shot.width / Math.max(1, canvas.width);
  const sy = shot.height / Math.max(1, canvas.height);
  const x0 = Math.max(0, Math.floor((x - canvas.left) * sx));
  const y0 = Math.max(0, Math.floor((y - canvas.top) * sy));
  const x1 = Math.min(shot.width, Math.ceil((x + w - canvas.left) * sx));
  const y1 = Math.min(shot.height, Math.ceil((y + h - canvas.top) * sy));
  const px = new Uint8Array(shot.pixels.buffer, shot.pixels.byteOffset, shot.pixels.byteLength);
  const counts = new Map();
  for (let row = y0; row < y1; row++) {
    for (let col = x0; col < x1; col++) {
      const i = (row * shot.width + col) * 4;
      const key = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1])
    .map(([key, n]) => ['#' + key.toString(16).padStart(6, '0'), n]);
}
"""

#: Waits until the page has answered every action before it. No call of the
#: page to the Web Worker may stay open over three turns of its event loop,
#: each turn a frame of the page and a task after it, and then the worker
#: draws a frame after every state the page sent. Answers an empty text, or
#: what is still open once `limit` milliseconds have passed. A worker that
#: is broken or closed answers nothing more, so the wait ends with it.
ANSWERED = """
async (limit) => {
  const turn = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const end = performance.now() + limit;
  const bridge = () => window.bausteine?.app?.bridge;
  for (let calm = 0; calm < 3;) {
    await turn();
    const b = bridge();
    calm = !b || b.pending.size === 0 ? calm + 1 : 0;
    if (performance.now() > end) return `${b ? b.pending.size : 0} calls to the worker are open after ${limit} ms`;
  }
  const b = bridge();
  if (b && !b.broken && !b.closed) await b.render().catch(() => null);
  await turn();
  return '';
}
"""

#: Marks the entry of the menu bar at the end of a path with the attribute
#: data-harness, and every submenu on the way with data-harness-via.
MENU_TARGET = """
(path) => {
  for (const e of document.querySelectorAll('[data-harness], [data-harness-via]')) {
    e.removeAttribute('data-harness');
    e.removeAttribute('data-harness-via');
  }
  const [menu, ...steps] = path;
  const item = document.querySelector(`#menubar .menu-item[data-menu="${menu}"]`);
  if (!item) return `no menu ${menu}`;
  let popup = item.querySelector(':scope > .menu-popup');
  const caption = (e) => (e.querySelector('span')?.textContent ?? e.textContent).trim().toLowerCase();
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const entries = [...popup.querySelectorAll(':scope > .menu-entry')];
    const entry = entries.find((e) => e.dataset.entry === step)
      ?? entries.find((e) => e.dataset.body === step)
      ?? entries.find((e) => caption(e) === step.toLowerCase());
    if (!entry) return `no entry ${step} in ${[menu, ...steps.slice(0, i)].join('/')}`;
    if (i === steps.length - 1) {
      entry.setAttribute('data-harness', '1');
      return '';
    }
    entry.setAttribute('data-harness-via', String(i));
    popup = entry.querySelector(':scope > .menu-popup');
    if (!popup) return `the entry ${step} opens no submenu`;
  }
  return 'the path names no entry';
}
"""


class Browser:
    """
    A page of the interface in headless Chromium with WebGPU on SwiftShader.

    `look` is "modern" or "classic" and `theme` "light" or "dark", which the
    page finds in its storage at the first visit. `theme` with a look and
    `appearance` with a theme keep the meaning of the older arguments, see
    choose_look.

    No door waits a fixed time. open(), look(), key(), entry(), menu() and
    click_world() end with settle(), which waits for the answer of the
    worker and the frame after it, and until() waits for a condition of
    the page and then for that answer, so a loaded machine only takes
    longer and never lets a check read the page too early.
    """

    def __init__(self, url, width=1440, height=900, look=None, theme=None, appearance=None):
        from concurrent.futures import ThreadPoolExecutor

        from playwright.sync_api import sync_playwright

        look, theme = choose_look(look, theme, appearance)
        self.start_look, self.start_theme = look, theme
        self.pool = ThreadPoolExecutor(max_workers=1)
        self.playwright = _Remote(self.pool, self.pool.submit(lambda: sync_playwright().start()).result())
        self.browser = self.playwright.chromium.launch(
            executable_path=chromium(),
            args=["--enable-unsafe-webgpu", "--enable-features=Vulkan,WebGPU",
                  "--use-angle=swiftshader", "--use-webgpu-adapter=swiftshader",
                  "--ignore-gpu-blocklist"],
        )
        self.page = self.browser.new_page(viewport={"width": width, "height": height}, accept_downloads=True)
        self.messages = []
        self.page.on("console", lambda m: self.messages.append(f"{m.type}: {m.text}"))
        self.page.on("pageerror", lambda e: self.messages.append(f"pageerror: {e}"))
        self.page.add_init_script(
            "try { if (!sessionStorage.getItem('bausteine.test')) {"
            " sessionStorage.setItem('bausteine.test', '1');"
            f" localStorage.setItem('bausteine.theme', '{theme}');"
            f" localStorage.setItem('bausteine.look', '{look}'); }} }} catch {{}}")
        self.url = url

    def open(self, hash_="", params=None, **more):
        """
        Opens the page with the debug door and waits for the first frames.

        `hash_` is the address of a scene such as "#/szene/<key>". `params`
        and the keywords give further parameters of the address, among them
        `look`, `theme` and `screen`, which the page applies for this visit
        without storing them.
        """
        query = {**(params or {}), **more}
        extra = "".join(f"&{urllib.parse.quote(str(k))}={urllib.parse.quote(str(v))}"
                        for k, v in query.items() if v is not None)
        self.page.goto(f"{self.url}/?debug&offscreen{extra}{hash_}")
        self.page.wait_for_function(
            "() => window.bausteine && window.bausteine.app.scene.id"
            " && document.documentElement.dataset.ready === '1'", timeout=60000)
        self.settle()
        return self

    def look(self, name):
        """
        Sets the look `name` through the debug door, waits until the worker
        drew a frame of it and answers the look of `html[data-look]`.
        """
        answer = self.page.evaluate(
            "async (n) => { bausteine.setLook(n);"
            " await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));"
            " const b = bausteine.app.bridge;"
            " if (typeof b.render === 'function') await b.render();"
            " return document.documentElement.dataset.look; }", name)
        self.settle()
        return answer

    def css(self, selector, property):
        """
        Answers the computed value of the CSS property `property` of the
        first element `selector`, such as "background-color", "color" or a
        custom property "--c-face", every colour in it written as #rrggbb,
        or None where no element matches.
        """
        value = self.page.evaluate(
            "([s, p]) => { const e = document.querySelector(s); if (!e) return null;"
            " const c = getComputedStyle(e); return (p.includes('-') ? c.getPropertyValue(p) : String(c[p] ?? '')).trim(); }",
            [selector, property])
        return None if value is None else hex_colors(value)

    def sample_box(self, x, y, w, h):
        """
        Answers how often each colour appears in the box (x, y, w, h) of the
        read back canvas, the box in CSS pixels of the page as rect()
        answers them, as a dict of #rrggbb to counts, the most frequent first.
        """
        return dict(self.page.evaluate(SAMPLE_BOX, [x, y, w, h]))

    def graphql_log(self):
        """Answers the GraphQL requests of the page since the last call as {query, variables, answer}."""
        return self.page.evaluate(
            "() => { const l = bausteine.log; return Array.isArray(l) ? l.splice(0, l.length) : []; }")

    def menu(self, path):
        """
        Chooses an entry of the menu bar as a user does, with the mouse.

        `path` names the menu and the entry by `data-menu` and `data-entry`,
        such as "datei/neu", a body of the menu Objekte by its `data-body`,
        such as "objekte/Kugel", and an entry of a submenu by its caption,
        such as "datei/beispiele/Roulette".
        """
        steps = [s for s in path.split("/") if s]
        problem = self.page.evaluate(MENU_TARGET, steps)
        if problem:
            raise Failure(f"menu {path}: {problem}")
        self.page.click(f'#menubar .menu-item[data-menu="{steps[0]}"] > .menu-title')
        for i in range(len(steps) - 2):
            self.page.hover(f'[data-harness-via="{i}"]')
        self.page.click('[data-harness="1"]')
        self.settle()

    def key(self, name):
        """Presses the key `name`, such as "Escape" or "Control+z", and waits for the answer of the page."""
        self.page.keyboard.press(name)
        self.settle()

    def revision(self):
        """Answers the revision of the last frame, `html[data-revision]`, or -1."""
        value = self.page.evaluate("() => document.documentElement.dataset.revision")
        return int(value) if value not in (None, "") else -1

    def wait_revision(self, n=None, timeout=10000):
        """
        Waits until a frame of the revision `n` or a later one is drawn, by
        default of the revision after the current one, and answers it.
        """
        if n is None:
            n = self.revision() + 1
        self.page.wait_for_function(
            "(n) => Number(document.documentElement.dataset.revision ?? -1) >= n", arg=n, timeout=timeout)
        return self.revision()

    def eval(self, script, arg=None):
        """Answers the value of `script` in the page."""
        return self.page.evaluate(script, arg)

    def screenshot(self, name):
        """Paints the read back canvas over the page and saves a screenshot under out/."""
        stats = self.page.evaluate(PAINT_SNAPSHOT)
        OUT.mkdir(parents=True, exist_ok=True)
        path = OUT / f"{name}.png"
        self.page.screenshot(path=str(path))
        self.page.evaluate("() => document.querySelector('#snapshot-overlay')?.remove()")
        return path, stats

    def rect(self, selector):
        """Answers the box of the first element `selector` as left, top, width and height."""
        return self.page.evaluate(
            "(s) => { const e = document.querySelector(s); if (!e) return null;"
            " const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }", selector)

    def texts(self, selector, attribute=None):
        """Answers the text, or the attribute `attribute`, of every element `selector`."""
        return self.page.evaluate(
            "([s, a]) => [...document.querySelectorAll(s)].map((e) => a ? e.getAttribute(a) : e.textContent.trim())",
            [selector, attribute])

    def visible(self, selector):
        """Answers whether the first element `selector` takes room on the page."""
        return self.page.evaluate(
            "(s) => { const e = document.querySelector(s); if (!e) return false;"
            " const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }",
            selector)

    def click_world(self, view, x, y, z, button="left"):
        """
        Clicks the point (x, y, z) of the scene in the view `view`.

        The viewport of a view lies inside its box by the bevel of the
        classic look, 2 px on each side, and 0 in the modern look, so the
        click adds half the difference of the widths of the box and of the
        viewport the last frame names to the pixel bridge.project answers.
        """
        at = self.page.evaluate(
            "([v, x, y, z]) => { const r = document.querySelector(`.view[data-view=\"${v}\"]`).getBoundingClientRect();"
            " const b = bausteine.app.bridge; const p = b.project(v, x, y, z);"
            " if (!p) return null;"
            " const w = b.cameras ? b.cameras[v * 18 + 16] : 0;"
            " const inset = w > 0 ? Math.max(0, (r.width - w) / 2) : 0;"
            " return [r.left + inset + p[0], r.top + inset + p[1]]; }",
            [view, x, y, z])
        if at is None:
            raise Failure(f"the view {view} shows no point ({x}, {y}, {z}), its viewport is hidden")
        self.page.mouse.click(at[0], at[1], button=button)
        self.settle()

    def fields(self):
        """Answers the fields T1(1) to T1(10) of the tab Körper, a star behind a locked one, None for a hidden one."""
        return self.page.evaluate(
            "() => [...Array(10)].map((_, i) => { const f = document.querySelector('#t1-' + (i + 1));"
            " return f.hidden ? null : f.value + (f.classList.contains('locked') ? '*' : ''); })")

    def status(self):
        """Answers the text of the status field of F5."""
        return self.page.evaluate("() => document.querySelector('#tstatus').value")

    def lines(self):
        """Answers the lines of the list OBJEKTE."""
        return self.page.evaluate("() => bausteine.app.lines.map((l) => l.text)")

    def entry(self, text):
        """Types `text` into the list of bodies CB1, as a user who picks it."""
        self.page.evaluate(
            "(t) => { const e = document.querySelector('#cb1-edit'); e.value = t; e.dispatchEvent(new Event('change')); }", text)
        self.settle()

    def settle(self, limit=30000):
        """
        Waits until the page has answered every action before it, the frame
        of the worker after it included, see ANSWERED, and raises a Failure
        that names what is still open after `limit` milliseconds. The wait
        ends with the answer and not after a fixed time, and a number that
        an older call passes as its fixed wait now bounds the wait instead.
        """
        problem = self.page.evaluate(ANSWERED, limit)
        if problem:
            raise Failure(f"the page did not answer: {problem}")

    def until(self, script, arg=None, timeout=30000):
        """
        Waits until the function `script` of the page, called with `arg`,
        answers a true value, and then for the answer of the page as
        settle() does. A condition fits what the page does without the
        worker, such as a timer, a file it reads or the zoom it steps.
        Answers whether the value came within `timeout` milliseconds and
        leaves the failure to the check after it, which names what the page
        shows instead.
        """
        try:
            self.page.wait_for_function(script, arg=arg, timeout=timeout)
        except Exception as error:  # noqa: BLE001, the check after it reports
            if "Timeout" not in type(error).__name__ and "Timeout" not in str(error):
                raise
            return False
        self.settle()
        return True

    def errors(self):
        """Answers the errors the page logged."""
        return [m for m in self.messages if m.startswith(("error", "pageerror"))]

    def close(self):
        """Closes the browser and its thread."""
        self.browser.close()
        self.playwright.stop()
        self.pool.shutdown()
