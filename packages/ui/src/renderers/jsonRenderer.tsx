import { toSurfaceView } from "../replay/surfaceView.js";
import { JsonTree } from "../components/JsonTree.js";
import type { PreviewRenderer } from "./types.js";

export const jsonRenderer: PreviewRenderer = {
  id: "json",
  label: "JSON (structural)",
  Surface: ({ surfaceId, surface }) => {
    const view = toSurfaceView(surfaceId, surface);
    const components = Object.fromEntries(
      Array.from(view.components.entries()).map(([id, node]) => [
        id,
        { type: node.type, childIds: node.childIds, props: node.props },
      ]),
    );
    return (
      <div className="mono text-xs">
        <div className="mb-1 text-ink-faint">components ({view.components.size})</div>
        <JsonTree value={components} />
        <div className="mb-1 mt-3 text-ink-faint">data model</div>
        <JsonTree value={view.dataModel ?? {}} />
      </div>
    );
  },
};
