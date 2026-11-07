// SPDX-License-Identifier: GPL-2.0-only
//
// 3D-Bausteine store.js: the scenes of the page. The service of Aosabi in
// the Web Worker keeps them and answers over GraphQL, and the shelf keeps a
// copy of each in the storage of the browser, so a scene survives a reload.
// Under the address ?debug the store writes every request and its answer
// into a log, which the test notebooks read.

/**
 * The kinds of items with their type codes of version 1.3 and the texts of
 * the list of bodies CB1 of the tab Körper, in the order of that list.
 */
export const KINDS = [
  { kind: 'SPHERE', code: 1, label: 'Kugel', group: false },
  { kind: 'CONE', code: 2, label: 'Kegel', group: false },
  { kind: 'CYLINDER', code: 3, label: 'Zylinder', group: false },
  { kind: 'CUBE', code: 4, label: 'Würfel', group: false },
  { kind: 'CUBOID', code: 5, label: 'Quader', group: false },
  { kind: 'PYRAMID', code: 6, label: 'Pyramide', group: false },
  { kind: 'PRISM', code: 7, label: 'Prisma', group: false },
  { kind: 'DISC', code: 8, label: 'Disc', group: false },
  { kind: 'UNION', code: 101, label: 'CSG-Vereinigung', group: true },
  { kind: 'DIFFERENCE', code: 102, label: 'CSG-Differenz', group: true },
  { kind: 'INTERSECTION', code: 103, label: 'CSG-Durchschnitt', group: true },
  { kind: 'MERGE', code: 104, label: 'CSG-Summe', group: true },
  { kind: 'DECLARE', code: 105, label: '#Neu', group: true },
  { kind: 'INSTANCE', code: 200, label: 'Objekt', group: false },
];

/** Returns the description of the kind `kind`. */
export function kindInfo(kind) {
  return KINDS.find((k) => k.kind === kind) ?? KINDS[0];
}

/**
 * The entries of CB1 that close a group and name no kind of item: CSG-Ende
 * closes the innermost open group of the CSG, Neu_Ende the new body.
 */
export const ENDS = [
  { end: 'csg', label: 'CSG-Ende' },
  { end: 'declare', label: 'Neu_Ende' },
];

/**
 * The fifteen entries of CB1 in the order of version 1.3, `Fill_CB1_Objekt`:
 * the eight bodies, the four groups of the CSG and CSG-Ende, then #Neu and
 * Neu_Ende. Neither the raster nor Ebene of the body bar is one of them.
 */
export const CB1_ENTRIES = [
  ...KINDS.filter((k) => !k.group && k.kind !== 'INSTANCE').map((k) => k.label),
  ...KINDS.filter((k) => k.group && k.kind !== 'DECLARE').map((k) => k.label),
  ENDS[0].label,
  ...KINDS.filter((k) => k.kind === 'DECLARE').map((k) => k.label),
  ENDS[1].label,
];

/** The values of one packed item, ITEM_STRIDE of bausteine-core. */
const STRIDE = 20;

/** The fields of an item the API answers. */
const ITEM_FIELDS = `id name kind parent position { x y z } size { x y z }
  rotation { x y z } color texture innerRadius source`;

/** The fields of a scene the API answers. */
const SCENE_FIELDS = `id name revision items { ${ITEM_FIELDS} }`;

/** Returns the packed items of `items` for the renderer, with the names of `textures`. */
export function pack(items, textures) {
  const out = new Float32Array(items.length * STRIDE);
  const index = new Map(items.map((item, i) => [item.id, i]));
  items.forEach((item, i) => {
    const o = i * STRIDE;
    const color = hexToRgb(item.color);
    out[o] = kindInfo(item.kind).code;
    out[o + 1] = item.parent != null && index.has(item.parent) ? index.get(item.parent) : -1;
    out.set([item.position.x, item.position.y, item.position.z], o + 2);
    out.set([item.size.x, item.size.y, item.size.z], o + 5);
    out.set([item.rotation.x, item.rotation.y, item.rotation.z], o + 8);
    out.set(color, o + 11);
    out[o + 14] = item.innerRadius ?? 0;
    out[o + 15] = item.texture ? textures.indexOf(item.texture) : -1;
    out[o + 16] = item.source != null && index.has(item.source) ? index.get(item.source) : -1;
  });
  return out;
}

/** Returns the colour #rrggbb as three components from zero to one. */
export function hexToRgb(hex) {
  const value = parseInt(String(hex ?? '#d9d9d9').slice(1), 16);
  if (Number.isNaN(value)) return [0.85, 0.85, 0.85];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((c) => c / 255);
}

/** Returns the input of `item` for `addItem` and `replaceItems`. */
export function toInput(item) {
  const point = (v) => ({ x: v.x, y: v.y, z: v.z });
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    parent: item.parent ?? null,
    position: point(item.position),
    size: point(item.size),
    rotation: point(item.rotation),
    color: item.color,
    texture: item.texture ?? null,
    innerRadius: item.innerRadius ?? 0,
    source: item.source ?? null,
  };
}

/** Returns a deep copy of `items`. */
export function cloneItems(items) {
  return items.map((item) => structuredClone(item));
}

/**
 * The store of the scenes on the service of Aosabi in the Web Worker. Every
 * question is one GraphQL request through the bridge.
 */
export class WorkerStore {
  /**
   * Takes the bridge to the worker and, where given, the array `log` that
   * receives every request as `{query, variables, answer}`.
   */
  constructor(bridge, { log = null } = {}) {
    this.bridge = bridge;
    this.log = log;
  }

  /** Sends one GraphQL request and answers its data, or throws its first error. */
  async request(query, variables = {}) {
    const body = await this.bridge.graphql(query, variables);
    if (this.log) {
      this.log.push({ query, variables, answer: body });
      // A log nobody drains keeps the newest thousand requests.
      if (this.log.length > 1000) this.log.splice(0, this.log.length - 1000);
    }
    if (body.errors?.length) throw new Error(body.errors[0].message);
    return body.data;
  }

  /** Loads the lists the interface offers: textures, kinds and examples. */
  async load() {
    const data = await this.request('{ textures { name group } kinds { kind label anchor group code } examples { key title } }');
    this.textures = data.textures;
    this.kinds = data.kinds;
    this.examples = data.examples;
  }

  async scene(id) {
    const data = await this.request(`query($id: ID!) { scene(id: $id) { ${SCENE_FIELDS} } }`, { id });
    return data.scene;
  }

  async createScene(name, example) {
    const data = await this.request(
      `mutation($name: String, $example: String) { createScene(name: $name, example: $example) { ${SCENE_FIELDS} } }`,
      { name, example },
    );
    return data.createScene;
  }

  async renameScene(id, name) {
    const data = await this.request(
      `mutation($id: ID!, $name: String!) { renameScene(id: $id, name: $name) { ${SCENE_FIELDS} } }`,
      { id, name },
    );
    return data.renameScene;
  }

  async deleteScene(id) {
    const data = await this.request('mutation($id: ID!) { deleteScene(id: $id) }', { id });
    return data.deleteScene;
  }

  /** Adds `item` to the scene `scene` behind the item `after`, or last into its group. */
  async addItem(scene, item, after = null) {
    const input = toInput(item);
    delete input.id;
    const data = await this.request(
      `mutation($scene: ID!, $input: AddItemInput!, $after: ID) { addItem(scene: $scene, input: $input, after: $after) { ${ITEM_FIELDS} } }`,
      { scene, input, after },
    );
    return data.addItem;
  }

  /** Moves the item `id` behind the member `after` of its group, or to the front for null. */
  async moveItem(scene, id, after) {
    const data = await this.request(
      `mutation($scene: ID!, $id: ID!, $after: ID) { moveItem(scene: $scene, id: $id, after: $after) { ${SCENE_FIELDS} } }`,
      { scene, id, after },
    );
    return data.moveItem;
  }

  /** Answers the lines of the list OBJEKTE in the format of version 1.3. */
  async list(scene) {
    const data = await this.request('query($id: ID!) { scene(id: $id) { list { text item end } } }', { id: scene });
    return data.scene?.list ?? [];
  }

  async updateItem(scene, id, patch) {
    const data = await this.request(
      `mutation($scene: ID!, $id: ID!, $input: UpdateItemInput!) { updateItem(scene: $scene, id: $id, input: $input) { ${ITEM_FIELDS} } }`,
      { scene, id, input: patch },
    );
    return data.updateItem;
  }

  async removeItem(scene, id) {
    const data = await this.request(
      `mutation($scene: ID!, $id: ID!) { removeItem(scene: $scene, id: $id) { ${SCENE_FIELDS} } }`,
      { scene, id },
    );
    return data.removeItem;
  }

  async replaceItems(scene, items) {
    const data = await this.request(
      `mutation($scene: ID!, $items: [AddItemInput!]!) { replaceItems(scene: $scene, items: $items) { ${SCENE_FIELDS} } }`,
      { scene, items: items.map(toInput) },
    );
    return data.replaceItems;
  }

  /**
   * Answers the scene file of POV-Ray, seen from `eye` towards `target`,
   * with the head of version 1.3 for `classic`, dated `date` and `time`.
   */
  async pov(scene, { eye = null, target = null, classic = false, date = null, time = null } = {}) {
    const data = await this.request(
      `query($id: ID!, $eye: PovEyeInput, $target: PovEyeInput, $classic: Boolean, $date: String, $time: String) {
        scene(id: $id) { pov(eye: $eye, target: $target, classic: $classic, date: $date, time: $time) } }`,
      { id: scene, eye, target, classic, date, time },
    );
    return data.scene?.pov ?? '';
  }
}

/** The key of the shelf in the storage of the browser. */
const SHELF = 'bausteine.shelf.v2';

/**
 * The copies of the scenes in the storage of the browser, each under a key
 * of its own, which the address of the page carries. The service in the
 * worker starts empty with every visit, so the page puts each scene back
 * from the shelf when it opens it. A copy holds the name, the items, the
 * camera of the export and the time it was kept.
 */
export class Shelf {
  constructor() {
    this.scenes = this.read();
    // Called once, the first time the storage of the browser refuses a copy.
    this.onFull = null;
    this.full = false;
  }

  read() {
    try {
      const value = JSON.parse(localStorage.getItem(SHELF) ?? '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  /** Writes the newest fifty copies into the storage, and answers whether the storage took them. */
  write() {
    try {
      localStorage.setItem(SHELF, JSON.stringify(this.scenes.slice(-50)));
      return true;
    } catch {
      // A full or blocked storage keeps the scenes for this visit alone, and says so once.
      if (!this.full) {
        this.full = true;
        this.onFull?.();
      }
      return false;
    }
  }

  /** Answers a new key. */
  static key() {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
  }

  /** Answers the copy of the scene `key`, or null. */
  get(key) {
    return this.scenes.find((s) => s.key === key) ?? null;
  }

  /** Keeps a copy of `scene` with the camera of the export `povCamera` under `key`, the newest last. */
  put(key, scene, povCamera = null) {
    this.scenes = this.scenes.filter((s) => s.key !== key);
    this.scenes.push({
      key,
      name: scene.name,
      items: cloneItems(scene.items),
      povCamera: povCamera ? structuredClone(povCamera) : null,
      saved: Date.now(),
    });
    return this.write();
  }

  /** Forgets the scene `key`. */
  remove(key) {
    this.scenes = this.scenes.filter((s) => s.key !== key);
    this.write();
  }

  /** Answers the copies, the newest first. */
  list() {
    return [...this.scenes].reverse();
  }
}
