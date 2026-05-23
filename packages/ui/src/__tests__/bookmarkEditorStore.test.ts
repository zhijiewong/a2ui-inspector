import { describe, expect, it, beforeEach } from "vitest";
import { useBookmarkEditorStore } from "../store/bookmarkEditor.js";

beforeEach(() => useBookmarkEditorStore.setState({ openTick: undefined }));

describe("useBookmarkEditorStore", () => {
  it("defaults openTick to undefined", () => {
    expect(useBookmarkEditorStore.getState().openTick).toBeUndefined();
  });

  it("openFor sets openTick", () => {
    useBookmarkEditorStore.getState().openFor(5);
    expect(useBookmarkEditorStore.getState().openTick).toBe(5);
  });

  it("close clears openTick", () => {
    useBookmarkEditorStore.getState().openFor(5);
    useBookmarkEditorStore.getState().close();
    expect(useBookmarkEditorStore.getState().openTick).toBeUndefined();
  });
});
