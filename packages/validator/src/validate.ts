import { readFile } from "node:fs/promises";
import { SessionEntrySchema } from "@a2ui-inspector/shared";

export interface ValidationError {
  line: number;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  lineCount: number;
  errors: ValidationError[];
}

/** Validate every non-blank line of a .jsonl session file against the v0.9 spec. */
export async function validateSessionFile(path: string): Promise<ValidationReport> {
  const text = await readFile(path, "utf8");
  const errors: ValidationError[] = [];
  let lineNo = 0;
  let lineCount = 0;

  for (const raw of text.split("\n")) {
    lineNo++;
    const line = raw.trim();
    if (!line) continue;
    lineCount++;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      errors.push({ line: lineNo, message: `malformed JSON — ${(err as Error).message}` });
      continue;
    }

    const result = SessionEntrySchema.safeParse(parsed);
    if (!result.success) {
      const detail = result.error.issues
        .map((i) => `${i.path.join("/") || "(root)"}: ${i.message}`)
        .join("; ");
      errors.push({ line: lineNo, message: detail });
    }
  }

  return { ok: errors.length === 0, lineCount, errors };
}

/** Render a human-readable report for the CLI. */
export function formatReport(path: string, report: ValidationReport): string {
  if (report.ok) {
    return `${path}: valid — ${report.lineCount} entr${report.lineCount === 1 ? "y" : "ies"} OK`;
  }
  const lines = report.errors.map((e) => `  line ${e.line}: ${e.message}`);
  return [
    `${path}: INVALID — ${report.errors.length} error${report.errors.length === 1 ? "" : "s"} in ${report.lineCount} entr${report.lineCount === 1 ? "y" : "ies"}`,
    ...lines,
  ].join("\n");
}
