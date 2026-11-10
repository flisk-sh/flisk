import { RedisClient } from "bun";
const redis = new RedisClient(process.env.REDIS_URL!);
const ORDERS = process.env.ORDERS_URL!;
const DELAY = Number(process.env.SHIP_DELAY_MS ?? 5000);
const STREAM = "orders.paid", GROUP = "fulfilment", ME = "worker-1";

function entries(res: any): [string, Record<string, string>][] {
  if (!res) return [];
  const streams = Array.isArray(res) ? res : Object.entries(res);
  const out: [string, Record<string, string>][] = [];
  for (const s of streams) {
    for (const [id, kv] of s[1]) {
      const f: Record<string, string> = {};
      if (Array.isArray(kv)) for (let i = 0; i < kv.length; i += 2) f[kv[i]] = kv[i + 1];
      else Object.assign(f, kv);
      out.push([id, f]);
    }
  }
  return out;
}
const ack = new RedisClient(process.env.REDIS_URL!);
async function ship(id: string, orderId: string) {
  await Bun.sleep(DELAY);
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`${ORDERS}/api/orders/${orderId}/ship`, { method: "POST" }).catch(() => null);
    if (r && (r.ok || r.status === 409)) { await ack.send("XACK", [STREAM, GROUP, id]); console.log("shipped", orderId); return; }
    await Bun.sleep(1000);
  }
}
try { await redis.send("XGROUP", ["CREATE", STREAM, GROUP, "0", "MKSTREAM"]); } catch (e: any) { if (!String(e).includes("BUSYGROUP")) throw e; }
console.log("fulfilment worker up");
// Entries this consumer read before a restart but never acknowledged are still pending: read them once (ID "0"), then new ones (">").
let cursor = "0";
while (true) {
  try {
    const res = await redis.send("XREADGROUP", ["GROUP", GROUP, ME, "COUNT", "10", "BLOCK", "2000", "STREAMS", STREAM, cursor]);
    const got = entries(res);
    for (const [id, f] of got) ship(id, JSON.parse(f.data).orderId).catch((e) => console.error("ship error", e));
    if (cursor === "0" && got.length === 0) cursor = ">";
  } catch (e) {
    console.error("loop error", e);
    await Bun.sleep(1000);
  }
}
