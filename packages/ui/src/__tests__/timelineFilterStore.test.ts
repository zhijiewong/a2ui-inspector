import { describe, expect, it, beforeEach } from "vitest";
import { useTimelineFilterStore, STORAGE_KEY } from "../store/timelineFilter.js";
import { ALL_DIRECTIONS, ALL_KINDS } from "../panels/timelineFilter.js";

beforeEach(() => {
  localStorage.clear();
  useTimelineFilterStore.getState().reset();
});

describe("useTimelineFilterStore", () => {
  it("defaults to both directions, all kinds, empty query", () => {
    const s = useTimelineFilterStore.getState();
    expect(s.directions.size).toBe(ALL_DIRECTIONS.length);
    expect(s.kinds.size).toBe(ALL_KINDS.length);
    expect(s.query).toBe("");
  });

  it("isDefault() is true at defaults and false after a change", () => {
    expect(useTimelineFilterStore.getState().isDefault()).toBe(true);
    useTimelineFilterStore.getState().setQuery("x");
    expect(useTimelineFilterStore.getState().isDefault()).toBe(false);
  });

  it("toggleDirection removes then re-adds a direction", () => {
    useTimelineFilterStore.getState().toggleDirection("agent->client");
    expect(useTimelineFilterStore.getState().directions.has("agent->client")).toBe(false);
    useTimelineFilterStore.getState().toggleDirection("agent->client");
    expect(useTimelineFilterStore.getState().directions.has("agent->client")).toBe(true);
  });

  it("toggleKind removes then re-adds a kind", () => {
    useTimelineFilterStore.getState().toggleKind("action");
    expect(useTimelineFilterStore.getState().kinds.has("action")).toBe(false);
    useTimelineFilterStore.getState().toggleKind("action");
    expect(useTimelineFilterStore.getState().kinds.has("action")).toBe(true);
  });

  it("setQuery updates the query", () => {
    useTimelineFilterStore.getState().setQuery("hello");
    expect(useTimelineFilterStore.getState().query).toBe("hello");
  });

  it("reset restores defaults", () => {
    useTimelineFilterStore.getState().toggleDirection("agent->client");
    useTimelineFilterStore.getState().setQuery("x");
    useTimelineFilterStore.getState().reset();
    expect(useTimelineFilterStore.getState().isDefault()).toBe(true);
  });

  it("persists to localStorage after every change", () => {
    useTimelineFilterStore.getState().toggleKind("action");
    useTimelineFilterStore.getState().setQuery("foo");
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.kinds).not.toContain("action");
    expect(parsed.query).toBe("foo");
  });

  it("hydrate reads a stored value", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ directions: ["agent->client"], kinds: ["createSurface"], query: "abc" })
    );
    useTimelineFilterStore.getState().hydrate();
    const s = useTimelineFilterStore.getState();
    expect(Array.from(s.directions)).toEqual(["agent->client"]);
    expect(Array.from(s.kinds)).toEqual(["createSurface"]);
    expect(s.query).toBe("abc");
  });

  it("hydrate falls back to defaults on malformed JSON", () => {
    localStorage.setItem(STORAGE_KEY, "not-json");
    useTimelineFilterStore.getState().hydrate();
    expect(useTimelineFilterStore.getState().isDefault()).toBe(true);
  });
});
