#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-only
"""
Checks the license rule of 3D-Bausteine over the tree and over the history of the fork.

    python3 -I tools/license_lint.py                    the tree, the messages and the patches
    python3 -I tools/license_lint.py --base HEAD~3      the same above another commit
    python3 -I tools/license_lint.py --tree             the tree alone
    python3 -I tools/license_lint.py --message FILE     one commit message before it is written

Version 1.3 of Herbert Kleber carries no license and none is assumed for it. Version 2.0 is
GPL-2.0-only. COPYING says which file belongs to which. The lint holds four rules.

1. Every file of version 2.0 whose type has a comment syntax opens with the line
   SPDX-License-Identifier: GPL-2.0-only in the comment form of its language. The line stands
   first, or second under a #! line, under the doctype of a page or under the declaration of an
   XML file. A notebook carries it on the first line of its first cell, which is Markdown. The
   types are the suffixes of SPDX_SUFFIXES. Markdown pages, JSON, lock files, pictures,
   .gitignore and .gitmodules carry no line, and COPYING section 2 covers them.
2. Every Cargo.toml outside third_party/ names GPL-2.0-only as its license or takes the license
   of its workspace.
3. No file of the tree outside third_party/ and LICENSES/ holds the forbidden name, the name of
   a permissive license that an earlier draft attached to the files of version 1.3 by mistake.
   The search is case sensitive and takes the name as a whole word, so the German word for
   "with" and the capitals inside a longer word are no hit. Binary files are searched as bytes.
4. No commit message holds the forbidden name, neither of the fork nor of the upstream history
   below it, and no patch of a commit above the base, the last commit of the upstream history,
   holds it either. The patch of a file under third_party/ or LICENSES/ is left out, as rule 3
   leaves out the files.

The files are the ones git tracks together with the new files git would add, so a file is
checked before its first commit and nothing git ignores is read. Every failure is printed with
its place, and the exit status is 1 when any rule fails. The history needs every commit above
the base, so a clone of the continuous integration fetches the whole history.
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath

#: The root of the repository, one level above this file.
ROOT = Path(__file__).resolve().parents[1]

#: The last commit of the upstream history of version 1.3. The commits above it are the fork.
BASE = "9b91030"

#: The forbidden name as code points, so that no file of the repository spells it, this one
#: included. It is the name of a permissive license that an earlier draft used for the files
#: of version 1.3, which carry no license at all.
FORBIDDEN = "".join(map(chr, (77, 73, 84)))

#: A hit is the name with no letter and no digit on either side.
WORD = re.compile(r"(?<![0-9A-Za-z])" + FORBIDDEN + r"(?![0-9A-Za-z])")
WORD_BYTES = re.compile(WORD.pattern.encode("ascii"))

#: The license of version 2.0 and the line that names it.
LICENSE = "GPL-2.0-only"
TAG = re.compile(r"SPDX-License-Identifier:\s*(?P<expression>.*?)\s*(?:\*/|-->)?\s*$")

#: The suffixes of the files of version 2.0 whose type has a comment syntax, as COPYING lists them.
SPDX_SUFFIXES = (
    ".rs", ".wgsl", ".js", ".mjs", ".css", ".html", ".svg", ".sh", ".py", ".yml", ".yaml",
    ".toml",
)
#: Files whose name gives a comment syntax that the suffix does not.
SPDX_NAMES = ("requirements.txt",)
#: The notebooks carry the line in their first Markdown cell.
NOTEBOOK = ".ipynb"

#: The lines a tag may stand under: an interpreter, the doctype of a page, an XML declaration.
PREAMBLE = re.compile(r"^(?:#!|<!doctype\s|<\?xml\s)", re.IGNORECASE)

#: The folders the forbidden name is not searched in: the submodule with its own license, and
#: the texts of the licenses, which are kept as their authors wrote them.
EXEMPT = ("third_party/", "LICENSES/")

#: The bytes read of a file to find its tag.
HEAD_BYTES = 4096


class Failure(Exception):
    """A failure of the lint itself, such as a missing commit, printed without a traceback."""


def git(*args, binary=False):
    """Answers the output of one git command in the root, or raises Failure."""
    result = subprocess.run(
        ["git", "-C", str(ROOT), "-c", "core.quotePath=false", *args],
        capture_output=True, check=False,
    )
    if result.returncode != 0:
        message = result.stderr.decode("utf-8", errors="replace").strip()
        raise Failure(f"git {' '.join(args)} failed: {message}")
    return result.stdout if binary else result.stdout.decode("utf-8", errors="replace")


def files():
    """Answers the tracked files and the new files git would add, relative to the root."""
    names = git("ls-files", "-z", "--cached", "--others", "--exclude-standard", binary=True)
    paths = []
    for raw in names.split(b"\0"):
        if not raw:
            continue
        path = PurePosixPath(raw.decode("utf-8", errors="surrogateescape"))
        full = ROOT / path
        if full.is_file() and not full.is_symlink():
            paths.append(path)
    return sorted(set(paths))


def exempt(path):
    """Answers whether `path` lies in a folder the forbidden name is not searched in."""
    return str(path).startswith(EXEMPT)


def needs_tag(path):
    """Answers whether the file at `path` is a file of version 2.0 that carries the SPDX line."""
    if exempt(path):
        return False
    return path.suffix in SPDX_SUFFIXES or path.name in SPDX_NAMES or path.suffix == NOTEBOOK


def tag_of(path):
    """Answers the expression of the SPDX line of a file, or None when it has none in place."""
    full = ROOT / path
    if path.suffix == NOTEBOOK:
        try:
            cells = json.loads(full.read_text(encoding="utf-8"))["cells"]
        except (OSError, ValueError, KeyError, TypeError):
            return None
        if not cells or cells[0].get("cell_type") != "markdown":
            return None
        source = cells[0].get("source", "")
        text = "".join(source) if isinstance(source, list) else str(source)
        lines = text.splitlines()[:1]
    else:
        with open(full, "rb") as stream:
            lines = stream.read(HEAD_BYTES).decode("utf-8", errors="replace").splitlines()[:2]
        lines = lines[1:2] if lines and PREAMBLE.match(lines[0]) else lines[:1]
    for line in lines:
        match = TAG.search(line)
        if match:
            return match.group("expression")
    return None


def check_tags(paths, report):
    """Rule 1: every file of version 2.0 with a comment syntax opens with its SPDX line."""
    for path in paths:
        if not needs_tag(path):
            continue
        expression = tag_of(path)
        if expression is None:
            report(f"{path}: the first line holds no SPDX-License-Identifier: {LICENSE}")
        elif expression != LICENSE:
            report(f"{path}: the SPDX line names {expression}, version 2.0 is {LICENSE}")


def check_manifests(paths, report):
    """Rule 2: every Cargo.toml outside third_party/ is GPL-2.0-only."""
    field = re.compile(r'^license\s*=\s*"(?P<value>[^"]*)"\s*$', re.M)
    inherited = re.compile(r"^license\.workspace\s*=\s*true\s*$", re.M)
    for path in paths:
        if path.name != "Cargo.toml" or exempt(path):
            continue
        text = (ROOT / path).read_text(encoding="utf-8")
        match = field.search(text)
        if match and match.group("value") != LICENSE:
            report(f"{path}: the license field names {match.group('value')}, not {LICENSE}")
        elif not match and not inherited.search(text):
            report(f"{path}: no license field and no license.workspace = true")


def lines_with_name(text):
    """Answers the numbers of the lines of `text` that hold the forbidden name."""
    return [number for number, line in enumerate(text.splitlines(), 1) if WORD.search(line)]


def check_tree(paths, report):
    """Rule 3: no file outside third_party/ and LICENSES/ holds the forbidden name."""
    for path in paths:
        if exempt(path):
            continue
        data = (ROOT / path).read_bytes()
        if not WORD_BYTES.search(data):
            continue
        if b"\0" in data[:HEAD_BYTES]:
            report(f"{path}: the binary file holds the forbidden name")
            continue
        numbers = lines_with_name(data.decode("utf-8", errors="replace"))
        report(f"{path}: the forbidden name stands on line {', '.join(map(str, numbers))}")


def check_history(base, report):
    """Rule 4: no message of the history and no patch above `base` holds the forbidden name."""
    try:
        git("rev-parse", "--verify", "--quiet", f"{base}^{{commit}}")
    except Failure:
        raise Failure(
            f"the base commit {base} is not in this clone, which a shallow clone causes: "
            "fetch the whole history, for example with fetch-depth 0 in the checkout"
        ) from None
    commits = git("rev-list", f"{base}..HEAD").split()
    for commit in git("rev-list", "HEAD").split():
        if lines_with_name(git("show", "-s", "--format=%an <%ae>%n%cn <%ce>", commit)):
            report(f"commit {commit[:12]}: the author or the committer holds the forbidden name")
        for number in lines_with_name(git("show", "-s", "--format=%B", commit)):
            report(f"commit {commit[:12]}: the message holds the forbidden name on line {number}")
    patch = git(
        "log", "-p", "--format=commit %H", "--no-color", "--no-ext-diff", "--no-textconv",
        f"{base}..HEAD",
    )
    commit, skipping, path = "", False, ""
    for line in patch.splitlines():
        if line.startswith("commit ") and len(line) == 47:
            commit, skipping, path = line[7:19], False, ""
            continue
        if line.startswith("diff --git "):
            names = line[len("diff --git "):].replace('"', "")
            path = names.split(" b/", 1)[-1]
            skipping = path.startswith(EXEMPT) or names.startswith(
                tuple("a/" + folder for folder in EXEMPT)
            )
            continue
        if not skipping and WORD.search(line):
            report(f"commit {commit}: the patch of {path or 'the commit'} holds the forbidden name")
    return len(commits)


def check_message(path, report):
    """Checks one commit message, such as .git/COMMIT_EDITMSG in a commit-msg hook."""
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    for number in lines_with_name(text):
        report(f"{path}: the message holds the forbidden name on line {number}")


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    parser.add_argument("--base", default=BASE, help=f"the last upstream commit (default {BASE})")
    parser.add_argument("--tree", action="store_true", help="check the tree and not the history")
    parser.add_argument("--message", metavar="FILE", help="check one commit message and stop")
    options = parser.parse_args(argv)

    failures = []

    def report(text):
        text = WORD.sub("(the forbidden name)", text)
        failures.append(text)
        print(f"license_lint: {text}", file=sys.stderr)

    try:
        if options.message:
            check_message(options.message, report)
            summary = "the message"
        else:
            paths = files()
            check_tags(paths, report)
            check_manifests(paths, report)
            check_tree(paths, report)
            summary = f"{len(paths)} files"
            if not options.tree:
                count = check_history(options.base, report)
                summary += f", every commit message and the patches of {count} commits"
                summary += f" above {options.base}"
    except Failure as error:
        print(f"license_lint: {error}", file=sys.stderr)
        return 1
    if failures:
        print(f"license_lint: {len(failures)} failures in {summary}", file=sys.stderr)
        return 1
    print(f"license_lint: {summary} pass")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
