#!/usr/bin/env node
import { validateSessionFile, formatReport } from "./validate.js";

const path = process.argv[2];

if (!path) {
  process.stderr.write("usage: a2ui-validate <session.jsonl>\n");
  process.exit(2);
}

try {
  const report = await validateSessionFile(path);
  process.stdout.write(formatReport(path, report) + "\n");
  process.exit(report.ok ? 0 : 1);
} catch (err) {
  process.stderr.write(`a2ui-validate: ${String((err as Error).message)}\n`);
  process.exit(2);
}
