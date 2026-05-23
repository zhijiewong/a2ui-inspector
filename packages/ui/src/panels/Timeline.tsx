import { useEffect, useMemo, useRef } from "react";
import { Star } from "lucide-react";
import { useSessionStore } from "../store/session.js";
import { useTimelineStore } from "../store/timeline.js";
import { useTimelineFilterStore } from "../store/timelineFilter.js";
import { useFilterFocusStore } from "../store/filterFocus.js";
import { useBookmarksStore } from "../store/bookmarks.js";
import { useBookmarkEditorStore } from "../store/bookmarkEditor.js";
import {
  ALL_DIRECTIONS,
  ALL_KINDS,
  entryKind,
  matchesFilter,
  type Direction,
  type Kind,
} from "./timelineFilter.js";

const KIND_LABEL: Record<Kind, string> = {
  createSurface: "create",
  updateComponents: "upd",
  updateDataModel: "data",
  deleteSurface: "del",
  action: "act",
};

const DIRECTION_LABEL: Record<Direction, string> = {
  "agent->client": "agent→client",
  "client->agent": "client→agent",
};

export function Timeline() {
  const entries = useSessionStore((s) => s.entries);
  const scrub = useTimelineStore((s) => s.scrubTick);
  const setScrub = useTimelineStore((s) => s.setScrubTick);

  const directions = useTimelineFilterStore((s) => s.directions);
  const kinds = useTimelineFilterStore((s) => s.kinds);
  const query = useTimelineFilterStore((s) => s.query);
  const toggleDirection = useTimelineFilterStore((s) => s.toggleDirection);
  const toggleKind = useTimelineFilterStore((s) => s.toggleKind);
  const setQuery = useTimelineFilterStore((s) => s.setQuery);
  const resetFilter = useTimelineFilterStore((s) => s.reset);
  const isDefault = useTimelineFilterStore((s) => s.isDefault());

  const bookmarksMap = useBookmarksStore((s) => s.bookmarks);
  const toggleBookmark = useBookmarksStore((s) => s.toggle);
  const openEditor = useBookmarkEditorStore((s) => s.openFor);

  const focusTick = useFilterFocusStore((s) => s.focusTick);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusTick > 0) inputRef.current?.focus();
  }, [focusTick]);

  const filter = useMemo(() => ({ directions, kinds, query }), [directions, kinds, query]);
  const visibleEntries = useMemo(
    () => entries.filter((e) => matchesFilter(e, filter)),
    [entries, filter]
  );

  useEffect(() => {
    if (scrub === "head") return;
    if (visibleEntries.length === 0) return;
    if (visibleEntries.some((e) => e.tick === scrub)) return;
    const forward = visibleEntries.find((e) => e.tick > scrub);
    const backward = [...visibleEntries].reverse().find((e) => e.tick < scrub);
    const next = forward ?? backward;
    if (next) setScrub(next.tick);
  }, [visibleEntries, scrub, setScrub]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (visibleEntries.length === 0) return;
      const ticks = visibleEntries.map((v) => v.tick);
      const current = scrub === "head" ? ticks[ticks.length - 1]! : scrub;
      const idx = ticks.indexOf(current);
      if (e.key === "ArrowRight") {
        const i = idx < 0 ? 0 : Math.min(ticks.length - 1, idx + 1);
        setScrub(ticks[i]!);
      } else if (e.key === "ArrowLeft") {
        const i = idx < 0 ? 0 : Math.max(0, idx - 1);
        setScrub(ticks[i]!);
      } else if (e.key === "End") {
        setScrub("head");
      } else if (e.key === "Home") {
        setScrub(ticks[0]!);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visibleEntries, scrub, setScrub]);

  const activeTick = scrub === "head" ? visibleEntries[visibleEntries.length - 1]?.tick : scrub;

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 border-b border-edge bg-surface px-2 py-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          aria-label="Filter sessions"
          className="mono w-full rounded border border-edge bg-app px-2 py-1 text-xs text-ink"
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {ALL_DIRECTIONS.map((d) => {
            const on = directions.has(d);
            return (
              <button
                key={d}
                onClick={() => toggleDirection(d)}
                aria-pressed={on}
                className={"mono rounded px-1.5 py-0.5 text-[10px] " + (on ? "bg-raised text-ink" : "text-ink-muted hover:bg-surface")}
              >
                {DIRECTION_LABEL[d]}
              </button>
            );
          })}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {ALL_KINDS.map((k) => {
            const on = kinds.has(k);
            return (
              <button
                key={k}
                onClick={() => toggleKind(k)}
                aria-pressed={on}
                className={"mono rounded px-1.5 py-0.5 text-[10px] " + (on ? "bg-raised text-ink" : "text-ink-muted hover:bg-surface")}
              >
                {KIND_LABEL[k]}
              </button>
            );
          })}
        </div>
        {!isDefault && (
          <div className="mt-2 flex items-center justify-between mono text-[10px] text-ink-muted">
            <span>{visibleEntries.length} of {entries.length} shown</span>
            <button
              onClick={resetFilter}
              className="rounded border border-edge px-1.5 py-0.5 hover:bg-raised"
            >
              Reset filter
            </button>
          </div>
        )}
      </div>

      <ol className="mono flex-1 overflow-auto text-xs">
        {visibleEntries.length === 0 ? (
          <li className="px-2 py-4 text-ink-muted">
            {entries.length === 0 ? "No entries yet." : "No entries match the current filter."}
          </li>
        ) : (
          visibleEntries.map((e) => {
            const isActive = e.tick === activeTick;
            return (
              <li
                key={e.tick}
                onClick={() => setScrub(e.tick)}
                className={
                  "group flex flex-col cursor-pointer border-l-2 px-2 py-1 " +
                  (isActive
                    ? "border-emerald-400 bg-surface text-emerald-300"
                    : "border-transparent hover:bg-surface")
                }
              >
                <div className="flex items-center">
                  <span className="mr-2 text-ink-muted">#{e.tick}</span>
                  <span>{entryKind(e)}</span>
                  {e.direction === "client->agent" ? (
                    <span className="ml-1 text-amber-400">←</span>
                  ) : null}
                  <button
                    aria-label={`Bookmark tick ${e.tick}`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (ev.shiftKey) openEditor(e.tick);
                      else toggleBookmark(e.tick);
                    }}
                    className={
                      "ml-auto rounded p-0.5 " +
                      (bookmarksMap.has(e.tick)
                        ? "text-amber-400"
                        : "text-ink-faint opacity-0 group-hover:opacity-100 hover:text-ink")
                    }
                  >
                    <Star
                      size={12}
                      fill={bookmarksMap.has(e.tick) ? "currentColor" : "none"}
                    />
                  </button>
                </div>
                {bookmarksMap.get(e.tick)?.note ? (
                  <div className="mono ml-4 text-[10px] text-ink-muted truncate">
                    {bookmarksMap.get(e.tick)!.note}
                  </div>
                ) : null}
              </li>
            );
          })
        )}
      </ol>
    </div>
  );
}
