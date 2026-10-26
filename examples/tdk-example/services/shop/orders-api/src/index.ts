import { serve } from "@hono/node-server";
import { connect, type NatsConnection } from "nats";
import { Hono } from "hono";
import { Pool } from "pg";

const port = Number(process.env.PORT ?? 4000);
const databaseUrl = process.env.DATABASE_URL;
const natsUrl = process.env.NATS_URL ?? "nats://flisk_example_nats:4222";
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const pgUrl = new URL(databaseUrl);
pgUrl.searchParams.delete("schema");
const db = new Pool({ connectionString: pgUrl.toString() });
let nats: NatsConnection;
let workerReady = false;

async function connectDependencies(): Promise<void> {
  while (true) {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS demo_orders (
          id bigserial PRIMARY KEY,
          item text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          worker_seen_at timestamptz
        )
      `);
      nats = await connect({ servers: natsUrl });
      return;
    } catch (error) {
      console.error("waiting for PostgreSQL and NATS", error);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}

const app = new Hono();
app.use("*", async (c, next) => {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Headers", "content-type");
  c.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  await next();
});
app.options("*", (c) => c.body(null, 204));
app.get("/health", (c) => c.json({ ok: true }));
app.get("/worker-ready", (c) => c.json({ ready: workerReady }, workerReady ? 200 : 503));
app.get("/", async (c) => {
  const result = await db.query("SELECT id, item, created_at AS \"createdAt\", worker_seen_at AS \"workerSeenAt\" FROM demo_orders ORDER BY id DESC LIMIT 20");
  return c.json({ orders: result.rows });
});
app.post("/", async (c) => {
  if (!workerReady) return c.json({ error: "orders worker is not ready" }, 503);
  const body = await c.req.json<{ item?: unknown }>();
  if (typeof body.item !== "string" || body.item.trim().length === 0) {
    return c.json({ error: "item is required" }, 400);
  }
  const result = await db.query(
    "INSERT INTO demo_orders (item) VALUES ($1) RETURNING id, item, created_at AS \"createdAt\", worker_seen_at AS \"workerSeenAt\"",
    [body.item.trim()],
  );
  const order = result.rows[0];
  nats.publish("demo.orders.created", new TextEncoder().encode(String(order.id)));
  return c.json({ order }, 201);
});
app.get("/:id", async (c) => {
  const result = await db.query(
    "SELECT id, item, created_at AS \"createdAt\", worker_seen_at AS \"workerSeenAt\" FROM demo_orders WHERE id = $1",
    [c.req.param("id")],
  );
  if (!result.rows[0]) return c.json({ error: "order not found" }, 404);
  return c.json({ order: result.rows[0] });
});

await connectDependencies();
const readySubscription = nats.subscribe("demo.orders.worker-ready");
await nats.flush();
void (async () => {
  for await (const _message of readySubscription) workerReady = true;
})();
serve({ fetch: app.fetch, port });
console.log(`orders-api listening on ${port}`);
