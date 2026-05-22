import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SessionEntry } from "@a2ui-inspector/shared";
import { ShareDialog } from "../components/ShareDialog.js";

const entry = (tick: number): SessionEntry => ({
  tick, ts: tick, direction: "agent->client",
  message: { version: "v0.9", createSurface: { surfaceId: `s${tick}` } } as never,
});

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe("ShareDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<ShareDialog open={false} onClose={() => {}} entries={[entry(0)]} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the empty-state message for an empty session", async () => {
    render(<ShareDialog open onClose={() => {}} entries={[]} />);
    expect(await screen.findByText(/nothing to share/i)).toBeTruthy();
  });

  it("shows the privacy warning and a link for a valid session", async () => {
    render(<ShareDialog open onClose={() => {}} entries={[entry(0), entry(1)]} />);
    expect(await screen.findByText(/anyone with the link can read it/i)).toBeTruthy();
    const link = screen.getByLabelText(/share link/i) as HTMLInputElement;
    expect(link.value).toMatch(/#share=/);
  });

  it("copies the link to the clipboard on Copy", async () => {
    render(<ShareDialog open onClose={() => {}} entries={[entry(0)]} />);
    const copyBtn = await screen.findByRole("button", { name: /copy link/i });
    fireEvent.click(copyBtn);
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1));
  });

  it("calls onClose when the Close button is clicked", async () => {
    const onClose = vi.fn();
    render(<ShareDialog open onClose={onClose} entries={[entry(0)]} />);
    fireEvent.click(await screen.findByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
