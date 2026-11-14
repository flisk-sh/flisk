// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { parseTiltResourceFailures } from "../doctor-runtime.js";
import {
  buildStartupReport,
  explainFailures,
  formatStartupReport,
  formatWaitFailures,
  isStartupStalled,
  logTail,
  MAX_FAILURE_MESSAGE,
  machineProblemFix,
  machineProblemFixes,
  transitiveDependencies,
  withLoggedReasons,
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
      json(item("redis", "error", "none"), item("worker", "pending", "pending")),
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
    // Shared postgres is needed by every service, so the worker is blocked too (#4125).
    expect(report.blocked).toEqual([
      { name: "api", because: ["postgres"] },
      { name: "worker", because: ["postgres"] },
    ]);
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
      item("redis", "error", "none"),
      item("a", "pending", "pending"),
      item("b", "ok", "pending"),
      item("c", "none", "none"),
      item("d", "ok", "ok"),
      item("e", "ok", "not_applicable"),
      item("(Tiltfile)", "pending", "none"),
    );
    const deps = { a: ["redis"] };
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

  it("says timed out while building when stillBuilding is present", () => {
    const lines = formatStartupReport(
      { failed: [], blocked: [], starting: [], stillBuilding: ["api"] },
      true,
    );
    expect(lines[0]).toBe("Timed out while building: api");
  });

  it("prints the last log lines for a service that timed out", () => {
    const lines = formatStartupReport(
      {
        failed: [],
        blocked: [],
        starting: ["postgres"],
        lastLogs: {
          postgres:
            "Starting database...\nError: FATAL password authentication failed for user 'flisk'",
        },
      },
      true,
    );
    expect(lines).toContain("Timed out waiting for postgres");
    expect(lines).toContain("Last log lines for postgres:");
    expect(lines).toContain("  Error: FATAL password authentication failed for user 'flisk'");
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
    const text = json(item("api", "error", "none"), item("worker", "pending", "pending"));
    expect(isStartupStalled(text, deps)).toBe(false);
  });

  it("is true as soon as shared postgres fails, though an unrelated image build is still running", () => {
    const text = json(
      item("postgres", "error", "none"),
      item("kitchen-api-image", "error", "none", failedBuild("npm ERR!")),
      item("restaurant-migrator-image", "in_progress", "pending"),
      item("migrator", "pending", "pending"),
    );
    expect(isStartupStalled(text, deps)).toBe(true);
    const report = buildStartupReport(text, deps);
    expect(report.starting).toEqual([]);
    expect(report.blocked.map((b) => b.name)).toContain("restaurant-migrator-image");
  });

  it("is true when traefik or the golden layers build fails", () => {
    for (const shared of ["traefik", "golden-layers-build"]) {
      const text = json(item(shared, "error", "none"), item("web-image", "in_progress", "pending"));
      expect(isStartupStalled(text, {})).toBe(true);
    }
  });

  it("keeps waiting when only one image failed and other services can still start", () => {
    const text = json(
      item("postgres", "ok", "ok"),
      item("kitchen-api-image", "error", "none", failedBuild("npm ERR!")),
      item("menu-api-image", "in_progress", "pending"),
    );
    expect(isStartupStalled(text, {})).toBe(false);
    const report = buildStartupReport(text, {});
    expect(report.failed.map((f) => f.name)).toEqual(["kitchen-api-image"]);
    expect(report.stillBuilding).toEqual(["menu-api-image"]);
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

// #3210: a failure always comes with its reason. A health gate only exits 1; the cause is the ERROR line it logged.
describe("withLoggedReasons", () => {
  const logs: Record<string, string> = {
    "postgres-healthy":
      "postgres health check is failing; waiting up to 120s for it to recover\n" +
      "ERROR: postgres is unhealthy: its health check still failed 120s after it first failed\n",
    "api-healthy":
      "postgres-healthy │ ERROR: container api exited with code 3 and will not restart (restart: no)\n",
    quiet: "nothing useful here\n",
  };
  const fetchLogs = vi.fn(async (name: string) => logs[name] ?? null);

  it("replaces a bare exit status with the last ERROR line of the resource's log", async () => {
    const failures = await withLoggedReasons(
      [
        { name: "postgres-healthy", message: "exit status 1", runtime: false },
        { name: "api-healthy", message: "Command failed: exit status 1" },
        { name: "quiet", message: "exit status 2" },
        { name: "web", message: "host port 80 is already allocated" },
      ],
      fetchLogs,
    );
    expect(failures).toEqual([
      {
        name: "postgres-healthy",
        message: "postgres is unhealthy: its health check still failed 120s after it first failed",
        runtime: false,
      },
      {
        name: "api-healthy",
        message: "container api exited with code 3 and will not restart (restart: no)",
      },
      { name: "quiet", message: "exit status 2" },
      { name: "web", message: "host port 80 is already allocated" },
    ]);
    expect(fetchLogs).not.toHaveBeenCalledWith("web");
  });

  it("puts that reason into the failure line of the report", async () => {
    const failed = await withLoggedReasons(
      [{ name: "postgres-healthy", message: "exit status 1" }],
      fetchLogs,
    );
    expect(formatStartupReport({ failed, blocked: [], starting: [] }, false)[0]).toBe(
      "✗ postgres-healthy failed: postgres is unhealthy: its health check still failed 120s after it first failed",
    );
  });
});

// #3822: a failed command or compose step is reported as its command line, so the reason Docker logged is shown instead.
describe("failed commands and compose steps", () => {
  const initNetworksCommand = `Command "echo \\"Initializing Docker networks...\\" && (docker network inspect db3_traefik-public >/dev/null 2>&1 && docker network inspect db3_traefik-public --format \\"{{.Labels}}\\" | grep -q \\"com.docker.compose\\" && echo \\"Removing network ...\\"${" && true".repeat(100)}" failed: exit status 1`;
  const composeCommand = `command ["docker" "compose" "--project-name" "db3-app-autogenerated" "--project-directory" "/tmp/db3/services/app/.autogenerated"${' "--env-file" "/tmp/db3/.env"'.repeat(20)} "up" "--no-deps" "-d" "cache"] failed. error: exit status 1`;
  const poolExhausted =
    "Error response from daemon: all predefined address pools have been fully subnetted";
  const logs: Record<string, string> = {
    "init-networks": `Initializing Docker networks...\nCreating network db3_traefik-public\n${poolExhausted}\n`,
    thing:
      " Image flisk-sh/does-not-exist-image:1.0 Pulling\n" +
      "\u001b[31m Error response from daemon: pull access denied for flisk-sh/does-not-exist-image, repository does not exist\u001b[0m\n\n",
  };
  const fetchLogs = vi.fn(async (name: string) => logs[name] ?? null);

  it("replaces a failed command's text with the last lines of its log", async () => {
    const [failure] = await withLoggedReasons(
      [{ name: "init-networks", message: initNetworksCommand }],
      fetchLogs,
    );
    expect(failure?.message).toBe(
      `Initializing Docker networks... Creating network db3_traefik-public ${poolExhausted}`,
    );
  });

  it("shows Docker's reason for a failed compose step, without colour codes", async () => {
    const [failure] = await withLoggedReasons(
      [{ name: "thing", message: composeCommand }],
      fetchLogs,
    );
    expect(failure?.message).toContain("pull access denied for flisk-sh/does-not-exist-image");
    expect(failure?.message).not.toContain("--project-name");
    expect(failure?.message).not.toContain("\u001b");
  });

  it("keeps the command text, cut short, when the resource has no log", async () => {
    const [failure] = await withLoggedReasons(
      [{ name: "cache", message: composeCommand }],
      fetchLogs,
    );
    expect(failure?.message.length).toBe(MAX_FAILURE_MESSAGE);
    expect(failure?.message.startsWith('command ["docker" "compose"')).toBe(true);
    expect(failure?.message.endsWith("…")).toBe(true);
  });

  it("keeps the end of a long log tail, where the reason is", () => {
    const tail = logTail(`${"x".repeat(400)}\n${poolExhausted}\n`);
    expect(tail?.length).toBe(MAX_FAILURE_MESSAGE);
    expect(tail?.endsWith(poolExhausted)).toBe(true);
  });

  it("adds the network fix for the address-pool message only", async () => {
    const failures = await withLoggedReasons(
      [
        { name: "init-networks", message: initNetworksCommand },
        { name: "thing", message: composeCommand },
      ],
      fetchLogs,
    );
    const fixes = await machineProblemFixes(failures, fetchLogs);
    expect([...fixes.keys()]).toEqual(["init-networks"]);
  });

  it("cuts the command text of failures past the fifth, whose log is not read", async () => {
    const reads = vi.fn(async () => null);
    const failures = await withLoggedReasons(
      Array.from({ length: 6 }, (_, i) => ({ name: `svc${i}`, message: composeCommand })),
      reads,
    );
    expect(reads).toHaveBeenCalledTimes(5);
    expect(failures[5]?.message.length).toBe(MAX_FAILURE_MESSAGE);
    expect(failures[5]?.message.startsWith('command ["docker" "compose"')).toBe(true);
  });

  it("strips terminal escapes from a logged ERROR line and cuts it", async () => {
    const long = `container web exited with code 1: ${"x".repeat(400)}`;
    const [failure] = await withLoggedReasons(
      [{ name: "web-healthy", message: "exit status 1" }],
      async () => `\u001b[31mERROR: ${long}\u001b[0m\n`,
    );
    expect(failure?.message.startsWith("container web exited with code 1: ")).toBe(true);
    expect(failure?.message).not.toContain("\u001b");
    expect(failure?.message.length).toBe(MAX_FAILURE_MESSAGE);
  });

  it("says in plain words that Docker is out of address pools when init-networks has no log (#3650)", async () => {
    const [failure] = await explainFailures(
      [{ name: "init-networks", message: initNetworksCommand }],
      async () => null,
    );
    expect(failure?.message).toContain("out of network address pools");
    expect(failure?.message).not.toContain("docker network inspect");
    expect(failure?.fix).toContain("flisk down --prune-networks");
    expect(failure?.fix).toContain("docker network prune");
  });

  it("recognises the other wording Docker uses when it has no subnet left", () => {
    expect(
      machineProblemFix(
        "could not find an available, non-overlapping IPv4 address pool among the defaults to assign to the network",
      ),
    ).toContain("docker network prune");
  });

  it("explainFailures gives each failure its logged reason and, for the address pool, the fix", async () => {
    const failures = await explainFailures(
      [
        { name: "init-networks", message: initNetworksCommand },
        { name: "thing", message: composeCommand },
      ],
      fetchLogs,
    );
    expect(failures[0]?.message.endsWith(poolExhausted)).toBe(true);
    expect(failures[0]?.fix).toContain("flisk doctor --fix --scope=machine");
    expect(failures[1]?.message).toContain("pull access denied");
    expect(failures[1]).not.toHaveProperty("fix");
  });
});

describe("formatWaitFailures", () => {
  it("prints each failure's reason and, under it, the fix", () => {
    const lines = formatWaitFailures([
      {
        name: "init-networks",
        message:
          "Error response from daemon: all predefined address pools have been fully subnetted",
        fix:
          machineProblemFix("all predefined address pools have been fully subnetted") ?? undefined,
      },
      { name: "cache", reason: "pull access denied" },
    ]);
    expect(lines[0]).toMatch(
      /^init-networks: Error response from daemon: all predefined address pools have been fully subnetted\n {4}→ Docker has no free network ranges left/,
    );
    expect(lines[1]).toBe("cache: pull access denied");
  });

  it("says failed when a failure has no text", () => {
    expect(formatWaitFailures([{ name: "web" }])).toEqual(["web: failed"]);
  });

  // #3823: an unhealthy service's log lines go under its own failure, not as a second entry for it.
  it("prints a failure's log lines under it and how to see more", () => {
    expect(
      formatWaitFailures([
        { name: "py", message: "health check is failing", logs: ["boom: cannot connect"] },
        { name: "web", message: "not healthy", logs: [] },
      ]),
    ).toEqual([
      "py: health check is failing\n    boom: cannot connect\n    (last line of: flisk logs --service py)",
      "web: not healthy",
    ]);
  });
});
