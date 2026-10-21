// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  generatedFieldErrorsForFile,
  SERVICE_MANIFEST_SCHEMA_VERSION,
  validateServiceManifest,
} from "../service-manifest.js";

describe("service manifest compatibility", () => {
  it("requires schema version and reports missing fields by path", () => {
    const result = validateServiceManifest({ appName: "api" }, "services/shop/api/service.json");
    expect(result.errors).toEqual([
      "services/shop/api/service.json.appType: required field is missing",
      "services/shop/api/service.json.stack: required field is missing",
      "services/shop/api/service.json.schemaVersion: required field is missing",
    ]);
  });

  it("warns about extra fields while retaining their values", () => {
    const manifest = {
      appName: "api",
      appType: "backend",
      stack: "shop",
      schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION,
      customerMetadata: { owner: "team-a" },
    };
    const result = validateServiceManifest(manifest, "service.json");
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(["service.json.customerMetadata: unknown field is preserved"]);
    expect(result.manifest?.customerMetadata).toEqual({ owner: "team-a" });
  });

  it("accepts a smoke block without calling it unknown, and reports a bad one as an error by path", () => {
    const base = {
      appName: "api",
      appType: "backend",
      stack: "shop",
      schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION,
    };
    const good = validateServiceManifest(
      { ...base, smoke: { via: "proxy", steps: [{ path: "/records", expect: 200 }] } },
      "service.json",
    );
    expect(good.errors).toEqual([]);
    expect(good.warnings).toEqual([]);

    const bad = validateServiceManifest(
      { ...base, smoke: { via: "container", steps: [{ path: "records" }] } },
      "service.json",
    );
    expect(bad.errors.join("\n")).toMatch(/service\.json\.smoke\.via/);
    expect(bad.errors.join("\n")).toMatch(/service\.json\.smoke\.steps\[0\]\.path/);
  });

  it("accepts dev.liveReload as a boolean and reports anything else as an error by path", () => {
    const base = {
      appName: "api",
      appType: "backend",
      stack: "shop",
      schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION,
    };
    const ok = validateServiceManifest(
      { ...base, language: "go", dev: { liveReload: true } },
      "service.json",
    );
    expect(ok.errors).toEqual([]);
    expect(ok.warnings).toEqual([]);

    const bad = validateServiceManifest(
      { ...base, language: "go", dev: { liveReload: "yes" } },
      "service.json",
    );
    expect(bad.errors.join("\n")).toMatch(/service\.json\.dev\.liveReload: expected true or false/);
  });

  it("warns that dev.liveReload only applies to Go services", () => {
    const base = {
      appName: "api",
      appType: "backend",
      stack: "shop",
      schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION,
    };
    const result = validateServiceManifest(
      { ...base, language: "python", dev: { liveReload: true } },
      "service.json",
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings.join("\n")).toMatch(/service\.json\.dev\.liveReload: .*only .*Go/);
  });

  it("warns specifically that a jwtSecret in service.json is ignored and must not be committed", () => {
    const result = validateServiceManifest(
      {
        appName: "api",
        appType: "backend",
        stack: "shop",
        schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION,
        jwtSecret: "committed-by-mistake",
      },
      "service.json",
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("service.json.jwtSecret");
    expect(result.warnings[0]).toMatch(/ignored/);
    expect(result.warnings[0]).toContain("JWT_SECRET");
    // The warning never repeats the secret itself.
    expect(result.warnings[0]).not.toContain("committed-by-mistake");
  });

  it("flags the deprecated dependencies and envVars fields, and says what replaces them", () => {
    const result = validateServiceManifest(
      {
        appName: "api",
        appType: "backend",
        stack: "shop",
        schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION,
        dependencies: ["orders"],
        envVars: { LOG_LEVEL: "debug" },
      },
      "service.json",
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      "service.json.dependencies: deprecated, use dependsOn (still read for now)",
      "service.json.envVars: deprecated, use params (still read when params is absent)",
    ]);
    // Deprecated is not removed: the values are kept so the engine can still fall back to them.
    expect(result.manifest?.dependencies).toEqual(["orders"]);
    expect(result.manifest?.envVars).toEqual({ LOG_LEVEL: "debug" });
  });

  it("does not flag the current fields", () => {
    const result = validateServiceManifest(
      {
        appName: "api",
        appType: "backend",
        stack: "shop",
        schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION,
        dependsOn: ["orders"],
        params: { LOG_LEVEL: "debug" },
      },
      "service.json",
    );
    expect(result.warnings).toEqual([]);
  });

  it("validates route path overrides as strings", () => {
    const base = {
      appName: "api",
      appType: "backend",
      stack: "shop",
      schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION,
    };
    const valid = validateServiceManifest(
      { ...base, apiPath: "/api/v2", basePath: "/web" },
      "services/shop/api/service.json",
    );
    expect(valid.errors).toEqual([]);
    expect(valid.warnings).toEqual([]);

    const invalid = validateServiceManifest(
      { ...base, apiPath: 42, basePath: null },
      "services/shop/api/service.json",
    );
    expect(invalid.errors).toEqual([
      "services/shop/api/service.json.apiPath: expected a string",
      "services/shop/api/service.json.basePath: expected a string",
    ]);
    expect(invalid.warnings).toEqual([]);
  });

  it("rejects unsupported schema versions", () => {
    const result = validateServiceManifest(
      { appName: "api", appType: "backend", stack: "shop", schemaVersion: 2 },
      "service.json",
    );
    expect(result.errors).toEqual([
      "service.json.schemaVersion: unsupported version 2 (supported: 1)",
    ]);
  });

  // GHSA-phgf-pww4-7jxc: these values are written into generated compose YAML as they are.
  it("rejects line breaks and YAML syntax in fields that reach generated output", () => {
    const base = {
      appName: "api",
      appType: "backend",
      stack: "shop",
      schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION,
      traefik: { pathPrefix: "/api/v1/shop-management" },
    };
    const hostile: Array<Record<string, unknown>> = [
      { healthCheckPath: "/health\n    privileged: true" },
      { healthCheckPath: '/health"' },
      { traefik: { pathPrefix: "/api", host: "a.local\n    privileged: true" } },
      { traefik: { pathPrefix: "/api/v1/x\n    network_mode: host" } },
      { traefik: { pathPrefix: "/api", healthCheck: "/h\n    volumes: []" } },
      { nats: { queueGroup: "g: true" } },
      { databaseName: "Flisk_x\n  privileged: true" },
      { stack: "shop # comment" },
      { image: "app\n    privileged: true" },
      { healthCheckPath: "health" },
      { healthCheckPath: 42 },
    ];
    for (const extra of hostile) {
      const result = validateServiceManifest({ ...base, ...extra }, "service.json");
      expect(result.errors, JSON.stringify(extra)).not.toEqual([]);
    }
  });

  it("names the field in the error and does not echo the unsafe value", () => {
    const result = validateServiceManifest(
      { ...manifestBase(), healthCheckPath: "/health\n    privileged: true" },
      "services/shop/api/service.json",
    );
    expect(result.errors).toEqual([
      "services/shop/api/service.json.healthCheckPath: must be a path such as /health (no spaces, line breaks or YAML syntax)",
    ]);
  });

  it("accepts the values the generator and existing service.json files use", () => {
    const result = validateServiceManifest(
      {
        ...manifestBase(),
        healthCheckPath: "/api/v1/health",
        databaseName: "Flisk_shop",
        image: "ghcr.io/acme/app:1.0@sha256:abc",
        traefik: {
          host: "shop.backend.my-project.local",
          pathPrefix: "/api/v1/shop-management",
          healthCheck: "/health",
        },
        nats: { queueGroup: "shop_backend_svc" },
      },
      "service.json",
    );
    expect(result.errors).toEqual([]);
  });

  it("treats empty generated-output values as unset", () => {
    const result = validateServiceManifest(
      { ...manifestBase(), traefik: { pathPrefix: "/api", healthCheck: "" } },
      "service.json",
    );
    expect(result.errors).toEqual([]);
  });

  it("reports unsafe generated-output values from a file, and nothing for a file it cannot parse", () => {
    const dir = mkdtempSync(join(tmpdir(), "service-manifest-"));
    try {
      const file = join(dir, "service.json");
      writeFileSync(file, JSON.stringify({ ...manifestBase(), stack: "shop\nprivileged: true" }));
      expect(generatedFieldErrorsForFile(file, "service.json")).toEqual([
        "service.json.stack: must be letters, digits, '_' or '-' (no spaces, line breaks or YAML syntax)",
      ]);

      writeFileSync(file, "{ not json");
      expect(generatedFieldErrorsForFile(file, "service.json")).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Fields outside the per-field allowlist also reach generated YAML (port, appName, dockerfile, buildContext, basePath, envVars).
  it("rejects a line break in any string key or value, not only the allowlisted fields", () => {
    const hostile: Array<[Record<string, unknown>, string]> = [
      [{ port: "4000\n    privileged: true" }, "service.json.port"],
      [{ appName: "api\n    privileged: true" }, "service.json.appName"],
      [{ dockerfile: "Dockerfile\n    privileged: true" }, "service.json.dockerfile"],
      [{ buildContext: "src\r    privileged: true" }, "service.json.buildContext"],
      [{ basePath: "/shop privileged: true" }, "service.json.basePath"],
      [
        { envVars: [{ name: "A", value: "v\n    privileged: true" }] },
        "service.json.envVars[0].value",
      ],
      [{ params: { "a\n    privileged": "x" } }, "service.json.params"],
    ];
    for (const [extra, field] of hostile) {
      const { errors } = validateServiceManifest({ ...manifestBase(), ...extra }, "service.json");
      expect(
        errors.some((error) => error.startsWith(`${field}: `)),
        JSON.stringify(extra),
      ).toBe(true);
      expect(errors.join("\n")).not.toContain("privileged");
    }
  });

  it("reports an allowlisted field once and leaves smoke, which never reaches generated config, alone", () => {
    const { errors } = validateServiceManifest(
      {
        ...manifestBase(),
        healthCheckPath: "/health\n    privileged: true",
        smoke: { via: "/api/v1/shop", create: { body: "{\n}" } },
      },
      "service.json",
    );
    expect(errors.filter((error) => error.startsWith("service.json.healthCheckPath"))).toHaveLength(
      1,
    );
    expect(
      errors.filter(
        (error) => error.startsWith("service.json.smoke") && error.includes("line break"),
      ),
    ).toEqual([]);
  });
});

function manifestBase(): Record<string, unknown> {
  return {
    appName: "api",
    appType: "backend",
    stack: "shop",
    schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION,
  };
}
