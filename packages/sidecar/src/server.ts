import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import { registerBridgeClient } from "./bridge.js";
import { SessionStore } from "./session/store.js";

export interface BuildServerOptions {
  store?: SessionStore;
  uiDistDir?: string;
  /** Bridge auth token. Defaults to A2UI_INSPECTOR_TOKEN or a random hex string. */
  token?: string;
}

export interface BuiltServer {
  app: FastifyInstance;
  token: string;
}

export async function buildServer(opts: BuildServerOptions = {}): Promise<BuiltServer> {
  const app = Fastify({ logger: false });
  const store = opts.store ?? new SessionStore();
  const token = opts.token ?? process.env.A2UI_INSPECTOR_TOKEN ?? randomBytes(16).toString("hex");

  await app.register(fastifyWebsocket);

  // Same-origin endpoint the UI fetches to learn the bridge token. Cross-origin
  // JS cannot read this response (no CORS headers), so it cannot reach /bridge.
  app.get("/bridge-token", async () => ({ token }));

  app.get("/bridge", { websocket: true }, (socket, request) => {
    const url = new URL(request.url ?? "/bridge", "http://localhost");
    if (url.searchParams.get("token") !== token) {
      socket.close(4401, "unauthorized");
      return;
    }
    registerBridgeClient(socket as never, store);
  });

  const here = dirname(fileURLToPath(import.meta.url));
  const uiDist = opts.uiDistDir
    ?? (existsSync(resolve(here, "../../ui/dist")) ? resolve(here, "../../ui/dist") : resolve(here, "../ui-dist"));
  if (existsSync(uiDist)) {
    await app.register(fastifyStatic, { root: uiDist, prefix: "/" });
  } else {
    app.get("/", async () => ({ ok: true, ui: "missing", hint: "Run `pnpm --filter @a2ui-inspector/ui build` to build the UI." }));
  }

  return { app, token };
}
