import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  diagnosticsPathFor,
  loadSession,
  loadSessionDiagnostics,
  saveSession,
  saveSessionDiagnostics,
} from "../session/persistence.js";
import type { SessionEntry } from "@a2ui-inspector/shared";
import { SessionStore } from "../session/store.js";
import { loadFileIntoStore } from "../adapters/file.js";

const tmp = () => mkdtempSync(join(tmpdir(), "a2ui-inspector-test-"));

const fixtureEntries: SessionEntry[] = [
  { tick: 0, ts: 1000, direction: "agent->client",
    message: { version: "v0.9", createSurface: { surfaceId: "main" } } as any },
  { tick: 1, ts: 1100, direction: "client->agent",
    action: { surfaceId: "main", componentId: "btn", kind: "tap" } },
];

describe("session persistence", () => {
  it("round-trips a session via save then load", async () => {
    const path = join(tmp(), "out.jsonl");
    await saveSession(path, fixtureEntries);
    const loaded = await loadSession(path);
    expect(loaded).toEqual(fixtureEntries);
  });

  it("loadSession skips empty lines and rejects malformed entries", async () => {
    const path = join(tmp(), "in.jsonl");
    const good = JSON.stringify(fixtureEntries[0]);
    writeFileSync(path, good + "\n\n" + good + "\n");
    const loaded = await loadSession(path);
    expect(loaded.length).toBe(2);
  });

  it("loadSession throws on malformed JSON", async () => {
    const path = join(tmp(), "bad.jsonl");
    writeFileSync(path, "not-json\n");
    await expect(loadSession(path)).rejects.toThrow();
  });

  it("saveSession writes one JSON object per line", async () => {
    const path = join(tmp(), "out.jsonl");
    await saveSession(path, fixtureEntries);
    const text = readFileSync(path, "utf8");
    const lines = text.trim().split("\n");
    expect(lines.length).toBe(2);
    expect(() => JSON.parse(lines[0]!)).not.toThrow();
  });
});

describe("file adapter", () => {
  it("loads a session file and replaces store contents", async () => {
    const path = join(tmp(), "x.jsonl");
    await saveSession(path, fixtureEntries);
    const store = new SessionStore();
    store.appendMessage({ version: "v0.9", deleteSurface: { surfaceId: "z" } } as any); // pollute
    await loadFileIntoStore(path, store);
    expect(store.length).toBe(2);
    expect(store.entries()[0]?.tick).toBe(0);
  });
});

describe("persistence: diagnostics sibling file", () => {
  it("diagnosticsPathFor swaps .jsonl for .diagnostics.jsonl", () => {
    expect(diagnosticsPathFor("/tmp/foo.jsonl")).toBe("/tmp/foo.diagnostics.jsonl");
    expect(diagnosticsPathFor("/tmp/foo")).toBe("/tmp/foo.diagnostics.jsonl");
  });

  it("save then load round-trips diagnostics", async () => {
    const dir = mkdtempSync(join(tmpdir(), "diag-"));
    try {
      const file = join(dir, "s.jsonl");
      const ds = [
        { ts: 1, category: "schema" as const, severity: "error" as const, code: "x", message: "y" },
        { ts: 2, category: "render" as const, severity: "warn" as const, code: "a", message: "b", tick: 3 },
      ];
      await saveSessionDiagnostics(file, ds);
      const round = await loadSessionDiagnostics(file);
      expect(round).toEqual(ds);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loadSessionDiagnostics returns [] when the sibling file does not exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "diag-"));
    try {
      const file = join(dir, "no-diags.jsonl");
      writeFileSync(file, "");
      const round = await loadSessionDiagnostics(file);
      expect(round).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
