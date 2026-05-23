import type { A2UIAction, A2UIMessage, Diagnostic, SessionEntry } from "@a2ui-inspector/shared";

type Listener<T> = (value: T) => void;

export class SessionStore {
  private log: SessionEntry[] = [];
  private diagnosticLog: Diagnostic[] = [];

  private appendListeners = new Set<Listener<SessionEntry>>();
  private replaceListeners = new Set<Listener<SessionEntry[]>>();
  private diagnosticAppendListeners = new Set<Listener<Diagnostic>>();
  private diagnosticReplaceListeners = new Set<Listener<Diagnostic[]>>();

  get length(): number {
    return this.log.length;
  }

  /** Returns the live backing array typed as readonly. Do not mutate. */
  entries(): readonly SessionEntry[] {
    return this.log;
  }

  diagnostics(): readonly Diagnostic[] {
    return this.diagnosticLog;
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

  appendDiagnostic(d: Diagnostic): void {
    this.diagnosticLog.push(d);
    this.fireDiagnosticAppend(d);
  }

  clear(): void {
    this.replace([]);
    this.replaceDiagnostics([]);
  }

  replace(entries: SessionEntry[]): void {
    this.log = [...entries];
    for (const l of this.replaceListeners) l(this.log);
  }

  replaceDiagnostics(ds: Diagnostic[]): void {
    this.diagnosticLog = [...ds];
    for (const l of this.diagnosticReplaceListeners) l(this.diagnosticLog);
  }

  onAppend(listener: Listener<SessionEntry>): () => void {
    this.appendListeners.add(listener);
    return () => this.appendListeners.delete(listener);
  }

  onReplace(listener: Listener<SessionEntry[]>): () => void {
    this.replaceListeners.add(listener);
    return () => this.replaceListeners.delete(listener);
  }

  onDiagnosticAppend(listener: Listener<Diagnostic>): () => void {
    this.diagnosticAppendListeners.add(listener);
    return () => this.diagnosticAppendListeners.delete(listener);
  }

  onDiagnosticReplace(listener: Listener<Diagnostic[]>): () => void {
    this.diagnosticReplaceListeners.add(listener);
    return () => this.diagnosticReplaceListeners.delete(listener);
  }

  private fireAppend(entry: SessionEntry): void {
    for (const l of this.appendListeners) l(entry);
  }

  private fireDiagnosticAppend(d: Diagnostic): void {
    for (const l of this.diagnosticAppendListeners) l(d);
  }
}
