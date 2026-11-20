// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Idempotent side effects. A run that is resumed (after an approval, or after a crash) starts its current node over, so a
// node that pays or sends would do it twice. Every effect gets a key that is the same on every attempt (the run's id and the
// step), and two things keep it to one:
//   1. the effect store: the key is looked up before the effect runs and the result is saved after it, next to the checkpoints
//      (a JSON file, or a Postgres table when DATABASE_URL is set);
//   2. the receiver: the key travels with the call (as an Idempotency-Key header would), because a crash between the effect
//      and the save leaves no record, and the retry must be recognised on the other side. `deliver` below does that for the
//      outbox, which stands in for the mail or payment API.
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Runs `effect(key)` once per key: a key that already has a saved result returns it, flagged `replayed`, and runs nothing. */
export async function once(store, key, effect) {
  const done = await store.get(key);
  if (done) return { ...done, replayed: true };
  const result = await effect(key);
  await store.set(key, result);
  return result;
}

/** key -> result, in a JSON file written through a temporary file, so a crash mid-write never leaves half a file. */
export class FileEffects {
  constructor(file) {
    this.file = file;
    try {
      this.saved = JSON.parse(readFileSync(file, "utf-8"));
    } catch {
      this.saved = {};
    }
  }

  async get(key) {
    return this.saved[key] ?? null;
  }

  async set(key, result) {
    this.saved[key] = result;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.saved));
    renameSync(`${this.file}.tmp`, this.file);
  }
}

/** key -> result, in the agent_effects table of the database the Postgres checkpointer uses. `pool` is a `pg` Pool. */
export class PostgresEffects {
  constructor(pool) {
    this.pool = pool;
  }

  async setup() {
    await this.pool.query(
      "CREATE TABLE IF NOT EXISTS agent_effects (key text PRIMARY KEY, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())",
    );
  }

  async get(key) {
    const { rows } = await this.pool.query("SELECT result FROM agent_effects WHERE key = $1", [
      key,
    ]);
    return rows[0]?.result ?? null;
  }

  async set(key, result) {
    await this.pool.query(
      "INSERT INTO agent_effects (key, result) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING",
      [key, JSON.stringify(result)],
    );
  }
}

/**
 * Reads the outbox. A missing file is an empty outbox. A last line that is not valid JSON is a write a crash cut short: it is
 * dropped from the file (so the next record does not glue onto it) and every complete record before it is kept, because those
 * keys are what stops a retry from delivering twice. A bad line anywhere else means the file was damaged some other way, and
 * delivering on top of it could repeat a delivery, so it throws.
 */
function readOutbox(file) {
  let text;
  try {
    text = readFileSync(file, "utf-8");
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const rows = text.split("\n").filter(Boolean);
  const records = [];
  for (const [index, row] of rows.entries()) {
    try {
      records.push(JSON.parse(row));
    } catch {
      if (index !== rows.length - 1)
        throw new Error(`the outbox ${file} has a damaged line ${index + 1}`);
      writeFileSync(file, records.map((record) => `${JSON.stringify(record)}\n`).join(""));
    }
  }
  return records;
}

/**
 * The receiver of the side effect: one JSON line per delivery in the outbox file. It remembers the keys it has seen, so a
 * second call with the same key delivers nothing and answers with the first delivery, the way a payment API treats an
 * Idempotency-Key. Replace the body with your own call and pass `key` along with it.
 */
export function deliver(file, key, payload) {
  const lines = readOutbox(file);
  const first = lines.find((line) => line.key === key);
  if (first) return { delivered: true, key, at: first.at, duplicate: true };
  const at = new Date().toISOString();
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify({ key, at, payload })}\n`);
  return { delivered: true, key, at };
}
