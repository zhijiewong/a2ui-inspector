import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { Timeline } from "../panels/Timeline.js";
import { useSessionStore } from "../store/session.js";
import { useTimelineStore } from "../store/timeline.js";

beforeEach(() => {
  useSessionStore.getState().reset();
  useTimelineStore.getState().setScrubTick("head");
  useSessionStore.getState().applyEvent({
    kind: "messageReceived",
    tick: 0,
    ts: 1000,
    message: { version: "v0.9", createSurface: { surfaceId: "main" } } as any,
  });
  useSessionStore.getState().applyEvent({
    kind: "messageReceived",
    tick: 1,
    ts: 1100,
    message: { version: "v0.9", updateDataModel: { surfaceId: "main", path: "/", value: {} } } as any,
  });
});

describe("Timeline", () => {
  it("renders one row per entry with the message kind", () => {
    render(<Timeline />);
    expect(screen.getByText(/createSurface/)).toBeTruthy();
    expect(screen.getByText(/updateDataModel/)).toBeTruthy();
  });

  it("clicking a row scrubs to that tick", () => {
    render(<Timeline />);
    fireEvent.click(screen.getByText(/createSurface/));
    expect(useTimelineStore.getState().scrubTick).toBe(0);
  });

  it("ArrowRight steps forward, ArrowLeft steps backward", () => {
    render(<Timeline />);
    useTimelineStore.getState().setScrubTick(0);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(useTimelineStore.getState().scrubTick).toBe(1);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(useTimelineStore.getState().scrubTick).toBe(0);
  });
});
