import { join } from "node:path";
const root = join(import.meta.dir, "..", "public");
const base = process.env.BASE_PATH ?? "";
Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  async fetch(req) {
    const p = new URL(req.url).pathname;
    if (p === "/health") return Response.json({ ok: true });
    const rel = p.startsWith(base) ? p.slice(base.length) : p;
    const f = Bun.file(join(root, rel === "" || rel === "/" ? "index.html" : rel));
    if (rel.includes("..") || !(await f.exists())) return new Response("not found", { status: 404 });
    return new Response(f, { headers: { "cache-control": "no-store" } });
  },
});
console.log("web up");
