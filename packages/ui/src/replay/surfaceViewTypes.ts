/**
 * Stable, inspector-owned view of an A2UI surface.
 *
 * Phase 2a panels (Component Tree, Data Model, Diff) consume `SurfaceView`
 * rather than the opaque `@a2ui/web_core` `SurfaceModel`. Keeping this type
 * decoupled from `web_core` internals means panels never break when the
 * upstream `SurfaceModel` shape changes.
 */

/** A single component, flattened to a stable, JSON-friendly shape. */
export interface ComponentNode {
  /** The component's unique id within its surface. */
  id: string;
  /** Component type name, e.g. "Column", "Text". */
  type: string;
  /** Ordered child component ids. */
  childIds: string[];
  /** Component props, EXCLUDING `children` and `id`. */
  props: Record<string, unknown>;
}

/** A stable snapshot of one surface's component tree and data model. */
export interface SurfaceView {
  /** The surface's id. */
  surfaceId: string;
  /** The root component id, or `undefined` if the surface has no components. */
  rootId: string | undefined;
  /** All components on the surface, keyed by id. */
  components: Map<string, ComponentNode>;
  /** The surface's data model as a plain JSON value. */
  dataModel: unknown;
}
