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
"""

import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEVTOOL = ROOT / "target" / "debug" / "bausteine-devtool"
ENGINE = ROOT / "crates" / "bausteine-web" / "target" / "debug" / "bausteine-graphql"
OUT = ROOT / "tests" / "notebooks" / "out"

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
    """A static site of a folder on the loopback, as any static host serves web/."""

    def __init__(self, folder=None):
        import threading

        sys.path.insert(0, str(ROOT / "tests"))
        from serve import server

        self.httpd = server(folder or ROOT / "web")
        self.url = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def get(self, path):
        """Answers the response of a GET of `path`."""
        import requests

        return requests.get(f"{self.url}{path}", timeout=30)

    def stop(self):
        """Stops the site."""
        self.httpd.shutdown()


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


def _wrap(pool, value):
    """Wraps `value` as a _Remote where it is an object of Playwright."""
    if type(value).__module__.startswith("playwright"):
        return _Remote(pool, value)
    return value


class Browser:
    """A page of the interface in headless Chromium with WebGPU on SwiftShader."""

    def __init__(self, url, width=1440, height=900, theme="modern", appearance="light"):
        from concurrent.futures import ThreadPoolExecutor

        from playwright.sync_api import sync_playwright

        self.pool = ThreadPoolExecutor(max_workers=1)
        self.playwright = _Remote(self.pool, self.pool.submit(lambda: sync_playwright().start()).result())
        executable = os.environ.get("BAUSTEINE_CHROMIUM") or (
            "/opt/pw-browsers/chromium" if Path("/opt/pw-browsers/chromium").exists() else None)
        self.browser = self.playwright.chromium.launch(
            executable_path=executable,
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
            f" localStorage.setItem('bausteine.theme', '{appearance}');"
            f" localStorage.setItem('bausteine.look', '{theme}'); }} }} catch {{}}")
        self.url = url

    def open(self, hash_=""):
        """Opens the page with the debug door and waits for the first frames."""
        self.page.goto(f"{self.url}/?debug&offscreen{hash_}")
        self.page.wait_for_function("() => window.bausteine && window.bausteine.app.scene.id", timeout=60000)
        self.page.wait_for_timeout(800)
        return self

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
        """Clicks the point (x, y, z) of the scene in the view `view`."""
        at = self.page.evaluate(
            "([v, x, y, z]) => { const r = document.querySelector(`.view[data-view=\"${v}\"]`).getBoundingClientRect();"
            " const p = bausteine.app.bridge.project(v, x, y, z); return [r.left + p[0], r.top + p[1]]; }",
            [view, x, y, z])
        self.page.mouse.click(at[0], at[1], button=button)
        self.page.wait_for_timeout(200)

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
        self.page.wait_for_timeout(150)

    def settle(self, ms=400):
        """Waits for the worker to answer and the page to draw."""
        self.page.wait_for_timeout(ms)

    def errors(self):
        """Answers the errors the page logged."""
        return [m for m in self.messages if m.startswith(("error", "pageerror"))]

    def close(self):
        """Closes the browser and its thread."""
        self.browser.close()
        self.playwright.stop()
        self.pool.shutdown()
