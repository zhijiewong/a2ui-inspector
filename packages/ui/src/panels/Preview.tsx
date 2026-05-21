import { Component, type ErrorInfo, type ReactNode, useMemo } from "react";
import { A2uiSurface } from "@a2ui/react/v0_9";
import { useSessionStore } from "../store/session.js";
import { useTimelineStore } from "../store/timeline.js";
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

  const tick = scrub === "head" ? entries.length - 1 : scrub;
  const { surfaces } = useMemo(() => stateAtTick(entries, tick), [entries, tick]);

  if (entries.length === 0) {
    return <div className="p-6 text-sm text-neutral-500">Waiting for messages. Connect to an upstream or load a .jsonl session.</div>;
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {Array.from(surfaces.entries()).map(([id, surface]) => (
        <div key={id} className="rounded border border-neutral-800 p-2">
          <div className="mb-1 mono text-xs text-neutral-500">surface: {id}</div>
          <div className="rounded bg-neutral-900 p-2">
            <SurfaceErrorBoundary surfaceId={id}>
              <A2uiSurface key={id} surface={surface as never} />
            </SurfaceErrorBoundary>
          </div>
        </div>
      ))}
    </div>
  );
}
