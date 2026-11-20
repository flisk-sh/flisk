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
    };
    expect(data.tilt.readiness).toMatchObject({ ready: true });
    // The disabled worker has no runtime state; it must not be reported as unhealthy or fail --strict.
    expect(data.unhealthy).toEqual([]);

    const strict = runFlisk(["status", "--strict"], { cwd: root, timeout: 30_000 });
    expect(strict.status).toBe(0);
  });

  it("prints one line about active overrides on a native up dry run", () => {
    const result = runFlisk(["up", "--dry-run"], { cwd: fixture(), timeout: 30_000 });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "Local overrides active (service.local.json): api: port, api: env",
    );
  });
});
