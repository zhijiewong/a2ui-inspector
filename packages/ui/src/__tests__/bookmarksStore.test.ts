import { describe, expect, it, beforeEach } from "vitest";
import { useBookmarksStore, type Bookmark } from "../store/bookmarks.js";

beforeEach(() => useBookmarksStore.getState().clear());

describe("useBookmarksStore", () => {
  it("starts empty", () => {
    expect(useBookmarksStore.getState().bookmarks.size).toBe(0);
  });

  it("toggle(tick) adds a bookmark with an empty note", () => {
    useBookmarksStore.getState().toggle(5);
    expect(useBookmarksStore.getState().bookmarks.size).toBe(1);
    expect(useBookmarksStore.getState().bookmarks.get(5)).toEqual({ tick: 5, note: "" });
    expect(useBookmarksStore.getState().has(5)).toBe(true);
  });

  it("toggle(tick) on an existing bookmark removes it", () => {
    useBookmarksStore.getState().toggle(5);
    useBookmarksStore.getState().toggle(5);
    expect(useBookmarksStore.getState().bookmarks.size).toBe(0);
    expect(useBookmarksStore.getState().has(5)).toBe(false);
  });

  it("setNote updates an existing note", () => {
    useBookmarksStore.getState().toggle(5);
    useBookmarksStore.getState().setNote(5, "broken here");
    expect(useBookmarksStore.getState().bookmarks.get(5)?.note).toBe("broken here");
  });

  it("setNote creates a bookmark if missing", () => {
    useBookmarksStore.getState().setNote(7, "note");
    expect(useBookmarksStore.getState().bookmarks.get(7)).toEqual({ tick: 7, note: "note" });
  });

  it("get returns the bookmark or undefined", () => {
    expect(useBookmarksStore.getState().get(5)).toBeUndefined();
    useBookmarksStore.getState().toggle(5);
    expect(useBookmarksStore.getState().get(5)).toEqual({ tick: 5, note: "" });
  });

  it("loadAll replaces the current set", () => {
    useBookmarksStore.getState().toggle(99);
    const fresh: Bookmark[] = [{ tick: 1, note: "a" }, { tick: 3, note: "b" }];
    useBookmarksStore.getState().loadAll(fresh);
    expect(useBookmarksStore.getState().bookmarks.size).toBe(2);
    expect(useBookmarksStore.getState().has(99)).toBe(false);
    expect(useBookmarksStore.getState().has(1)).toBe(true);
    expect(useBookmarksStore.getState().get(3)?.note).toBe("b");
  });

  it("clear empties the map", () => {
    useBookmarksStore.getState().toggle(1);
    useBookmarksStore.getState().toggle(2);
    useBookmarksStore.getState().clear();
    expect(useBookmarksStore.getState().bookmarks.size).toBe(0);
  });
});
