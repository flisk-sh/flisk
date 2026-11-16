// Redelivery, duplicates and reordering against a real Redis Streams broker and Postgres.
// Needs REDIS_URL and DATABASE_URL (the README shows how to start both).
import { afterAll, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { RedisClient, SQL } from "bun";
import { resolve } from "node:path";

const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
setDefaultTimeout(30000);
// Its own stream, so the test never competes with a consumer that `flisk up` is running.
const STREAM = "payments.test";
const redis = new RedisClient(REDIS_URL);
const db = new SQL(DATABASE_URL);
const consumerPath = resolve(import.meta.dir, "../src/consumer.ts");

const publish = (e: Record<string, unknown>) => redis.send("XADD", [STREAM, "*", "data", JSON.stringify(e)]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Start the real consumer as a child process. */
function startConsumer(env: Record<string, string> = {}) {
  return Bun.spawn(["bun", "run", consumerPath], {
    env: { ...process.env, REDIS_URL, DATABASE_URL, STREAM, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
}

/** Wait until the group has no pending (unacknowledged) and no unread messages. */
async function drained(timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const info = (await redis.send("XINFO", ["GROUPS", STREAM])) as { pending: number; lag: number | null }[];
    const g = info[0];
    if (g && g.pending === 0 && (g.lag === 0 || g.lag === null)) return;
    await sleep(100);
  }
  throw new Error("consumer did not drain the stream in time");
}

const ledgerTotal = async () => Number((await db`SELECT COALESCE(SUM(amount_cents),0) AS t FROM ledger`)[0].t);
const status = async (id: string) => (await db`SELECT status FROM payments WHERE payment_id=${id}`)[0]?.status;

const cap = (event_id: string, capture_id: string, amount_cents = 125) => ({
  event_id, type: "PaymentCaptured", payment_id: "p1", provider_account: "acct", capture_id, amount_cents,
});

let consumer: ReturnType<typeof startConsumer> | undefined;
beforeEach(async () => {
  consumer?.kill();
  await redis.send("DEL", [STREAM]);
  await db`DROP TABLE IF EXISTS inbox, ledger, payments`;
});
afterAll(() => consumer?.kill());

describe("idempotent consumer", () => {
  test("the same event delivered twice has one effect", async () => {
    consumer = startConsumer();
    await publish(cap("e1", "c1"));
    await publish(cap("e1", "c1"));
    await drained();
    expect(await ledgerTotal()).toBe(125);
  });

  test("a new event id for the same capture has one effect", async () => {
    consumer = startConsumer();
    await publish(cap("e1", "c1"));
    await publish(cap("e2", "c1"));
    await drained();
    expect(await ledgerTotal()).toBe(125);
  });

  test("a second capture of the same payment is kept (partial captures)", async () => {
    consumer = startConsumer();
    await publish(cap("e1", "c1"));
    await publish(cap("e3", "c2"));
    await drained();
    expect(await ledgerTotal()).toBe(250);
  });

  test("an older Authorized after Captured leaves the payment captured", async () => {
    consumer = startConsumer();
    await publish(cap("e1", "c1"));
    await publish({ event_id: "e0", type: "PaymentAuthorized", payment_id: "p1", provider_account: "acct" });
    await drained();
    expect(await status("p1")).toBe("captured");
  });

  test("a consumer killed after commit and before ack is redelivered once, with one effect", async () => {
    // First run dies at the failpoint: the row is committed, the message is not acknowledged.
    consumer = startConsumer({ DIE_BEFORE_ACK: "1" });
    await publish(cap("e1", "c1"));
    expect(await consumer.exited).toBe(1);
    expect(await ledgerTotal()).toBe(125);
    const pending = (await redis.send("XPENDING", [STREAM, "ledger"])) as unknown[];
    expect(pending[0]).toBe(1); // still unacknowledged

    // Restart without the failpoint: the broker redelivers, the inbox absorbs it.
    consumer = startConsumer();
    await drained();
    expect(await ledgerTotal()).toBe(125);
  });
});
