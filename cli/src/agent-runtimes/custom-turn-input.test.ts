// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getCustomAgentIndexTemplate } from "./custom.js";

// Runs the generated files-durability index with Bun and checks how POST /turn treats the body's field name (#3829).
const freePort = () =>
  new Promise<number>((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => resolvePort(typeof address === "object" && address ? address.port : 0));
    });
  });

describe("generated custom agent: POST /turn body", () => {
  const workDir = mkdtempSync(join(tmpdir(), "flisk-agent-input-"));
  const stateDir = join(workDir, "state");
  let child: ChildProcess | undefined;
  let base = "";

  beforeAll(async () => {
    const source = join(workDir, "index.ts");
    writeFileSync(source, getCustomAgentIndexTemplate("support-agent", "files"));
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    child = spawn("bun", ["run", source], {
      env: {
        ...process.env,
        PORT: String(port),
        AGENT_STATE_DIR: stateDir,
        AGENT_DURABILITY: "files",
      },
      stdio: "ignore",
    });
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`${base}/health`)).ok) return;
      } catch {
        // not listening yet
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("generated agent never became healthy");
  }, 20_000);

  afterAll(() => {
    child?.kill("SIGKILL");
    rmSync(workDir, { recursive: true, force: true });
  });

  const turn = (body: unknown, sessionId: string) =>
    fetch(`${base}/turn`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-session-id": sessionId },
      body: JSON.stringify(body),
    });

  const checkpoints = () => {
    try {
      return readdirSync(stateDir).filter((file) => file.endsWith(".json"));
    } catch {
      return [];
    }
  };

  it.each([[{ message: "hello" }], [{ prompt: "hello" }], [{ input: "" }], [{ input: 42 }], [{}]])(
    "answers 400 input_required for %j and writes no checkpoint",
    async (body) => {
      const response = await turn(body, "no-input");
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "input_required",
        hint: 'send {"input": "..."}',
      });
      expect(checkpoints()).toEqual([]);
    },
  );

  it("still runs a turn for a non-empty string input", async () => {
    const response = await turn({ input: "hi" }, "with-input");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      sessionId: "with-input",
      reply: "received hi (turn 1)",
      turns: 1,
    });
    expect(checkpoints()).toHaveLength(1);
  });

  // The generated agent caps /turn bodies at AGENT_MAX_TURN_BODY_BYTES (default
  // 1 MiB). These bodies are built to an exact byte length: {"input":" is 10
  // bytes and "} is 2, so the padding makes up the rest.
  const bodyOfSize = (bytes: number) => `{"input":"${"a".repeat(bytes - 12)}"}`;

  it("answers 413 payload_too_large for a body one byte over the limit and writes no checkpoint", async () => {
    const before = checkpoints();
    const body = bodyOfSize(1_048_577);
    expect(Buffer.byteLength(body)).toBe(1_048_577);
    const response = await fetch(`${base}/turn`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-session-id": "over-limit" },
      body,
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "payload_too_large" });
    expect(checkpoints()).toEqual(before);
  });

  it("still runs a turn for a body exactly at the limit", async () => {
    const body = bodyOfSize(1_048_576);
    expect(Buffer.byteLength(body)).toBe(1_048_576);
    const response = await fetch(`${base}/turn`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-session-id": "at-limit" },
      body,
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { turns: number };
    expect(data.turns).toBe(1);
    expect(checkpoints()).toContain("at-limit.json");
  });
});
