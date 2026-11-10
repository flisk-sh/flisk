import { SQL } from "bun";
const sql = new SQL(process.env.DATABASE_URL!.split("?")[0]);
// Behind a path-routing gateway (Flisk's Traefik serves /api/<service>/...) the prefix is stripped or kept; accept both.
const PREFIX = /^\/api\/(?:catalog|orders|payments|notifications)(?=\/(?:health|api)\b)/;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
async function handle(req: Request): Promise<Response> {
    const p = new URL(req.url).pathname.replace(PREFIX, "").replace(/\/$/, "");
    if (p === "/health" || p === "/api/payments/health") {
      await sql`SELECT 1 FROM payments LIMIT 1`; // fails until the migrator has created the table
      return Response.json({ ok: true, service: "payments" });
    }
    if (p === "/api/payments" && req.method === "GET")
      return Response.json(await sql`SELECT * FROM payments ORDER BY created_at DESC`);
    if (p === "/api/payments" && req.method === "POST") {
      const b: any = await req.json().catch(() => ({}));
      if (!b.orderId || !Number.isInteger(b.amountCents))
        return Response.json({ error: "orderId and amountCents required" }, { status: 400 });
      const [row] = await sql`INSERT INTO payments (order_id, amount_cents) VALUES (${b.orderId}, ${b.amountCents}) RETURNING *`;
      return Response.json(row, { status: 201 });
    }
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
console.log("payments up");
