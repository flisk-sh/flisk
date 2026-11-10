import { SQL, RedisClient } from "bun";
const sql = new SQL(process.env.DATABASE_URL!.split("?")[0]);
const redis = new RedisClient(process.env.REDIS_URL!);
const CATALOG = process.env.CATALOG_URL!;
const PAYMENTS = process.env.PAYMENTS_URL!;
const err = (error: string, status: number) => Response.json({ error }, { status });

// Behind a path-routing gateway (Flisk's Traefik serves /api/<service>/...) the prefix is stripped or kept; accept both.
const PREFIX = /^\/api\/(?:catalog|orders|payments|notifications)(?=\/(?:health|api)\b)/;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
async function handle(req: Request): Promise<Response> {
    const p = new URL(req.url).pathname.replace(PREFIX, "").replace(/\/$/, "");
    if (p === "/health" || p === "/api/orders/health") {
      await sql`SELECT 1`;
      await redis.send("PING", []);
      return Response.json({ ok: true, service: "orders" });
    }
    if (p === "/api/orders" && req.method === "GET")
      return Response.json(await sql`SELECT * FROM orders ORDER BY created_at DESC`);

    if (p === "/api/orders" && req.method === "POST") {
      const b: any = await req.json().catch(() => ({}));
      const quantity = Number(b.quantity ?? 1);
      if (!b.productId || !Number.isInteger(quantity) || quantity < 1) return err("productId and positive integer quantity required", 400);
      const pr = await fetch(`${CATALOG}/api/products/${encodeURIComponent(b.productId)}`);
      if (pr.status === 404) return err("unknown product", 400);
      if (!pr.ok) return err("catalog unavailable", 502);
      const product: any = await pr.json();
      const amount = product.price_cents * quantity;
      const [order] = await sql`
        INSERT INTO orders (product_id, product_name, quantity, amount_cents, customer)
        VALUES (${product.id}, ${product.name}, ${quantity}, ${amount}, ${b.customer ?? "anonymous"}) RETURNING *`;
      const pay = await fetch(`${PAYMENTS}/api/payments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: order.id, amountCents: amount }),
      }).catch(() => null);
      if (!pay || !pay.ok) {
        await sql`UPDATE orders SET status='payment_failed', updated_at=now() WHERE id=${order.id}`;
        return err("payment failed", 502);
      }
      const [paid] = await sql`UPDATE orders SET status='paid', updated_at=now() WHERE id=${order.id} RETURNING *`;
      await redis.send("XADD", ["orders.paid", "*", "data", JSON.stringify({ orderId: paid.id, amountCents: amount, customer: paid.customer, productName: paid.product_name })]);
      return Response.json(paid, { status: 201 });
    }

    let m = p.match(/^\/api\/orders\/([0-9a-f-]{36})$/);
    if (m && req.method === "GET") {
      const [row] = await sql`SELECT * FROM orders WHERE id = ${m[1]}`;
      return row ? Response.json(row) : err("not found", 404);
    }
    m = p.match(/^\/api\/orders\/([0-9a-f-]{36})\/ship$/);
    if (m && req.method === "POST") {
      const [row] = await sql`UPDATE orders SET status='shipped', updated_at=now() WHERE id=${m[1]} AND status='paid' RETURNING *`;
      return row ? Response.json(row) : err("order not found or not in paid state", 409);
    }
    return err("not found", 404);
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
console.log("orders up");
