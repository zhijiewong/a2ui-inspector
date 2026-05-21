import { loadSession } from "../session/persistence.js";
import type { SessionStore } from "../session/store.js";

export async function loadFileIntoStore(path: string, store: SessionStore): Promise<number> {
  const entries = await loadSession(path);
  store.replace(entries);
  return entries.length;
}
