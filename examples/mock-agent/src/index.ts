import { WebSocketServer } from "ws";

const port = Number(process.env.PORT ?? 8000);
const wss = new WebSocketServer({ port });
process.stdout.write(`mock A2UI agent listening on ws://127.0.0.1:${port}\n`);

const script: Array<unknown> = [
  { version: "v0.9", createSurface: { surfaceId: "main", catalogId: "https://a2ui.org/specification/v0_9/basic_catalog.json" } },
  { version: "v0.9", updateComponents: {
    surfaceId: "main",
    components: [
      { id: "root", component: "Column", children: ["title", "body"] },
      { id: "title", component: "Text", text: { path: "/title" } },
      { id: "body", component: "Text", text: { path: "/body" } },
    ],
  }},
  { version: "v0.9", updateDataModel: { surfaceId: "main", path: "/", value: { title: "Hello from A2UI!", body: "Mock agent script v1." } } },
  { version: "v0.9", updateDataModel: { surfaceId: "main", path: "/title", value: "Updated title (tick 3)" } },
];

wss.on("connection", (socket) => {
  let i = 0;
  const tick = () => {
    if (i >= script.length) return;
    socket.send(JSON.stringify(script[i++]));
    setTimeout(tick, 300);
  };
  tick();
});
