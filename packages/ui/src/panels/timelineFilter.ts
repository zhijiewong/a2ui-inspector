import type { SessionEntry } from "@a2ui-inspector/shared";

export type Direction = "agent->client" | "client->agent";
export type Kind = "createSurface" | "updateComponents" | "updateDataModel" | "deleteSurface" | "action";

export const ALL_DIRECTIONS: readonly Direction[] = ["agent->client", "client->agent"];
export const ALL_KINDS: readonly Kind[] = [
  "createSurface",
  "updateComponents",
  "updateDataModel",
  "deleteSurface",
  "action",
];

export interface TimelineFilter {
  directions: Set<Direction>;
  kinds: Set<Kind>;
  query: string;
}

export const DEFAULT_FILTER: TimelineFilter = {
  directions: new Set<Direction>(ALL_DIRECTIONS),
  kinds: new Set<Kind>(ALL_KINDS),
  query: "",
};

interface MessageShape {
  createSurface?: { surfaceId?: string };
  updateComponents?: { surfaceId?: string };
  updateDataModel?: { surfaceId?: string };
  deleteSurface?: { surfaceId?: string };
}

export function entryKind(entry: SessionEntry): Kind | "unknown" {
  if (entry.action) return "action";
  const m = entry.message as MessageShape | undefined;
  if (!m) return "unknown";
  if (m.createSurface) return "createSurface";
  if (m.updateComponents) return "updateComponents";
  if (m.updateDataModel) return "updateDataModel";
  if (m.deleteSurface) return "deleteSurface";
  return "unknown";
}

export function entrySurfaceId(entry: SessionEntry): string | undefined {
  if (entry.action) return entry.action.surfaceId;
  const m = entry.message as MessageShape | undefined;
  return (
    m?.createSurface?.surfaceId ??
    m?.updateComponents?.surfaceId ??
    m?.updateDataModel?.surfaceId ??
    m?.deleteSurface?.surfaceId
  );
}

export function matchesFilter(entry: SessionEntry, filter: TimelineFilter): boolean {
  if (!filter.directions.has(entry.direction)) return false;
  const k = entryKind(entry);
  if (k === "unknown") return false;
  if (!filter.kinds.has(k)) return false;

  const q = filter.query.trim().toLowerCase();
  if (!q) return true;

  if (k.toLowerCase().includes(q)) return true;
  const sid = entrySurfaceId(entry);
  if (sid && sid.toLowerCase().includes(q)) return true;
  if (entry.action && entry.action.componentId.toLowerCase().includes(q)) return true;

  return false;
}
