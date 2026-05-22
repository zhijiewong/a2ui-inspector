import { readFile, writeFile } from "node:fs/promises";
import { SessionEntrySchema, type SessionEntry } from "@a2ui-inspector/shared";

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
