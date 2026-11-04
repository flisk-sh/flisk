// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// LangGraph's MemorySaver, written to a JSON file after every checkpoint, so a run survives a crash and resumes where it
// stopped. No native module: the SQLite checkpointer needs better-sqlite3, which has to compile on install. For production,
// use @langchain/langgraph-checkpoint-postgres or -sqlite instead.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { MemorySaver } from "@langchain/langgraph";

// MemorySaver keeps serialized checkpoints as Uint8Array; JSON keeps them as { $bytes: base64 }.
const encode = (value) =>
  convert(value, (v) =>
    v instanceof Uint8Array ? { $bytes: Buffer.from(v).toString("base64") } : v,
  );
const decode = (value) =>
  convert(value, (v) =>
    v && typeof v === "object" && "$bytes" in v
      ? new Uint8Array(Buffer.from(v.$bytes, "base64"))
      : v,
  );

function convert(value, leaf) {
  const done = leaf(value);
  if (done !== value || value === null || typeof value !== "object") return done;
  if (Array.isArray(value)) return value.map((item) => convert(item, leaf));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, convert(item, leaf)]));
}

export class FileSaver extends MemorySaver {
  constructor(file) {
    super();
    this.file = file;
    try {
      const saved = JSON.parse(readFileSync(file, "utf-8"));
      this.storage = decode(saved.storage);
      this.writes = decode(saved.writes);
    } catch {
      // first start: nothing saved yet
    }
  }

  /** Writes a temporary file and renames it over the old one, so a crash mid-write never leaves half a file. */
  flush() {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(
      `${this.file}.tmp`,
      JSON.stringify({ storage: encode(this.storage), writes: encode(this.writes) }),
    );
    renameSync(`${this.file}.tmp`, this.file);
  }

  async put(...args) {
    const config = await super.put(...args);
    this.flush();
    return config;
  }

  async putWrites(...args) {
    await super.putWrites(...args);
    this.flush();
  }

  async deleteThread(threadId) {
    await super.deleteThread(threadId);
    this.flush();
  }
}
