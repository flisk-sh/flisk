// Flisk does not create the database for a bring-your-own job and TypeORM does not either, so create it if missing.
const { Client } = require('pg');

(async () => {
  const url = new URL(process.env.DATABASE_URL.split('?')[0]);
  const db = decodeURIComponent(url.pathname.slice(1));
  url.pathname = '/postgres';
  const client = new Client({ connectionString: url.toString() });
  for (let i = 0; ; i++) {
    try { await client.connect(); break; } catch (e) { if (i > 60) throw e; await new Promise((r) => setTimeout(r, 1000)); }
  }
  const { rowCount } = await client.query('select 1 from pg_database where datname = $1', [db]);
  if (!rowCount) await client.query(`create database "${db.replace(/"/g, '""')}"`);
  await client.end();
})().catch((e) => { console.error(e); process.exit(1); });
