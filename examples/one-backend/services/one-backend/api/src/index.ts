import { Hono } from "hono";

const app = new Hono();
app.get("/", (c) => c.json({ message: "Hello from Flisk" }));
app.get("/health", (c) => c.json({ status: "ok" }));

const port = Number(process.env.PORT ?? 4000);
Bun.serve({ port, fetch: app.fetch });
