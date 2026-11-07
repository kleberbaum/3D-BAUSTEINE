# The worker protocol

The page of 3D-Bausteine starts one Web Worker and talks to it through `postMessage` alone. The
worker runs the module of WebAssembly of [crates/bausteine-web](../crates/bausteine-web/), which
holds the GraphQL engine of the service and the renderer on WebGPU, and draws into the canvas the
page transfers to it once at the start. This page is the reference of the messages between the two:
[web/js/bridge.js](../web/js/bridge.js) sends them on the page,
[web/js/worker.js](../web/js/worker.js) turns each into one call of the `Worker` of
[worker.rs](../crates/bausteine-web/src/worker.rs), and the test notebooks read both against this
text.

Every message is an object `{type, id?, ...fields}`. A message that expects an answer carries an
`id`, an integer the page counts up, and the answer carries the same `id`. The worker handles the
messages one after the other, so a request never overtakes the state the page posted before it.

## 1. From the page to the worker

| Type | Fields | Transfer | Answer | Call of `Worker` |
| --- | --- | --- | --- | --- |
| `init` | `id, canvas, width, height, scale, offscreen` | `canvas` | `ready` or `error` | `create(canvas)`, `resize`, `schema`, `dump` |
| `graphql` | `id, body` | | `graphql` | `graphql(body)`, then a frame |
| `state` | any subset of section 2 | `preview.buffer` | none, a `frame` follows | one setter per field |
| `pick` | `id, view, x, y` | | `pick` | `pick(view, x, y)` |
| `bounds` | `id` | | `bounds` | `bounds()` |
| `snapshot` | `id` | | `snapshot` | `snapshot()`, `dump` for the size |
| `render` | `id` | | `frame` with the `id` | `render()` and `revision()` at once |
| `dump` | `id` | | `dump` | `dump()` |
| `close` | none | | none | `close()`, then the worker ends |

`init` hands over the `OffscreenCanvas` of `#canvas` with its size in device pixels, `scale` the
device pixels of one CSS pixel, and `offscreen` true where the address of the page holds
`?offscreen` (section 9). `graphql.body` is the JSON text of a GraphQL request, the object with
`query` and `variables` that `tests/harness.py Engine` sends to `bausteine-graphql` as well, so one
notebook judges the engine the page talks to. `pick` takes CSS pixels of the viewport of the view.
`render` draws at once rather than at the next animation frame, which a notebook uses to wait for a
known frame. `close` frees the device of WebGPU and ends the worker after the messages before it.

## 2. The fields of `state`

The worker applies the fields of one `state` message in this order and draws one frame after them,
however many messages arrive before the next animation frame of the worker.

| Field | Shape | Call of `Worker` | Meaning |
| --- | --- | --- | --- |
| `size` | `{width, height, scale}` | `resize(width, height, scale)` | The canvas in device pixels |
| `viewports` | four `[x, y, w, h]` in CSS pixels | `set_viewport(i, x, y, w, h)` | `w = 0` hides a view |
| `ortho` | `{x, y, z, ppu}` | `set_ortho` | The shared centre and scale of the parallel views |
| `orbit` | `{x, y, z, yaw, pitch, distance}` | `set_orbit` | The camera of the oblique view of the modern look |
| `obliqueZoom` | number | `set_oblique_zoom` | `d3zoomf / 10` of version 1.3 |
| `obliquePan` | `{x, y}` in CSS pixels | `set_oblique_pan` | The shift of the classic Schrägriss to the right and down |
| `turn` | `{x, y, z}` in degrees | `set_turn` | The turn of the tab Kamera, for display alone |
| `dark` | bool | `set_dark` | The dark theme of the modern look |
| `classic` | bool | `set_classic` | The wires, the raster and the cavalier camera of version 1.3, in whole pixels |
| `inverted` | bool | `set_inverted` | Black on white, as the thesis prints its pictures |
| `raytrace` | bool | `set_raytrace` | The ray tracer of the oblique view |
| `scene` | id or null | `show(id)` | The scene the views draw |
| `selected` | id or null | `set_selected` | The selected item |
| `preview` | `Float32Array` of one packed item or null | `set_preview` | The body the page is placing |

The view indices on the wire are those of the renderer: `0` Aufriss, `1` Kreuzriss, `2` Grundriss,
`3` Schrägriss. The numbers of version 1.3, `ixy = 1`, `iyz = 2`, `ixz = 3` and `id3 = 4`, appear in
comments and in the register of quirks only. There is no field for the origin of a view and none
for the bevel of the classic views: the page places the origin with the shared centre of `ortho`
and shrinks each viewport by the bevel before it sends `viewports`.

`obliquePan` moves the picture of the cavalier camera of the classic look, which version 1.3 draws
with its origin at half the width and 70 percent of the height of the view and which has no target
that a drag could move. A right or a middle drag in the classic Schrägriss adds the distance of the
pointer to it, so the drawing follows the pointer as a whole. The renderer adds `2x / w` and
`−2y / h` to the translation of the matrix of that camera, `w` and `h` the viewport of the view, so
the cameras of `frame` and the answers of `pick` follow the shift. A field that is not finite
counts as zero, and the modern look, whose camera of the oblique view has a target in `orbit`,
ignores the field.

## 3. From the worker to the page

| Type | Fields | Transfer |
| --- | --- | --- |
| `ready` | `id, protocol, schema, adapter` | |
| `graphql` | `id, body` | |
| `frame` | `cameras, revision`, and the `id` of a `render` | `cameras.buffer` |
| `pick` | `id, item`, the id of the item or `''` | |
| `bounds` | `id, bounds`, six numbers or `[]` | |
| `snapshot` | `id, width, height, pixels` | `pixels.buffer` |
| `dump` | `id, state` | |
| `error` | `id?, message, detail?, fatal?` | |

`ready.protocol` is the version of this protocol, `1`. `ready.schema` is the schema text of the
GraphQL API, and `ready.adapter` is `{name, backend}`, the name of the adapter where the browser
tells it, often empty, and the backend `webgpu`.

`frame.revision` is the revision of the shown scene the frame draws, `-1` where no scene is shown.
The bridge writes it to the attribute `data-revision` of the root element of the page, so a
notebook waits until the revision reaches the one GraphQL answered before it takes a picture.

`snapshot.pixels` is a `Uint8Array` of the whole canvas, `width` by `height` device pixels, four
bytes per pixel in the order red, green, blue and alpha, the rows packed tightly from the top, the
alpha always 255. The order holds whatever the format of the surface: `gpu.rs` swaps red and blue
where the browser prefers `bgra8unorm`. The page crops one view with its viewport times `scale`, and
`ImageData` takes the pixels as they are.

## 4. The cameras

`frame.cameras` is a `Float32Array` of 72 numbers, 18 for each of the four views in the order of
section 2: the 16 numbers of the product of projection and view by columns, then the width and the
height of the viewport in CSS pixels. A hidden view has 18 zeros. The page projects a point of the
scene to a CSS pixel of the viewport with these numbers alone and never asks the worker per point:

```text
(cx, cy, cw) = view_proj · (x, y, z, 1)
pixel        = ((cx / cw · 0.5 + 0.5) · width, (0.5 − cy / cw · 0.5) · height)
```

The point is behind the camera where `cw` is not above `1e-4`. The same rule holds for the parallel
views, the perspective camera of the modern oblique view and the cavalier camera of version 1.3,
since the worker hands every camera over as a matrix. `bridge.project(view, x, y, z)` applies it.

## 5. The dump

`dump.state` is the state of the worker for the notebooks and the console, as the worker keeps it,
with the limits of the renderer applied:

| Field | Holds |
| --- | --- |
| `shown`, `revision`, `ids` | The shown scene, its revision and the ids of its items in their order |
| `viewports`, `ortho`, `orbit`, `obliqueZoom`, `obliquePan`, `turn` | The cameras as section 2 names them |
| `classic`, `dark`, `inverted`, `raytrace` | The switches of section 2 |
| `selected` | The id of the selected item, or null |
| `preview` | Whether a body is being placed |
| `size` | `{width, height, scale}`, the canvas in device pixels, which a snapshot has too |
| `adapter` | `{name, backend}` as in `ready` |

The content of the scene is not in the dump, since GraphQL answers it.

## 6. Errors

A message that fails answers `error` with the `id` of the message, where it has one, and the worker
goes on. `message` is German, since the page shows it to the person in front of it, in the status
line or in the fallback over the views. `detail` is the text of Rust, of wgpu or of the browser,
for the console. A message of an unknown type answers `error` as well.

A panic of the module is fatal. The panic hook of `Worker.create` writes the text of the panic to
the console and hands it to the function `bausteinePanic` of the global scope of the worker, which
`worker.js` defines. The worker then answers `error` with `fatal: true`, the message `Der Web
Worker ist ausgefallen und muss neu geladen werden` and the text of the panic as the `detail`, and
from then on answers every message with an `id` the same way. A trap of the module without a panic
and an error that no message caught end the worker the same way.

The bridge rejects every call that waits with a fatal error and calls its `failure` callback once
with the message and the detail. The page shows its fallback over the views. The same callback
hears a protocol of another version (section 8) and a worker that fails to load.

## 7. Rules

- The messages run one after the other on both sides: the worker handles them through one queue of
  promises, and the frames of the animation run through the same queue. A frame therefore reflects
  every `state` message before it, and a frame never draws while a snapshot waits for its pixels.
- The page never parses geometry and the worker never parses GraphQL. After every answer the worker
  reads the shown scene straight from the service through `bausteine::snapshot` and hands it to the
  renderer.
- The worker never pushes a scene to the page. The page learns of a change through the answer of
  its own request, since it owns its one worker and nobody else writes to it.
- The service and its scenes live in the memory of the worker. A reload starts an empty service,
  and the page rebuilds the shown scene from its shelf through `createScene` and `replaceItems`.
  The ids of items are therefore valid for one visit, and the key of the shelf, not the id of the
  service, names a scene in the address.

## 8. The version of the protocol

`PROTOCOL` in `bridge.js` and in `worker.js` is `1`. The bridge compares `ready.protocol` with its
own constant and fails loudly on a difference, with the German message `Seite und Web Worker gehören
zu verschiedenen Versionen. Neu laden holt beide frisch.`, which a stale `worker.js` from the cache
of the browser causes. A change of a message that an older page or worker would misread raises the
number in both files and in this page at once. A new message or a new optional field does not.

## 9. The hooks of the test notebooks

| Hook | Does |
| --- | --- |
| `?offscreen` | The worker replaces `configure` and `getCurrentTexture` of `GPUCanvasContext` by a texture of its own, since the headless SwiftShader loses its device on the first present to a canvas. The pixels come back through `snapshot`. |
| `?debug` | The page hands `window.bausteine` to the console and to the notebooks, with `app.bridge` among it. |
| `bridge.render()` | Draws now and answers `{cameras, revision}`. |
| `bridge.dump()` | Answers the object of section 5. |
| `bridge.snapshot()` | Answers `{width, height, pixels}` of section 3. |
| `bridge.close()` | Ends the worker, after which every call rejects. |
| `bridge.protocol`, `bridge.adapter`, `bridge.revision` | What `ready` and the last frame told. |
| `html[data-revision]` | The revision of the last frame. |

The binary `bausteine-graphql` of the build host boots the same engine and answers one request body
per line of standard input, so the notebooks judge the GraphQL engine of the worker without a
browser.
