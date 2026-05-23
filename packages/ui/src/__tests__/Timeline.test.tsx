import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

  it("hides rows whose kind is filtered out", async () => {
    const { useTimelineFilterStore } = await import("../store/timelineFilter.js");
    useTimelineFilterStore.getState().reset();
    useTimelineFilterStore.getState().toggleKind("createSurface");
    render(<Timeline />);
    expect(screen.queryByText(/createSurface/)).toBeNull();
    expect(screen.getByText(/updateDataModel/)).toBeTruthy();
    useTimelineFilterStore.getState().reset();
  });

  it("filters by search query (case-insensitive substring on kind)", async () => {
    const { useTimelineFilterStore } = await import("../store/timelineFilter.js");
    useTimelineFilterStore.getState().reset();
    useTimelineFilterStore.getState().setQuery("DATA");
    render(<Timeline />);
    expect(screen.queryByText(/createSurface/)).toBeNull();
    expect(screen.getByText(/updateDataModel/)).toBeTruthy();
    useTimelineFilterStore.getState().reset();
  });

  it("shows the X of Y count and reset button only when filtered", async () => {
    const { useTimelineFilterStore } = await import("../store/timelineFilter.js");
    useTimelineFilterStore.getState().reset();
    const { unmount } = render(<Timeline />);
    expect(screen.queryByText(/shown/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /reset filter/i })).toBeNull();
    unmount();

    useTimelineFilterStore.getState().setQuery("createSurface");
    render(<Timeline />);
    expect(screen.getByText(/1 of 2 shown/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /reset filter/i }));
    expect(useTimelineFilterStore.getState().isDefault()).toBe(true);
  });

  it("scrub-snaps to the nearest visible tick when the active tick is filtered out", async () => {
    const { useTimelineFilterStore } = await import("../store/timelineFilter.js");
    useTimelineFilterStore.getState().reset();
    useTimelineStore.getState().setScrubTick(0);
    useTimelineFilterStore.getState().toggleKind("createSurface");
    render(<Timeline />);
    await waitFor(() => expect(useTimelineStore.getState().scrubTick).toBe(1));
    useTimelineFilterStore.getState().reset();
  });

  it("renders an empty-state message when no entries match", async () => {
    const { useTimelineFilterStore } = await import("../store/timelineFilter.js");
    useTimelineFilterStore.getState().reset();
    useTimelineFilterStore.getState().setQuery("xyz-no-match");
    render(<Timeline />);
    expect(screen.getByText(/no entries match/i)).toBeTruthy();
    useTimelineFilterStore.getState().reset();
  });

  it("focuses the search input when the filter-focus tick increments", async () => {
    const { useFilterFocusStore } = await import("../store/filterFocus.js");
    useFilterFocusStore.setState({ focusTick: 0 });
    render(<Timeline />);
    const input = screen.getByLabelText(/filter sessions/i) as HTMLInputElement;
    expect(document.activeElement).not.toBe(input);
    useFilterFocusStore.getState().requestFocus();
    await waitFor(() => expect(document.activeElement).toBe(input));
  });
});
