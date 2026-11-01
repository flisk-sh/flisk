// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { freePort } from "../../test-support/index.js";
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
    const port = await freePort();
    const workerPort = await freePort();
    const env = { ...process.env, PORT: String(port) };
    const coordinator = spawn("node", [join(dir, "coordinator/server.mjs")], { env });
    const worker = spawn("node", [join(dir, "worker/server.mjs")], {
      env: {
        ...env,
        PORT: String(workerPort),
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
      if (!created) throw new Error("the coordinator never answered");
      expect(created.status).toBe(201);
      expect(((await created.json()) as { subtasks: unknown[] }).subtasks).toHaveLength(3);
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

  describe("recovery", () => {
    type Subtask = { status: string; attempts: number; error: string | null };
    type Goal = { status: string; subtasks: Subtask[] };
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    async function startSwarm(env: Record<string, string>) {
      const dir = mkdtempSync(join(tmpdir(), "swarm-"));
      dirs.push(dir);
      writeSwarmProject(dir);
      const port = await freePort();
      const workerPort = await freePort();
      const base = `http://localhost:${port}`;
      const procs = [
        spawn("node", [join(dir, "coordinator/server.mjs")], {
          env: { ...process.env, PORT: String(port), ...env },
        }),
      ];
      const post = async (path: string, body: unknown) =>
        (await fetch(`${base}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }).then((r) => r.json())) as Record<string, unknown>;
      for (let i = 0; i < 50; i++) {
        try {
          await fetch(`${base}/health`);
          break;
        } catch {
          await sleep(100);
        }
      }
      const startWorker = (extra: Record<string, string> = {}) =>
        procs.push(
          spawn("node", [join(dir, "worker/server.mjs")], {
            env: {
              ...process.env,
              PORT: String(workerPort),
              WORKER_NAME: "w",
              COORDINATOR_URL: base,
              ...extra,
            },
          }),
        );
      const waitForGoal = async (until: (goal: Goal) => boolean) => {
        let goal: Goal | undefined;
        for (let i = 0; i < 100 && !(goal && until(goal)); i++) {
          await sleep(200);
          goal = ((await (await fetch(`${base}/goals`)).json()) as { goals: Goal[] }).goals[0];
        }
        return goal;
      };
      return {
        post,
        startWorker,
        waitForGoal,
        stop: () => {
          for (const proc of procs) proc.kill();
        },
      };
    }

    it("requeues the subtask of a worker that died mid-task, and another worker finishes it", async () => {
      const swarm = await startSwarm({ CLAIM_MS: "2500" });
      try {
        await swarm.post("/goals", { goal: "one. two" });
        // A worker claims a subtask and dies: it never completes or reports.
        const { task } = (await swarm.post("/claim", { worker: "dead" })) as {
          task: { id: string };
        };
        expect(task).toBeTruthy();
        swarm.startWorker();
        const goal = await swarm.waitForGoal((g) => g.status === "done");
        expect(goal?.status).toBe("done");
        expect(goal?.subtasks.map((s) => s.attempts).sort()).toEqual([1, 2]);
        expect(goal?.subtasks.find((s) => s.attempts === 2)?.error).toMatch(/dead did not finish/);
        // The dead worker coming back late cannot overwrite the retry's answer.
        expect(await swarm.post("/complete", { id: task.id, result: "late" })).toEqual({
          error: "claim expired",
        });
      } finally {
        swarm.stop();
      }
    }, 30_000);

    it("retries a failing subtask up to MAX_ATTEMPTS, then marks it and its goal failed", async () => {
      const swarm = await startSwarm({ MAX_ATTEMPTS: "2" });
      try {
        await swarm.post("/goals", { goal: "only part" });
        swarm.startWorker({ FAIL_RATE: "1" });
        const goal = await swarm.waitForGoal((g) => g.status === "failed");
        expect(goal?.status).toBe("failed");
        expect(goal?.subtasks[0]).toMatchObject({
          status: "failed",
          attempts: 2,
          error: "w failed on purpose",
        });
      } finally {
        swarm.stop();
      }
    }, 30_000);
  });
});
