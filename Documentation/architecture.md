# Architecture

3D-Bausteine 2.0 is the CAD program of the diploma thesis "Grundlagen der 3D-Computergrafik",
written again in Rust. The program of 2002 is Visual Basic 5 with a C library for the oblique view
and POV-Ray as the ray tracer. Version 2.0 runs in the browser: the geometry and the renderer are
Rust compiled to WebAssembly, the renderer draws with WebGPU, and the scenes live in a service of
[Aosabi](https://github.com/netsnek/aosabi) behind one GraphQL API. This page shows the parts, how
a change of a scene travels, how the page and the worker number the views, how the program is
built and checked, and the environment version 1.3 ran in.

## 1. The parts

![The page on the main thread is the GraphQL client, the Web Worker is the GraphQL server with the
engine and the renderer, postMessage is the wire, and the binary bausteine-graphql boots the same
engine on the build host](images/architecture.svg)

The page is the GraphQL client, the Web Worker is the GraphQL server, and the wire between them is
`postMessage`. There is no HTTP, no socket and no server process: any static host serves the
folder `web/`, and the page needs no server of its own. The page starts one Web Worker and hands it
its canvas once as an `OffscreenCanvas`. The worker runs one module of WebAssembly, which holds two
parts. The engine is the service of Aosabi from `service/`, booted with `aosabi::embed`, which
answers each GraphQL request body the page sends as a message. The renderer draws the four views
with WebGPU into the canvas, from the scene the service holds. After every answer the worker reads
the shown scene straight from the service and hands it to the renderer, so a scene crosses the
boundary between page and worker as GraphQL alone and never as geometry.

On the build host the binary `bausteine-graphql` boots the same engine and answers one request body
per line of its standard input. `tests/harness.py` drives it, so the notebooks judge the engine the
page talks to, and they drive the page itself in a headless Chromium with WebGPU on SwiftShader. A
later version can serve the same service with the card server of `cargo aosabi build`, which
answers the same bodies at `POST /graphql`. Then `bridge.js` gains a fetch transport, and
`store.js` and the modules stay as they are.

| Folder | Holds |
| --- | --- |
| [crates/bausteine-core](../crates/bausteine-core/) | The geometry, with no dependency outside the standard library |
| [crates/bausteine-web](../crates/bausteine-web/) | The module of the Web Worker: the engine and the renderer on WebGPU through wgpu, and the binary `bausteine-graphql` |
| [crates/bausteine-devtool](../crates/bausteine-devtool/) | The seam of the test notebooks to the geometry, one primitive per subcommand |
| [service](../service/) | The service of Aosabi: the scenes and the GraphQL API |
| [web](../web/) | The page and the script of the worker: HTML, CSS and plain ES modules with no build step |
| [third_party/aosabi](https://github.com/netsnek/aosabi) | Aosabi as a submodule, since its crates are not on a registry yet |
| [tools](../tools/) | The build, the lints and the check of the license rule |
| [tests](../tests/) | The test cases, Jupyter notebooks run by papermill |
| [Documentation](.) | This page, the protocol of the worker, the API, the licenses and the register of quirks |

## 2. The page

The page is one HTML document, two stylesheets and a flat set of plain ES modules under `web/js/`,
loaded without a build step. Every URL in it is relative, so the page works under any path of any
host.

| File | Holds |
| --- | --- |
| `index.html` | The one DOM of both looks: Form1 with the menus and the four views, the windows F2 to F6 and F9, the dialogs and the splash |
| `style.css` | The modern look, light and dark, with the windows docked in a grid |
| `classic.css` | The classic look of version 1.3, scoped under `html[data-look="classic"]` |
| `js/state.js` | The shared state `app`, the events `on` and `emit`, the status line, the number format with the German comma |
| `js/scene.js` | The commit of a change, undo and redo, the selection |
| `js/store.js` | The GraphQL client with its query texts, the table of the bodies, and the shelf of scenes in the storage of the browser |
| `js/bridge.js` | The transport to the worker, the indices of the views, and the projection of a point with the cameras of the last frame |
| `js/views.js` | The mouse of the four views, the overlays, the zoom ladders and the fields of F5 |
| `js/koerper.js` | The tab Körper: the list OBJEKTE, the input mask, the three buttons and the handshake of `mark_point` |
| `js/register.js` | The tabs of F4 and the tabs Ausgabe, Kamera and Einstellung |
| `js/bilder.js` | The tab Bilder, the pictures in IndexedDB and the slide show F9 |
| `js/farben.js` | The window Farben/Texturen F6 and the dialog Farben |
| `js/menus.js` | The menu bar and the states of its entries |
| `js/dialogs.js` | The message box, the tool tips, the dialogs Öffnen and Hilfe, the splash |
| `js/look.js` | The switch of the look and the theme, the virtual screen and the windows of the classic look |
| `js/icons.js`, `js/icons-classic.js` | The modern icons as SVG, and the pixel icons of the classic look |
| `js/main.js` | The start of the page, the commands of the menus and the tool bars, the keys and the debug door |
| `js/worker.js` | The script of the Web Worker, which turns each message into one call of the module |

The two looks share one DOM. Switching the look sets `html[data-look]`, activates or drops the rules
of `classic.css` and swaps a few captions and icons, and it creates and removes no element with an
id. The data never differ between the looks: a look is a presentation, never another behaviour of
the scene.

The page keeps the open scene in `localStorage` under `bausteine.shelf.v2`, the look, the theme and
the settings under `bausteine.look`, `bausteine.theme`, `bausteine.inverted`, `bausteine.display`
and `bausteine.einstellung`, and the pictures of the tab Bilder in the IndexedDB `bausteine`. The
address names the scene: `#/szene/<key>` opens the copy of the shelf under that key, and `#d=<data>`
carries a whole scene for a link to share. Under `?debug` the page hands `window.bausteine` to the
console and to the notebooks, and `?offscreen` lets the worker draw into a texture of its own for
the headless browser of the notebooks.

## 3. The wire and the views

The messages between page and worker are few, and [worker.md](worker.md) is their reference.
`graphql` carries the JSON body of a GraphQL request and its answer. `state` carries what only the
renderer needs: the viewports, the cameras, the look, the scene to show, the selection and the body
the page is placing. After each frame the worker posts the cameras it drew with, so the page
projects the points of its overlays and the coordinates under the mouse without a round trip.
`init`, `pick`, `bounds`, `snapshot`, `render`, `dump` and `close` answer the start, the item under
a pixel, the box around the scene, the pixels of the views, a frame on demand, the state of the
worker and its end.

The views carry the indices of the renderer on the wire, in `data-view` of the DOM and in the
cameras of a frame. Version 1.3 numbered them differently, and its numbers appear only in comments
and in the register of quirks.

| Index | View | In version 1.3 | Place | Right | Up |
| --- | --- | --- | --- | --- | --- |
| `0` | Aufriss, the front view | `iyz = 2` | Top right | y | z |
| `1` | Kreuzriss, the side view | `ixz = 3` | Top left | −x | z |
| `2` | Grundriss, the top view | `ixy = 1` | Bottom right | y | −x |
| `3` | Schrägriss, the oblique view | `id3 = 4` | Bottom left | | |

The places are those of the zugeordnete Normalrisse of the GZ lesson: the Grundriss under the
Aufriss and the Kreuzriss beside it. The DOM holds the four views in the order `1 0 3 2`, which is
the order of reading them.

## 4. The geometry

The crate `bausteine-core` holds what the program knows about space, in modules that each answer a
module or a form of version 1.3:

| Module | Holds | In version 1.3 |
| --- | --- | --- |
| `math` | The vectors and the homogeneous 4x4 matrices | `Module2.bas` |
| `body` | The eight bodies and the four operations of the CSG | `F4.frm` |
| `texture` | The 43 standard textures of POV-Ray | `Fill_CB3_Texi` of `POV.bas` |
| `scene` | The items and the tree of their groups | `obj()` of `Module1.bas` |
| `mesh` | The polygon model of the unit bodies and its edges | `D3_Kugel` and the others |
| `view` | The three normal views and the oblique view | `View()` of `3D_bau.frm` |
| `drawing` | The faces and the lines of each view | `draw2D` and `graf3d32.dll` |
| `classic` | The wire models, the dot raster and the cavalier projection of version 1.3 | `D3_Refresh` of `Module1.bas`, `grid` of `3D_bau.frm`, `graf3d32.dll` |
| `pov` | The export to POV-Ray | `POV.bas` |
| `raytrace` | The program of the ray tracer on the GPU | POV-Ray itself |
| `packed` | A scene as one array of numbers | |
| `examples` | The scenes a class starts from | The POV files of the slide show |

Every body is a unit body that the matrix of its item scales, turns and moves, as `FillTM` builds
it: translation · rotation x · rotation y · rotation z · scaling. The unit bodies and the meaning of
the position and the dimensions are those of version 1.3, so a scene of the old program keeps its
meaning. The coordinate system is the one of the GZ lesson, right handed with x towards the viewer
of the front view, y to the right and z up.

A group of the CSG is an item whose children name it as their parent. Version 1.3 writes a group as
a pair of a beginning and a `CSG-Ende` in its flat list, and a missing end breaks the export. The
tree makes that mistake impossible, and the list OBJEKTE still shows the flat form of version 1.3.

## 5. The four views

The front view (Aufriss), the side view (Kreuzriss) and the top view (Grundriss) are parallel
projections that share one centre and one scale, so a point lies on one line in each pair of views,
as the reference lines of the lesson ask. In the modern look the oblique view (Schrägriss) is a
perspective camera that orbits the scene, and the shared centre puts the origin in the middle of
each view.

The modern views follow the rules of a technical drawing. A view draws the edges where two faces
meet at an angle and the outline where a curved surface turns away from the viewer, computed for
each view from the normals of the two faces of each edge. An edge that a face hides is drawn a
second time, dashed and faint, by a pipeline whose depth test passes behind the faces. A body that
a difference cuts away draws as a dashed ghost, since the rasterizer does not compute the solid of
the CSG.

The classic look draws as version 1.3 drew: black views with a white raster of single dots, the
wire models of the bodies, and the oblique view as the cavalier projection of `graf3d32.dll`, which
the worker hands to the page as a matrix like every other camera. The shared centre places the
origin at the fraction `(F/5) / 328.27` of each view, where `F` is the shorter outer side of Form1,
which is where the pictures of the thesis show it.

## 6. The ray tracer

Version 1.3 writes `ausgabe.pov` and starts POV-Ray. Version 2.0 traces the rays in a fragment
shader of the oblique view. The crate `bausteine-core` writes the tree of the scene in postfix
order, one node per body with the inverse of its matrix and its material, one node per operation.
The shader evaluates the distance functions of the bodies on a small stack, where a union is the
minimum, an intersection the maximum and a difference the maximum with the negated distance of the
cutter, and finds the surface by sphere tracing. The room is the one of the POV export: a checkered
floor that mirrors a little, two white walls, the sky and one light, with soft shadows, mirrors for
the metals and glass that lets light through. The export to POV-Ray stays, so the image of POV-Ray
is one download away.

## 7. The service and the API

The service is a plain Rust crate. Its types and its `impl` blocks are the schema, which `cargo
aosabi build --device worker` infers and writes to `service/target/aosabi/schema.graphql`, together
with a generated copy of the crate that the module of the worker links. [graphql.md](graphql.md)
lists the API with examples.

A change of a scene travels this way:

1. The page sends a mutation, such as `updateItem`, to the worker.
2. The service checks the input, applies it, puts every group before its children and counts the
   revision up.
3. The worker answers the mutation, compares the revision of the scene the renderer shows with the
   one the service holds, and hands a newer scene to the renderer, which builds its buffers again.
4. The renderer draws a frame and the worker posts `frame` with the cameras and the revision, which
   the page writes to `html[data-revision]`.

The scenes live in the memory of the worker for as long as the page is open, and the page keeps a
copy of the open scene in the storage of the browser, which it loads again on the next visit. The
page owns its one worker and nobody else writes to it, so the API has no subscription. A class
saves a scene it wants to keep as a file.

## 8. Building, checking and serving

```sh
git submodule update --init
cargo install wasm-bindgen-cli --version 0.2.130 --locked
sh tools/build.sh
python3 tests/serve.py web
```

`tools/build.sh` builds the command line of Aosabi, the service and its generated copy, the module
of the worker for `wasm32-unknown-unknown` bound into `web/pkg` by wasm-bindgen, and the native
binary `bausteine-graphql`, which boots the same engine for the notebooks. It ends with the size of
`web/pkg/bausteine_web_bg.wasm` in bytes. `--dev` builds with debug information and faster, and
`--check` builds the service and checks the module for wasm32 without writing a binary.

`tools/lint.sh` is the check before a commit. It runs `cargo fmt --check` and `cargo clippy` with
every warning an error on the three cargo workspaces, the module of the worker for wasm32 and for
the build host, then `tools/license_lint.py`, and it checks that every notebook is committed
without its outputs. The license lint checks the SPDX line of every file of version 2.0 and that
the name of the permissive license an earlier draft attached to version 1.3 stands in no file, no
commit message and no patch of the fork. [licensing.md](licensing.md) says why.

`python3 tests/run.py` runs the notebooks with papermill, and `--fast` runs those that need no
browser. The continuous integration in `.github/workflows/ci.yml` runs three jobs: `lint` runs
`tools/lint.sh` over the whole history, `build-and-fast` builds and runs the fast notebooks, and
`browser` runs the notebooks that drive the page in a headless Chromium. The workflow
`.github/workflows/pages.yml` publishes `web/` on GitHub Pages and is prepared and switched off.

A static host serves the page when it gives `.js` the type `text/javascript`, `.wasm` the type
`application/wasm` and `.svg` the type `image/svg+xml`, and serves it in a secure context, over
https or from localhost, since WebGPU and `transferControlToOffscreen` need one. No header of
isolation is needed, since the page shares no memory between threads. `tests/serve.py` is such a
host for a developer and for the notebooks.

Both looks need the same browser: WebGPU in a Web Worker that draws into an `OffscreenCanvas`, which
Chrome and Edge offer since version 113, Safari since 26, and Firefox since 141 where it has
switched WebGPU on.

## 9. The environment of version 1.3

Version 1.3 documents nowhere what it needs to run, so this section writes it down from the
project file `3d_bau.vbp`, the file `3D_BAU.EXE` and the `Declare` lines of `Module1.bas`.

| Part | Version 1.3 needs | Version 2.0 needs instead |
| --- | --- | --- |
| System | Windows 98 or Windows NT 4.0, the platforms the thesis names | A browser with WebGPU in a Web Worker |
| Runtime | `MSVBVM50.DLL`, the runtime of Visual Basic 5, with the German language library `VB5DE.DLL` | The module of WebAssembly under `web/pkg` |
| Controls | `COMCTL32.OCX` 1.3 for the tool bars and their image lists, `TABCTL32.OCX` 1.1 for the SSTab of F4, `COMDLG32.OCX` 1.2 for the dialog Farben and the file dialogs | HTML and CSS in both looks |
| Library | `graf3d32.dll`, a debug build of `Grafik3d.cpp`, at the fixed path `C:\3DBAU\graf3d32.DLL` that every `Declare` names | The renderer of the module |
| Folder | The program installed in `C:\3DBAU`, with `screen.exe` there for the button Bildschirmeinstellungen | Any folder of any static host |
| Ray tracer | POV-Ray 3.1 for Windows at `C:\3DBAU\POV31\bin\pvengine.exe` | The ray tracer of the oblique view, and the export for POV-Ray |
| Screen | At least 800 by 600 for Form1, and 1024 by 768 for the window Farben/Texturen to stand on the screen whole | Any window, and the virtual screens of the classic look |

The register of quirks keeps these as row M-80, and [quirks.md](quirks.md) says how version 2.0
handles each quirk of version 1.3.
