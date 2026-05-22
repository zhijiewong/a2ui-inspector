import type { SurfaceView } from "./surfaceView.js";

/**
 * The set of changes between two consecutive `SurfaceView` snapshots: which
 * components appeared/disappeared/changed and which data-model paths changed.
 */
export interface SurfaceDiff {
  /** Component ids present in `curr` but not in `prev`. */
  addedComponents: string[];
  /** Component ids present in `prev` but not in `curr`. */
  removedComponents: string[];
  /** Component ids whose `type` or `props` changed between `prev` and `curr`. */
  changedComponents: string[];
  /** JSON-Pointer paths into the data model whose leaf values changed. */
  changedPaths: Set<string>;
}

/**
 * Diffs two `SurfaceView` snapshots. An `undefined` `prev` (no prior tick)
 * yields every component as added and every data-model path as changed.
 */
export function diffSurfaceViews(prev: SurfaceView | undefined, curr: SurfaceView): SurfaceDiff {
  const prevComps = prev?.components ?? new Map();
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const [id, node] of curr.components) {
    const before = prevComps.get(id);
    if (!before) {
      added.push(id);
      continue;
    }
    if (before.type !== node.type || JSON.stringify(before.props) !== JSON.stringify(node.props)) {
      changed.push(id);
    }
  }
  for (const id of prevComps.keys()) {
    if (!curr.components.has(id)) removed.push(id);
  }

  const changedPaths = new Set<string>();
  collectChangedPaths(prev?.dataModel, curr.dataModel, "", changedPaths);

  return {
    addedComponents: added,
    removedComponents: removed,
    changedComponents: changed,
    changedPaths,
  };
}

/**
 * Recursively walks two JSON values, recording the JSON-Pointer path of every
 * leaf that differs. Objects/arrays are descended key-by-key; primitives are
 * compared via `JSON.stringify`. When only one side is an object (e.g. a brand
 * new data model whose `prev` is `undefined`), the missing side is treated as
 * an empty object so each differing leaf gets its own path rather than a
 * single coarse root entry.
 */
function collectChangedPaths(before: unknown, after: unknown, path: string, out: Set<string>): void {
  if (before === after) return;
  const beforeIsObject = before !== null && typeof before === "object";
  const afterIsObject = after !== null && typeof after === "object";

  // Neither side is an object: compare as primitives.
  if (!beforeIsObject && !afterIsObject) {
    if (JSON.stringify(before) !== JSON.stringify(after)) out.add(path === "" ? "/" : path);
    return;
  }

  // At least one side is an object. Descend key-by-key, treating a missing
  // (non-object) side as an empty object so each differing leaf of a newly
  // added — or wholly removed — subtree gets its own JSON-Pointer path. An
  // object whose array-ness flipped is also handled correctly by this walk.
  const beforeRec = (beforeIsObject ? before : {}) as Record<string, unknown>;
  const afterRec = (afterIsObject ? after : {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(beforeRec), ...Object.keys(afterRec)]);
  for (const k of keys) {
    collectChangedPaths(beforeRec[k], afterRec[k], `${path}/${k}`, out);
  }
}
