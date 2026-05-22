import { useMemo } from "react";
import { useSessionStore } from "../store/session.js";
import { useTimelineStore } from "../store/timeline.js";
import { useSelectionStore } from "../store/selection.js";
import { stateAtTick } from "../replay/processor.js";
import { toSurfaceView, type SurfaceView, type ComponentNode } from "../replay/surfaceView.js";
import { JsonTree } from "../components/JsonTree.js";

export function ComponentTree() {
  const entries = useSessionStore((s) => s.entries);
  const scrub = useTimelineStore((s) => s.scrubTick);
  const selectedSurface = useSelectionStore((s) => s.surfaceId);
  const selectedComponent = useSelectionStore((s) => s.componentId);
  const selectComponent = useSelectionStore((s) => s.selectComponent);

  const tick = scrub === "head" ? entries.length - 1 : scrub;
  const views = useMemo(() => {
    const { surfaces } = stateAtTick(entries, tick);
    return Array.from(surfaces.entries()).map(([id, model]) => toSurfaceView(id, model));
  }, [entries, tick]);

  if (views.length === 0) {
    return <div className="p-4 text-xs text-ink-muted">No surfaces at this tick.</div>;
  }

  const activeView: SurfaceView = views.find((v) => v.surfaceId === selectedSurface) ?? views[0]!;
  const selectedNode = selectedComponent ? activeView.components.get(selectedComponent) : undefined;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto p-2">
        {activeView.rootId ? (
          <TreeNode
            view={activeView}
            id={activeView.rootId}
            depth={0}
            selectedId={selectedComponent}
            onSelect={(cid) => selectComponent(activeView.surfaceId, cid)}
          />
        ) : (
          <div className="text-xs text-ink-muted">Surface has no root component yet.</div>
        )}
      </div>
      {selectedNode && (
        <div className="border-t border-edge p-2">
          <div className="mono mb-1 text-xs text-ink-muted">
            component: {selectedNode.type} <span className="text-ink-faint">#{selectedNode.id}</span>
          </div>
          <JsonTree value={selectedNode.props} />
        </div>
      )}
    </div>
  );
}

interface TreeNodeProps {
  view: SurfaceView;
  id: string;
  depth: number;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

function TreeNode({ view, id, depth, selectedId, onSelect }: TreeNodeProps) {
  const node: ComponentNode | undefined = view.components.get(id);
  if (!node) {
    return (
      <div className="mono text-xs text-red-400" style={{ paddingLeft: `${depth * 12}px` }}>
        #{id} (missing)
      </div>
    );
  }
  const isSelected = id === selectedId;
  return (
    <div>
      <div
        style={{ paddingLeft: `${depth * 12}px` }}
        onClick={() => onSelect(id)}
        className={
          "mono cursor-pointer text-xs px-1 " +
          (isSelected ? "bg-raised text-emerald-300" : "hover:bg-surface text-ink")
        }
      >
        <span className="text-ink-muted">#{id}</span> <span>{node.type}</span>
      </div>
      {node.childIds.map((childId) => (
        <TreeNode key={childId} view={view} id={childId} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </div>
  );
}
