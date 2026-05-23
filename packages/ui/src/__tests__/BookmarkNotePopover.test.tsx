import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { BookmarkNotePopover } from "../components/BookmarkNotePopover.js";
import { useBookmarksStore } from "../store/bookmarks.js";
import { useBookmarkEditorStore } from "../store/bookmarkEditor.js";

beforeEach(() => {
  useBookmarksStore.getState().clear();
  useBookmarkEditorStore.setState({ openTick: undefined });
});

describe("BookmarkNotePopover", () => {
  it("renders nothing when openTick is undefined", () => {
    const { container } = render(<BookmarkNotePopover />);
    expect(container.firstChild).toBeNull();
  });

  it("opens for the given tick and pre-fills an empty textarea when no bookmark exists", () => {
    useBookmarkEditorStore.getState().openFor(5);
    render(<BookmarkNotePopover />);
    expect(screen.getByText(/Bookmark · tick #5/)).toBeTruthy();
    const textarea = screen.getByLabelText(/bookmark note/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
  });

  it("pre-fills the textarea with the existing note", () => {
    useBookmarksStore.getState().setNote(5, "broke here");
    useBookmarkEditorStore.getState().openFor(5);
    render(<BookmarkNotePopover />);
    const textarea = screen.getByLabelText(/bookmark note/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe("broke here");
  });

  it("Save writes the draft via setNote and closes the editor", () => {
    useBookmarkEditorStore.getState().openFor(5);
    render(<BookmarkNotePopover />);
    const textarea = screen.getByLabelText(/bookmark note/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "the new note" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(useBookmarksStore.getState().bookmarks.get(5)?.note).toBe("the new note");
    expect(useBookmarkEditorStore.getState().openTick).toBeUndefined();
  });

  it("Remove deletes the bookmark and closes the editor", () => {
    useBookmarksStore.getState().toggle(5);
    useBookmarkEditorStore.getState().openFor(5);
    render(<BookmarkNotePopover />);
    fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    expect(useBookmarksStore.getState().has(5)).toBe(false);
    expect(useBookmarkEditorStore.getState().openTick).toBeUndefined();
  });

  it("Remove is hidden when the tick is not yet bookmarked", () => {
    useBookmarkEditorStore.getState().openFor(5);
    render(<BookmarkNotePopover />);
    expect(screen.queryByRole("button", { name: /^remove$/i })).toBeNull();
  });

  it("Cancel closes without mutating", () => {
    useBookmarksStore.getState().setNote(5, "original");
    useBookmarkEditorStore.getState().openFor(5);
    render(<BookmarkNotePopover />);
    const textarea = screen.getByLabelText(/bookmark note/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "changed" } });
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(useBookmarksStore.getState().bookmarks.get(5)?.note).toBe("original");
    expect(useBookmarkEditorStore.getState().openTick).toBeUndefined();
  });
});
