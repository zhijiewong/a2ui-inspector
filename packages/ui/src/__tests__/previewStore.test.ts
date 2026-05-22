import { describe, expect, it, beforeEach } from "vitest";
import { usePreviewStore, FRAME_WIDTHS } from "../store/preview.js";

beforeEach(() => usePreviewStore.setState({ frame: "desktop" }));

describe("preview store", () => {
  it("defaults to the desktop frame", () => {
    expect(usePreviewStore.getState().frame).toBe("desktop");
  });

  it("setFrame changes the frame", () => {
    usePreviewStore.getState().setFrame("mobile");
    expect(usePreviewStore.getState().frame).toBe("mobile");
  });

  it("FRAME_WIDTHS maps mobile and tablet to pixel widths and desktop to undefined", () => {
    expect(FRAME_WIDTHS.mobile).toBe(390);
    expect(FRAME_WIDTHS.tablet).toBe(768);
    expect(FRAME_WIDTHS.desktop).toBeUndefined();
  });
});
