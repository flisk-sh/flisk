import { SQL, RedisClient } from "bun";
const sql = new SQL(process.env.DATABASE_URL!.split("?")[0]);
const redis = new RedisClient(process.env.REDIS_URL!);
const STREAM = "orders.paid", GROUP = "notifications", ME = "worker-1";

// Behind a path-routing gateway (Flisk's Traefik serves /api/<service>/...) the prefix is stripped or kept; accept both.
const PREFIX = /^\/api\/(?:catalog|orders|payments|notifications)(?=\/(?:health|api)\b)/;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
async function handle(req: Request): Promise<Response> {
    const p = new URL(req.url).pathname.replace(PREFIX, "").replace(/\/$/, "");
    if (p === "/health" || p === "/api/notifications/health") return Response.json({ ok: true, service: "notifications" });
    if (p === "/api/notifications") return Response.json(await sql`SELECT * FROM notifications ORDER BY created_at DESC`);
    return Response.json({ error: "not found" }, { status: 404 });
}
Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  async fetch(req) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const res = await handle(req);
    for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
    return res;
  },
});

// Normalise XREADGROUP replies (array or map shaped) to [[id, {field: value}]]
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
try { await redis.send("XGROUP", ["CREATE", STREAM, GROUP, "0", "MKSTREAM"]); } catch (e: any) { if (!String(e).includes("BUSYGROUP")) throw e; }
console.log("notifications worker up");
// Entries read before a restart but never acknowledged are still pending: read them once (ID "0"), then new ones (">").
let cursor = "0";
while (true) {
  try {
    const res = await redis.send("XREADGROUP", ["GROUP", GROUP, ME, "COUNT", "10", "BLOCK", "2000", "STREAMS", STREAM, cursor]);
    const got = entries(res);
    for (const [id, f] of got) {
      const d = JSON.parse(f.data);
      await sql`INSERT INTO notifications (order_id, message) VALUES (${d.orderId}, ${`Order paid: ${d.productName} for ${d.customer} (${(d.amountCents / 100).toFixed(2)})`}) ON CONFLICT (order_id) DO NOTHING`;
      await redis.send("XACK", [STREAM, GROUP, id]);
      console.log("notified", d.orderId);
    }
    if (cursor === "0" && got.length === 0) cursor = ">";
  } catch (e) {
    console.error("loop error", e);
    await Bun.sleep(1000);
  }
}
