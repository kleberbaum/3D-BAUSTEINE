# The GraphQL API

The Web Worker of the page answers GraphQL. The page posts the JSON body of a GraphQL request, the
object with `query` and optionally `variables` and `operationName` that a request over HTTP
carries, and the worker answers the response body, through `aosabi::embed` and with no socket. The
schema is inferred from the plain Rust types of [service/src](../service/src/) by
`cargo aosabi build`, which writes it to `service/target/aosabi/schema.graphql`. The page itself
uses nothing but this API for its scenes, so everything the page does, a script in the console of
the browser can do as well:

```js
const answer = await bausteine.graphql('{ scenes { id name } }');
```

The binary `bausteine-graphql`, which `tools/build.sh` builds for the host, boots the same engine
and answers one request body per line of standard input. The notebooks drive it, and it serves a
quick look at the API without a browser:

```sh
echo '{"query":"{ examples { key title } }"}' | crates/bausteine-web/target/debug/bausteine-graphql
```

## 1. Types

| Type | Holds |
| --- | --- |
| `Scene` | `id`, `name`, `revision`, `items` and the field `pov(eye, target)`, the scene file of POV-Ray |
| `Item` | `id`, `name`, `kind`, `parent`, `position`, `size`, `rotation`, `color`, `texture`, `innerRadius`, `source` |
| `Kind` | `SPHERE`, `CONE`, `CYLINDER`, `CUBE`, `CUBOID`, `PYRAMID`, `PRISM`, `DISC`, the groups `UNION`, `DIFFERENCE`, `INTERSECTION`, `MERGE` and `DECLARE`, and `INSTANCE` |
| `Vector` | `x`, `y`, `z` in the coordinates of the GZ lesson |
| `KindInfo` | The German name of a kind, what its position names and its type code of version 1.3 |
| `Texture` | The name of a standard texture of POV-Ray and its group |
| `Example` | The key and the title of an example scene |

The position and the size of an item mean what the input mask of version 1.3 asks for:

| Kind | Position | Size |
| --- | --- | --- |
| `SPHERE` | The centre | `x` is the radius |
| `CONE`, `CYLINDER` | The centre of the base | `x` is the radius, `z` the height |
| `CUBE` | The corner at the back, left and bottom | `x` is the edge |
| `CUBOID` | The corner at the back, left and bottom | The three edges |
| `PYRAMID`, `PRISM` | The corner of the base | The two edges of the base and the height |
| `DISC` | The centre | `x` is the radius, `innerRadius` the hole |
| A group | The move of its children | The scaling of its children |
| `INSTANCE` | The move of the declared body | The scaling of the declared body |

The rotation turns about z first, then y, then x, in degrees. A `DIFFERENCE` keeps its first child
and takes every later child away. A `DECLARE` is the `#Neu` of version 1.3: a group that defines a
new body under its name and places it once where it stands. An `INSTANCE` places the body of the
declaration that its `source` names once more, with a position, a size and a rotation of its own,
as `Neu Ende` and the name of the new body do in the object list of version 1.3.

## 2. Queries

```graphql
{
  scene(id: "1") {
    name
    revision
    items { id name kind parent position { x y z } size { x y z } color texture }
    pov(eye: { x: 15, y: 15, z: 8 }, target: { x: 0, y: 0, z: 0 })
  }
  scenes { id name }
  kinds { kind label anchor code }
  textures { name group }
  examples { key title }
}
```

## 3. Mutations

| Mutation | Does |
| --- | --- |
| `createScene(name, example)` | Creates a scene, empty or as a copy of an example |
| `renameScene(id, name)` | Renames a scene |
| `deleteScene(id)` | Deletes a scene |
| `addItem(scene, input)` | Adds an item and answers it with its id |
| `updateItem(scene, id, input)` | Changes the fields of an item that `input` names, and moves it into another group with `parent`, or to the top with an empty `parent` |
| `removeItem(scene, id)` | Removes an item with everything in its groups |
| `replaceItems(scene, items)` | Replaces every item, which is how the page undoes a change and imports a file |

```graphql
mutation {
  addItem(scene: "1", input: {
    kind: CYLINDER
    position: { x: 4, y: 5, z: -0.5 }
    size: { x: 1, y: 1, z: 3 }
    color: "#3a8fd9"
  }) { id }
}
```

An input that the service cannot take answers an error with the code `BAD_USER_INPUT` and the field
in its details, such as a colour that is not of the form `#rrggbb`, an unknown texture, a number
that is not finite, or a group that would hold itself.

## 4. Limits

The worker keeps its scenes in memory for as long as the page is open, at most 256 of them, the
oldest going first, and a scene holds at most 512 items. The page keeps a copy of the open scene in
the storage of the browser and loads it again on the next visit, and a class saves a scene it wants
to keep as a file. A subscription that streams the changes of a scene to every page of a class
belongs to the server of a later version and is not part of this API.
