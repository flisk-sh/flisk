// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { swarmManifests, writeSwarmProject } from "../swarm-template.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("swarm template", () => {
  it("declares local processes that wait for the coordinator", () => {
    const manifests = swarmManifests();
    expect(Object.keys(manifests)).toEqual([
      "coordinator/service.json",
      "worker-1/service.json",
      "worker-2/service.json",
      "worker-3/service.json",
    ]);
    for (const manifest of Object.values(manifests)) expect(manifest.command).toBeTruthy();
    expect(manifests["worker-2/service.json"]?.dependsOn).toEqual(["coordinator"]);
    const ports = Object.values(manifests).map((m) => m.port);
    expect(new Set(ports).size).toBe(ports.length);
  });

  it("writes the project to disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-"));
    dirs.push(dir);
    writeSwarmProject(dir);
    for (const file of [
      "README.md",
      "coordinator/server.mjs",
      "worker/server.mjs",
      "worker-3/service.json",
    ]) {
      expect(existsSync(join(dir, file))).toBe(true);
    }
    expect(JSON.parse(readFileSync(join(dir, "coordinator/service.json"), "utf-8")).port).toBe(
      4100,
    );
  });

  it("finishes a goal: the coordinator splits it and a worker completes every part", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-"));
    dirs.push(dir);
    writeSwarmProject(dir);
    const port = 4300 + Math.floor(Math.random() * 400);
    const env = { ...process.env, PORT: String(port) };
    const coordinator = spawn("node", [join(dir, "coordinator/server.mjs")], { env });
    const worker = spawn("node", [join(dir, "worker/server.mjs")], {
      env: {
        ...env,
        PORT: String(port + 1000),
        WORKER_NAME: "w",
        COORDINATOR_URL: `http://localhost:${port}`,
      },
    });
    try {
      const base = `http://localhost:${port}`;
      let created: Response | undefined;
      for (let i = 0; i < 50 && !created; i++) {
        try {
          created = await fetch(`${base}/goals`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ goal: "read docs. summarize and list risks" }),
          });
        } catch {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      expect(created?.status).toBe(201);
      expect(((await created?.json()) as { subtasks: unknown[] }).subtasks).toHaveLength(3);
      let status = "";
      for (let i = 0; i < 100 && status !== "done"; i++) {
        await new Promise((r) => setTimeout(r, 200));
        const { goals } = (await (await fetch(`${base}/goals`)).json()) as {
          goals: { status: string }[];
        };
        status = goals[0]?.status ?? "";
      }
      expect(status).toBe("done");
    } finally {
      coordinator.kill();
      worker.kill();
    }
  }, 30_000);
});
