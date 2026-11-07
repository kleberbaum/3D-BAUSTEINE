# The GraphQL API

The Web Worker of the page answers GraphQL. The page posts the JSON body of a GraphQL request, the
object with `query` and optionally `variables` and `operationName` that a request over HTTP
carries, and the worker answers with the response body, through `aosabi::embed` and with no socket
and no server. The schema is inferred from the plain Rust types of
[service/src](../service/src/) by `cargo aosabi build`, which writes it to
`service/target/aosabi/schema.graphql`. The page itself uses nothing but this API for its scenes, so
everything the page does, a script in the console of the browser can do as well:

```js
const answer = await bausteine.graphql('{ scenes { id name } }');
```

On the build host the binary `bausteine-graphql`, which `tools/build.sh` builds, boots the same
engine through `aosabi::embed` and answers one request body per line of standard input. The
notebooks drive it, and it serves a quick look at the API without a browser. With `--schema` it
prints the schema it answers with:

```sh
echo '{"query":"{ examples { key title } }"}' | crates/bausteine-web/target/debug/bausteine-graphql
crates/bausteine-web/target/debug/bausteine-graphql --schema
```

## 1. Types

| Type | Holds |
| --- | --- |
| `Scene` | `id`, `name`, `revision`, `items`, the field `pov(eye, target, classic, date, time)`, the scene file of POV-Ray, and the field `list`, the lines of the list OBJEKTE |
| `Item` | `id`, `name`, `kind`, `parent`, `position`, `size`, `rotation`, `color`, `texture`, `innerRadius`, `source` |
| `Kind` | `SPHERE`, `CONE`, `CYLINDER`, `CUBE`, `CUBOID`, `PYRAMID`, `PRISM`, `DISC`, the groups `UNION`, `DIFFERENCE`, `INTERSECTION`, `MERGE` and `DECLARE`, and `INSTANCE` |
| `Vector` | `x`, `y`, `z` in the coordinates of the GZ lesson |
| `ListLine` | `text`, `item` and `end` of one line of the list OBJEKTE |
| `KindInfo` | `kind`, its name `label` in the interface of version 1.3, `anchor`, what its position names, `group` and `code`, its type code of version 1.3 |
| `Texture` | `name`, the name of a standard texture of POV-Ray, `group`, its German group, and `material`, how the ray tracer in the browser renders it |
| `Material` | `surface`, `base` and `accent` as `#rrggbb` and `reflection` from 0 to 1 |
| `Surface` | `PLAIN`, `METAL`, `GLASS`, `WOOD`, `MARBLE`, `GRANITE` and `STRIPES`, the family that decides how the ray tracer shades a surface |
| `Example` | `key` and `title` of an example scene |
| `AddItemInput` | The fields of `Item` a client sends, every one but `kind` optional |
| `UpdateItemInput` | The fields of an item to change, every one optional |
| `PovEyeInput` | `x`, `y`, `z` of a point a client sends, named after its first use, the eye of `pov` |

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
as `Neu_Ende` and the name of the new body do in the list of bodies of version 1.3.

The field `kinds` answers the fourteen kinds in the order of the body bar with the names and the
type codes of version 1.3. A new item without a name takes its label as its name.

| Kind | `label` | `code` |
| --- | --- | --- |
| `SPHERE`, `CONE`, `CYLINDER`, `CUBE` | `Kugel`, `Kegel`, `Zylinder`, `Würfel` | 1 to 4 |
| `CUBOID`, `PYRAMID`, `PRISM`, `DISC` | `Quader`, `Pyramide`, `Prisma`, `Disc` | 5 to 8 |
| `UNION`, `DIFFERENCE`, `INTERSECTION`, `MERGE` | `Vereinigung`, `Differenz`, `Durchschnitt`, `Summe` | 101 to 104 |
| `DECLARE`, `INSTANCE` | `Neu`, `Objekt` | 105, 200 |

The disc is `Disc` as the body bar, the menu Objekte and the list of bodies CB1 of version 1.3 call
it. The page writes the entries of CB1 from its own table in `web/js/store.js`, which adds the
prefix `CSG-` of the groups and the entries `#Neu` and `Neu_Ende`.

## 2. Queries

```graphql
{
  scene(id: "1") {
    name
    revision
    items { id name kind parent position { x y z } size { x y z } color texture }
    list { text item end }
    pov(eye: { x: 15, y: 15, z: 8 }, target: { x: 0, y: 0, z: 0 },
        classic: true, date: "06.03.2002", time: "21:03:31")
  }
  scenes { id name }
  kinds { kind label anchor group code }
  textures { name group material { surface base accent reflection } }
  examples { key title }
}
```

`scene(id)` answers null for an id the service does not keep, and `scenes` lists the scenes the
newest first.

### 2.1 The scene file of POV-Ray

The field `pov` writes the scene file of POV-Ray 3 for the scene. `eye` and `target` are points of
the lesson, by default `(15, 15, 8)` and the origin, which give `location <15,8,-15> look_at
<0,0,0>` of `Def_Pov` in version 1.3. A point `(x, y, z)` of the lesson becomes `<y, z, -x>`.

The head names the program and the date and the time of the export:

```text
// ==========================================================
// 3D-Bausteine 2.0 nach 3D-Baukasten 1.3 (H. Kleber 2002)
// Szene für POV-Ray 3, Datum: 06.03.2002 Zeit: 21:03:31
// ==========================================================
```

With `classic: true` it takes the layout of `Def_Pov`, which writes every line of comment with an
empty line after it:

```text
//==========================================================

// 3D-Bausteine Version 2.0 (klassisch) nach 3D-Baukasten 1.3 (c) 2002 H.Kleber

// POV 2 Datei Datum: 06.03.2002 Zeit: 21:03:31

//==========================================================

```

Both heads go on alike with the six includes `colors.inc`, `textures.inc`, `glass.inc`,
`metals.inc`, `woods.inc` and `stones.inc`, the sky, the camera, the light, the floor and the two
walls of version 1.3, and then the items.

`date` is written as `TT.MM.JJJJ` and `time` as `HH:MM:SS`, the German `Date` and `Time` of Visual
Basic that `Def_Pov` wrote, for example `06.03.2002` and `21:03:31`. The page produces both, since
the module of WebAssembly reads no clock of the place it runs in, and the service writes them as
they come, a line break as a blank. Without either, the head of 2.0 names no date and the classic
head leaves both places empty.

A texture stands as `texture { Gold_Metal }`. Twenty names of the list of version 1.3 are
pigments in `textures.inc`: `Brown_Agate`, `Sapphire_Agate`, `Pink_Granite`, `White_Marble`,
`Red_Marble`, `Jade`, `Cherry_Wood`, `Tan_Wood`, `Pine_Wood`, `Dark_Wood`, `White_Wood`,
`DMFWood1` to `DMFWood5`, `Candy_Cane`, `Peel`, `Blue_Sky2` and `Blood_Sky`. POV-Ray reads a
pigment inside a texture only as `pigment { }`, so the export writes `texture { pigment { Jade } }`
for them, where version 1.3 wrote `texture {Jade}}`. The field `textures` keeps the 43 names and
the order of version 1.3, `Lightening1` spelled as POV-Ray 3.1 spells it.

POV-Ray renders the scene file with the textures of its include files, and the ray tracer in the
browser approximates each of them with a material of the table `TEXTURES` of
`crates/bausteine-core/src/texture.rs`. The field `material` of a texture answers that material,
so the swatch of the tab Oberfläche paints a texture as the ray tracer renders it. Its `surface` is
the family that decides the shading, the variant of `Surface` of the core in the capitals of a
GraphQL enum: a matte `PLAIN`, a mirroring `METAL`, a `GLASS` that lets light through, a `WOOD`
with the rings of its grain, a `MARBLE` with its veins, a `GRANITE` of grains and the `STRIPES` of
`Candy_Cane`. `base` is the main colour and `accent` the second colour of a pattern, both as
`#rrggbb`, and a metal and a glass leave `accent` black. `reflection` says how much of its
surroundings the surface mirrors, from 0 to 1, as the table writes it:

| Texture | `surface` | `base` | `accent` | `reflection` |
| --- | --- | --- | --- | --- |
| `Gold_Metal` | `METAL` | `#f2bf40` | `#000000` | 0.65 |
| `Jade` | `MARBLE` | `#2e8c52` | `#8cd99e` | 0.2 |
| `Green_Glass` | `GLASS` | `#8ce699` | `#000000` | 0.1 |
| `Cherry_Wood` | `WOOD` | `#9e472e` | `#6b291a` | 0.05 |
| `Candy_Cane` | `STRIPES` | `#f2f2f2` | `#d91a1f` | 0.1 |

The group of a texture is the group of its menu and not its family, so `Rusty_Iron` of the group
`Metall` and `Cork` of the group `Holz` are both a `GRANITE`.

### 2.2 The list OBJEKTE

The field `list` writes the lines of the list OBJEKTE as `CB2_ADD` of version 1.3 does: the line
`0 Raster` first, then per item its number, two blanks for each level of the CSG, a blank, the
marks of the open groups and the name. The members of a group carry its mark, `°` for a union, `-`
for a difference, `^` for an intersection and `+` for a merge, and the line `CSG-Ende` stands back
at the level of the opener. A declaration opens with `#Neu` and its name, takes no mark and no
level, and ends with a line of its name. `item` names the item of the line, null for the raster and
the group for a line that ends it, and `end` says whether the line ends a group or a declaration.
The work piece of p. 95 of the thesis reads:

```text
0 Raster
1 #Neu Werkstück1
2 CSG-Differenz
3   -Quader
4   -Zylinder
5 CSG-Ende
6 Werkstück1
```

## 3. Mutations

| Mutation | Does |
| --- | --- |
| `createScene(name, example)` | Creates a scene, empty or as a copy of an example, named `name` or after the example |
| `renameScene(id, name)` | Renames a scene |
| `deleteScene(id)` | Deletes a scene and answers whether there was one |
| `addItem(scene, input, after)` | Adds an item and answers it with its id. `after` names the item the new one follows among the members of its group, or the group itself, which the new item then opens, as Einfügen of version 1.3 inserts behind the selected line. Without `after` the item goes last into its group |
| `updateItem(scene, id, input)` | Changes the fields of an item that `input` names, and moves it into another group with `parent`, or to the top with an empty `parent`. A body becomes another body and a group another group, as Ändern of version 1.3 does |
| `moveItem(scene, id, after)` | Moves an item with everything in its groups behind another member of its group, or to the front of its group with `after` null, since the order of the members is the meaning of a difference |
| `removeItem(scene, id)` | Removes an item with everything in its groups |
| `replaceItems(scene, items)` | Replaces every item, which is how the page undoes a change and imports a file. An item keeps an `id` the scene does not hold yet |

Every mutation that changes a scene counts its `revision` up by one and answers the scene or the
item after the change.

```graphql
mutation {
  addItem(scene: "1", input: {
    kind: CYLINDER
    position: { x: 4, y: 5, z: -0.5 }
    size: { x: 1, y: 1, z: 3 }
    color: "#3a8fd9"
  }, after: "3") { id }
}
```

## 4. Refusals

A request the service cannot take answers an error with a German message, the code
`BAD_USER_INPUT` and the field in `extensions.details.field`, and changes nothing. A scene the
service does not keep answers the message `Diese Szene gibt es nicht`, the code `SCENE_NOT_FOUND`
and its id in `extensions.details.id`.

| Field | Message | When |
| --- | --- | --- |
| `example` | `Dieses Beispiel gibt es nicht` | `createScene` names no example |
| `name` | `Eine Szene braucht einen Namen` | `renameScene` gets nothing but blanks |
| `id` | `Dieses Objekt gibt es nicht` | `updateItem`, `moveItem` or `removeItem` names no item of the scene |
| `scene`, `items` | `Die Szene ist voll` | The scene would hold more than 512 items |
| `position`, `size`, `rotation` | `Eine Zahl ist zu groß oder keine Zahl` | A number is not finite or larger than 10000 |
| `color` | `Eine Farbe hat die Form #rrggbb` | A colour is not of the form `#rrggbb` |
| `texture` | `Diese Textur gibt es nicht` | A texture is none of the 43 |
| `innerRadius` | `Der innere Radius ist ungültig` | The hole of a disc is negative, larger than 10000 or no number |
| `parent` | `Diese Gruppe gibt es nicht` | A new item names a parent that is no group of the scene |
| `parent` | `Diese Gruppe kann das Objekt nicht aufnehmen` | An item would move into a group below itself or into no group |
| `source`, `parent` | `Ein Objekt setzt einen neuen Körper ein, der nicht über ihm liegt` | An instance names no declaration, or would lie inside the one it places |
| `kind` | `Ein Körper wird nur zu einem Körper, eine Gruppe nur zu einer Gruppe` | A change of kind crosses from a body to a group or back, or touches a declaration or an instance |
| `after` | `Das Ziel liegt nicht in derselben Gruppe` | `moveItem` names a target outside the group of the item |

A request that is no GraphQL of this schema, such as a field the schema lacks, a value of `Kind`
that does not exist or a missing argument, answers the error of the GraphQL engine of Aosabi in its
own English words and with no code, as a GraphQL server over HTTP does. A body that is no JSON
object with a string field `query` answers one error and no data, and the engine answers on after
it.

## 5. Limits

The worker keeps its scenes in memory for as long as the page is open, at most 256 of them, the
oldest going first, and a scene holds at most 512 items. A name is trimmed and cut to 60
characters, and a coordinate, a dimension or an angle lies between -10000 and 10000. The page keeps
a copy of the open scene in the storage of the browser and loads it again on the next visit, and a
class saves a scene it wants to keep as a file.

The page owns its one worker, so the API has no subscription in this version. A subscription that
streams the changes of a scene to every page of a class belongs to the server of a later version.
