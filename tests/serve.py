#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-only
"""
Serves a folder as a static site, the way any static host serves web/.

    python3 tests/serve.py web [port]

3D-Bausteine needs no server of its own: the page, its module scripts, the
script of its Web Worker and the module of WebAssembly are files. This
server only makes sure every file goes out with the media type a browser
demands of a module script and of WebAssembly.
"""

import functools
import http.server
import sys
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
}


class Handler(http.server.SimpleHTTPRequestHandler):
    """Serves the files of the folder with the media types of TYPES."""

    def guess_type(self, path):
        return TYPES.get(Path(path).suffix, "application/octet-stream")

    def log_message(self, *args):
        pass


def server(folder, port=0):
    """Returns a server of `folder` on the loopback, port 0 for a free one."""
    handler = functools.partial(Handler, directory=str(folder))
    return http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)


def main(argv):
    folder = argv[0] if argv else "web"
    port = int(argv[1]) if len(argv) > 1 else 8000
    httpd = server(folder, port)
    print(f"serving {folder} at http://127.0.0.1:{httpd.server_address[1]}/")
    httpd.serve_forever()


if __name__ == "__main__":
    main(sys.argv[1:])
