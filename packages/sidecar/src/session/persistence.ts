import { readFile, writeFile } from "node:fs/promises";
import {
  DiagnosticSchema,
  SessionEntrySchema,
  type Diagnostic,
  type SessionEntry,
} from "@a2ui-inspector/shared";

export async function saveSession(path: string, entries: SessionEntry[]): Promise<void> {
  const body = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  await writeFile(path, body, "utf8");
}

export async function loadSession(path: string): Promise<SessionEntry[]> {
  const text = await readFile(path, "utf8");
  const out: SessionEntry[] = [];
  let lineNo = 0;
  for (const raw of text.split("\n")) {
    lineNo++;
    const line = raw.trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      throw new Error(`${path}:${lineNo}: malformed JSON — ${(err as Error).message}`);
    }
    out.push(SessionEntrySchema.parse(parsed));
  }
  return out;
}

/**
 * Sibling-file path: foo.jsonl → foo.diagnostics.jsonl (and foo → foo.diagnostics.jsonl).
 * Matching is case-sensitive: only a lowercase `.jsonl` suffix is stripped; any other
 * suffix (e.g. `.jsonl.bak`, `.JSONL`) is preserved and `.diagnostics.jsonl` appended.
 */
export function diagnosticsPathFor(sessionPath: string): string {
  if (sessionPath.endsWith(".jsonl")) {
    return sessionPath.slice(0, -".jsonl".length) + ".diagnostics.jsonl";
  }
  return sessionPath + ".diagnostics.jsonl";
}

export async function saveSessionDiagnostics(sessionPath: string, diagnostics: Diagnostic[]): Promise<void> {
  const body = diagnostics.map((d) => JSON.stringify(d)).join("\n") + (diagnostics.length ? "\n" : "");
  await writeFile(diagnosticsPathFor(sessionPath), body, "utf8");
}

export async function loadSessionDiagnostics(sessionPath: string): Promise<Diagnostic[]> {
  let text: string;
  try {
    text = await readFile(diagnosticsPathFor(sessionPath), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: Diagnostic[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const parsed = JSON.parse(line);
    out.push(DiagnosticSchema.parse(parsed));
  }
  return out;
}
