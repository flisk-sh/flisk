import { SQL } from "bun";
import { readdirSync } from "node:fs";
const sql = new SQL(process.env.DATABASE_URL!.split("?")[0]);
await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
const done = new Set((await sql`SELECT name FROM schema_migrations`).map((r: any) => r.name));
for (const f of readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(f)) continue;
  console.log("applying", f);
  const text = await Bun.file(`migrations/${f}`).text();
  await sql.begin(async (tx) => {
    await tx.unsafe(text);
    await tx`INSERT INTO schema_migrations (name) VALUES (${f})`;
  });
}
console.log("migrations complete");
process.exit(0);
