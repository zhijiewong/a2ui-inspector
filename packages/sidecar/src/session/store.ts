import type { A2UIAction, A2UIMessage, SessionEntry } from "@a2ui-inspector/shared";

type Listener<T> = (value: T) => void;

export class SessionStore {
  private log: SessionEntry[] = [];

  private appendListeners = new Set<Listener<SessionEntry>>();
  private replaceListeners = new Set<Listener<SessionEntry[]>>();

  get length(): number {
    return this.log.length;
  }

  entries(): readonly SessionEntry[] {
    return this.log;
  }

  appendMessage(message: A2UIMessage): SessionEntry {
    const entry: SessionEntry = {
      tick: this.log.length,
      ts: Date.now(),
      direction: "agent->client",
      message,
    };
    this.log.push(entry);
    this.fireAppend(entry);
    return entry;
  }

  appendAction(action: A2UIAction): SessionEntry {
    const entry: SessionEntry = {
      tick: this.log.length,
      ts: Date.now(),
      direction: "client->agent",
      action,
    };
    this.log.push(entry);
    this.fireAppend(entry);
    return entry;
  }

  clear(): void {
    this.replace([]);
  }

  replace(entries: SessionEntry[]): void {
    this.log = [...entries];
    for (const l of this.replaceListeners) l(this.log);
  }

  onAppend(listener: Listener<SessionEntry>): () => void {
    this.appendListeners.add(listener);
    return () => this.appendListeners.delete(listener);
  }

  onReplace(listener: Listener<SessionEntry[]>): () => void {
    this.replaceListeners.add(listener);
    return () => this.replaceListeners.delete(listener);
  }

  private fireAppend(entry: SessionEntry): void {
    for (const l of this.appendListeners) l(entry);
  }
}
