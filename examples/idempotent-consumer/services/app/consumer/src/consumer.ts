import { RedisClient, SQL } from "bun";
import { resolve } from "node:path";
import { handle, type PaymentEvent } from "./handler";

const STREAM = process.env.STREAM ?? "payments";
const GROUP = process.env.GROUP ?? "ledger";
const NAME = process.env.CONSUMER_NAME ?? "c1"; // fixed, so a restart re-reads its own unacked messages
const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
// Test failpoint: die after the commit and before the acknowledgement.
const DIE_BEFORE_ACK = process.env.DIE_BEFORE_ACK === "1";

const redis = new RedisClient(REDIS_URL);
const db = new SQL(DATABASE_URL);

await db.file(resolve(import.meta.dir, "schema.sql"));
try {
  await redis.send("XGROUP", ["CREATE", STREAM, GROUP, "0", "MKSTREAM"]);
} catch (err) {
  if (!String(err).includes("BUSYGROUP")) throw err;
}

type Entry = [string, string[]];
const toEvent = (fields: string[]): PaymentEvent => JSON.parse(fields[fields.indexOf("data") + 1]);

async function read(id: string): Promise<Entry[]> {
  // Bun's client returns a map { <stream>: [[id, fields], ...] }, or null when nothing arrived.
  const res = (await redis.send("XREADGROUP", [
    "GROUP", GROUP, NAME, "COUNT", "10", "BLOCK", id === ">" ? "1000" : "1", "STREAMS", STREAM, id,
  ])) as Record<string, Entry[]> | null;
  return res?.[STREAM] ?? [];
}

async function drain(entries: Entry[]) {
  for (const [msgId, fields] of entries) {
    const outcome = await handle(db, GROUP, toEvent(fields));
    console.log(`event ${toEvent(fields).event_id}: ${outcome}`);
    if (DIE_BEFORE_ACK) dieBeforeAck();
    await redis.send("XACK", [STREAM, GROUP, msgId]);
  }
}

function dieBeforeAck(): never {
  console.log("failpoint: exiting after commit, before ack");
  process.exit(1);
}

// Redelivery: first drain what this consumer read earlier and never acknowledged ("0"),
// then switch to new messages (">").
for (let backlog = await read("0"); backlog.length; backlog = await read("0")) {
  await drain(backlog);
}
while (true) await drain(await read(">"));
