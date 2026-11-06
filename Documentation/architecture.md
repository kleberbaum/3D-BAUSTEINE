# Architecture

3D-Bausteine 2.0 is the CAD program of the diploma thesis "Grundlagen der 3D-Computergrafik",
written again in Rust. The program of 2002 is Visual Basic 5 with a C library for the oblique view
and POV-Ray as the ray tracer. Version 2.0 runs in the browser: the geometry and the renderer are
Rust compiled to WebAssembly, the renderer draws with WebGPU, and the scenes of a class live in a
service of [Aosabi](https://github.com/netsnek/aosabi) behind one GraphQL API. This page shows the
parts, how a change of a scene travels, and where each part of version 1.3 went.

## 1. The parts

```text
page, the main thread                          Web Worker
+--------------------------------------+       +---------------------------------------------+
| web/index.html, style.css            |       | web/js/worker.js                            |
| js/main.js    menus, toolbars, mouse |       |   web/pkg/bausteine_web.wasm                |
|               input mask, undo       |       |                                             |
| js/store.js   the GraphQL client     | ----> |   Engine    aosabi::embed with service/     |
|               of the scenes          | query |               Query and Mutation over the   |
| js/bridge.js  the messages, and the  | <---- |               scenes of the class           |
|               cameras of the last    | reply |                     |                       |
|               frame for the overlays |       |                     | snapshot of a scene   |
|                                      | state |                     v                       |
|                                      | ----> |   Renderer  wgpu on WebGPU, four views, the |
|                                      | frame |               classic look and the ray      |
|                                      | <---- |               tracer, into the canvas       |
| <canvas> transferred once  ======================> OffscreenCanvas                         |
+--------------------------------------+       +---------------------------------------------+
                                     crates/bausteine-core
                         the geometry the service and the renderer share
```

Everything of the program runs in the browser, and the page needs no server of its own: any static
host serves the folder `web/`. The page starts one Web Worker and hands it its canvas as an
`OffscreenCanvas`. The worker runs one module of WebAssembly, which holds two parts. The engine is
the service of [Aosabi](https://github.com/netsnek/aosabi) from `service/`, booted with
`aosabi::embed`, which answers each GraphQL request the page sends as a message, with no socket and
no HTTP. The renderer draws the four views with WebGPU into the canvas, from the scene the service
holds, so a scene crosses the boundary between page and worker as GraphQL alone and never as
geometry.

| Folder | Holds |
| --- | --- |
| [crates/bausteine-core](../crates/bausteine-core/) | The geometry, with no dependency outside the standard library |
| [crates/bausteine-web](../crates/bausteine-web/) | The module of the Web Worker: the engine and the renderer on WebGPU through wgpu |
| [crates/bausteine-devtool](../crates/bausteine-devtool/) | The seam of the test notebooks to the geometry, one primitive per subcommand |
| [service](../service/) | The service of Aosabi: the scenes and the GraphQL API |
| [web](../web/) | The page and the script of the worker: HTML, CSS and plain ES modules with no build step |
| [third_party/aosabi](https://github.com/netsnek/aosabi) | Aosabi as a submodule, since its crates are not on a registry yet |
| [tools/build.sh](../tools/build.sh) | The build of the service, the module and the engine of the notebooks |
| [tests](../tests/) | The test cases, Jupyter notebooks run by papermill |

The messages between page and worker are few. `graphql` carries the JSON body of a GraphQL request
and its answer. `state` carries what only the renderer needs: the size of the canvas, the cameras,
the look, the selection and the item a click is inserting. After each frame the worker posts the
cameras it drew with, so the page projects the points of its overlays, the rubber band and the
coordinates under the mouse, without a round trip. `pick`, `bounds` and `snapshot` answer the item
under a pixel, the box around the scene and the pixels of the views for an image.

## 2. The geometry

The crate `bausteine-core` holds what the program knows about space, in modules that each answer a
module or a form of version 1.3:

| Module | Holds | In version 1.3 |
| --- | --- | --- |
| `math` | The vectors and the homogeneous 4x4 matrices | `M2.bas` |
| `body` | The eight bodies and the four operations of the CSG | `F4.frm` |
| `texture` | The 43 standard textures of POV-Ray | `Fill_CB3_Texi` of `POV.bas` |
| `scene` | The items and the tree of their groups | `obj()` of `Module1.bas` |
| `mesh` | The polygon model of the unit bodies and its edges | `D3_Kugel` and the others |
| `view` | The three normal views and the oblique view | `View()` of `3D_bau.frm` |
| `drawing` | The faces and the lines of each view | `draw2D` and `graf3d32.dll` |
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
tree makes that mistake impossible.

## 3. The four views

The front view (Aufriss), the side view (Kreuzriss) and the top view (Grundriss) are parallel
projections that share one centre and one scale, so a point lies on one line in each pair of views,
as the reference lines of the lesson ask. The oblique view (Schrägriss) is a perspective camera that
orbits the scene.

The views follow the rules of a technical drawing. A view draws the edges where two faces meet at an
angle and the outline where a curved surface turns away from the viewer, computed for each view from
the normals of the two faces of each edge. An edge that a face hides is drawn a second time, dashed
and faint, by a pipeline whose depth test passes behind the faces. A body that a difference cuts
away draws as a dashed ghost, since the rasterizer does not compute the solid of the CSG.

## 4. The ray tracer

Version 1.3 writes `ausgabe.pov` and starts POV-Ray, which ran under Windows 98 and failed under
Windows NT on the first day in class. Version 2.0 traces the rays in a fragment shader of the
oblique view. The crate `bausteine-core` writes the tree of the scene in postfix order, one node per
body with the inverse of its matrix and its material, one node per operation. The shader evaluates
the distance functions of the bodies on a small stack, where a union is the minimum, an intersection
the maximum and a difference the maximum with the negated distance of the cutter, and finds the
surface by sphere tracing. The room is the one of the POV export: a checkered floor that mirrors a
little, two white walls, the sky and one light, with soft shadows, mirrors for the metals and glass
that lets light through. The export to POV-Ray stays, so the image of POV-Ray is one download away.

## 5. The service and the API

The service is a plain Rust crate. Its types and its `impl` blocks are the schema, which `cargo
aosabi build --device worker` infers and writes to `service/target/aosabi/schema.graphql`, together
with a generated copy of the crate that the module of the worker links. [graphql.md](graphql.md)
lists the API with examples.

A change of a scene travels this way:

1. The page sends a mutation, such as `updateItem`, to the worker.
2. The service checks the input, applies it, puts every group before its children and counts the
   revision up.
3. The worker answers the mutation and compares the revision of the scene the renderer shows with
   the one the service holds. A newer revision hands the scene to the renderer, which builds its
   buffers again and draws a frame.

The scenes live in the memory of the worker for as long as the page is open, and the page keeps a
copy of the open scene in the storage of the browser, which it loads again on the next visit. A
class saves a scene it wants to keep as a file. A server that holds the scenes of a whole class and
streams the changes to every page is a later step: the service is the same crate, and Aosabi serves
it through a card of its own.

## 6. Building

```sh
git submodule update --init
cargo install wasm-bindgen-cli --version 0.2.130 --locked
sh tools/build.sh
python3 tests/serve.py web
```

The script builds the command line of Aosabi, the service and its generated copy, the module of the
worker for `wasm32-unknown-unknown` bound into `web/pkg` by wasm-bindgen, and the native binary
`bausteine-graphql`, which boots the same engine for the notebooks. `tests/serve.py` is a static
server that gives the module scripts and the module of WebAssembly their media types, and any other
static host does the same.

The page needs a browser with WebGPU in a Web Worker: Chrome and Edge since version 113, Safari
since 26 and Firefox since 141.