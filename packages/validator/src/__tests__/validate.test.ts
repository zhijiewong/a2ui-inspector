import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateSessionFile, formatReport } from "../validate.js";

const tmp = () => mkdtempSync(join(tmpdir(), "a2ui-validate-test-"));
const write = (body: string) => {
  const path = join(tmp(), "session.jsonl");
  writeFileSync(path, body);
  return path;
};

const validEntry = JSON.stringify({
  tick: 0, ts: 1000, direction: "agent->client",
  message: { version: "v0.9", createSurface: { surfaceId: "main" } },
});

describe("validateSessionFile", () => {
  it("reports ok for a fully valid session", async () => {
    const report = await validateSessionFile(write(validEntry + "\n"));
    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.lineCount).toBe(1);
  });

  it("skips blank lines", async () => {
    const report = await validateSessionFile(write(validEntry + "\n\n" + validEntry + "\n"));
    expect(report.ok).toBe(true);
    expect(report.lineCount).toBe(2);
  });

  it("reports malformed JSON with the 1-based line number", async () => {
    const report = await validateSessionFile(write("not-json\n"));
    expect(report.ok).toBe(false);
    expect(report.errors[0]?.line).toBe(1);
    expect(report.errors[0]?.message).toMatch(/malformed JSON/);
  });

  it("collects ALL errors, not just the first", async () => {
    const report = await validateSessionFile(write("not-json\n" + "{}\n"));
    expect(report.errors.length).toBe(2);
    expect(report.errors[0]?.line).toBe(1);
    expect(report.errors[1]?.line).toBe(2);
  });

  it("reports a schema-invalid entry (missing message/action)", async () => {
    const bad = JSON.stringify({ tick: 0, ts: 0, direction: "agent->client" });
    const report = await validateSessionFile(write(bad + "\n"));
    expect(report.ok).toBe(false);
    expect(report.errors[0]?.line).toBe(1);
  });
});

describe("formatReport", () => {
  it("renders a success line when ok", () => {
    const out = formatReport("s.jsonl", { ok: true, lineCount: 3, errors: [] });
    expect(out).toMatch(/s\.jsonl/);
    expect(out).toMatch(/3/);
    expect(out.toLowerCase()).toMatch(/valid|ok/);
  });

  it("renders each error with its line number when not ok", () => {
    const out = formatReport("s.jsonl", {
      ok: false, lineCount: 2,
      errors: [{ line: 1, message: "malformed JSON — x" }, { line: 2, message: "bad" }],
    });
    expect(out).toMatch(/1:/);
    expect(out).toMatch(/2:/);
    expect(out).toMatch(/bad/);
  });
});
