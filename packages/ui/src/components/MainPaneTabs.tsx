import { useMainPaneStore, type MainPaneTab } from "../store/mainPane.js";

const TABS: Array<{ id: MainPaneTab; label: string }> = [
  { id: "preview", label: "Preview" },
  { id: "tree", label: "Tree" },
  { id: "diff", label: "Diff" },
];

export function MainPaneTabs() {
  const tab = useMainPaneStore((s) => s.tab);
  const setTab = useMainPaneStore((s) => s.setTab);
  return (
    <div className="flex border-b border-neutral-800">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={
            "px-3 py-1 text-xs border-b-2 " +
            (tab === t.id
              ? "border-emerald-400 text-emerald-300"
              : "border-transparent text-neutral-400 hover:text-neutral-200")
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
