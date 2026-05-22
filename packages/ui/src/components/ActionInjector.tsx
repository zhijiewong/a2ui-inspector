import { useState } from "react";
import type { A2UIAction } from "@a2ui-inspector/shared";

interface ActionInjectorProps {
  onInject: (action: A2UIAction) => void;
}

const KINDS = ["tap", "submit", "textChange", "change", "select"];

export function ActionInjector({ onInject }: ActionInjectorProps) {
  const [surfaceId, setSurfaceId] = useState("");
  const [componentId, setComponentId] = useState("");
  const [kind, setKind] = useState("tap");
  const [payloadText, setPayloadText] = useState("");
  const [error, setError] = useState<string | undefined>();

  const fire = () => {
    setError(undefined);
    if (!surfaceId.trim() || !componentId.trim()) {
      setError("Surface and component are required.");
      return;
    }
    const action: A2UIAction = { surfaceId: surfaceId.trim(), componentId: componentId.trim(), kind };
    if (payloadText.trim()) {
      try {
        action.payload = JSON.parse(payloadText);
      } catch {
        setError("Invalid JSON payload.");
        return;
      }
    }
    onInject(action);
  };

  return (
    <div className="border-t border-neutral-800 p-2 mono text-xs">
      <div className="mb-1 text-neutral-500">Inject action</div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          surface
          <input
            aria-label="surface"
            value={surfaceId}
            onChange={(e) => setSurfaceId(e.target.value)}
            className="w-24 rounded border border-neutral-700 bg-neutral-900 px-1"
          />
        </label>
        <label className="flex items-center gap-1">
          component
          <input
            aria-label="component"
            value={componentId}
            onChange={(e) => setComponentId(e.target.value)}
            className="w-24 rounded border border-neutral-700 bg-neutral-900 px-1"
          />
        </label>
        <label className="flex items-center gap-1">
          kind
          <select
            aria-label="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="rounded border border-neutral-700 bg-neutral-900 px-1"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          payload
          <input
            aria-label="payload"
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
            placeholder='{"text":"…"}'
            className="w-40 rounded border border-neutral-700 bg-neutral-900 px-1"
          />
        </label>
        <button
          onClick={fire}
          className="rounded border border-neutral-700 px-2 py-0.5 hover:bg-neutral-800"
        >
          Inject
        </button>
      </div>
      {error && <div className="mt-1 text-red-300">{error}</div>}
    </div>
  );
}
