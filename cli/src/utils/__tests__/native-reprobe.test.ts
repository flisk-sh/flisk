// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTempDir, makeResource } from "../../test-support/index.js";
import {
  localUrl,
  NativeSupervisor,
  nativeServiceStates,
  planNativeRun,
  readNativeRunState,
} from "../native-runtime.js";

const NODE = JSON.stringify(process.execPath);

/**
 * A real local process that answers /health, then stops answering for 300ms when the `hang` file appears. It stays alive the
 * whole time: a stubbed version of the SIGSTOP repro in #4692, without needing a POSIX-only signal in the test suite.
 */
const SERVER = `
import { createServer } from "node:http";
import { existsSync, rmSync } from "node:fs";
const port = Number(process.env.PORT);
let server;
let downUntil = 0;
const start = () => {
  if (server) return;
  const candidate = createServer((req, res) => {
    res.writeHead(req.url === "/health" ? 200 : 404);
    res.end("ok");
  });
  candidate.once("error", () => {});
  candidate.listen(port, () => { server = candidate; });
};
start();
setInterval(() => {
  if (existsSync("hang")) {
    rmSync("hang");
    downUntil = Date.now() + 300;
    if (server) {
      server.closeAllConnections?.();
      server.close();
      server = undefined;
    }
  }
  if (!server && Date.now() >= downUntil) start();
}, 20);
`;

function nativeService(dir: string, name: string, config: Record<string, unknown>) {
  return {
    ...makeResource(name, "bring-your-own", config),
    path: dir,
    configPath: join(dir, "service.json"),
  };
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as { port: number };
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

function waitFor(condition: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (condition()) resolve();
      else if (Date.now() > deadline) reject(new Error("condition not met in time"));
      else setTimeout(poll, 25);
    };
    poll();
  });
}

const supervisors: NativeSupervisor[] = [];
afterEach(async () => {
  await Promise.all(supervisors.splice(0).map((supervisor) => supervisor.stop()));
});

// SIGSTOP is POSIX-only; Windows runs the stubbed "server stops answering" test above instead.
const itPosix = process.platform === "win32" ? it.skip : it;

describe("native ready-service re-probe (#4692)", () => {
  it("reports unhealthy after consecutive failures and ready again after one success", async () => {
    const root = createTempDir();
    const port = await freePort();
    writeFileSync(join(root, "server.mjs"), SERVER);
    const plan = planNativeRun(
      [
        nativeService(root, "api", {
          command: `${NODE} server.mjs`,
          port,
          healthCheckPath: "/health",
          healthCheck: { interval: 0.05, retries: 3 },
        }),
      ],
      {},
      root,
    );
    expect(plan.services[0]?.reprobe).toEqual({
      intervalMs: 50,
      retries: 3,
      onFailure: "report",
    });
    const notes: string[] = [];
    const supervisor = new NativeSupervisor(root, plan.services, {
      onNote: (name, message) => notes.push(`${name}: ${message}`),
    });
    supervisors.push(supervisor);
    expect(await supervisor.start()).toEqual([]);
    expect(nativeServiceStates(root, ["api"]).api.status).toBe("ready");

    writeFileSync(join(root, "hang"), "");
    await waitFor(() => nativeServiceStates(root, ["api"]).api.status === "unhealthy");
    const reason = nativeServiceStates(root, ["api"]).api.reason;
    expect(reason).toContain("GET /health failed 3 consecutive probes");
    expect(readNativeRunState(root)?.services.api?.unhealthy).toBe(reason);
    expect(notes).toContain(`api: unhealthy: ${reason}`);

    await waitFor(() => nativeServiceStates(root, ["api"]).api.status === "ready");
    expect(nativeServiceStates(root, ["api"]).api.reason).toBeUndefined();
    expect(readNativeRunState(root)?.services.api?.unhealthy).toBeUndefined();
    expect(notes).toContain("api: ready again");
  }, 20_000);

  it("restarts an unhealthy service with onFailure: restart", async () => {
    const root = createTempDir();
    const port = await freePort();
    writeFileSync(join(root, "server.mjs"), SERVER);
    const plan = planNativeRun(
      [
        nativeService(root, "api", {
          command: `${NODE} server.mjs`,
          port,
          healthCheckPath: "/health",
          healthCheck: { interval: 0.05, retries: 2, onFailure: "restart" },
        }),
      ],
      {},
      root,
    );
    expect(plan.services[0]?.reprobe?.onFailure).toBe("restart");
    const notes: string[] = [];
    const supervisor = new NativeSupervisor(
      root,
      plan.services,
      { onNote: (name, message) => notes.push(`${name}: ${message}`) },
      { restartDelayMs: 50 },
    );
    supervisors.push(supervisor);
    expect(await supervisor.start()).toEqual([]);
    const firstPid = supervisor.pidOf("api");

    writeFileSync(join(root, "hang"), "");
    await waitFor(() => supervisor.pidOf("api") !== firstPid);
    expect(notes.some((note) => note.startsWith("api: unhealthy: "))).toBe(true);
    expect(notes.some((note) => note.includes("restarting in 0.05s"))).toBe(true);
    await waitFor(() => nativeServiceStates(root, ["api"]).api.status === "ready");
    expect((await fetch(localUrl(port, "/health"))).status).toBe(200);
  }, 20_000);

  it("never re-probes a service with healthCheck: false", async () => {
    const root = createTempDir();
    const port = await freePort();
    writeFileSync(join(root, "server.mjs"), SERVER);
    const plan = planNativeRun(
      [
        nativeService(root, "api", {
          command: `${NODE} server.mjs`,
          port,
          healthCheck: false,
        }),
      ],
      {},
      root,
    );
    expect(plan.services[0]?.healthCheckDisabled).toBe(true);
    expect(plan.services[0]?.reprobe).toBeUndefined();
    const notes: string[] = [];
    const supervisor = new NativeSupervisor(root, plan.services, {
      onNote: (name, message) => notes.push(`${name}: ${message}`),
    });
    supervisors.push(supervisor);
    expect(await supervisor.start()).toEqual([]);
    expect(nativeServiceStates(root, ["api"]).api.status).toBe("ready");

    writeFileSync(join(root, "hang"), "");
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(nativeServiceStates(root, ["api"]).api).toEqual({ status: "ready" });
    expect(notes.some((note) => note.includes("unhealthy"))).toBe(false);
    expect(existsSync(join(root, "hang"))).toBe(false);
  }, 20_000);

  itPosix(
    "reports a real SIGSTOPped process as unhealthy, then ready after SIGCONT",
    async () => {
      const root = createTempDir();
      const port = await freePort();
      writeFileSync(join(root, "server.mjs"), SERVER);
      const plan = planNativeRun(
        [
          nativeService(root, "api", {
            command: `${NODE} server.mjs`,
            port,
            healthCheckPath: "/health",
            healthCheck: { interval: 0.05, retries: 3 },
          }),
        ],
        {},
        root,
      );
      const supervisor = new NativeSupervisor(root, plan.services);
      supervisors.push(supervisor);
      expect(await supervisor.start()).toEqual([]);
      expect(nativeServiceStates(root, ["api"]).api.status).toBe("ready");
      const pid = supervisor.pidOf("api");
      expect(pid).toBeDefined();

      try {
        process.kill(pid as number, "SIGSTOP");
        await waitFor(() => nativeServiceStates(root, ["api"]).api.status === "unhealthy", 12_000);
        expect(nativeServiceStates(root, ["api"]).api.reason).toContain(
          "GET /health failed 3 consecutive probes",
        );
      } finally {
        // Let the afterEach stop the process group even if an assertion above failed.
        try {
          process.kill(pid as number, "SIGCONT");
        } catch {
          // It may already have exited.
        }
      }
      await waitFor(() => nativeServiceStates(root, ["api"]).api.status === "ready", 10_000);
    },
    30_000,
  );
});
