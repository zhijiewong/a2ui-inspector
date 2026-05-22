import { useMemo } from "react";
import { useSessionStore } from "../store/session.js";
import { useTimelineStore } from "../store/timeline.js";
import { useSelectionStore } from "../store/selection.js";
import { stateAtTick } from "../replay/processor.js";
import { toSurfaceView } from "../replay/surfaceView.js";
import { JsonTree } from "../components/JsonTree.js";

export function DataModel() {
  const entries = useSessionStore((s) => s.entries);
  const scrub = useTimelineStore((s) => s.scrubTick);
  const selectedSurface = useSelectionStore((s) => s.surfaceId);

  const tick = scrub === "head" ? entries.length - 1 : scrub;
  const views = useMemo(() => {
    const { surfaces } = stateAtTick(entries, tick);
    return Array.from(surfaces.entries()).map(([id, model]) => toSurfaceView(id, model));
  }, [entries, tick]);

  if (views.length === 0) {
    return <div className="p-3 text-xs text-ink-muted">No data model at this tick.</div>;
  }

  const view = views.find((v) => v.surfaceId === selectedSurface) ?? views[0]!;

  return (
    <div className="overflow-auto p-2">
      <div className="mono mb-1 text-xs text-ink-muted">data model · surface: {view.surfaceId}</div>
      <JsonTree value={view.dataModel ?? {}} />
    </div>
  );
}
