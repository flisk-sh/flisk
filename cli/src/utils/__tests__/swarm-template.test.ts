// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { type ChildProcess, spawn } from "node:child_process";
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
    const coordinator = spawn("node", ["server.mjs"], { cwd: join(dir, "coordinator"), env });
    const worker = spawn("node", ["server.mjs"], {
      cwd: join(dir, "worker"),
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
      const procs: ChildProcess[] = [];
      // From the service folder, as flisk up runs it: the state file lands in coordinator/.data.
      const startCoordinator = () => {
        const proc = spawn("node", ["server.mjs"], {
          cwd: join(dir, "coordinator"),
          env: { ...process.env, PORT: String(port), ...env },
        });
        procs.push(proc);
        return proc;
      };
      let coordinator = startCoordinator();
      const healthy = async () => {
        for (let i = 0; i < 50; i++) {
          try {
            await fetch(`${base}/health`);
            return;
          } catch {
            await sleep(100);
          }
        }
        throw new Error("the coordinator never answered");
      };
      const post = async (path: string, body: unknown) =>
        (await fetch(`${base}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }).then((r) => r.json())) as Record<string, unknown>;
      await healthy();
      const startWorker = (extra: Record<string, string> = {}) =>
        procs.push(
          spawn("node", ["server.mjs"], {
            cwd: join(dir, "worker"),
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
      /** kill -9 the coordinator, then start it again on the same port, as the flisk up supervisor does. */
      const crashCoordinator = async () => {
        const gone = new Promise((r) => coordinator.once("exit", r));
        coordinator.kill("SIGKILL");
        await gone;
        coordinator = startCoordinator();
        await healthy();
      };
      return {
        dir,
        post,
        crashCoordinator,
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
          task: { id: string; attempt: number };
        };
        expect(task).toBeTruthy();
        swarm.startWorker();
        const goal = await swarm.waitForGoal((g) => g.status === "done");
        expect(goal?.status).toBe("done");
        expect(goal?.subtasks.map((s) => s.attempts).sort()).toEqual([1, 2]);
        expect(goal?.subtasks.find((s) => s.attempts === 2)?.error).toMatch(/dead did not finish/);
        // The dead worker coming back late cannot overwrite the retry's answer.
        expect(
          await swarm.post("/complete", { id: task.id, attempt: task.attempt, result: "late" }),
        ).toEqual({
          error: "claim expired",
        });
      } finally {
        swarm.stop();
      }
    }, 30_000);

    it("drops a stale answer from an expired claim while another worker holds the subtask", async () => {
      const swarm = await startSwarm({ CLAIM_MS: "300" });
      try {
        await swarm.post("/goals", { goal: "only part" });
        const first = (await swarm.post("/claim", { worker: "slow" })) as {
          task: { id: string; attempt: number };
        };
        let second: { task: { id: string; attempt: number } | null } = { task: null };
        for (let i = 0; i < 30 && !second.task; i++) {
          await sleep(100);
          second = (await swarm.post("/claim", { worker: "fresh" })) as typeof second;
        }
        expect(second.task).toMatchObject({ id: first.task.id, attempt: 2 });
        // The slow worker answers now, while the subtask is claimed again: that answer must not count.
        expect(
          await swarm.post("/complete", {
            id: first.task.id,
            attempt: first.task.attempt,
            result: "stale",
          }),
        ).toEqual({ error: "claim expired" });
        expect(
          await swarm.post("/complete", { id: first.task.id, attempt: 2, result: "fresh" }),
        ).toEqual({ ok: true });
        const goal = (await swarm.waitForGoal((g) => g.status === "done")) as Goal & {
          subtasks: { result: string }[];
        };
        expect(goal.subtasks[0]?.result).toBe("fresh");
      } finally {
        swarm.stop();
      }
    }, 30_000);

    it("keeps its goals across a kill -9 and restart, and the workers finish them", async () => {
      const swarm = await startSwarm({ CLAIM_MS: "2500" });
      try {
        await swarm.post("/goals", { goal: "one. two. three" });
        await swarm.post("/claim", { worker: "dies-with-coordinator" });
        await swarm.crashCoordinator();
        const after = await swarm.waitForGoal(() => true);
        expect(after?.subtasks).toHaveLength(3);
        expect(existsSync(join(swarm.dir, "coordinator/.data/swarm-state.json"))).toBe(true);
        swarm.startWorker();
        const goal = await swarm.waitForGoal((g) => g.status === "done");
        expect(goal?.status).toBe("done");
        // The claim held when the coordinator died kept its deadline, expired and was retried.
        expect(goal?.subtasks.some((s) => s.attempts === 2)).toBe(true);
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
