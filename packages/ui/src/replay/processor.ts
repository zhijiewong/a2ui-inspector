import { Catalog, MessageProcessor } from "@a2ui/web_core/v0_9";
import { BASIC_FUNCTIONS } from "@a2ui/web_core/v0_9/basic_catalog";
import {
  basicCatalog,
  type ReactComponentImplementation,
} from "@a2ui/react/v0_9";
import type { SessionEntry } from "@a2ui-inspector/shared";

/**
 * The catalog registered with the processor must carry the *React* component
 * implementations from `@a2ui/react` (each exposes a `.render` function), not
 * the bare `ComponentApi` descriptors from `@a2ui/web_core`. `<A2uiSurface>`
 * reads `compImpl.render` to obtain the component to mount; if the catalog
 * only holds API descriptors, `render` is `undefined` and React throws
 * error #130 ("Element type is invalid"). The basic component implementations
 * are taken from `@a2ui/react`'s `basicCatalog`.
 */
type ReactCatalog = Catalog<ReactComponentImplementation>;

/** React component implementations, keyed by component type name. */
const BASIC_REACT_COMPONENTS: ReactComponentImplementation[] = Array.from(
  basicCatalog.components.values(),
);

/**
 * Builds a default catalog containing the basic React component
 * implementations and the functions shipped with `@a2ui/web_core`. A fresh
 * catalog is created per replay so that any catalog-level state (e.g.
 * function invokers) is not shared across processors.
 */
function createBasicCatalog(): ReactCatalog {
  return new Catalog("basic", BASIC_REACT_COMPONENTS, BASIC_FUNCTIONS);
}

export interface ReplayState {
  /** Map of surfaceId -> SurfaceModel (opaque to the inspector). */
  surfaces: ReadonlyMap<string, unknown>;
  /** The processor used to derive the state, exposed for renderers. */
  processor: MessageProcessor<ReactComponentImplementation>;
}

/**
 * Scans the message list for distinct `createSurface.catalogId` values so we
 * can register a matching catalog for each. The MessageProcessor rejects
 * `createSurface` if no catalog with that id is registered, so the inspector
 * fabricates stub catalogs (cloning the basic components/functions) to keep
 * replay tolerant of agents that use arbitrary catalog ids.
 */
function collectCatalogIds(
  entries: readonly SessionEntry[],
): Set<string | undefined> {
  const ids = new Set<string | undefined>();
  for (const entry of entries) {
    const msg = entry.message as
      | { createSurface?: { catalogId?: unknown } }
      | undefined;
    if (msg && msg.createSurface) {
      const id = msg.createSurface.catalogId;
      ids.add(typeof id === "string" ? id : undefined);
    }
  }
  return ids;
}

/**
 * Replays all session entries up to and including `tick` through a fresh
 * `@a2ui/web_core` MessageProcessor and returns the resulting surface state.
 *
 * Entries with `tick > tick` are skipped. Malformed messages are swallowed so
 * a single bad frame can't break the timeline.
 */
export function stateAtTick(
  entries: readonly SessionEntry[],
  tick: number,
): ReplayState {
  const catalogIds = collectCatalogIds(entries);
  const catalogs: ReactCatalog[] = [createBasicCatalog()];
  for (const id of catalogIds) {
    if (id === "basic") continue;
    // The processor matches catalogs by exact `id` equality, so we mint a
    // stub catalog per id observed (including `undefined`) to tolerate
    // sessions that target arbitrary or omitted catalogs. Each stub carries
    // the basic React component implementations so surfaces can render.
    catalogs.push(
      new Catalog(
        id as unknown as string,
        BASIC_REACT_COMPONENTS,
        BASIC_FUNCTIONS,
      ),
    );
  }
  const processor = new MessageProcessor<ReactComponentImplementation>(catalogs);
  for (const entry of entries) {
    if (entry.tick > tick) break;
    if (!entry.message) continue;
    try {
      processor.processMessages([entry.message as never]);
    } catch {
      // Swallow per-message errors: an invalid frame shouldn't abort replay.
    }
  }
  return { surfaces: processor.model.surfacesMap, processor };
}
