#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-only
"""
Runs the test notebooks of 3D-Bausteine with papermill.

    python3 tests/run.py                 every notebook
    python3 tests/run.py 10 30           the notebooks whose names start so
    python3 tests/run.py --fast          every notebook without a browser

Each executed notebook lands under tests/notebooks/out/, which is never
committed, and the run ends with exit code 1 when any notebook fails.
"""

import sys
import time
from pathlib import Path

import papermill

HERE = Path(__file__).resolve().parent
NOTEBOOKS = HERE / "notebooks"
OUT = NOTEBOOKS / "out"

#: The notebooks that drive a browser, which --fast leaves out.
BROWSER = ("60_", "70_", "80_")


def main(argv):
    fast = "--fast" in argv
    prefixes = [a for a in argv if not a.startswith("--")]
    books = sorted(p for p in NOTEBOOKS.glob("*.ipynb"))
    if prefixes:
        books = [b for b in books if b.name.startswith(tuple(prefixes))]
    if fast:
        books = [b for b in books if not b.name.startswith(BROWSER)]
    OUT.mkdir(parents=True, exist_ok=True)
    failed = []
    for book in books:
        start = time.monotonic()
        try:
            papermill.execute_notebook(
                str(book), str(OUT / book.name), cwd=str(HERE),
                kernel_name="python3", progress_bar=False,
            )
            status = "passed"
        except Exception as error:  # noqa: BLE001, the report names every failure
            status = "FAILED"
            failed.append((book.name, error))
        print(f"{status:7} {book.name}  {time.monotonic() - start:.1f} s", flush=True)
    for name, error in failed:
        print(f"\n--- {name}\n{str(error)[-3000:]}")
    print(f"\n{len(books) - len(failed)} of {len(books)} notebooks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
