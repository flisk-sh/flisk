// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The Night City migrator: a one-shot job. Flisk starts it after the database is ready and starts the API only once it exited 0.
import { configFromEnv, withDb } from "../lib/pg.mjs";

const MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE gigs (
        id serial PRIMARY KEY,
        title text NOT NULL,
        status text NOT NULL DEFAULT 'open',
        result text,
        created_at timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz
      );
      CREATE TABLE jobs (
        id serial PRIMARY KEY,
        gig_id integer NOT NULL REFERENCES gigs (id),
        seq integer NOT NULL,
        text text NOT NULL,
        kind text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        worker text,
        attempts integer NOT NULL DEFAULT 0,
        claimed_at timestamptz,
        result text,
        finished_at timestamptz
      );
      CREATE TABLE job_claims (
        job_id integer NOT NULL REFERENCES jobs (id),
        attempt integer NOT NULL,
        worker text NOT NULL,
        claimed_at timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz,
        PRIMARY KEY (job_id, attempt)
      );`,
  },
];

await withDb(
  configFromEnv(),
  async (query) => {
    await query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const applied = new Set((await query("SELECT version FROM schema_migrations")).map((row) => Number(row.version)));
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      await query(
        `BEGIN; ${migration.sql}; INSERT INTO schema_migrations (version) VALUES (${migration.version}); COMMIT;`,
      );
      console.log(`applied migration ${migration.version}`);
    }
    console.log("migrations are up to date");
  },
  { waitMs: 60_000 },
);
