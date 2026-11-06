# Licensing

The repository holds version 1.3 of 2002 and version 2.0 of 2026 side by side, under different
terms. [COPYING](../COPYING) says which file falls under which, and this page says why the parts
that version 2.0 links fit its license.

## 1. Version 1.3

The Visual Basic 5 program of Herbert Kleber carries no license. Its files stay in the repository
as they are, every right in them stays with their author, and the license of version 2.0 does not
reach them. Version 2.0 contains no code of version 1.3. It implements the design that the diploma
thesis "Grundlagen der 3D-Computergrafik" describes, and its comments name the procedure of
version 1.3 that each part takes the place of, so a reader can compare the two.

## 2. Version 2.0

Every file of version 2.0 is GPL-2.0-only, Copyright (C) 2026 Florian Kleber, and opens with the
line `SPDX-License-Identifier: GPL-2.0-only`. The text of the license is
[LICENSES/GPL-2.0-only.txt](../LICENSES/GPL-2.0-only.txt). The license is version 2 only, without
the clause "or any later version".

## 3. What a build links

A program under GPL-2.0-only may link code whose license allows its terms. The Apache License 2.0
alone does not, since its patent clause adds a restriction that version 2 of the GPL forbids. Every
crate a build of version 2.0 links therefore has to offer a license that GPL-2.0-only allows, and
`cargo metadata` lists the license of each:

```sh
cargo metadata --format-version 1 --filter-platform wasm32-unknown-unknown
cargo metadata --format-version 1 --manifest-path service/Cargo.toml
```

The renderer links wgpu, wasm-bindgen, js-sys and web-sys with their dependencies, the service links
the crates of Aosabi with theirs, and the geometry links nothing outside the standard library. Each
of them offers a license that GPL-2.0-only allows. A crate whose only license is Apache-2.0, such as
`codespan-reporting`, appears in the lock as a dependency of naga but is linked by no build, which
`cargo tree -i codespan-reporting --target wasm32-unknown-unknown -e normal` shows. A change that
adds a crate checks its license the same way.

## 4. The textures and the scenes

The names of the 43 textures are the identifiers of the include files of POV-Ray 3, which an
exported scene names so POV-Ray finds them. Version 2.0 holds no part of those include files. The
example scenes are new scenes built after the ideas of the scene files of version 1.3.
