// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Drives the real `flisk mcp` stdio server against a temp multi-service native project (no Docker, no Tilt):
// healthy service -> broken config -> cause in the response -> repair -> READY -> restart -> dependants healthy -> down.
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), "../../../bin/flisk.js");
const freePort = () =>
  new Promise<number>((done) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as { port: number };
      s.close(() => done(port));
    });
  });
const SERVER = (guard = "") => `import {createServer} from "node:http";
${guard}
createServer((q,s)=>{s.end(q.url==="/health"?"ok":"hi")}).listen(Number(process.env.PORT));`;
const health = async (port: number) => {
  try {
    return (await fetch(`http://localhost:${port}/health`)).status;
  } catch {
    return "down";
  }
};

describe("MCP native lifecycle acceptance (real flisk mcp server)", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "flisk-mcp-accept-")));
  let child: ChildProcess | undefined;
  afterAll(() => {
    child?.kill();
    rmSync(root, { recursive: true, force: true });
  });

  it("starts, diagnoses, repairs, restarts and stops a native stack through MCP", async () => {
    const [pb, pa, pw] = [await freePort(), await freePort(), await freePort()];
    const svc = (name: string, body: string, manifest: Record<string, unknown>) => {
      mkdirSync(join(root, name), { recursive: true });
      writeFileSync(join(root, name, "server.mjs"), body);
      writeFileSync(
        join(root, name, "service.json"),
        JSON.stringify({
          schemaVersion: 1,
          appName: name,
          command: "node server.mjs",
          healthCheckPath: "/health",
          ...manifest,
        }),
      );
    };
    svc("base", SERVER(), { appType: "backend", port: pb });
    svc(
      "api",
      SERVER(
        `if(!process.env.API_TOKEN){console.error("FATAL: API_TOKEN is not set (config error)");process.exit(1)}`,
      ),
      { appType: "backend", port: pa, dependsOn: ["base"], env: { API_TOKEN: "${API_TOKEN}" } },
    );
    svc("web", SERVER(), { appType: "frontend", port: pw, dependsOn: ["api"] });
    mkdirSync(join(root, ".flisk"), { recursive: true });

    child = spawn(process.execPath, [CLI, "mcp"], { cwd: root, stdio: ["pipe", "pipe", "ignore"] });
    let buf = "";
    let id = 0;
    const waiting = new Map<number, (m: any) => void>();
    child.stdout?.on("data", (d) => {
      buf += d;
      for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        try {
          const m = JSON.parse(line);
          waiting.get(m.id)?.(m);
        } catch {}
      }
    });
    const rpc = (method: string, params: unknown) =>
      new Promise<any>((done) => {
        const n = ++id;
        waiting.set(n, done);
        child?.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id: n, method, params })}\n`);
      });
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const m = await rpc("tools/call", { name, arguments: { projectPath: root, ...args } });
      return { isError: m.result?.isError as boolean, env: JSON.parse(m.result.content[0].text) };
    };
    await rpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "t", version: "1" },
    });
    child.stdin?.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
    );

    // 1. a healthy service
    let r = await call("up", { only: ["base"], waitForReady: true, waitSeconds: 60 });
    expect(r.isError).toBe(false);
    expect(r.env.data).toMatchObject({ state: "ready", ready: true });
    expect(await health(pb)).toBe(200);

    // 2-3. a deliberate config error: the actual cause is in the response
    r = await call("up", { force: true, waitForReady: true, waitSeconds: 90 });
    expect(r.isError).toBe(true);
    expect(r.env.data).toMatchObject({ state: "failed", ready: false });
    expect(JSON.stringify(r.env)).toContain("API_TOKEN is not set");

    // 4-5. repair the config, READY
    writeFileSync(join(root, ".env"), "API_TOKEN=s3cr3t-token-value-9f8e\n");
    r = await call("up", { waitForReady: true, waitSeconds: 90 });
    expect(r.isError).toBe(false);
    expect(r.env.data).toMatchObject({ state: "ready", ready: true });
    expect([await health(pb), await health(pa), await health(pw)]).toEqual([200, 200, 200]);

    // 6-8. restart through MCP: READY again, dependants untouched
    r = await call("resource_restart", { resource: "api", waitSeconds: 60 });
    expect(r.isError).toBe(false);
    expect(r.env.data).toMatchObject({
      resource: "api",
      restarted: true,
      state: "ready",
      ready: true,
    });
    expect([await health(pb), await health(pa), await health(pw)]).toEqual([200, 200, 200]);

    // 9. clean shutdown
    r = await call("down");
    expect(r.isError).toBe(false);
    await new Promise((done) => setTimeout(done, 1500));
    expect([await health(pb), await health(pa), await health(pw)]).toEqual([
      "down",
      "down",
      "down",
    ]);
  }, 240_000);
});
