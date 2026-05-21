#!/usr/bin/env node
import { buildServer } from "./server.js";

const port = Number(process.env.A2UI_INSPECTOR_PORT ?? "8765");
const host = process.env.A2UI_INSPECTOR_HOST ?? "127.0.0.1";

const app = await buildServer();
await app.listen({ port, host });

const url = `http://${host}:${port}`;
process.stdout.write(`A2UI Inspector ready: ${url}\n`);

const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
try {
  const { spawn } = await import("node:child_process");
  spawn(opener, [url], { stdio: "ignore", detached: true }).unref();
} catch { /* ignore */ }
