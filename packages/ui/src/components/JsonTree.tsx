import { useState } from "react";

interface JsonTreeProps {
  value: unknown;
  /** JSON-Pointer paths whose leaves should be highlighted. */
  changedPaths?: Set<string>;
}

export function JsonTree({ value, changedPaths }: JsonTreeProps) {
  return <JsonNode value={value} path="" name={undefined} changedPaths={changedPaths} depth={0} />;
}

interface JsonNodeProps {
  value: unknown;
  path: string;
  name: string | undefined;
  changedPaths?: Set<string>;
  depth: number;
}

function JsonNode({ value, path, name, changedPaths, depth }: JsonNodeProps) {
  const [open, setOpen] = useState(depth < 2);
  const isObject = value !== null && typeof value === "object";
  const indent = { paddingLeft: `${depth * 12}px` };

  if (!isObject) {
    const changed = changedPaths?.has(path) ?? false;
    return (
      <div
        data-testid={`json-leaf-${path}`}
        style={indent}
        className={"mono text-xs " + (changed ? "text-emerald-300" : "text-ink")}
      >
        {name !== undefined && <span className="text-sky-400">{name}: </span>}
        <span>{formatPrimitive(value)}</span>
      </div>
    );
  }

  const entries: Array<[string, unknown]> = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>);

  return (
    <div>
      <div
        style={indent}
        className="mono text-xs cursor-pointer text-ink-muted hover:text-ink"
        onClick={() => setOpen((o) => !o)}
      >
        <span>{open ? "▾" : "▸"} </span>
        {name !== undefined ? <span className="text-sky-400">{name}</span> : <span>root</span>}
        <span className="text-ink-faint"> {Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}</span>
      </div>
      {open &&
        entries.map(([k, v]) => (
          <JsonNode
            key={k}
            value={v}
            name={k}
            path={`${path}/${k}`}
            changedPaths={changedPaths}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

function formatPrimitive(v: unknown): string {
  if (typeof v === "string") return `"${v}"`;
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  return String(v);
}
