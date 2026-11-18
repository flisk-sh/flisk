// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The LangGraph starter's side-effect helpers (cli/templates/langgraph/agent/effects.mjs), run for real: they use only Node, so
// they are tested here without installing LangGraph. The graph around them is tested live in tests/e2e/journeys/agent-templates L6.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

interface Store {
  get(key: string): Promise<Record<string, unknown> | null>;
  set(key: string, result: Record<string, unknown>): Promise<void>;
}
interface Effects {
  once(
    store: Store,
    key: string,
    effect: (key: string) => unknown,
  ): Promise<Record<string, unknown>>;
  deliver(
    file: string,
    key: string,
    payload: unknown,
  ): { delivered: boolean; key: string; at: string; duplicate?: boolean };
  FileEffects: new (file: string) => Store;
  PostgresEffects: new (pool: {
    query: (sql: string, params?: unknown[]) => Promise<unknown>;
  }) => Store & {
    setup(): Promise<void>;
  };
}

const effectsFile = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../templates/langgraph/agent/effects.mjs",
);
const load = (): Promise<Effects> => import(pathToFileURL(effectsFile).href);

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const tmp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "lg-effects-"));
  dirs.push(dir);
  return dir;
};
const lines = (file: string): string[] => readFileSync(file, "utf-8").split("\n").filter(Boolean);

describe("once", () => {
  it("runs the effect the first time and returns the saved result, flagged replayed, after that", async () => {
    const { once, FileEffects } = await load();
    const store = new FileEffects(join(tmp(), "effects.json"));
    let calls = 0;
    const effect = (key: string) => ({ delivered: true, key, calls: ++calls });
    const first = await once(store, "run-1:send", effect);
    const second = await once(store, "run-1:send", effect);
    expect(calls).toBe(1);
    expect(first).toEqual({ delivered: true, key: "run-1:send", calls: 1 });
    expect(second).toEqual({ delivered: true, key: "run-1:send", calls: 1, replayed: true });
  });

  it("keeps one result per key", async () => {
    const { once, FileEffects } = await load();
    const store = new FileEffects(join(tmp(), "effects.json"));
    let calls = 0;
    await once(store, "run-1:send", () => ({ n: ++calls }));
    await once(store, "run-2:send", () => ({ n: ++calls }));
    expect(calls).toBe(2);
  });

  it("does not save a result when the effect throws, so the next attempt runs it again", async () => {
    const { once, FileEffects } = await load();
    const store = new FileEffects(join(tmp(), "effects.json"));
    await expect(
      once(store, "run-1:send", () => {
        throw new Error("the mail API is down");
      }),
    ).rejects.toThrow("the mail API is down");
    expect(await store.get("run-1:send")).toBeNull();
    expect((await once(store, "run-1:send", () => ({ ok: true }))).ok).toBe(true);
  });
});

describe("a crash between the effect and its saved result", () => {
  it("delivers once, because the receiver recognises the key", async () => {
    const { once, deliver, FileEffects } = await load();
    const dir = tmp();
    const outbox = join(dir, "outbox.jsonl");
    // First attempt: the effect reaches the outbox, then the agent dies before store.set runs.
    deliver(outbox, "run-1:send", { answer: "hello" });
    expect(lines(outbox)).toHaveLength(1);
    // The restarted agent finds no record, so it runs the effect again with the same key.
    const store = new FileEffects(join(dir, "effects.json"));
    const again = await once(store, "run-1:send", (key) =>
      deliver(outbox, key, { answer: "hello" }),
    );
    expect(lines(outbox)).toHaveLength(1);
    expect(again).toMatchObject({ delivered: true, key: "run-1:send", duplicate: true });
  });
});

describe("deliver", () => {
  it("appends one JSON line per key and answers a repeated key with the first delivery", async () => {
    const { deliver } = await load();
    const outbox = join(tmp(), "nested", "outbox.jsonl");
    const first = deliver(outbox, "a", { answer: "one" });
    const other = deliver(outbox, "b", { answer: "two" });
    const repeat = deliver(outbox, "a", { answer: "changed" });
    expect(lines(outbox).map((line) => JSON.parse(line).key)).toEqual(["a", "b"]);
    expect(JSON.parse(lines(outbox)[0] as string).payload).toEqual({ answer: "one" });
    expect(first.duplicate).toBeUndefined();
    expect(other.duplicate).toBeUndefined();
    expect(repeat).toEqual({ delivered: true, key: "a", at: first.at, duplicate: true });
  });
});

describe("FileEffects", () => {
  it("keeps its records across a restart, and starts empty when the file is missing or damaged", async () => {
    const { FileEffects } = await load();
    const file = join(tmp(), "effects.json");
    expect(await new FileEffects(file).get("k")).toBeNull();
    await new FileEffects(file).set("k", { ok: true });
    expect(await new FileEffects(file).get("k")).toEqual({ ok: true });
    writeFileSync(file, "{ not json");
    expect(await new FileEffects(file).get("k")).toBeNull();
  });
});

describe("PostgresEffects", () => {
  it("creates its table, reads a key and writes it once with ON CONFLICT DO NOTHING", async () => {
    const { PostgresEffects } = await load();
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const pool = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return { rows: sql.startsWith("SELECT") ? [{ result: { delivered: true } }] : [] };
      },
    };
    const store = new PostgresEffects(pool);
    await store.setup();
    expect(await store.get("run-1:send")).toEqual({ delivered: true });
    await store.set("run-1:send", { delivered: true });
    expect(calls[0]?.sql).toContain("CREATE TABLE IF NOT EXISTS agent_effects");
    expect(calls[1]).toEqual({
      sql: "SELECT result FROM agent_effects WHERE key = $1",
      params: ["run-1:send"],
    });
    expect(calls[2]?.sql).toContain("ON CONFLICT (key) DO NOTHING");
    expect(calls[2]?.params).toEqual(["run-1:send", JSON.stringify({ delivered: true })]);
  });

  it("reads a missing key as null", async () => {
    const { PostgresEffects } = await load();
    const store = new PostgresEffects({ query: async () => ({ rows: [] }) });
    expect(await store.get("nothing")).toBeNull();
  });
});
