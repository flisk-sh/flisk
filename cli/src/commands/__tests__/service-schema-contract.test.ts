// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import { BACKEND_FRAMEWORKS } from "../../backend-frameworks/registry.js";
import { BACKEND_LANGUAGES } from "../../backend-languages/registry.js";
import { FRONTEND_FRAMEWORKS } from "../../frontend-frameworks/registry.js";
import {
  CREATABLE_RESOURCE_TYPES,
  RESOURCE_CONFIG_APP_TYPES,
  type ResourceConfigFields,
} from "../../types/index.js";
import { RESOURCE_FEATURES } from "../../utils/resource-features.js";
import { validateServiceManifest } from "../../utils/service-manifest.js";
import { createByoServiceJson, createServiceJson } from "../resource.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const schema = JSON.parse(
  readFileSync(join(repoRoot, "engine", "schemas", "service-schema.json"), "utf-8"),
);
const publishWorkflow = readFileSync(
  join(repoRoot, ".github", "workflows", "publish-service-schema.yml"),
  "utf-8",
);

const frameworkIds = [...Object.keys(FRONTEND_FRAMEWORKS), ...Object.keys(BACKEND_FRAMEWORKS)];
const languageIds = Object.keys(BACKEND_LANGUAGES);
const ajv = new Ajv({ strict: false });
const validateService = ajv.compile(schema);
const manifest = (fields: Record<string, unknown>) => ({
  stack: "shop",
  schemaVersion: 1,
  ...fields,
});
const RESOURCE_CONFIG_FIELDS = [
  "appName",
  "appType",
  "stack",
  "schemaVersion",
  "port",
  "replicas",
  "runtime",
  "featuresEnabled",
  "dependsOn",
  "enabled",
  "basePath",
  "backendName",
  "apiPath",
  "healthCheckPath",
  "smoke",
  "traefik",
  "sablier",
  "dockerfile",
  "image",
  "exposeViaProxy",
  "agent",
] as const satisfies readonly (keyof ResourceConfigFields)[];
type ResourceConfigFieldsAreComplete =
  Exclude<keyof ResourceConfigFields, (typeof RESOURCE_CONFIG_FIELDS)[number]> extends never
    ? true
    : false;
const resourceConfigFieldsAreComplete: ResourceConfigFieldsAreComplete = true;

// The CLI provider registries are the contract: the CLI rejects an unknown id before it writes a resource. The JSON Schema is only
// an editor hint, so adding a provider must not require touching its open framework/language fields.
describe("service-schema.json stays independent of the provider registries", () => {
  it("tracks ResourceConfig fields, app types, and registered feature names", () => {
    expect(resourceConfigFieldsAreComplete).toBe(true);
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining([...RESOURCE_CONFIG_FIELDS]),
    );
    expect(schema.properties.appType.enum).toEqual(
      expect.arrayContaining([...RESOURCE_CONFIG_APP_TYPES]),
    );
    expect(schema.properties.appType.enum).toHaveLength(RESOURCE_CONFIG_APP_TYPES.length);
    expect(schema.properties.type.enum).toEqual(schema.properties.appType.enum);
    expect(schema.properties.featuresEnabled.items.enum).toEqual(
      expect.arrayContaining([...Object.keys(RESOURCE_FEATURES), "nats"]),
    );
    const checkPropertyDescriptions = (objectSchema: { properties?: Record<string, unknown> }) => {
      for (const [name, property] of Object.entries(objectSchema.properties ?? {})) {
        expect(
          (property as { description?: string }).description,
          `${name} description`,
        ).toBeTruthy();
        checkPropertyDescriptions(property as { properties?: Record<string, unknown> });
      }
    };
    checkPropertyDescriptions(schema);
  });

  it("validates all service manifests created by the resource generators", () => {
    const generatedServices = [
      ...CREATABLE_RESOURCE_TYPES.map((type, index) =>
        type === "bring-your-own"
          ? createByoServiceJson("test-byo", "shop", 4500, {
              healthCheckPath: "/health",
              dockerfile: "Dockerfile",
            })
          : createServiceJson(
              `test-${type}`,
              type,
              "shop",
              (type === "frontend" ? 3000 : 4000) + index,
              type === "worker" ? ["nats"] : [],
            ),
      ),
      ...Object.keys(FRONTEND_FRAMEWORKS).map((framework, index) =>
        createServiceJson(
          `test-frontend-${framework}`,
          "frontend",
          "shop",
          3000 + index,
          [],
          framework,
        ),
      ),
      ...Object.keys(BACKEND_FRAMEWORKS).map((framework, index) =>
        createServiceJson(
          `test-backend-${framework}`,
          "backend",
          "shop",
          4000 + index,
          [],
          framework,
        ),
      ),
      ...Object.keys(BACKEND_LANGUAGES).map((language, index) =>
        createServiceJson(
          `test-backend-${language}`,
          "backend",
          "shop",
          4500 + index,
          [],
          undefined,
          language,
        ),
      ),
    ];

    for (const service of generatedServices) {
      expect(validateService(service), JSON.stringify(validateService.errors)).toBe(true);
    }
  });

  it("accepts the NATS feature used by existing service manifests", () => {
    expect(
      validateService(
        manifest({
          appName: "orders-api",
          appType: "backend",
          port: 4000,
          featuresEnabled: ["nats"],
        }),
      ),
    ).toBe(true);
  });

  it("validates supported post-start smoke checks", () => {
    expect(
      validateService(
        manifest({
          appName: "orders-api",
          appType: "backend",
          port: 4000,
          smoke: {
            via: "proxy",
            steps: [{ name: "health", path: "/health", expect: 200 }],
          },
        }),
      ),
    ).toBe(true);
  });

  it("bounds backend ports to the range the engine allocates", () => {
    for (const port of [4000, 5999]) {
      expect(validateService(manifest({ appName: "api", appType: "backend", port }))).toBe(true);
    }
    for (const port of [0, 3999, 6000, 65536, 1.5]) {
      expect(validateService(manifest({ appName: "api", appType: "backend", port }))).toBe(false);
    }
  });

  it("keeps the rules for required fields", () => {
    expect(validateService({ appName: "api", appType: "backend", port: 4000 })).toBe(false);
    expect(validateService(manifest({ appName: "api", port: 4000 }))).toBe(false);
  });

  it("accepts the legacy `type` alias when appType is absent", () => {
    expect(validateService(manifest({ appName: "legacy-api", type: "backend", port: 4000 }))).toBe(
      true,
    );
  });

  it("treats `$schema` as editor metadata during service-manifest discovery", () => {
    const result = validateServiceManifest(
      {
        $schema: schema.$id,
        appName: "api",
        appType: "backend",
        stack: "shop",
        schemaVersion: 1,
      },
      "service.json",
    );
    expect(result.warnings).toEqual([]);
  });

  it("accepts every registered framework and language id with its open pattern", () => {
    const framework = new RegExp(schema.properties.framework.pattern);
    const language = new RegExp(schema.properties.language.pattern);
    for (const id of frameworkIds) expect(id, `framework ${id}`).toMatch(framework);
    for (const id of languageIds) expect(id, `language ${id}`).toMatch(language);
    expect(schema.properties.framework.enum).toBeUndefined();
    expect(schema.properties.language.enum).toBeUndefined();
  });

  it("keeps `examples` a short hint that names real providers, not a catalog to edit per provider", () => {
    for (const field of ["framework", "language"] as const) {
      const examples: string[] = schema.properties[field].examples;
      const registered = field === "framework" ? frameworkIds : languageIds;
      expect(
        examples.length,
        `${field} examples are a hint, not a list of every provider`,
      ).toBeLessThanOrEqual(3);
      for (const id of examples) expect(registered, `${field} example ${id}`).toContain(id);
    }
  });

  it("describes the ids as coming from the CLI registry", () => {
    expect(schema.properties.framework.description).toMatch(/registr(y|ies)/i);
    expect(schema.properties.language.description).toMatch(/registr(y|ies)/i);
  });
});

describe("publishing the schema from main", () => {
  it("only publishes after a change lands on main, never from a pull request", () => {
    expect(publishWorkflow).toMatch(/push:\s*\n\s*branches: \[main\]/);
    expect(publishWorkflow).not.toContain("pull_request");
  });

  it("reports whether the live copy matches main, so a missing token is not a silent success", () => {
    expect(publishWorkflow).toContain("Report whether the published schema matches main");
    expect(publishWorkflow).toContain("https://tdk-landscape.github.io/schema.service.json");
    expect(publishWorkflow).toContain("GITHUB_STEP_SUMMARY");
  });
});

describe("bring-your-own health path", () => {
  const byo = manifest({
    appName: "postgres",
    appType: "bring-your-own",
    port: 4500,
    dockerfile: "Dockerfile",
  });

  it("accepts a bring-your-own service without healthCheckPath, for a service that is not HTTP", () => {
    expect(validateService(byo)).toBe(true);
  });

  it("still requires port for a bring-your-own service", () => {
    const withoutPort: Record<string, unknown> = { ...byo };
    delete withoutPort.port;
    expect(validateService(withoutPort)).toBe(false);
  });

  it("keeps the healthCheckPath pattern when a bring-your-own service sets one", () => {
    expect(validateService({ ...byo, healthCheckPath: "/health" })).toBe(true);
    expect(validateService({ ...byo, healthCheckPath: "health" })).toBe(false);
  });
});
