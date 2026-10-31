// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  containerErrors,
  dockerNameErrors,
  extraPortsErrors,
  generatedFieldErrorsForFile,
  getInvalidServiceRoutePathFields,
  isDockerSafeName,
  SERVICE_MANIFEST_SCHEMA_URL,
  SERVICE_MANIFEST_SCHEMA_VERSION,
  secretConflictWarnings,
  secretsErrors,
  sidecarErrors,
  validateGeneratedStringFields,
  validateServiceManifest,
  validateServiceManifestFile,
  volumesErrors,
} from "../service-manifest.js";

function manifestBase(): Record<string, unknown> {
  return {
    appName: "api",
    appType: "backend",
    stack: "shop",
    schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION,
  };
}

describe("service manifest compatibility", () => {
  it("rejects non-object, null, and array manifests", () => {
    expect(validateServiceManifest(null, "service.json")).toEqual({
      errors: ["service.json: expected a JSON object"],
      warnings: [],
    });
    expect(validateServiceManifest(undefined, "service.json")).toEqual({
      errors: ["service.json: expected a JSON object"],
      warnings: [],
    });
    expect(validateServiceManifest("raw-string", "service.json")).toEqual({
      errors: ["service.json: expected a JSON object"],
      warnings: [],
    });
    expect(validateServiceManifest(12345, "service.json")).toEqual({
      errors: ["service.json: expected a JSON object"],
      warnings: [],
    });
    expect(validateServiceManifest([], "service.json")).toEqual({
      errors: ["service.json: expected a JSON object"],
      warnings: [],
    });
  });

  it("requires schema version and reports missing required fields by path", () => {
    const result = validateServiceManifest({}, "services/shop/api/service.json");
    expect(result.errors).toEqual([
      "services/shop/api/service.json.appName: required field is missing",
      "services/shop/api/service.json.appType: required field is missing",
      "services/shop/api/service.json.stack: required field is missing",
      "services/shop/api/service.json.schemaVersion: required field is missing",
    ]);
  });

  it("reports required fields that are not strings", () => {
    const result = validateServiceManifest(
      {
        appName: 123,
        appType: null,
        stack: "shop",
        schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION,
      },
      "service.json",
    );
    expect(result.errors).toEqual([
      "service.json.appName: expected a string",
      "service.json.appType: expected a string",
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

  it("accepts all known service manifest fields without unknown warnings", () => {
    const allKnown = {
      $schema: SERVICE_MANIFEST_SCHEMA_URL,
      agent: { model: "default" },
      apiBasePath: "/api/v1",
      apiPath: "/api",
      appName: "full-service",
      appType: "backend",
      backendName: "flisk-core",
      basePath: "/base",
      build: { context: "." },
      buildContext: "./build",
      databaseName: "shop_db",
      dependencies: ["dep-svc"],
      dev: { liveReload: false },
      dependsOn: ["dep-svc"],
      dockerfile: "Dockerfile",
      enabled: true,
      exposeViaProxy: true,
      featuresEnabled: ["tracing"],
      framework: "fastapi",
      healthCheckPath: "/health",
      language: "python",
      name: "full-service",
      nats: { queueGroup: "q_group" },
      params: { ENV_VAR: "1" },
      playwright: { timeout: 5000 },
      port: 8080,
      replicas: 1,
      restart: "always",
      runtime: "docker",
      sablier: { sessionDuration: "5m" },
      schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION,
      secrets: { required: ["DB_PASSWORD"] },
      smoke: { via: "proxy", steps: [{ path: "/health", expect: 200 }] },
      stack: "shop",
      syncs: [{ host: "./src", container: "/app" }],
      traefik: { host: "shop.local", pathPrefix: "/api", healthCheck: "/health" },
      type: "service",
    };

    // `image` and `dockerfile` are alternatives (a service runs from one source), so `image` is checked on its own.
    const result = validateServiceManifest(allKnown, "service.json");
    expect(result.errors).toEqual([]);
    const withImage = validateServiceManifest(
      { ...manifestBase(), image: "ghcr.io/org/repo:tag" },
      "service.json",
    );
    expect(withImage.errors).toEqual([]);
    // Only deprecation warnings should be present, no "unknown field" warnings
    const unknownWarnings = [...result.warnings, ...withImage.warnings].filter((w) =>
      w.includes("unknown field"),
    );
    expect(unknownWarnings).toEqual([]);
  });

  describe("field types the engine reads", () => {
    const base = (): Record<string, unknown> => ({ ...manifestBase() });
    const errorsFor = (extra: Record<string, unknown>): string[] =>
      validateServiceManifest({ ...base(), ...extra }, "s.json").errors;

    it.each([
      [{ traefik: "x" }, "traefik: expected an object"],
      [{ sablier: "on" }, "sablier: expected an object"],
      [{ nats: [] }, "nats: expected an object"],
      [{ params: "x" }, "params: expected an object"],
      [{ build: "Dockerfile" }, "build: expected an object"],
      [{ featuresEnabled: "vitest" }, "featuresEnabled: expected an array of strings"],
      [{ featuresEnabled: [1] }, "featuresEnabled: expected an array of strings"],
      [{ image: 7 }, "image: expected a string"],
      [{ language: "BUN" }, "language: expected a lowercase id"],
      [{ exposeViaProxy: "no" }, "exposeViaProxy: expected true or false"],
      [{ replicas: 1.5 }, "replicas: expected an integer from 1 to 10"],
      [{ replicas: 0 }, "replicas: expected an integer from 1 to 10"],
      [{ replicas: "2" }, "replicas: expected an integer from 1 to 10"],
      [{ replicas: 100000 }, "replicas: expected an integer from 1 to 10"],
      [{ databaseName: "d".repeat(64) }, "databaseName: at most 63"],
      [
        { dockerfile: "/etc/passwd" },
        "dockerfile: must be a path relative to the service directory",
      ],
      [
        { buildContext: "/opt/src" },
        "buildContext: must be a path relative to the service directory",
      ],
      [
        { buildContext: "C:\\src" },
        "buildContext: must be a path relative to the service directory",
      ],
      [
        { build: { context: "/" } },
        "build.context: must be a path relative to the service directory",
      ],
      [{ build: { dockerfile: "/x" } }, "build.dockerfile: must be a path relative to"],
      [{ dev: { command: "x", watch: ["/etc/**"] } }, "dev.watch[0]: must be a path relative to"],
      [{ dev: { watch: "src" } }, "dev.watch: expected an array of strings"],
      [{ image: "nginx:1", dockerfile: "Dockerfile" }, 'set "image" or "dockerfile", not both'],
    ])("reports %j", (extra, message) => {
      expect(errorsFor(extra).join("\n")).toContain(message);
    });

    it.each([
      {},
      { replicas: 1 },
      { replicas: 10 },
      { traefik: null },
      { build: null },
      { dockerfile: "docker/Dockerfile.dev" },
      { buildContext: "src" },
      // A service.json inside the project may build from a tree outside it; `flisk import` writes exactly this for a Compose app.
      { buildContext: "../../../api" },
      { buildContext: "../../../../l565-ext/outer-src", dockerfile: "Dockerfile" },
      { build: { context: "../../../api", dockerfile: "Dockerfile" } },
      { build: { dockerfile: "Dockerfile", context: "." } },
      { featuresEnabled: [] },
      { restart: "always" },
      { appType: "bring-your-own" },
      { appType: "api" },
      { restart: "sometimes" },
    ])("accepts %j", (extra) => {
      expect(errorsFor(extra)).toEqual([]);
    });

    it("refuses a frontend framework that is not registered, which would stop the Vite generator", () => {
      for (const framework of ["Next", "no such", "react;rm", "", "../react"]) {
        expect(errorsFor({ appType: "frontend", framework }).join("\n")).toContain(
          "framework: expected one of",
        );
      }
      for (const framework of ["react", "vue", "tanstack-router", "next"]) {
        expect(errorsFor({ appType: "frontend", framework })).toEqual([]);
      }
      // A backend's framework (hono, express, ...) is not in this list and is not checked here.
      expect(errorsFor({ appType: "backend", framework: "hono" })).toEqual([]);
    });

    it("refuses replicas above 1 on a frontend, which Compose is not generated for", () => {
      expect(errorsFor({ appType: "frontend", replicas: 3 }).join("\n")).toContain(
        "a frontend runs as one container",
      );
      expect(errorsFor({ appType: "frontend", replicas: 1 })).toEqual([]);
      expect(errorsFor({ appType: "backend", replicas: 3 })).toEqual([]);
    });

    it("leaves a local-process service alone", () => {
      expect(errorsFor({ command: "node x.js", replicas: 0, traefik: "x" })).toEqual([]);
    });
  });

  it("accepts a smoke block without calling it unknown, and reports a bad one as an error by path", () => {
    const base = manifestBase();
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
    const base = manifestBase();
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

    const badNumber = validateServiceManifest(
      { ...base, language: "go", dev: { liveReload: 1 } },
      "service.json",
    );
    expect(badNumber.errors.join("\n")).toMatch(
      /service\.json\.dev\.liveReload: expected true or false/,
    );
  });

  it("ignores dev when it is null or not an object", () => {
    const base = manifestBase();
    const resultNull = validateServiceManifest({ ...base, dev: null }, "service.json");
    expect(resultNull.errors).toEqual([]);

    const resultString = validateServiceManifest({ ...base, dev: "not-an-object" }, "service.json");
    expect(resultString.errors).toEqual([]);
  });

  it("warns that dev.liveReload only applies to Go services", () => {
    const base = manifestBase();
    const result = validateServiceManifest(
      { ...base, language: "python", dev: { liveReload: true } },
      "service.json",
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings.join("\n")).toMatch(/service\.json\.dev\.liveReload: .*only .*Go/);

    // false does not warn for non-Go services
    const resultFalse = validateServiceManifest(
      { ...base, language: "python", dev: { liveReload: false } },
      "service.json",
    );
    expect(resultFalse.warnings).toEqual([]);
  });

  it("warns specifically that a jwtSecret in service.json is ignored and must not be committed", () => {
    const result = validateServiceManifest(
      {
        ...manifestBase(),
        jwtSecret: "committed-by-mistake",
      },
      "service.json",
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("service.json.jwtSecret");
    expect(result.warnings[0]).toMatch(/ignored/);
    expect(result.warnings[0]).toContain("JWT_SECRET");
    expect(result.warnings[0]).not.toContain("committed-by-mistake");
  });

  it("flags the deprecated dependencies and envVars fields, and says what replaces them", () => {
    const result = validateServiceManifest(
      {
        ...manifestBase(),
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
    expect(result.manifest?.dependencies).toEqual(["orders"]);
    expect(result.manifest?.envVars).toEqual({ LOG_LEVEL: "debug" });
  });

  it("does not flag the current fields", () => {
    const result = validateServiceManifest(
      {
        ...manifestBase(),
        dependsOn: ["orders"],
        params: { LOG_LEVEL: "debug" },
      },
      "service.json",
    );
    expect(result.warnings).toEqual([]);
  });

  describe("getInvalidServiceRoutePathFields", () => {
    it("returns empty array for non-objects or arrays", () => {
      expect(getInvalidServiceRoutePathFields(null)).toEqual([]);
      expect(getInvalidServiceRoutePathFields(undefined)).toEqual([]);
      expect(getInvalidServiceRoutePathFields([])).toEqual([]);
      expect(getInvalidServiceRoutePathFields("string")).toEqual([]);
      expect(getInvalidServiceRoutePathFields(123)).toEqual([]);
    });

    it("returns empty array when fields are valid strings or absent", () => {
      expect(getInvalidServiceRoutePathFields({})).toEqual([]);
      expect(getInvalidServiceRoutePathFields({ apiPath: "/api" })).toEqual([]);
      expect(getInvalidServiceRoutePathFields({ basePath: "/base" })).toEqual([]);
      expect(getInvalidServiceRoutePathFields({ apiPath: "/api", basePath: "/base" })).toEqual([]);
    });

    it("returns field names when fields are not strings", () => {
      expect(getInvalidServiceRoutePathFields({ apiPath: 42 })).toEqual(["apiPath"]);
      expect(getInvalidServiceRoutePathFields({ basePath: null })).toEqual(["basePath"]);
      expect(getInvalidServiceRoutePathFields({ apiPath: true, basePath: {} })).toEqual([
        "apiPath",
        "basePath",
      ]);
    });
  });

  it("validates route path overrides as strings", () => {
    const base = manifestBase();
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
    const result = validateServiceManifest({ ...manifestBase(), schemaVersion: 2 }, "service.json");
    expect(result.errors).toEqual([
      "service.json.schemaVersion: unsupported version 2 (supported: 1)",
    ]);
  });

  describe("validateGeneratedStringFields", () => {
    it("accepts valid generated string fields", () => {
      const manifest = {
        healthCheckPath: "/health/v1-status",
        traefik: {
          host: "shop.backend.my-project.local",
          pathPrefix: "/api/v1/shop-management",
          healthCheck: "/ping",
        },
        nats: { queueGroup: "shop_backend.group-1" },
        databaseName: "shop_db-2",
        stack: "shop-stack_prod",
        image: "ghcr.io/acme/app:1.0@sha256:abc123def",
      };
      expect(validateGeneratedStringFields(manifest, "service.json")).toEqual([]);
    });

    it("treats null, undefined, and empty string as unset", () => {
      const manifest = {
        healthCheckPath: "",
        traefik: { host: null, pathPrefix: undefined, healthCheck: "" },
        nats: { queueGroup: null },
        databaseName: "",
        stack: undefined,
        image: null,
      };
      expect(validateGeneratedStringFields(manifest, "service.json")).toEqual([]);
    });

    it("reports non-string types for generated fields", () => {
      const manifest = {
        healthCheckPath: 123,
        traefik: { host: true, pathPrefix: ["/path"] },
        nats: { queueGroup: {} },
        databaseName: false,
        image: 99,
      };
      const errors = validateGeneratedStringFields(manifest, "service.json");
      expect(errors).toContain("service.json.healthCheckPath: expected a string");
      expect(errors).toContain("service.json.traefik.host: expected a string");
      expect(errors).toContain("service.json.traefik.pathPrefix: expected a string");
      expect(errors).toContain("service.json.nats.queueGroup: expected a string");
      expect(errors).toContain("service.json.databaseName: expected a string");
      expect(errors).toContain("service.json.image: expected a string");
    });

    it("reports specific pattern requirements without echoing dangerous values", () => {
      const invalidFields: Array<[Record<string, unknown>, string, string]> = [
        [{ healthCheckPath: "health" }, "healthCheckPath", "a path such as /health"],
        [
          { traefik: { host: "host:8080" } },
          "traefik.host",
          "a hostname such as shop.backend.myproject.local",
        ],
        [
          { traefik: { pathPrefix: "api/v1" } },
          "traefik.pathPrefix",
          "a path such as /api/v1/shop-management",
        ],
        [{ traefik: { healthCheck: "health" } }, "traefik.healthCheck", "a path such as /health"],
        [
          { nats: { queueGroup: "queue with spaces" } },
          "nats.queueGroup",
          "letters, digits, '_', '.' or '-'",
        ],
        [{ databaseName: "db.dot" }, "databaseName", "letters, digits, '_' or '-'"],
        [{ stack: "stack.with.dots" }, "stack", "letters, digits, '_' or '-'"],
        [
          { image: "image with spaces" },
          "image",
          "an image reference such as ghcr.io/acme/app:1.0",
        ],
      ];

      for (const [partial, fieldName, patternHint] of invalidFields) {
        const errors = validateGeneratedStringFields(partial, "service.json");
        expect(
          errors.some((e) => e.startsWith(`service.json.${fieldName}: must be ${patternHint}`)),
          `Failed for field ${fieldName}`,
        ).toBe(true);
      }
    });

    it("detects control characters in nested object keys and array values", () => {
      const manifestWithBadKey = {
        "root\nkey": "value",
        nested: {
          "nested\rkey": "value",
        },
      };
      const keyErrors = validateGeneratedStringFields(manifestWithBadKey, "service.json");
      expect(keyErrors).toContain("service.json: a key contains a line break");
      expect(keyErrors).toContain("service.json.nested: a key contains a line break");

      const manifestWithUnicodeControls = {
        params: {
          del: "val\x7f",
          nel: "val\x85",
          lineSep: "val\u2028",
          parSep: "val\u2029",
          nul: "val\x00",
        },
      };
      const controlErrors = validateGeneratedStringFields(
        manifestWithUnicodeControls,
        "service.json",
      );
      expect(controlErrors.length).toBe(5);
      for (const err of controlErrors) {
        expect(err).toContain("must not contain line breaks or control characters");
      }
    });
  });

  describe("validateServiceManifestFile and generatedFieldErrorsForFile", () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "service-manifest-file-"));
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it("reports missing file in validateServiceManifestFile", () => {
      const missing = join(dir, "nonexistent.json");
      expect(validateServiceManifestFile(missing, "nonexistent.json")).toEqual({
        errors: ["nonexistent.json: file is missing"],
        warnings: [],
      });
    });

    it("reports invalid JSON syntax in validateServiceManifestFile", () => {
      const invalid = join(dir, "broken.json");
      writeFileSync(invalid, "{ invalid json content");
      const result = validateServiceManifestFile(invalid, "broken.json");
      expect(result.errors[0]).toContain("broken.json: invalid JSON (");
      expect(result.warnings).toEqual([]);
    });

    it("validates a well-formed service.json file", () => {
      const file = join(dir, "service.json");
      writeFileSync(file, JSON.stringify(manifestBase()));
      const result = validateServiceManifestFile(file, "service.json");
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.manifest?.appName).toBe("api");
    });

    it("generatedFieldErrorsForFile returns empty array for missing or unparseable files", () => {
      expect(generatedFieldErrorsForFile(join(dir, "missing.json"), "missing.json")).toEqual([]);

      const broken = join(dir, "broken.json");
      writeFileSync(broken, "not json");
      expect(generatedFieldErrorsForFile(broken, "broken.json")).toEqual([]);

      const arrayJson = join(dir, "array.json");
      writeFileSync(arrayJson, "[1, 2, 3]");
      expect(generatedFieldErrorsForFile(arrayJson, "array.json")).toEqual([]);
    });

    it("generatedFieldErrorsForFile returns errors for files with hostile values", () => {
      const hostileFile = join(dir, "hostile.json");
      writeFileSync(
        hostileFile,
        JSON.stringify({ ...manifestBase(), healthCheckPath: "/health\ninjection: true" }),
      );
      const errors = generatedFieldErrorsForFile(hostileFile, "hostile.json");
      expect(errors).toContain(
        "hostile.json.healthCheckPath: must be a path such as /health (no spaces, line breaks or YAML syntax)",
      );
    });
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

  describe("Docker-safe names", () => {
    it.each(["orders", "orders-api", "orders2", "back_office", "a.b", "a__b", "a".repeat(63)])(
      "accepts %j as a stack",
      (name) => expect(isDockerSafeName(name)).toBe(true),
    );
    it("limits appName to 59 characters, because Tilt labels it app.<appName> (63 bytes)", () => {
      expect(dockerNameErrors({ appName: "a".repeat(59) }, "s.json")).toEqual([]);
      expect(dockerNameErrors({ appName: "a".repeat(60) }, "s.json")).toHaveLength(1);
    });
    it.each([
      "",
      "Orders",
      "my service",
      "-x",
      "x-",
      "x--",
      ".x",
      "x/y",
      "x:y",
      "ünï",
      "a".repeat(64),
      7,
      null,
    ])("refuses %j", (name) => expect(isDockerSafeName(name)).toBe(false));
    it("reports appName and stack without echoing a long value", () => {
      const errors = dockerNameErrors(
        { appName: "A".repeat(100), stack: "Shop" },
        "svc/service.json",
      );
      expect(errors).toHaveLength(2);
      expect(errors[0]).toContain("svc/service.json.appName");
      expect(errors[0].length).toBeLessThan(260);
    });
    it("is part of validateServiceManifest, and skips a local-process service", () => {
      const base = { appType: "backend", schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION };
      expect(
        validateServiceManifest({ ...base, appName: "Orders", stack: "shop" }, "s.json").errors,
      ).toEqual([expect.stringContaining("appName")]);
      expect(
        validateServiceManifest({ ...base, appName: "Orders", command: "node x.js" }, "s.json")
          .errors,
      ).toEqual([]);
    });
  });
});

describe("secretConflictWarnings", () => {
  const file = "services/main/api/service.json";

  it("warns when params or env sets a name that secrets also declares", () => {
    const warnings = secretConflictWarnings(
      {
        secrets: { required: ["ADMIN_PASSWORD"], optional: ["TOKEN"] },
        params: { ADMIN_PASSWORD: "changeme", OTHER: "x" },
        env: { TOKEN: "t" },
      },
      file,
    );
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("params.ADMIN_PASSWORD");
    expect(warnings[1]).toContain("env.TOKEN");
  });

  it("is quiet when the names differ, or the shapes are not the expected ones", () => {
    expect(
      secretConflictWarnings({ secrets: { required: ["A"] }, params: { B: "1" } }, file),
    ).toEqual([]);
    expect(secretConflictWarnings({ secrets: "A", params: { A: "1" } }, file)).toEqual([]);
    expect(secretConflictWarnings({ secrets: { required: ["A"] }, params: ["A"] }, file)).toEqual(
      [],
    );
    expect(secretConflictWarnings({}, file)).toEqual([]);
  });
});

describe("secretsErrors", () => {
  const file = "services/main/api/service.json";

  it("accepts the documented shape and an absent value", () => {
    expect(secretsErrors({}, file)).toEqual([]);
    expect(secretsErrors({ secrets: null }, file)).toEqual([]);
    expect(secretsErrors({ secrets: { required: ["A_KEY", "_b2"], optional: [] } }, file)).toEqual(
      [],
    );
  });

  it.each([
    [{ secrets: "A_KEY" }, "secrets: expected an object"],
    [{ secrets: ["A_KEY"] }, "secrets: expected an object"],
    [{ secrets: { required: "A_KEY" } }, "secrets.required: expected a list"],
    [{ secrets: { optional: 7 } }, "secrets.optional: expected a list"],
    [{ secrets: { required: ["1BAD"] } }, '"1BAD" is not an environment variable name'],
    [{ secrets: { required: ["A-B"] } }, '"A-B"'],
    [{ secrets: { required: [""] } }, '""'],
    [{ secrets: { required: [7] } }, "7 is not an environment variable name"],
    [{ secrets: { required: ["A${B}"] } }, "is not an environment variable name"],
  ])("rejects %j", (manifest, message) => {
    const errors = secretsErrors(manifest, file);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(message);
  });
});

describe("containerErrors", () => {
  const file = "services/main/vpn/service.json";
  const byo = (container: unknown) => ({ appType: "bring-your-own", container });

  it("accepts the Compose options a real image needs, and an absent value", () => {
    expect(containerErrors({ appType: "bring-your-own" }, file)).toEqual([]);
    expect(
      containerErrors(
        byo({
          capAdd: ["NET_ADMIN"],
          capDrop: ["ALL"],
          init: false,
          readOnly: true,
          user: "10001:10001",
          securityOpt: ["no-new-privileges:true"],
          shmSize: "256mb",
        }),
        file,
      ),
    ).toEqual([]);
  });

  it("refuses container on a resource Flisk builds itself", () => {
    expect(containerErrors({ appType: "backend", container: { readOnly: true } }, file)).toEqual([
      `${file}.container: only applies to bring-your-own resources (appType "bring-your-own")`,
    ]);
  });

  it.each([
    [byo("NET_ADMIN"), "container: expected an object"],
    [byo({ capAdd: "NET_ADMIN" }), "container.capAdd: expected a list"],
    [byo({ capAdd: ["net_admin"] }), "container.capAdd: expected a list"],
    [byo({ capDrop: ["ALL\nprivileged: true"] }), "container.capDrop: expected a list"],
    [byo({ readOnly: "yes" }), "container.readOnly: expected true or false"],
    [byo({ init: 1 }), "container.init: expected true or false"],
    [byo({ user: "root\nprivileged: true" }), "container.user: expected a user"],
    [byo({ securityOpt: ['seccomp="x"'] }), "container.securityOpt: expected a list"],
    [byo({ shmSize: "lots" }), "container.shmSize: expected a size"],
    [byo({ privileged: true }), "container.privileged: unknown option"],
  ])("reports %j", (manifest, message) => {
    const errors = containerErrors(manifest, file);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(message);
  });

  it("is part of validateServiceManifest", () => {
    const result = validateServiceManifest(
      {
        appName: "vpn",
        appType: "bring-your-own",
        stack: "main",
        schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION,
        image: "example/vpn:1",
        container: { capAdd: ["NET_ADMIN"] },
      },
      file,
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe("extraPortsErrors", () => {
  const file = "services/main/caddy/service.json";
  const byo = (extraPorts: unknown, more: Record<string, unknown> = {}) => ({
    appType: "bring-your-own",
    extraPorts,
    ...more,
  });

  it("accepts a proxy on 80 and 443, and an absent value", () => {
    expect(extraPortsErrors({ appType: "bring-your-own" }, file)).toEqual([]);
    expect(
      extraPortsErrors(
        byo([
          { port: 80 },
          { port: 443, hostPort: 8443, protocol: "tcp" },
          { port: 443, protocol: "udp" },
        ]),
        file,
      ),
    ).toEqual([]);
  });

  it.each([
    [byo(80), "extraPorts: expected a list"],
    [{ appType: "backend", extraPorts: [{ port: 80 }] }, "only applies to bring-your-own"],
    [byo([80]), "extraPorts[0]: expected an object"],
    [byo([{ port: 0 }]), "extraPorts[0].port: expected a port number"],
    [byo([{ port: "80" }]), "extraPorts[0].port: expected a port number"],
    [byo([{ port: 80, hostPort: 70000 }]), "extraPorts[0].hostPort: expected a port number"],
    [byo([{ port: 53, protocol: "sctp" }]), "extraPorts[0].protocol: expected tcp or udp"],
    [byo([{ port: 80, bind: "0.0.0.0" }]), "extraPorts[0].bind: unknown option"],
    [
      byo([{ port: 80 }, { port: 8080, hostPort: 80 }]),
      "extraPorts[1].hostPort: 80/tcp is published twice",
    ],
    [byo([{ port: 80 }], { replicas: 2 }), "extraPorts: needs a single container"],
  ])("reports %j", (manifest, message) => {
    const errors = extraPortsErrors(manifest, file);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(message);
  });
});

describe("sidecarErrors", () => {
  const file = "services/main/bgutil/service.json";
  const byo = (more: Record<string, unknown>) => ({
    appName: "bgutil",
    appType: "bring-your-own",
    ...more,
  });

  it("accepts a sidecar of another resource, and an absent value", () => {
    expect(sidecarErrors(byo({}), file)).toEqual([]);
    expect(sidecarErrors(byo({ sidecarOf: "tubehaus" }), file)).toEqual([]);
  });

  it.each([
    [{ appType: "backend", sidecarOf: "tubehaus" }, "only applies to bring-your-own"],
    [byo({ sidecarOf: 7 }), "expected the appName"],
    [byo({ sidecarOf: "Tube Haus" }), "expected the appName"],
    [byo({ sidecarOf: 'x"\nprivileged: true' }), "expected the appName"],
    [byo({ sidecarOf: "bgutil" }), "cannot name the resource itself"],
    [byo({ sidecarOf: "tubehaus", extraPorts: [{ port: 4416 }] }), "has no ports of its own"],
    [byo({ sidecarOf: "tubehaus", replicas: 2 }), "needs a single container"],
  ])("reports %j", (manifest, message) => {
    const errors = sidecarErrors(manifest, file);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(message);
  });
});

describe("volumesErrors", () => {
  const file = "services/tube/tubehaus/service.json";
  const byo = (volumes: unknown) => ({ appType: "bring-your-own", volumes });

  it("accepts named volumes, bind mounts and read-only, and an absent value", () => {
    expect(volumesErrors({ appType: "bring-your-own" }, file)).toEqual([]);
    expect(
      volumesErrors(
        byo([
          { source: "tubehaus-data", target: "/data" },
          { source: "./config", target: "/etc/app", readOnly: true },
          { source: "../shared/web", target: "/srv/web", readOnly: true },
        ]),
        file,
        3,
      ),
    ).toEqual([]);
  });

  it.each([
    [byo("data:/data"), "volumes: expected a list"],
    [
      { appType: "backend", volumes: [{ source: "data", target: "/data" }] },
      "only applies to bring-your-own",
    ],
    [byo(["data:/data"]), "volumes[0]: expected an object"],
    [byo([{ source: "/etc", target: "/etc" }]), "volumes[0].source: expected a volume name"],
    [byo([{ source: "Data", target: "/data" }]), "volumes[0].source: expected a volume name"],
    [
      byo([{ source: "data\nprivileged: true", target: "/data" }]),
      "volumes[0].source: expected a volume name",
    ],
    [byo([{ source: "data", target: "data" }]), "volumes[0].target: expected an absolute path"],
    [
      byo([{ source: "data", target: "/data/../etc" }]),
      "volumes[0].target: expected an absolute path",
    ],
    [
      byo([
        { source: "a", target: "/data" },
        { source: "b", target: "/data" },
      ]),
      "/data is mounted twice",
    ],
    [
      byo([{ source: "data", target: "/data", readOnly: "yes" }]),
      "volumes[0].readOnly: expected true or false",
    ],
    [
      byo([{ source: "data", target: "/data", driver: "nfs" }]),
      "volumes[0].driver: unknown option",
    ],
  ])("reports %j", (manifest, message) => {
    const errors = volumesErrors(manifest, file, 3);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(message);
  });

  it("refuses a bind mount that climbs out of the project, once its location is known", () => {
    const climbing = byo([{ source: "../../../../etc", target: "/host-etc" }]);
    expect(volumesErrors(climbing, file)).toEqual([]);
    expect(volumesErrors(climbing, file, 3)).toEqual([
      `${file}.volumes[0].source: must stay inside the project`,
    ]);
    expect(volumesErrors(byo([{ source: "../../..", target: "/project" }]), file, 3)).toEqual([]);
  });
});
