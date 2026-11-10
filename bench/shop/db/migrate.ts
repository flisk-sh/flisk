import { SQL } from "bun";
import { readdirSync } from "node:fs";
const sql = new SQL(process.env.DATABASE_URL!.split("?")[0]);
// Tools that start everything at once (Tilt) can run this before Postgres accepts connections: wait for it.
for (let i = 0; ; i++) {
  try {
    await sql`SELECT 1`;
    break;
  } catch (e) {
    if (i >= 60) throw e;
    await Bun.sleep(1000);
  }
}
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
