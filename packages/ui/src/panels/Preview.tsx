import { Component, type ErrorInfo, type ReactNode, useMemo } from "react";
import { A2uiSurface } from "@a2ui/react/v0_9";
import { useSessionStore } from "../store/session.js";
import { useTimelineStore } from "../store/timeline.js";
import { useSelectionStore } from "../store/selection.js";
import { stateAtTick } from "../replay/processor.js";

class SurfaceErrorBoundary extends Component<{ surfaceId: string; children: ReactNode }, { error?: Error }> {
  override state = {} as { error?: Error };
  override componentDidCatch(error: Error, _info: ErrorInfo) {
    this.setState({ error });
  }
  override render() {
    if (this.state.error) {
      return (
        <div className="mono text-xs text-red-300">
          Failed to render surface "{this.props.surfaceId}". The bundled @a2ui/react renderer threw: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

export function Preview() {
  const entries = useSessionStore((s) => s.entries);
  const scrub = useTimelineStore((s) => s.scrubTick);
  const selectedSurface = useSelectionStore((s) => s.surfaceId);
  const selectSurface = useSelectionStore((s) => s.selectSurface);

  const tick = scrub === "head" ? entries.length - 1 : scrub;
  const { surfaces } = useMemo(() => stateAtTick(entries, tick), [entries, tick]);
  const surfaceList = Array.from(surfaces.entries());

  if (surfaceList.length === 0) {
    return <div className="p-6 text-sm text-ink-muted">Waiting for messages. Connect to an upstream or load a .jsonl session.</div>;
  }

  const activeId = surfaceList.find(([id]) => id === selectedSurface)?.[0] ?? surfaceList[0]![0];
  const activeSurface = surfaces.get(activeId);

  return (
    <div className="flex h-full flex-col" data-testid="preview-pane">
      {surfaceList.length > 1 && (
        <div className="flex border-b border-edge">
          {surfaceList.map(([id]) => (
            <button
              key={id}
              onClick={() => selectSurface(id)}
              className={
                "px-3 py-1 mono text-xs border-b-2 " +
                (id === activeId
                  ? "border-sky-400 text-sky-300"
                  : "border-transparent text-ink-muted hover:text-ink")
              }
            >
              {id}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-auto p-3">
        <div className="rounded border border-edge p-2">
          <div className="mb-1 mono text-xs text-ink-muted">surface: {activeId}</div>
          <div className="rounded bg-surface p-2">
            <SurfaceErrorBoundary surfaceId={activeId}>
              <A2uiSurface key={activeId} surface={activeSurface as never} />
            </SurfaceErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
