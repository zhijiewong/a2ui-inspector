import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import { registerBridgeClient } from "./bridge.js";
import { SessionStore } from "./session/store.js";

export interface BuildServerOptions {
  store?: SessionStore;
  uiDistDir?: string;
}

export async function buildServer(opts: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const store = opts.store ?? new SessionStore();

  await app.register(fastifyWebsocket);

  app.get("/bridge", { websocket: true }, (socket) => {
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

  return app;
}
