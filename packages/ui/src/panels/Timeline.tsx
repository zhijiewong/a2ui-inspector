import { useEffect } from "react";
import { useSessionStore } from "../store/session.js";
import { useTimelineStore } from "../store/timeline.js";

function kindOf(entry: { message?: unknown; action?: unknown }): string {
  if (entry.action) return "action";
  const m = entry.message as { createSurface?: unknown; updateComponents?: unknown; updateDataModel?: unknown; deleteSurface?: unknown } | undefined;
  if (!m) return "unknown";
  if (m.createSurface) return "createSurface";
  if (m.updateComponents) return "updateComponents";
  if (m.updateDataModel) return "updateDataModel";
  if (m.deleteSurface) return "deleteSurface";
  return "unknown";
}

export function Timeline() {
  const entries = useSessionStore((s) => s.entries);
  const scrub = useTimelineStore((s) => s.scrubTick);
  const setScrub = useTimelineStore((s) => s.setScrubTick);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const current = scrub === "head" ? entries.length - 1 : scrub;
      if (e.key === "ArrowRight") {
        setScrub(Math.min(entries.length - 1, current + 1));
      } else if (e.key === "ArrowLeft") {
        setScrub(Math.max(0, current - 1));
      } else if (e.key === "End") {
        setScrub("head");
      } else if (e.key === "Home") {
        setScrub(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entries.length, scrub, setScrub]);

  const activeTick = scrub === "head" ? entries.length - 1 : scrub;

  return (
    <ol className="mono text-xs">
      {entries.map((e) => {
        const isActive = e.tick === activeTick;
        return (
          <li
            key={e.tick}
            onClick={() => setScrub(e.tick)}
            className={
              "cursor-pointer border-l-2 px-2 py-1 " +
              (isActive
                ? "border-emerald-400 bg-neutral-900 text-emerald-300"
                : "border-transparent hover:bg-neutral-900")
            }
          >
            <span className="mr-2 text-neutral-500">#{e.tick}</span>
            <span>{kindOf(e)}</span>
            {e.direction === "client->agent" ? <span className="ml-1 text-amber-400">←</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
