import { useState } from "react";
import { useDiagnosticsStore } from "../store/diagnostics.js";
import { useTimelineStore } from "../store/timeline.js";
import type { Diagnostic } from "@a2ui-inspector/shared";

const ALL_CATEGORIES: Array<Diagnostic["category"]> = ["schema", "protocol", "transport", "render"];
const ALL_SEVERITIES: Array<Diagnostic["severity"]> = ["error", "warn"];

export function ErrorsPanel(): JSX.Element {
  const diagnostics = useDiagnosticsStore((s) => s.diagnostics);
  const [categoryFilter, setCategoryFilter] = useState<Set<Diagnostic["category"]>>(
    new Set(ALL_CATEGORIES),
  );
  const [severityFilter, setSeverityFilter] = useState<Set<Diagnostic["severity"]>>(
    new Set(ALL_SEVERITIES),
  );

  const visible = Array.from(diagnostics.values()).filter(
    (d) => categoryFilter.has(d.category) && severityFilter.has(d.severity),
  );

  const toggleCategory = (c: Diagnostic["category"]): void => {
    setCategoryFilter((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  };

  const toggleSeverity = (s: Diagnostic["severity"]): void => {
    setSeverityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  const jumpTo = (tick: number | undefined): void => {
    if (tick !== undefined) useTimelineStore.getState().setScrubTick(tick);
  };

  return (
    <div className="flex h-full flex-col bg-app text-ink">
      <div className="border-b border-edge p-2">
        <div className="mb-1 flex flex-wrap gap-1">
          {ALL_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => toggleCategory(c)}
              aria-pressed={categoryFilter.has(c)}
              className={`rounded border border-edge px-2 py-0.5 text-xs ${categoryFilter.has(c) ? "bg-raised text-ink" : "text-ink-faint"}`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {ALL_SEVERITIES.map((s) => (
            <button
              key={s}
              onClick={() => toggleSeverity(s)}
              aria-pressed={severityFilter.has(s)}
              className={`rounded border border-edge px-2 py-0.5 text-xs ${severityFilter.has(s) ? "bg-raised text-ink" : "text-ink-faint"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="p-3 text-sm text-ink-muted">
          {diagnostics.size === 0 ? "No errors in this session." : "No errors match the current filter."}
        </div>
      ) : (
        <ul className="flex-1 overflow-auto">
          {visible.map((d, i) => (
            <li
              key={`${d.ts}-${d.category}-${d.code}-${d.tick ?? "x"}-${i}`}
              className="border-b border-edge px-2 py-1.5"
            >
              <button
                onClick={() => jumpTo(d.tick)}
                className="block w-full text-left"
                aria-label={d.tick !== undefined ? `tick #${d.tick} ${d.code}` : `${d.code}`}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className={`h-1.5 w-1.5 rounded-full ${d.severity === "error" ? "bg-red-500" : "bg-amber-400"}`} />
                  <span className="text-ink-muted">{d.tick !== undefined ? `tick #${d.tick}` : "—"}</span>
                  <span className="text-ink">{d.code}</span>
                  <span className="text-ink-faint">[{d.category}]</span>
                </div>
                <div className="mt-0.5 text-xs text-ink-muted">{d.message}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
