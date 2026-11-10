import { SQL } from "bun";
const sql = new SQL(process.env.DATABASE_URL!.split("?")[0]);
// Behind a path-routing gateway (Flisk's Traefik serves /api/<service>/...) the prefix is stripped or kept; accept both.
const PREFIX = /^\/api\/(?:catalog|orders|payments|notifications)(?=\/(?:health|api)\b)/;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
async function handle(req: Request): Promise<Response> {
    const p = new URL(req.url).pathname.replace(PREFIX, "").replace(/\/$/, "");
    if (p === "/health" || p === "/api/products/health") {
      await sql`SELECT 1 FROM products LIMIT 1`; // fails until the migrator has created the table
      return Response.json({ ok: true, service: "catalog" });
    }
    if (p === "/api/products") return Response.json(await sql`SELECT * FROM products ORDER BY id`);
    const m = p.match(/^\/api\/products\/(\d+)$/);
    if (m) {
      const [row] = await sql`SELECT * FROM products WHERE id = ${Number(m[1])}`;
      return row ? Response.json(row) : Response.json({ error: "not found" }, { status: 404 });
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
console.log("catalog up");
