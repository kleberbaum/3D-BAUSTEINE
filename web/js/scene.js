// SPDX-License-Identifier: GPL-2.0-only
//
// 3D-Bausteine scene.js: the scene of the page. Every change goes to the
// service of Aosabi in the Web Worker as a GraphQL mutation. After it the
// page loads the scene and the lines of its list OBJEKTE again, keeps a
// copy on the shelf of the browser, and keeps the items before the change
// for an undo.
//
// The changes, the undo and the redo run one after the other. Each one
// starts once the answer of the one before has landed, so two quick clicks
// make two steps of the history, each with the items it really changed.

import { app, emit, itemById, safe, snapshotItems } from './state.js';

/** How many changes the history keeps. */
const HISTORY = 100;

/** Takes `scene` as the scene of the page, loads its list and tells every part of the page. */
export async function setScene(scene) {
  const id = app.lines[app.line]?.item ?? null;
  const end = app.lines[app.line]?.end ?? false;
  const wasRaster = app.line === 0;
  app.scene = scene;
  if (app.sceneKey) app.shelf.put(app.sceneKey, scene, app.povCamera);
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

/** The end of the last change in the queue, which the next change waits for. */
let queue = Promise.resolve();

/** Runs `task` once every change before it has ended, and answers what it answers. */
function serial(task) {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}

/**
 * Runs the change `action` on the service, keeps the items before it for
 * an undo, loads the scene after it, and answers what `action` answered,
 * or null where it failed. The change waits for the changes before it, so
 * `action` reads the scene and the selection they left. `settle` runs
 * with the answer once the scene is loaded and before the next change
 * starts, for the selection the change leaves behind.
 */
export function commit(action, settle = null) {
  return serial(async () => {
    const before = snapshotItems();
    const result = await safe(action);
    if (result === null) {
      await reloadScene();
      return null;
    }
    remember(before);
    await reloadScene();
    settle?.(result);
    return result;
  });
}

/** Undoes the last change. A change the service refuses leaves both stacks as they were. */
export function undo() {
  return serial(async () => {
    const items = app.history.pop();
    if (!items) return;
    const now = snapshotItems();
    const scene = await safe(() => app.store.replaceItems(app.scene.id, items));
    if (scene) {
      app.future.push(now);
      await setScene(scene);
    } else {
      app.history.push(items);
    }
    emit('history');
  });
}

/** Does the last undone change again. A change the service refuses leaves both stacks as they were. */
export function redo() {
  return serial(async () => {
    const items = app.future.pop();
    if (!items) return;
    const now = snapshotItems();
    const scene = await safe(() => app.store.replaceItems(app.scene.id, items));
    if (scene) {
      app.history.push(now);
      await setScene(scene);
    } else {
      app.future.push(items);
    }
    emit('history');
  });
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
