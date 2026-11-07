#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-only
"""
Serves a folder as a static site, the way any static host serves web/.

    python3 tests/serve.py web [port]
    python3 tests/serve.py web 8000 --host 0.0.0.0

3D-Bausteine needs no server of its own: the page, its module scripts, the
script of its Web Worker and the module of WebAssembly are files. This
server only makes sure every file goes out with the media type a browser
demands of a module script and of WebAssembly.

By default it listens on the loopback only. The option --host names the
address to listen on, 0.0.0.0 for every interface, so the computers of a
classroom open the page over the local network. A browser grants WebGPU
and the transfer of a canvas to a worker only to a secure context, which
the loopback is and a plain address of the network is not, so a computer
other than the one that serves needs the page over https or a browser
told to treat the address as secure.

The test harness mounts further folders under a prefix of the address,
for example the pictures of the slide show under /images/, so a test
writes nothing into the folder it serves.
"""

import functools
import http.server
import posixpath
import sys
import urllib.parse
from pathlib import Path

TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".wasm": "application/wasm",
    ".svg": "image/svg+xml",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
}

#: The address the server listens on unless --host names another.
LOOPBACK = "127.0.0.1"


class Handler(http.server.SimpleHTTPRequestHandler):
    """Serves the files of the folder with the media types of TYPES."""

    #: The folders served under a prefix of the address, as {"/images/": Path}.
    mounts = {}

    def guess_type(self, path):
        return TYPES.get(Path(path).suffix.lower(), "application/octet-stream")

    def translate_path(self, path):
        clean = urllib.parse.unquote(path.split("?", 1)[0].split("#", 1)[0])
        for prefix, folder in self.mounts.items():
            if clean.startswith(prefix):
                rest = posixpath.normpath(clean[len(prefix):]).lstrip("/")
                parts = [p for p in rest.split("/") if p not in ("", ".", "..")]
                return str(Path(folder).joinpath(*parts))
        return super().translate_path(path)

    def log_message(self, *args):
        pass


def server(folder, port=0, host=LOOPBACK, mounts=None):
    """
    Returns a server of `folder` on `host`, port 0 for a free one. `mounts`
    maps a prefix of the address such as "/images/" to a further folder.
    """
    handler_class = type("MountedHandler", (Handler,), {"mounts": dict(mounts or {})})
    handler = functools.partial(handler_class, directory=str(folder))
    return http.server.ThreadingHTTPServer((host, port), handler)


def parse(argv):
    """Answers the folder, the port and the host of the command line `argv`."""
    host = LOOPBACK
    rest = []
    args = iter(argv)
    for arg in args:
        if arg == "--host":
            host = next(args, None)
            if not host:
                raise SystemExit("serve.py: --host needs an address")
        elif arg.startswith("--host="):
            host = arg.split("=", 1)[1]
        elif arg in ("-h", "--help"):
            print(__doc__.strip())
            raise SystemExit(0)
        else:
            rest.append(arg)
    folder = rest[0] if rest else "web"
    port = int(rest[1]) if len(rest) > 1 else 8000
    return folder, port, host


def main(argv):
    folder, port, host = parse(argv)
    httpd = server(folder, port, host)
    shown = "127.0.0.1" if host in ("0.0.0.0", "") else host
    print(f"serving {folder} at http://{shown}:{httpd.server_address[1]}/")
    if host != LOOPBACK:
        print("other computers need a secure context for WebGPU, see the head of serve.py")
    httpd.serve_forever()


if __name__ == "__main__":
    main(sys.argv[1:])
