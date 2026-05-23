import { describe, expect, it, beforeEach } from "vitest";
import { useFilterFocusStore } from "../store/filterFocus.js";

beforeEach(() => useFilterFocusStore.setState({ focusTick: 0 }));

describe("useFilterFocusStore", () => {
  it("defaults focusTick to 0", () => {
    expect(useFilterFocusStore.getState().focusTick).toBe(0);
  });

  it("requestFocus increments focusTick", () => {
    useFilterFocusStore.getState().requestFocus();
    expect(useFilterFocusStore.getState().focusTick).toBe(1);
    useFilterFocusStore.getState().requestFocus();
    expect(useFilterFocusStore.getState().focusTick).toBe(2);
  });
});
