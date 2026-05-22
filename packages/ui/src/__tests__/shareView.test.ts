import { describe, expect, it, beforeEach } from "vitest";
import { useShareViewStore } from "../store/shareView.js";

beforeEach(() => useShareViewStore.setState({ isSharedView: false }));

describe("share-view store", () => {
  it("defaults to not-shared", () => {
    expect(useShareViewStore.getState().isSharedView).toBe(false);
  });

  it("setSharedView toggles the flag", () => {
    useShareViewStore.getState().setSharedView(true);
    expect(useShareViewStore.getState().isSharedView).toBe(true);
    useShareViewStore.getState().setSharedView(false);
    expect(useShareViewStore.getState().isSharedView).toBe(false);
  });
});
