// SPDX-License-Identifier: GPL-2.0-only
//
// 3D-Bausteine scene.js: the scene of the page. Every change goes to the
// service of Aosabi in the Web Worker as a GraphQL mutation. After it the
// page loads the scene and the lines of its list OBJEKTE again, keeps a
// copy on the shelf of the browser, and keeps the items before the change
// for an undo.

import { app, emit, itemById, safe, snapshotItems } from './state.js';

/** How many changes the history keeps. */
const HISTORY = 100;

/** Takes `scene` as the scene of the page, loads its list and tells every part of the page. */
export async function setScene(scene) {
  const id = app.lines[app.line]?.item ?? null;
  const end = app.lines[app.line]?.end ?? false;
  const wasRaster = app.line === 0;
  app.scene = scene;
  if (app.sceneKey) app.shelf.put(app.sceneKey, scene);
  app.lines = (await safe(() => app.store.list(scene.id))) ?? [{ text: '0 Raster', item: null, end: false }];
  // The selection follows its item, or its end line, through the new list.
  if (id != null) {
    app.line = app.lines.findIndex((line) => line.item === id && line.end === end);
  } else {
    app.line = wasRaster ? 0 : -1;
  }
  emit('scene', scene);
}

/** Loads the scene of the page again from the service. */
export async function reloadScene() {
  const scene = await safe(() => app.store.scene(app.scene.id));
  if (scene) await setScene(scene);
  return scene;
}

/** Keeps `before`, the items before a change, for an undo. */
export function remember(before) {
  app.history.push(before);
  if (app.history.length > HISTORY) app.history.shift();
  app.future = [];
  emit('history');
}

/**
 * Runs the change `action` on the service, keeps the items before it for
 * an undo, loads the scene after it, and answers what `action` answered,
 * or null where it failed.
 */
export async function commit(action) {
  const before = snapshotItems();
  const result = await safe(action);
  if (result === null) {
    await reloadScene();
    return null;
  }
  remember(before);
  await reloadScene();
  return result;
}

/** Undoes the last change. */
export async function undo() {
  const items = app.history.pop();
  if (!items) return;
  app.future.push(snapshotItems());
  const scene = await safe(() => app.store.replaceItems(app.scene.id, items));
  if (scene) await setScene(scene);
  emit('history');
}

/** Does the last undone change again. */
export async function redo() {
  const items = app.future.pop();
  if (!items) return;
  app.history.push(snapshotItems());
  const scene = await safe(() => app.store.replaceItems(app.scene.id, items));
  if (scene) await setScene(scene);
  emit('history');
}

/** Selects the line `index` of the list OBJEKTE, -1 for none. */
export function selectLine(index) {
  app.line = index >= 0 && index < app.lines.length ? index : -1;
  emit('select', app.line);
}

/** Selects the line of the item `id`, its end line for `end`, or nothing for null. */
export function selectItem(id, end = false) {
  if (id == null) {
    selectLine(-1);
    return;
  }
  selectLine(app.lines.findIndex((line) => line.item === id && line.end === end));
}

/** Returns the groups that hold `item`, the innermost first. */
export function groupsOf(item) {
  const out = [];
  let current = itemById(item?.parent);
  while (current && out.length < 32) {
    out.push(current);
    current = itemById(current.parent);
  }
  return out;
}

/** Returns the ids of the item `id` and of everything in its groups. */
export function subtreeIds(id) {
  const out = [id];
  for (let i = 0; i < out.length; i += 1) {
    for (const item of app.scene.items) if (item.parent === out[i] && !out.includes(item.id)) out.push(item.id);
  }
  return out;
}
