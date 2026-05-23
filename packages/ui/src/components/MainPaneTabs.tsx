import { useMainPaneStore, type MainPaneTab } from "../store/mainPane.js";
import { useDiagnosticsStore } from "../store/diagnostics.js";

const TABS: Array<{ id: MainPaneTab; label: string }> = [
  { id: "preview", label: "Preview" },
  { id: "tree", label: "Tree" },
  { id: "diff", label: "Diff" },
  { id: "errors", label: "Errors" },
];

export function MainPaneTabs() {
  const tab = useMainPaneStore((s) => s.tab);
  const setTab = useMainPaneStore((s) => s.setTab);
  const diagnosticCount = useDiagnosticsStore((s) => s.diagnostics.size);
  return (
    <div className="flex border-b border-edge">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={
            "px-3 py-1 text-xs border-b-2 " +
            (tab === t.id
              ? "border-emerald-400 text-emerald-300"
              : "border-transparent text-ink-muted hover:text-ink")
          }
        >
          {t.label}
          {t.id === "errors" && diagnosticCount > 0 ? (
            <span className="ml-1 text-red-300">({diagnosticCount})</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
