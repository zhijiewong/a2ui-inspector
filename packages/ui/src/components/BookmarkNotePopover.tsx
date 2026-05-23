import { useEffect, useState } from "react";
import { useBookmarksStore } from "../store/bookmarks.js";
import { useBookmarkEditorStore } from "../store/bookmarkEditor.js";

export function BookmarkNotePopover() {
  const openTick = useBookmarkEditorStore((s) => s.openTick);
  const close = useBookmarkEditorStore((s) => s.close);
  const existing = useBookmarksStore((s) =>
    openTick === undefined ? undefined : s.bookmarks.get(openTick)
  );
  const setNote = useBookmarksStore((s) => s.setNote);
  const toggle = useBookmarksStore((s) => s.toggle);

  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (openTick === undefined) return;
    setDraft(existing?.note ?? "");
  }, [openTick, existing?.note]);

  if (openTick === undefined) return null;

  const onSave = () => {
    setNote(openTick, draft);
    close();
  };
  const onRemove = () => {
    if (existing) toggle(openTick);
    close();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-24"
      onClick={close}
    >
      <div
        className="w-[28rem] max-w-[90vw] rounded border border-edge-strong bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bookmark-popover-title"
      >
        <div id="bookmark-popover-title" className="mb-2 font-semibold text-ink">Bookmark · tick #{openTick}</div>
        <textarea
          aria-label="Bookmark note"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What's interesting about this tick?"
          rows={4}
          className="mono w-full rounded border border-edge bg-app px-2 py-1 text-xs text-ink"
        />
        <div className="mt-3 flex items-center justify-between">
          {existing ? (
            <button
              onClick={onRemove}
              className="rounded border border-edge px-2 py-1 text-xs text-red-300 hover:bg-raised"
            >
              Remove
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={close}
              className="rounded border border-edge px-2 py-1 text-xs hover:bg-raised"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              className="rounded border border-edge px-2 py-1 text-xs hover:bg-raised"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
