#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-only
#
# Builds 3D-Bausteine: the copy of the service that cargo aosabi generates,
# the module of the Web Worker for wasm32 bound with wasm-bindgen into
# web/pkg, and the native binary bausteine-graphql of the test notebooks,
# which boots the same GraphQL engine as the worker. Run it from the root of
# the repository.
#
#   sh tools/build.sh            the release build of the module
#   sh tools/build.sh --dev      a faster build with debug information
#   sh tools/build.sh --check    the service and a check of the module alone
#
# The check builds the command line of Aosabi and the generated copy of the
# service as the build does, then runs cargo check on the module for wasm32
# and writes no binary, which is enough for clippy and for a quick job of the
# continuous integration. A build ends with the size of the module of
# WebAssembly in bytes, the number a reader of the page downloads once.
#
# It needs the toolchain of rust-toolchain.toml, wasm-bindgen-cli of the
# version crates/bausteine-web/Cargo.lock pins, and the submodule
# third_party/aosabi. The check needs no wasm-bindgen. The page under web/
# needs no server of its own: any static host serves it, for example
# python3 tests/serve.py web.

set -eu

mode=build
profile=release
flag=--release
case "${1:-}" in
"") ;;
--dev)
	profile=debug
	flag=
	;;
--check)
	mode=check
	;;
*)
	echo "build.sh: unknown argument $1, the arguments are --dev and --check" >&2
	exit 2
	;;
esac

if [ ! -f third_party/aosabi/Cargo.toml ]; then
	git submodule update --init third_party/aosabi
fi

echo "build.sh: the command line of Aosabi"
cargo build --locked --manifest-path third_party/aosabi/Cargo.toml \
	-p aosabi-cli --bin cargo-aosabi
aosabi="$(pwd)/third_party/aosabi/target/debug/cargo-aosabi"

echo "build.sh: the service, its schema and its generated copy"
"$aosabi" build --locked --device worker --manifest-path service/Cargo.toml

web=crates/bausteine-web

if [ "$mode" = check ]; then
	echo "build.sh: a check of the module of the Web Worker for wasm32-unknown-unknown"
	cargo check --locked --manifest-path "$web/Cargo.toml" --lib \
		--target wasm32-unknown-unknown
	echo "build.sh: the check is done"
	exit 0
fi

bindgen=$(sed -n '/^name = "wasm-bindgen"$/{n;s/version = "\(.*\)"/\1/p;}' "$web/Cargo.lock")
if ! wasm-bindgen --version 2>/dev/null | grep -q "$bindgen"; then
	echo "build.sh: wasm-bindgen $bindgen is missing, install it with" >&2
	echo "  cargo install wasm-bindgen-cli --version $bindgen --locked" >&2
	exit 1
fi

echo "build.sh: the module of the Web Worker for wasm32-unknown-unknown ($profile)"
cargo build --locked $flag --manifest-path "$web/Cargo.toml" --lib \
	--target wasm32-unknown-unknown
wasm-bindgen --target web --no-typescript --out-dir web/pkg \
	"$web/target/wasm32-unknown-unknown/$profile/bausteine_web.wasm"

echo "build.sh: the GraphQL engine of the notebooks"
cargo build --locked --manifest-path "$web/Cargo.toml" --bin bausteine-graphql

wasm=web/pkg/bausteine_web_bg.wasm
bytes=$(wc -c <"$wasm" | tr -d ' ')
echo "build.sh: $wasm holds $bytes bytes ($profile)"

echo "build.sh: done. Serve the page with"
echo "  python3 tests/serve.py web"
