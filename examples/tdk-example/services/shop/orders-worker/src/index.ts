import { connect, type NatsConnection } from "nats";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const natsUrl = process.env.NATS_URL ?? "nats://flisk_example_nats:4222";
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const pgUrl = new URL(databaseUrl);
pgUrl.searchParams.delete("schema");
const db = new Pool({ connectionString: pgUrl.toString() });
let nc: NatsConnection | undefined;
while (!nc) {
  try {
    nc = await connect({ servers: natsUrl });
  } catch (error) {
    console.error("waiting for NATS", error);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}
const subscription = nc.subscribe("demo.orders.created", { queue: "orders-workers" });
await nc.flush();
nc.publish("demo.orders.worker-ready", new Uint8Array());
console.log("orders-worker subscribed to demo.orders.created");

for await (const message of subscription) {
  const id = new TextDecoder().decode(message.data);
  const result = await db.query(
    "UPDATE demo_orders SET worker_seen_at = now() WHERE id = $1 RETURNING id, item",
    [id],
  );
  if (result.rows[0]) console.log(`worker observed order ${id}: ${result.rows[0].item}`);
  else console.error(`worker received unknown order ${id}`);
}
