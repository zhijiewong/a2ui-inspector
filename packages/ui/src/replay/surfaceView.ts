import type { ComponentNode, SurfaceView } from "./surfaceViewTypes.js";

export type { ComponentNode, SurfaceView } from "./surfaceViewTypes.js";

/**
 * Builds a stable, inspector-owned `SurfaceView` from an opaque
 * `@a2ui/web_core` `SurfaceModel`.
 *
 * Discovered `SurfaceModel` shape (web_core v0.10, schema v0_9):
 *  - `model.componentsModel` is a `SurfaceComponentsModel`; its `entries`
 *    getter yields `[id, ComponentModel]` pairs.
 *  - each `ComponentModel` exposes `id` (string), `type` (string) and
 *    `properties` (a `Record<string, unknown>`). Extra fields from a
 *    `updateComponents` frame — including `children` — land in `properties`.
 *  - `model.dataModel` is a `DataModel`; `dataModel.get("/")` returns the
 *    root JSON value.
 *
 * web_core carries no explicit "root component" pointer, so the root id is
 * inferred: prefer a component literally named "root", otherwise the first
 * component that no other component lists as a child, otherwise the first
 * component encountered.
 *
 * Any unexpected/missing field is tolerated — a malformed model yields an
 * empty view rather than throwing.
 */
export function toSurfaceView(surfaceId: string, model: unknown): SurfaceView {
  if (model === null || typeof model !== "object") {
    return {
      surfaceId,
      rootId: undefined,
      components: new Map(),
      dataModel: undefined,
    };
  }

  const components = new Map<string, ComponentNode>();
  const rawComponents = (model as { componentsModel?: unknown }).componentsModel;

  for (const [id, raw] of iterateComponents(rawComponents)) {
    const node = toComponentNode(id, raw);
    components.set(node.id, node);
  }

  return {
    surfaceId,
    rootId: pickRootId(components),
    components,
    dataModel: readDataModel((model as { dataModel?: unknown }).dataModel),
  };
}

/**
 * Yields `[id, component]` pairs from a `SurfaceComponentsModel`, a plain
 * object keyed by id, or a `Map`. Returns nothing for anything else.
 */
function* iterateComponents(
  collection: unknown,
): Generator<[string, unknown]> {
  if (collection === null || typeof collection !== "object") return;

  // `SurfaceComponentsModel` exposes an `entries` getter returning an
  // `IterableIterator<[string, ComponentModel]>`.
  const entries = (collection as { entries?: unknown }).entries;
  if (entries && typeof entries[Symbol.iterator as keyof typeof entries] === "function") {
    for (const pair of entries as Iterable<unknown>) {
      const [id, comp] = pair as [unknown, unknown];
      if (typeof id === "string") yield [id, comp];
    }
    return;
  }

  // A plain `Map<string, component>`.
  if (collection instanceof Map) {
    for (const [id, comp] of collection) {
      if (typeof id === "string") yield [id, comp];
    }
    return;
  }

  // A plain object keyed by component id.
  for (const [id, comp] of Object.entries(collection)) {
    yield [id, comp];
  }
}

/** Converts a single raw component into a stable `ComponentNode`. */
function toComponentNode(id: string, raw: unknown): ComponentNode {
  if (raw === null || typeof raw !== "object") {
    return { id, type: "unknown", childIds: [], props: {} };
  }
  const rec = raw as Record<string, unknown>;
  const componentId =
    typeof rec.id === "string" && rec.id.length > 0 ? rec.id : id;

  // `properties` holds the catalog props on a web_core `ComponentModel`.
  // A2UI passthrough fields (e.g. `children`) are nested there too.
  const properties =
    rec.properties && typeof rec.properties === "object"
      ? (rec.properties as Record<string, unknown>)
      : rec;

  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (key === "children" || key === "id" || key === "component") continue;
    props[key] = value;
  }

  return {
    id: componentId,
    type: componentType(rec.type ?? rec.component),
    childIds: extractChildIds(properties.children),
    props,
  };
}

/**
 * Resolves a component type name. A2UI v0.9 components may carry their type
 * as a bare string or as an object keyed by the type name
 * (e.g. `{ Column: {...} }`).
 */
function componentType(raw: unknown): string {
  if (typeof raw === "string" && raw.length > 0) return raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const keys = Object.keys(raw);
    if (keys.length === 1 && keys[0]) return keys[0];
  }
  return "unknown";
}

/** Normalises a `children` value into an ordered list of string ids. */
function extractChildIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const child of raw) {
    if (typeof child === "string") {
      ids.push(child);
    } else if (child && typeof child === "object") {
      // Tolerate `{ id: "..." }` or `{ componentId: "..." }` wrappers.
      const rec = child as Record<string, unknown>;
      const candidate = rec.id ?? rec.componentId;
      if (typeof candidate === "string") ids.push(candidate);
    }
  }
  return ids;
}

/**
 * Infers the root component id. web_core does not record one, so:
 *  1. prefer a component literally named "root";
 *  2. otherwise the first component no other component references as a child;
 *  3. otherwise the first component encountered.
 */
function pickRootId(
  components: Map<string, ComponentNode>,
): string | undefined {
  if (components.size === 0) return undefined;
  if (components.has("root")) return "root";

  const referenced = new Set<string>();
  for (const node of components.values()) {
    for (const childId of node.childIds) referenced.add(childId);
  }
  for (const id of components.keys()) {
    if (!referenced.has(id)) return id;
  }
  // Every component is referenced (cycle); fall back to the first. The
  // earlier `size === 0` guard guarantees at least one key exists.
  return components.keys().next().value as string;
}

/**
 * Reads the surface's data model as a plain JSON value. A web_core
 * `DataModel` exposes `get(path)`; calling `get("/")` returns the root.
 */
function readDataModel(dataModel: unknown): unknown {
  if (dataModel === null || dataModel === undefined) return undefined;
  if (typeof dataModel === "object") {
    const getter = (dataModel as { get?: unknown }).get;
    if (typeof getter === "function") {
      try {
        return (getter as (path: string) => unknown).call(dataModel, "/");
      } catch {
        return undefined;
      }
    }
  }
  // Already a plain value.
  return dataModel;
}
