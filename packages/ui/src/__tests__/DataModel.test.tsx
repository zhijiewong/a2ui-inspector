import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { DataModel } from "../panels/DataModel.js";
import { useSessionStore } from "../store/session.js";
import { useTimelineStore } from "../store/timeline.js";
import { useSelectionStore } from "../store/selection.js";

beforeEach(() => {
  useSessionStore.getState().reset();
  useTimelineStore.getState().setScrubTick("head");
  useSelectionStore.setState({ surfaceId: undefined, componentId: undefined });
  const ev = (tick: number, message: unknown) =>
    useSessionStore.getState().applyEvent({ kind: "messageReceived", tick, ts: tick, message: message as never });
  ev(0, { version: "v0.9", createSurface: { surfaceId: "main", catalogId: "x" } });
  ev(1, { version: "v0.9", updateDataModel: { surfaceId: "main", path: "/", value: { title: "Hello", n: 7 } } });
});

describe("DataModel", () => {
  it("renders the data model of the active surface at the scrubbed tick", () => {
    render(<DataModel />);
    expect(screen.getByText(/title/)).toBeTruthy();
    expect(screen.getByText(/"Hello"/)).toBeTruthy();
    expect(screen.getByText(/^7$/)).toBeTruthy();
  });

  it("shows an empty-state message when there are no surfaces", () => {
    useSessionStore.getState().reset();
    render(<DataModel />);
    expect(screen.getByText(/no data model/i)).toBeTruthy();
  });
});
