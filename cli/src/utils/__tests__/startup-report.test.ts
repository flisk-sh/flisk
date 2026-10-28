// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { parseTiltResourceFailures } from "../doctor-runtime.js";
import {
  buildStartupReport,
  formatStartupReport,
  isStartupStalled,
  machineProblemFix,
  machineProblemFixes,
  transitiveDependencies,
} from "../startup-report.js";

function item(name: string, update: string, runtime: string, extra: object = {}) {
  return { metadata: { name }, status: { updateStatus: update, runtimeStatus: runtime, ...extra } };
}
const json = (...items: object[]) => JSON.stringify({ items });
const failedBuild = (message: string) => ({ buildHistory: [{ error: message }] });
const unhealthy = { composeResourceInfo: { healthStatus: "unhealthy" } };

describe("buildStartupReport", () => {
  it("names the failed database and the api that is not ready because of it", () => {
    const report = buildStartupReport(
      json(
        item(
          "postgres",
          "error",
          "none",
          failedBuild("Bind for 0.0.0.0:5432 failed: port is already allocated"),
        ),
        item("api", "pending", "pending"),
        item("frontend", "ok", "ok"),
      ),
      { api: ["postgres"], frontend: ["api"] },
    );
    expect(report.failed).toEqual([
      { name: "postgres", message: "host port 5432 is already allocated" },
    ]);
    // frontend runs, but reaches postgres through api, so it is not ready either (as `flisk status` says).
    expect(report.blocked).toEqual([
      { name: "api", because: ["postgres"] },
      { name: "frontend", because: ["postgres"] },
    ]);
    expect(report.starting).toEqual([]);
  });

  it("blocks services that depend on the failure through another service", () => {
    const report = buildStartupReport(
      json(
        item("postgres", "error", "none"),
        item("api", "pending", "pending"),
        item("web", "pending", "pending"),
      ),
      { api: ["postgres"], web: ["api"] },
    );
    expect(report.blocked).toEqual([
      { name: "api", because: ["postgres"] },
      { name: "web", because: ["postgres"] },
    ]);
  });

  it("does not blame a failure for a service that does not depend on it", () => {
    const report = buildStartupReport(
      json(item("postgres", "error", "none"), item("worker", "pending", "pending")),
      { worker: [] },
    );
    expect(report.blocked).toEqual([]);
    expect(report.starting).toEqual(["worker"]);
  });

  it("lists every failed dependency, sorted", () => {
    const report = buildStartupReport(
      json(
        item("redis", "error", "none"),
        item("postgres", "error", "none"),
        item("api", "pending", "pending"),
      ),
      { api: ["redis", "postgres"] },
    );
    expect(report.blocked).toEqual([{ name: "api", because: ["postgres", "redis"] }]);
  });

  it("names an unhealthy database that Tilt calls running, and the running api that depends on it", () => {
    const report = buildStartupReport(
      json(
        item("postgres", "ok", "ok", unhealthy),
        item("api", "ok", "ok"),
        item("worker", "ok", "ok"),
      ),
      { api: ["postgres"] },
    );
    expect(report.failed).toEqual([
      { name: "postgres", message: "container is running, but its health check is failing" },
    ]);
    expect(report.blocked).toEqual([{ name: "api", because: ["postgres"] }]);
    expect(report.starting).toEqual([]);
  });

  it("keeps the build error when an update failed on a container that is also unhealthy", () => {
    const report = buildStartupReport(
      json(
        item("postgres", "error", "ok", {
          ...unhealthy,
          ...failedBuild("Bind for 0.0.0.0:5432 failed: port is already allocated"),
        }),
      ),
      {},
    );
    expect(report.failed).toEqual([
      { name: "postgres", message: "host port 5432 is already allocated" },
    ]);
  });

  it("keeps a database whose health check has not passed yet as starting", () => {
    const report = buildStartupReport(
      json(item("postgres", "ok", "ok", { composeResourceInfo: { healthStatus: "starting" } })),
      {},
    );
    expect(report).toEqual({ failed: [], blocked: [], starting: ["postgres"] });
  });

  it("falls back to the raw statuses when Tilt gave no error text", () => {
    const report = buildStartupReport(json(item("postgres", "ok", "error")), {});
    expect(report.failed).toEqual([{ name: "postgres", message: "ok/error" }]);
  });

  it("ignores deferred, disabled and Tiltfile entries", () => {
    const report = buildStartupReport(
      json(
        item("idle", "none", "none"),
        item("other-phase", "none", "none", { disableStatus: { state: "Disabled" } }),
        item("(Tiltfile)", "pending", "none"),
      ),
      {},
      new Set(["idle"]),
    );
    expect(report).toEqual({ failed: [], blocked: [], starting: [] });
  });

  it("counts exactly the resources parseTiltResourceFailures counts as pending", () => {
    const mixed = json(
      item("postgres", "error", "none"),
      item("a", "pending", "pending"),
      item("b", "ok", "pending"),
      item("c", "none", "none"),
      item("d", "ok", "ok"),
      item("e", "ok", "not_applicable"),
      item("(Tiltfile)", "pending", "none"),
    );
    const deps = { a: ["postgres"] };
    const report = buildStartupReport(mixed, deps);
    const parsed = parseTiltResourceFailures(mixed);
    expect(report.blocked.length + report.starting.length).toBe(parsed.pendingCount);
    expect(report.failed.length).toBe(parsed.failures.length);
  });

  it("reports nothing when Tilt returned no items", () => {
    expect(buildStartupReport("{}", {})).toEqual({ failed: [], blocked: [], starting: [] });
  });

  it("blames a failure for a service that reaches it through a dependency cycle", () => {
    const report = buildStartupReport(
      json(item("postgres", "error", "none"), item("api", "pending", "pending")),
      { api: ["postgres"], postgres: ["api"] },
    );
    expect(report.failed).toEqual([{ name: "postgres", message: "error/none" }]);
    expect(report.blocked).toEqual([{ name: "api", because: ["postgres"] }]);
    expect(report.starting).toEqual([]);
  });
});

describe("transitiveDependencies", () => {
  it("visits a dependency shared by two services once", () => {
    const closure = transitiveDependencies("web", {
      web: ["api", "worker"],
      api: ["postgres"],
      worker: ["postgres"],
    });
    expect([...closure].sort()).toEqual(["api", "postgres", "worker"]);
  });

  it("returns every node of a dependency cycle without recursing forever", () => {
    const closure = transitiveDependencies("api", { api: ["postgres"], postgres: ["api"] });
    expect(closure.has("postgres")).toBe(true);
    expect(closure.has("api")).toBe(true);
  });
});

describe("formatStartupReport", () => {
  it("prints the failed service, what it blocks and the way out", () => {
    const lines = formatStartupReport(
      {
        failed: [{ name: "postgres", message: "host port 5432 is already allocated" }],
        blocked: [{ name: "api", because: ["postgres"] }],
        starting: [],
      },
      false,
    );
    expect(lines).toEqual([
      "✗ postgres failed: host port 5432 is already allocated",
      "  Fix: stop the process using port 5432 (find it with: lsof -nP -iTCP:5432 -sTCP:LISTEN), or set FLISK_POSTGRES_PORT to a free port and run flisk up",
      "✗ api is not ready because postgres failed",
      "The environment is not ready: postgres failed, so 1 dependent service is not ready. Tilt is still running; inspect it or run: flisk down",
    ]);
  });

  it("names the process holding the port when it is known", () => {
    const lines = formatStartupReport(
      {
        failed: [{ name: "postgres", message: "host port 5432 is already allocated" }],
        blocked: [],
        starting: [],
      },
      false,
      () => ({ pid: 4321, command: "postgres" }),
    );
    expect(lines[1]).toBe(
      "  Fix: port 5432 is held by postgres (pid 4321). Stop it, or set FLISK_POSTGRES_PORT to a free port and run flisk up",
    );
  });

  it("looks up the occupant only for port conflicts", () => {
    const occupantOf = vi.fn(() => null);
    formatStartupReport(
      { failed: [{ name: "worker", message: "exited with 1" }], blocked: [], starting: [] },
      false,
      occupantOf,
    );
    expect(occupantOf).not.toHaveBeenCalled();
  });

  it("ends with how many dependent services each failure leaves not ready", () => {
    const lines = formatStartupReport(
      {
        failed: [
          { name: "postgres", message: "container is running, but its health check is failing" },
        ],
        blocked: [
          { name: "api", because: ["postgres"] },
          { name: "migrator", because: ["postgres"] },
          { name: "worker", because: ["postgres"] },
        ],
        starting: [],
      },
      false,
    );
    expect(lines.at(-1)).toBe(
      "The environment is not ready: postgres failed, so 3 dependent services are not ready. Tilt is still running; inspect it or run: flisk down",
    );
  });

  it("keeps the plain closing line when a failure blocks nothing", () => {
    const lines = formatStartupReport(
      { failed: [{ name: "worker", message: "exited with 1" }], blocked: [], starting: [] },
      false,
    );
    expect(lines.at(-1)).toBe(
      "The environment is not ready. Tilt is still running; inspect it or run: flisk down",
    );
  });

  it("says timed out for services that never finished", () => {
    const lines = formatStartupReport({ failed: [], blocked: [], starting: ["api", "web"] }, true);
    expect(lines[0]).toBe("Timed out waiting for api, web");
  });

  it("prints nothing when nothing is wrong", () => {
    expect(formatStartupReport({ failed: [], blocked: [], starting: [] }, false)).toEqual([]);
  });
});

describe("isStartupStalled", () => {
  const deps = { api: ["postgres"], web: ["api"] };

  it("is true when a failure blocks everything still pending", () => {
    const text = json(
      item("postgres", "error", "none"),
      item("api", "pending", "pending"),
      item("web", "pending", "pending"),
    );
    expect(isStartupStalled(text, deps)).toBe(true);
  });

  it("is true when an unhealthy database fails a running api that depends on it", () => {
    const text = json(item("postgres", "ok", "ok", unhealthy), item("api", "ok", "ok"));
    expect(isStartupStalled(text, deps)).toBe(true);
  });

  it("is false while something unrelated to the failure is still starting", () => {
    const text = json(item("postgres", "error", "none"), item("worker", "pending", "pending"));
    expect(isStartupStalled(text, deps)).toBe(false);
  });

  it("is false when nothing has failed", () => {
    expect(isStartupStalled(json(item("api", "pending", "pending")), deps)).toBe(false);
  });
});

describe("shared infrastructure that fails before any service starts", () => {
  // The shape Tilt reports for a resource held back by a failed resource_dep (checked with tilt 0.37: a local_resource
  // whose dependency exits 1 shows waiting.reason "waiting-for-dep" and waiting.on naming it).
  const waitingFor = (name: string) => ({
    waiting: {
      reason: "waiting-for-dep",
      on: [{ apiVersion: "v1alpha1", group: "tilt.dev", kind: "UIResource", name }],
    },
  });
  const poolExhausted =
    "Failed to create Docker network shop_infisical-network: Error response from daemon: all predefined address pools have been fully subnetted";
  const text = json(
    item("init-networks", "error", "not_applicable", failedBuild(poolExhausted)),
    item("postgres", "pending", "pending", waitingFor("init-networks")),
    item("traefik", "pending", "pending", waitingFor("init-networks")),
    item("api", "pending", "pending", waitingFor("postgres")),
  );

  it("counts what Tilt says a resource waits on as a dependency", () => {
    const report = buildStartupReport(text, { api: [] });
    expect(report.starting).toEqual([]);
    expect(report.blocked.map((b) => [b.name, b.because])).toEqual([
      ["postgres", ["init-networks"]],
      ["traefik", ["init-networks"]],
      ["api", ["init-networks"]],
    ]);
  });

  it("is stalled, so flisk up stops waiting instead of running into the timeout", () => {
    expect(isStartupStalled(text, { api: [] })).toBe(true);
  });

  it("finds the Docker message in the failed resource's log when Tilt's error is only the exit status", async () => {
    const logs: Record<string, string> = {
      "init-networks": `Initializing Docker networks...\n${poolExhausted}\n`,
    };
    const fixes = await machineProblemFixes(
      [
        { name: "init-networks", message: "Command failed: exit status 1" },
        { name: "api", message: "exit status 1" },
      ],
      async (name) => logs[name] ?? null,
    );
    expect([...fixes.keys()]).toEqual(["init-networks"]);
    const lines = formatStartupReport(
      { failed: [{ name: "init-networks", message: "exit status 1" }], blocked: [], starting: [] },
      false,
      undefined,
      fixes,
    );
    expect(lines.join("\n")).toContain("flisk doctor --fix --scope=machine");
  });

  it("explains an exhausted Docker network pool", () => {
    expect(machineProblemFix(poolExhausted)).toContain("flisk doctor --fix --scope=machine");
    expect(machineProblemFix("exit status 1")).toBeNull();
    const lines = formatStartupReport(buildStartupReport(text, {}), false);
    expect(lines.join("\n")).toContain("Docker has no free network ranges left");
  });
});
