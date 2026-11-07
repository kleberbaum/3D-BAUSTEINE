#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-only
#
# Lints 3D-Bausteine the way the first job of the continuous integration
# does, and is the check to run before every commit. Run it from the root of
# the repository.
#
#   sh tools/lint.sh
#
# It runs four checks in turn and reports every one that fails, so a single
# run lists everything to fix.
#
#   format    Runs cargo fmt --check on the three cargo workspaces: the root
#             with the geometry and the devtool, the service, and the module
#             of the Web Worker.
#   clippy    Runs cargo clippy with every warning an error on the root, on
#             the service, and on the module of the Web Worker for wasm32 and
#             for the build host, where bausteine-graphql runs.
#   license   Runs tools/license_lint.py, which checks the SPDX line of every
#             file of version 2.0 and looks for the forbidden name in the
#             tree, in the messages and in the patches of the fork.
#   notebooks Checks that every notebook under tests/notebooks is committed
#             without its outputs, its execution counts and the metadata of
#             papermill.
#
# The module of the Web Worker links the copy of the service that cargo
# aosabi generates, so the script runs sh tools/build.sh --check before the
# lints, which writes that copy again from service/src and so never lints the
# module against a copy older than the service. The exit status is 1 when any
# check fails.

set -u

failed=

step() {
	name=$1
	shift
	echo "lint.sh: $name: $*"
	if ! "$@"; then
		echo "lint.sh: $name FAILED" >&2
		failed="$failed $name"
	fi
}

web=crates/bausteine-web/Cargo.toml

step format cargo fmt --check
step format cargo fmt --check --manifest-path service/Cargo.toml
step format cargo fmt --check --manifest-path "$web"

step clippy sh tools/build.sh --check
step clippy cargo clippy --locked --workspace --all-targets -- -D warnings
step clippy cargo clippy --locked --manifest-path service/Cargo.toml --all-targets \
	-- -D warnings
step clippy cargo clippy --locked --manifest-path "$web" --lib \
	--target wasm32-unknown-unknown -- -D warnings
step clippy cargo clippy --locked --manifest-path "$web" --all-targets -- -D warnings

step license python3 -I tools/license_lint.py

# A notebook keeps its outputs under tests/notebooks/out/, which git ignores.
# The committed copy holds the cells alone, so a diff shows what changed in
# the test and never the noise of a run.
step notebooks python3 -I - tests/notebooks/*.ipynb <<'EOF'
import json
import sys

bad = []
for path in sys.argv[1:]:
    with open(path, encoding="utf-8") as stream:
        book = json.load(stream)
    if "papermill" in book.get("metadata", {}):
        bad.append(f"{path}: the metadata of papermill")
    for number, cell in enumerate(book.get("cells", []), 1):
        if "papermill" in cell.get("metadata", {}) or "execution" in cell.get("metadata", {}):
            bad.append(f"{path}: cell {number} keeps the metadata of a run")
        if cell.get("cell_type") != "code":
            continue
        if cell.get("outputs"):
            bad.append(f"{path}: cell {number} keeps its outputs")
        if cell.get("execution_count") is not None:
            bad.append(f"{path}: cell {number} keeps its execution count")
for line in bad:
    print(f"lint.sh: {line}", file=sys.stderr)
print(f"lint.sh: {len(sys.argv) - 1} notebooks, {len(bad)} traces of a run")
sys.exit(1 if bad else 0)
EOF

if [ -n "$failed" ]; then
	echo "lint.sh: failed:$failed" >&2
	exit 1
fi
echo "lint.sh: every check passes"
