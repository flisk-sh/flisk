// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { createTempProject, parseEnvelope, runFlisk } from "../../test-support/index.js";
import { nativeRunStatePath } from "../../utils/native-runtime.js";

const projectJson = {
  version: "1.0",
  project: { name: "local-overrides-report", version: "1.0.0" },
  discovery: { paths: ["services/*/*"] },
  optional_infra: {
    monitoring: false,
    elk: false,
    debezium: false,
    golden_image: false,
    verdaccio: false,
  },
  phases: {
    pre_alpha: { name: "Pre-Alpha", description: "", enabledStacks: ["app"] },
    alpha: { name: "Alpha", description: "", enabledStacks: [] },
    beta: { name: "Beta", description: "", enabledStacks: [] },
    out_of_scope: { name: "Out of Scope", description: "", enabledStacks: [] },
  },
};

function fixture(): string {
  return createTempProject({
    projectJson,
    files: {
      "services/app/api/service.json": JSON.stringify({
        appName: "api",
        appType: "backend",
        stack: "app",
        schemaVersion: 1,
        command: "node server.js",
        port: 8080,
        env: { KEEP: "committed" },
      }),
      "services/app/api/service.local.json": JSON.stringify({
        port: 9100,
        env: { KEEP: "local", ADDED: "yes" },
      }),
    },
  });
}

const expected = [
  { service: "api", field: "port" },
  { service: "api", field: "env" },
];

describe("local overrides in command output", () => {
  it("reports active overrides in resources --json", () => {
    const result = runFlisk(["resources", "--json"], { cwd: fixture() });

    expect(result.status).toBe(0);
    expect(parseEnvelope(result.stdout).data?.overrides).toEqual(expected);
  });

  it("reports active overrides in status --json", () => {
    const result = runFlisk(["status", "--json"], { cwd: fixture(), timeout: 30_000 });

    expect(result.status).toBe(0);
    expect(parseEnvelope(result.stdout).data?.overrides).toEqual(expected);
  });

  it("reports active overrides in config verify --json without invalidating generated config", () => {
    const result = runFlisk(["config", "verify", "--json"], { cwd: fixture() });

    expect(result.status).toBe(0);
    const data = parseEnvelope(result.stdout).data as {
      valid: boolean;
      diffs: unknown[];
      errors: unknown[];
      overrides: unknown;
    };
    expect(data.valid).toBe(true);
    expect(data.diffs).toEqual([]);
    expect(data.errors).toEqual([]);
    expect(data.overrides).toEqual(expected);
  });

  it("keeps config verify valid when a local override file is malformed", () => {
    const root = createTempProject({
      projectJson,
      files: {
        "services/app/api/service.json": JSON.stringify({
          appName: "api",
          appType: "backend",
          stack: "app",
          schemaVersion: 1,
          command: "node server.js",
          port: 8080,
          env: { KEEP: "committed" },
        }),
        "services/app/api/service.local.json": '{"port": 9100,',
      },
    });

    const json = runFlisk(["config", "verify", "--json"], { cwd: root });
    expect(json.status).toBe(0);
    const data = parseEnvelope(json.stdout).data as {
      valid: boolean;
      errors: unknown[];
      diffs: unknown[];
      overrides: unknown[];
      overrideErrors: string[];
    };
    expect(data.valid).toBe(true);
    expect(data.errors).toEqual([]);
    expect(data.diffs).toEqual([]);
    expect(data.overrides).toEqual([]);
    expect(data.overrideErrors[0]).toMatch(/service\.local\.json: invalid JSON/);

    const text = runFlisk(["config", "verify"], { cwd: root });
    expect(text.status).toBe(0);
    expect(text.stdout).toContain("All files are in sync!");
  });

  it("uses the local port in native status --json addresses", () => {
    const result = runFlisk(["status", "--json"], { cwd: fixture(), timeout: 30_000 });

    expect(result.status).toBe(0);
    const data = parseEnvelope(result.stdout).data as {
      resources: Array<{ name: string; port: number | null; directUrl: string | null }>;
    };
    const api = data.resources.find((resource) => resource.name === "api");
    expect(api?.port).toBe(9100);
    expect(api?.directUrl).toBe("http://localhost:9100");
  });

  it("excludes a locally disabled service from native readiness", () => {
    const root = createTempProject({
      projectJson,
      files: {
        "services/app/api/service.json": JSON.stringify({
          appName: "api",
          appType: "backend",
          stack: "app",
          schemaVersion: 1,
          command: "node server.js",
          port: 8080,
        }),
        "services/app/worker/service.json": JSON.stringify({
          appName: "worker",
          appType: "worker",
          stack: "app",
          schemaVersion: 1,
          command: "node worker.js",
        }),
        "services/app/worker/service.local.json": JSON.stringify({ enabled: false }),
      },
    });
    const statePath = nativeRunStatePath(root);
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(
      statePath,
      JSON.stringify({ pid: process.pid, services: { api: { pid: process.pid, ready: true } } }),
    );

    const result = runFlisk(["status", "--json"], { cwd: root, timeout: 30_000 });
    expect(result.status).toBe(0);
    const data = parseEnvelope(result.stdout).data as {
      tilt: { readiness: { ready: boolean } | null };
      unhealthy: string[];
      stacks: Array<{ name: string; healthyCount: number; healthTotal: number }>;
    };
    expect(data.tilt.readiness).toMatchObject({ ready: true });
    // The disabled worker has no runtime state; it must not be reported as unhealthy or fail --strict.
    expect(data.unhealthy).toEqual([]);
    // Stack health totals count the services the launch starts, not the committed inventory.
    const app = data.stacks.find((stack) => stack.name === "app");
    expect(app).toMatchObject({ healthyCount: 1, healthTotal: 1 });

    const strict = runFlisk(["status", "--strict"], { cwd: root, timeout: 30_000 });
    expect(strict.status).toBe(0);
  });

  it("keeps one service's valid override when another service's local file is malformed", () => {
    const root = createTempProject({
      projectJson,
      files: {
        "services/app/api/service.json": JSON.stringify({
          appName: "api",
          appType: "backend",
          stack: "app",
          schemaVersion: 1,
          command: "node server.js",
          port: 8080,
        }),
        // Malformed: api falls back to its committed fields.
        "services/app/api/service.local.json": '{"port": 9100,',
        "services/app/worker/service.json": JSON.stringify({
          appName: "worker",
          appType: "worker",
          stack: "app",
          schemaVersion: 1,
          command: "node worker.js",
        }),
        "services/app/worker/service.local.json": JSON.stringify({ enabled: false }),
      },
    });
    const statePath = nativeRunStatePath(root);
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(
      statePath,
      JSON.stringify({ pid: process.pid, services: { api: { pid: process.pid, ready: true } } }),
    );

    const result = runFlisk(["status", "--json"], { cwd: root, timeout: 30_000 });
    expect(result.status).toBe(0);
    const data = parseEnvelope(result.stdout).data as {
      tilt: { readiness: { ready: boolean } | null };
      unhealthy: string[];
      overrides: Array<{ service: string; field: string }>;
      resources: Array<{ name: string; port: number | null }>;
    };
    // The worker's valid enabled: false survives, so it stays out of the health calculations.
    expect(data.tilt.readiness).toMatchObject({ ready: true });
    expect(data.unhealthy).toEqual([]);
    expect(data.overrides).toEqual([{ service: "worker", field: "enabled" }]);
    // api's malformed file leaves it on its committed port instead of the overridden one.
    const api = data.resources.find((resource) => resource.name === "api");
    expect(api?.port).toBe(8080);

    const strict = runFlisk(["status", "--strict"], { cwd: root, timeout: 30_000 });
    expect(strict.status).toBe(0);
  });

  it("keeps an image-based dependency on its committed port and env despite a service.local.json", () => {
    const root = createTempProject({
      projectJson,
      files: {
        "services/app/api/service.json": JSON.stringify({
          appName: "api",
          appType: "backend",
          stack: "app",
          schemaVersion: 1,
          command: "node server.js",
          port: 8080,
        }),
        "services/app/cache/service.json": JSON.stringify({
          appName: "cache",
          appType: "backend",
          stack: "app",
          schemaVersion: 1,
          image: "redis:7",
          port: 6379,
          env: { KEEP: "committed" },
        }),
        // Overrides never reach a container: `flisk up` runs the committed image config.
        "services/app/cache/service.local.json": JSON.stringify({
          port: 16379,
          enabled: false,
          env: { KEEP: "local" },
        }),
      },
    });
    const statePath = nativeRunStatePath(root);
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(
      statePath,
      JSON.stringify({
        pid: process.pid,
        services: {
          api: { pid: process.pid, ready: true },
          cache: { pid: process.pid, ready: true, container: "local-report-cache-1" },
        },
      }),
    );

    const result = runFlisk(["status", "--json"], { cwd: root, timeout: 30_000 });
    expect(result.status).toBe(0);
    const data = parseEnvelope(result.stdout).data as {
      unhealthy: string[];
      overrides: Array<{ service: string; field: string }>;
      resources: Array<{ name: string; port: number | null }>;
      stacks: Array<{ name: string; healthyCount: number; healthTotal: number }>;
    };
    // The report shows what actually runs: the committed container port, and the cache still
    // counted by health (native launch starts it, so an enabled: false local file cannot hide it).
    const cache = data.resources.find((resource) => resource.name === "cache");
    expect(cache?.port).toBe(6379);
    expect(data.overrides).toEqual([]);
    expect(data.unhealthy).toEqual([]);
    const app = data.stacks.find((stack) => stack.name === "app");
    expect(app).toMatchObject({ healthyCount: 2, healthTotal: 2 });
  });

  it("limits the reported overrides to the requested stack", () => {
    const root = createTempProject({
      projectJson,
      files: {
        "services/app/api/service.json": JSON.stringify({
          appName: "api",
          appType: "backend",
          stack: "app",
          schemaVersion: 1,
          command: "node server.js",
          port: 8080,
        }),
        "services/app/api/service.local.json": JSON.stringify({ port: 9100 }),
        "services/data/worker/service.json": JSON.stringify({
          appName: "worker",
          appType: "worker",
          stack: "data",
          schemaVersion: 1,
          command: "node worker.js",
        }),
        "services/data/worker/service.local.json": JSON.stringify({ enabled: false }),
      },
    });

    const result = runFlisk(["status", "--stack", "data", "--json"], {
      cwd: root,
      timeout: 30_000,
    });
    expect(result.status).toBe(0);
    const data = parseEnvelope(result.stdout).data as {
      overrides: Array<{ service: string; field: string }>;
      resources: Array<{ name: string }>;
    };
    // The override list names only services the stack-filtered report shows.
    expect(data.overrides).toEqual([{ service: "worker", field: "enabled" }]);
    expect(data.resources.map((resource) => resource.name)).toEqual(["worker"]);
  });

  it("prints one line about active overrides on a native up dry run", () => {
    const result = runFlisk(["up", "--dry-run"], { cwd: fixture(), timeout: 30_000 });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "Local overrides active (service.local.json): api: port, api: env",
    );
  });
});
