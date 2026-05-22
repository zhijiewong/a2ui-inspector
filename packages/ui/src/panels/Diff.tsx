import { useMemo } from "react";
import { useSessionStore } from "../store/session.js";
import { useTimelineStore } from "../store/timeline.js";
import { useSelectionStore } from "../store/selection.js";
import { stateAtTick } from "../replay/processor.js";
import { toSurfaceView } from "../replay/surfaceView.js";
import { diffSurfaceViews } from "../replay/diff.js";
import { JsonTree } from "../components/JsonTree.js";

export function Diff() {
  const entries = useSessionStore((s) => s.entries);
  const scrub = useTimelineStore((s) => s.scrubTick);
  const selectedSurface = useSelectionStore((s) => s.surfaceId);

  const tick = scrub === "head" ? entries.length - 1 : scrub;

  const { diff, currView } = useMemo(() => {
    const currState = stateAtTick(entries, tick);
    const prevState = stateAtTick(entries, tick - 1);
    const pickView = (surfaces: ReadonlyMap<string, unknown>) => {
      const list = Array.from(surfaces.entries()).map(([id, m]) => toSurfaceView(id, m));
      return list.find((v) => v.surfaceId === selectedSurface) ?? list[0];
    };
    const curr = pickView(currState.surfaces);
    const prev = pickView(prevState.surfaces);
    if (!curr) return { diff: undefined, currView: undefined };
    return { diff: diffSurfaceViews(prev, curr), currView: curr };
  }, [entries, tick, selectedSurface]);

  if (!diff || !currView) {
    return <div className="p-3 text-xs text-neutral-500">Nothing to diff at this tick.</div>;
  }

  return (
    <div className="overflow-auto p-3 mono text-xs">
      <div className="mb-2 text-neutral-500">
        diff · tick {tick - 1} → {tick} · surface: {currView.surfaceId}
      </div>
      <Section label="Added components" items={diff.addedComponents} className="text-emerald-300" />
      <Section label="Removed components" items={diff.removedComponents} className="text-red-300" />
      <Section label="Changed components" items={diff.changedComponents} className="text-amber-300" />
      <div className="mt-3 text-neutral-400">Data model (changed paths highlighted):</div>
      <JsonTree value={currView.dataModel ?? {}} changedPaths={diff.changedPaths} />
    </div>
  );
}

function Section({ label, items, className }: { label: string; items: string[]; className: string }) {
  return (
    <div className="mb-1">
      <span className="text-neutral-500">{label}: </span>
      {items.length === 0 ? (
        <span className="text-neutral-600">none</span>
      ) : (
        items.map((id) => (
          <span key={id} className={"mr-2 " + className}>
            #{id}
          </span>
        ))
      )}
    </div>
  );
}
