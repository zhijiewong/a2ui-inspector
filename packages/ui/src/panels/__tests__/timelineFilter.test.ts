import { describe, expect, it } from "vitest";
import type { SessionEntry } from "@a2ui-inspector/shared";
import {
  entryKind,
  entrySurfaceId,
  matchesFilter,
  DEFAULT_FILTER,
  ALL_DIRECTIONS,
  ALL_KINDS,
  type Direction,
  type Kind,
  type TimelineFilter,
} from "../timelineFilter.js";

const msg = (variant: "createSurface" | "updateComponents" | "updateDataModel" | "deleteSurface", surfaceId: string): SessionEntry => ({
  tick: 0, ts: 0, direction: "agent->client",
  message: { version: "v0.9", [variant]: { surfaceId } } as never,
});
const act = (componentId: string): SessionEntry => ({
  tick: 0, ts: 0, direction: "client->agent",
  action: { surfaceId: "main", componentId, kind: "tap" },
});

const filter = (override: Partial<TimelineFilter> = {}): TimelineFilter => ({
  directions: new Set<Direction>(ALL_DIRECTIONS),
  kinds: new Set<Kind>(ALL_KINDS),
  query: "",
  ...override,
});

describe("entryKind", () => {
  it("returns createSurface for createSurface messages", () => {
    expect(entryKind(msg("createSurface", "s"))).toBe("createSurface");
  });
  it("returns updateComponents for updateComponents messages", () => {
    expect(entryKind(msg("updateComponents", "s"))).toBe("updateComponents");
  });
  it("returns updateDataModel for updateDataModel messages", () => {
    expect(entryKind(msg("updateDataModel", "s"))).toBe("updateDataModel");
  });
  it("returns deleteSurface for deleteSurface messages", () => {
    expect(entryKind(msg("deleteSurface", "s"))).toBe("deleteSurface");
  });
  it("returns action for client actions", () => {
    expect(entryKind(act("btn"))).toBe("action");
  });
});

describe("entrySurfaceId", () => {
  it("extracts surfaceId from createSurface", () => {
    expect(entrySurfaceId(msg("createSurface", "main"))).toBe("main");
  });
  it("extracts surfaceId from updateComponents", () => {
    expect(entrySurfaceId(msg("updateComponents", "sidebar"))).toBe("sidebar");
  });
  it("extracts surfaceId from an action", () => {
    expect(entrySurfaceId(act("btn"))).toBe("main");
  });
});

describe("matchesFilter — direction", () => {
  it("includes the entry when its direction is in the set", () => {
    expect(matchesFilter(msg("createSurface", "s"), filter())).toBe(true);
  });
  it("excludes the entry when its direction is filtered out", () => {
    expect(matchesFilter(msg("createSurface", "s"), filter({ directions: new Set(["client->agent"]) }))).toBe(false);
  });
});

describe("matchesFilter — kind", () => {
  it("excludes the entry when its kind is filtered out", () => {
    expect(matchesFilter(msg("createSurface", "s"), filter({ kinds: new Set(["updateDataModel"]) }))).toBe(false);
  });
});

describe("matchesFilter — query", () => {
  it("empty query passes everything", () => {
    expect(matchesFilter(msg("createSurface", "main"), filter({ query: "" }))).toBe(true);
  });
  it("matches the kind label (case-insensitive)", () => {
    expect(matchesFilter(msg("createSurface", "main"), filter({ query: "CREATE" }))).toBe(true);
  });
  it("matches the surfaceId substring", () => {
    expect(matchesFilter(msg("createSurface", "sidebar"), filter({ query: "side" }))).toBe(true);
  });
  it("matches the componentId substring for actions", () => {
    expect(matchesFilter(act("submit-btn"), filter({ query: "btn" }))).toBe(true);
  });
  it("excludes entries that match no facet", () => {
    expect(matchesFilter(msg("createSurface", "main"), filter({ query: "nope" }))).toBe(false);
  });
});

describe("matchesFilter — combination", () => {
  it("requires direction AND kind AND query to all match", () => {
    const e = msg("createSurface", "main");
    expect(matchesFilter(e, filter({ directions: new Set(["agent->client"]), kinds: new Set(["createSurface"]), query: "main" }))).toBe(true);
    expect(matchesFilter(e, filter({ directions: new Set(["client->agent"]), kinds: new Set(["createSurface"]), query: "main" }))).toBe(false);
  });
});

describe("DEFAULT_FILTER", () => {
  it("includes both directions and all five kinds and an empty query", () => {
    expect(DEFAULT_FILTER.directions.size).toBe(2);
    expect(DEFAULT_FILTER.kinds.size).toBe(5);
    expect(DEFAULT_FILTER.query).toBe("");
  });
});
