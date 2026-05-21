import {
  Catalog,
  MessageProcessor,
  type ComponentApi,
} from "@a2ui/web_core/v0_9";
import {
  BASIC_COMPONENTS,
  BASIC_FUNCTIONS,
} from "@a2ui/web_core/v0_9/basic_catalog";
import type { SessionEntry } from "@a2ui-inspector/shared";

/**
 * Builds a default catalog containing the basic components and functions
 * shipped with `@a2ui/web_core`. A fresh catalog is created per replay so
 * that any catalog-level state (e.g. function invokers) is not shared
 * across processors.
 */
function createBasicCatalog(): Catalog<ComponentApi> {
  return new Catalog<ComponentApi>("basic", BASIC_COMPONENTS, BASIC_FUNCTIONS);
}

export interface ReplayState {
  /** Map of surfaceId -> SurfaceModel (opaque to the inspector). */
  surfaces: ReadonlyMap<string, unknown>;
  /** The processor used to derive the state, exposed for renderers. */
  processor: MessageProcessor<ComponentApi>;
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
  const catalogs: Catalog<ComponentApi>[] = [createBasicCatalog()];
  for (const id of catalogIds) {
    if (id === "basic") continue;
    // The processor matches catalogs by exact `id` equality, so we mint a
    // stub catalog per id observed (including `undefined`) to tolerate
    // sessions that target arbitrary or omitted catalogs.
    catalogs.push(
      new Catalog<ComponentApi>(
        id as unknown as string,
        BASIC_COMPONENTS,
        BASIC_FUNCTIONS,
      ),
    );
  }
  const processor = new MessageProcessor<ComponentApi>(catalogs);
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
