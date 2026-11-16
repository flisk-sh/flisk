// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { existsSync, readFileSync } from "node:fs";
import { type HealthCheckObjectConfig, RESOURCE_CONFIG_APP_TYPES } from "../types/index.js";
import { FRONTEND_FRAMEWORK_IDS } from "./frontend-framework-ids.js";
import { isGenerateName, parseGenerateSpec } from "./generated-secrets.js";
import { isPlainObject } from "./is-plain-object.js";
import { declaresCommand, serviceLabel, validateNativeServiceFields } from "./native-service.js";
import { buildArgsErrors, envFileErrors, loggingErrors } from "./service-manifest-build-env.js";
import { CONTAINER_WORD_FIELD, containerErrors } from "./service-manifest-container.js";
import { dependsOnErrors } from "./service-manifest-depends-on.js";
import { extraPortsErrors } from "./service-manifest-ports.js";
import { ENV_NAME_PATTERN, hasLineBreakOrControl } from "./service-manifest-shared.js";
import { volumesErrors } from "./service-manifest-volumes.js";
import { validateSmoke } from "./smoke.js";

// The container option checks live in utils/service-manifest-container.ts; re-exported for existing importers.
export {
  buildArgsErrors,
  containerErrors,
  dependsOnErrors,
  envFileErrors,
  extraPortsErrors,
  loggingErrors,
  volumesErrors,
};

export const SERVICE_MANIFEST_SCHEMA_VERSION = 1;
export const SERVICE_MANIFEST_SCHEMA_URL = "https://flisk.sh/schema.service.json";

/**
 * A frontend's `basePath`, as in the schema (runtime/engine/schemas/service-schema.json). `flisk resource --base-path` checks
 * the same pattern, so a resource it creates is never reported invalid by `flisk config verify`.
 */
export const BASE_PATH_PATTERN = /^\/[a-z0-9/-]*$/;

/**
 * Fields that are still read, or still tolerated, but should not be used. The warning says what replaces each one. `jwtSecret` is
 * ignored outright: a secret must not be committed (see docs/environment.md).
 */
const DEPRECATED_FIELDS: Record<string, string> = {
  dependencies: "deprecated, use dependsOn (still read for now)",
  envVars: "deprecated, use params (still read when params is absent)",
  jwtSecret:
    "ignored. A secret must not be committed: remove it and set JWT_SECRET in the project .env",
};

const KNOWN_SERVICE_FIELDS = new Set([
  "$schema",
  "agent",
  "apiBasePath",
  "apiPath",
  "appName",
  "appType",
  "backendName",
  "basePath",
  "build",
  "buildArgs",
  "buildContext",
  "command",
  "configs",
  "container",
  "databaseName",
  "dependencies",
  "dev",
  "dependsOn",
  "dockerfile",
  "enabled",
  "env",
  "envFile",
  "exposeViaProxy",
  "extraPorts",
  "featuresEnabled",
  "framework",
  "healthCheck",
  "healthCheckPath",
  "image",
  "language",
  "logging",
  "models",
  "name",
  "nats",
  "params",
  "profiles",
  "playwright",
  "provides",
  "providers",
  "port",
  "replicas",
  "restart",
  "runtime",
  "sablier",
  "schemaVersion",
  "secrets",
  "sidecarOf",
  "smoke",
  "stack",
  "syncs",
  "toolchain",
  "traefik",
  "type",
  "volumes",
  "webUi",
]);

/**
 * String fields written into the generated Docker Compose, Traefik and NATS config as they are. A newline or YAML syntax in one of
 * them adds keys to the generated service (GHSA-phgf-pww4-7jxc), so each must match its pattern. Empty values are treated as unset.
 * `tilt up` reads service.json without this CLI, so engine/topologies/tilt/manifest/parser.star enforces the same rules.
 */
const GENERATED_STRING_FIELDS: ReadonlyArray<{
  path: readonly string[];
  pattern: RegExp;
  expected: string;
}> = [
  { path: ["healthCheckPath"], pattern: /^\/[a-z0-9/-]*$/, expected: "a path such as /health" },
  { path: ["healthCheck", "path"], pattern: /^\/[a-z0-9/-]*$/, expected: "a path such as /health" },
  { path: ["apiPath"], pattern: /^\/[A-Za-z0-9._~/-]*$/, expected: "a path such as /api/v1" },
  { path: ["apiBasePath"], pattern: /^\/[A-Za-z0-9._~/-]*$/, expected: "a path such as /api/v1" },
  {
    path: ["traefik", "host"],
    pattern: /^[A-Za-z0-9.-]+$/,
    expected: "a hostname such as shop.backend.myproject.local",
  },
  {
    path: ["traefik", "pathPrefix"],
    pattern: /^\/[a-z0-9/-]*$/,
    expected: "a path such as /api/v1/shop-management",
  },
  {
    path: ["traefik", "healthCheck"],
    pattern: /^\/[a-z0-9/-]*$/,
    expected: "a path such as /health",
  },
  {
    path: ["nats", "queueGroup"],
    pattern: /^[A-Za-z0-9_.-]+$/,
    expected: "letters, digits, '_', '.' or '-'",
  },
  { path: ["databaseName"], pattern: /^[A-Za-z0-9_-]+$/, expected: "letters, digits, '_' or '-'" },
  { path: ["stack"], pattern: /^[A-Za-z0-9_-]+$/, expected: "letters, digits, '_' or '-'" },
  {
    path: ["image"],
    // Compose variables are allowed (postgres:${POSTGRES_VERSION:-18}-alpine); Compose fills them in from the project .env.
    // Mirrors image_reference_ok in engine/.../tilt/manifest/parser.star.
    // `${NAME:?message}` / `${NAME?message}` stop Compose with the message when NAME is unset (any-sync's garage image).
    // The message is printable ASCII without quotes, backslash, braces, `$` or backtick (IMAGE_MESSAGE_CHARS in parser.star).
    pattern:
      /^(?:[A-Za-z0-9._/:@-]|\$\{[A-Za-z_][A-Za-z0-9_]*(?::?-[A-Za-z0-9._/:@-]+|:?\?[A-Za-z0-9 !#%&()*+,./:;<=>?@[\]^_|~-]*)?\})+$/,
    expected:
      "an image reference such as ghcr.io/acme/app:1.0, with variables written as ${NAME}, ${NAME:-default}, ${NAME-default} or ${NAME:?message}",
  },
  { path: ["basePath"], pattern: BASE_PATH_PATTERN, expected: "a path such as /storefront" },
];

/**
 * Errors for generated-output fields whose values could change the generated YAML. The value itself is not echoed, because it may
 * contain the newline that makes it dangerous.
 */
export function validateGeneratedStringFields(
  manifest: Record<string, unknown>,
  displayPath: string,
): string[] {
  const errors: string[] = [];
  const reportedFields = new Set<string>();
  for (const { path, pattern, expected } of GENERATED_STRING_FIELDS) {
    let value: unknown = manifest;
    for (const key of path) {
      value =
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)[key]
          : undefined;
    }
    if (value === undefined || value === null || value === "") continue;
    const field = `${displayPath}.${path.join(".")}`;
    if (typeof value !== "string" || !pattern.test(value)) reportedFields.add(field);
    if (typeof value !== "string") {
      errors.push(`${field}: expected a string`);
    } else if (!pattern.test(value)) {
      errors.push(`${field}: must be ${expected} (no spaces, line breaks or YAML syntax)`);
    }
  }
  for (const [field, message] of lineBreakErrors(manifest, displayPath)) {
    if (!reportedFields.has(field)) errors.push(`${field}: ${message}`);
  }
  return errors;
}

/**
 * Many more service.json values than GENERATED_STRING_FIELDS reach the generated YAML (port, appName, dockerfile, buildContext,
 * basePath, envVars, ...). A key can only be added through a line break, so no string key or value may contain one. `smoke` is
 * skipped: the CLI sends it over HTTP and it is never written into generated config.
 */
function lineBreakErrors(
  manifest: Record<string, unknown>,
  displayPath: string,
): Array<[string, string]> {
  const errors: Array<[string, string]> = [];
  const pending: Array<[unknown, string]> = Object.entries(manifest)
    .filter(([key]) => key !== "smoke")
    .map(([key, value]) => [value, `${displayPath}.${key}`]);
  for (const key of Object.keys(manifest)) {
    if (hasLineBreakOrControl(key)) errors.push([displayPath, "a key contains a line break"]);
  }
  while (pending.length > 0) {
    const [value, field] = pending.pop() as [unknown, string];
    if (typeof value === "string") {
      if (hasLineBreakOrControl(value) && !CONTAINER_WORD_FIELD.test(field)) {
        errors.push([field, "must not contain line breaks or control characters"]);
      }
    } else if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) pending.push([item, `${field}[${index}]`]);
    } else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        if (hasLineBreakOrControl(key)) {
          errors.push([field, "a key contains a line break"]);
        } else {
          pending.push([item, `${field}.${key}`]);
        }
      }
    }
  }
  return errors.sort(([a], [b]) => a.localeCompare(b));
}

/**
 * `appName` and `stack` end up in a Docker image name (`<project>_<stack>_<appName>:dev`), a Compose service and a container
 * name. Docker refuses a repository name with an uppercase letter, a space or a leading, trailing or doubled separator, and
 * Tilt then fails inside `docker_compose` after `flisk up` said all was well. 63 is the DNS label limit the Traefik host uses.
 */
const DOCKER_NAME = /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/;
/** Tilt labels every service `app.<appName>`, and a label is at most 63 bytes; a stack has no such prefix. */
const DOCKER_NAME_MAX = { appName: 59, stack: 63 } as const;

export function isDockerSafeName(value: unknown, max: number = DOCKER_NAME_MAX.stack): boolean {
  return typeof value === "string" && value.length <= max && DOCKER_NAME.test(value);
}

/** Errors for an `appName` or `stack` that Docker cannot name an image after. A `command` service never reaches Docker. */
export function dockerNameErrors(manifest: Record<string, unknown>, displayPath: string): string[] {
  if (declaresCommand(manifest)) return [];
  const errors: string[] = [];
  for (const field of ["appName", "stack"] as const) {
    const value = manifest[field];
    if (typeof value !== "string" || isDockerSafeName(value, DOCKER_NAME_MAX[field])) continue;
    // The value is not echoed: it may hold the line break that makes a service.json dangerous (see lineBreakErrors).
    errors.push(
      `${displayPath}.${field}: cannot be a Docker image name; use lowercase letters and digits joined by "-", "_" or "." (at most ${DOCKER_NAME_MAX[field]} characters)`,
    );
  }
  return errors;
}

type FieldKind = "string" | "boolean" | "object" | "string[]";

/**
 * The types the engine reads these fields as (runtime/engine/schemas/service-schema.json). A value of another type is not
 * ignored: the Tiltfile calls `.get` on an object field or `+` on a string field and stops with a Starlark error
 * ("string has no .get field or method"), after `flisk up` has already said yes. `null` reads as unset, as it does there.
 * Only fields whose shape is unambiguous are listed: `syncs`, `secrets`, `playwright`, `runtime` and `dev` are written in forms the
 * published schema does not describe, so they stay as they are. Fields checked in validateServiceManifest (appName, appType,
 * stack, port, schemaVersion, dependsOn, smoke, healthCheckPath, the command-service fields) are not repeated.
 */
const FIELD_KINDS: Readonly<Record<string, FieldKind>> = {
  apiBasePath: "string",
  backendName: "string",
  buildContext: "string",
  databaseName: "string",
  dockerfile: "string",
  framework: "string",
  image: "string",
  language: "string",
  restart: "string",
  enabled: "boolean",
  exposeViaProxy: "boolean",
  webUi: "boolean",
  agent: "object",
  build: "object",
  nats: "object",
  params: "object",
  sablier: "object",
  traefik: "object",
  featuresEnabled: "string[]",
};

const REPLICAS_MAX = 10;
const DATABASE_NAME_MAX = 63;

/**
 * An absolute path or a Windows drive. Build paths are relative to the service directory (the loader joins them to it), so an
 * absolute one can never resolve. `..` is allowed on purpose: a service.json inside the project may build from a source tree
 * outside it (docs/layout.md, docs/byo.md), and `flisk import` writes exactly that for a Compose service whose Dockerfile stays
 * where it was.
 */
export function isAbsoluteBuildPath(value: string): boolean {
  return /^([\\/]|[A-Za-z]:)/.test(value);
}

/** Errors for a field of the wrong type, an enum value that does not exist, an escaping path, or a conflicting source. */
export function fieldTypeErrors(manifest: Record<string, unknown>, displayPath: string): string[] {
  if (declaresCommand(manifest)) return [];
  const errors: string[] = [];
  const bad = (field: string, expected: string): void => {
    errors.push(`${displayPath}.${field}: expected ${expected}`);
  };
  for (const [field, kind] of Object.entries(FIELD_KINDS)) {
    const value = manifest[field];
    if (value === undefined || value === null) continue;
    if (kind === "string" && typeof value !== "string") bad(field, "a string");
    else if (kind === "boolean" && typeof value !== "boolean") bad(field, "true or false");
    else if (kind === "object" && !isPlainObject(value)) bad(field, "an object");
    else if (
      kind === "string[]" &&
      !(Array.isArray(value) && value.every((entry) => typeof entry === "string"))
    ) {
      bad(field, "an array of strings");
    }
  }
  const replicas = manifest.replicas;
  if (replicas !== undefined && replicas !== null) {
    if (
      typeof replicas !== "number" ||
      !Number.isInteger(replicas) ||
      replicas < 1 ||
      replicas > REPLICAS_MAX
    ) {
      bad("replicas", `an integer from 1 to ${REPLICAS_MAX}`);
    }
  }
  if (
    typeof manifest.databaseName === "string" &&
    manifest.databaseName.length > DATABASE_NAME_MAX
  ) {
    errors.push(
      `${displayPath}.databaseName: at most ${DATABASE_NAME_MAX} characters (a Postgres identifier)`,
    );
  }
  if (
    manifest.appType === "frontend" &&
    typeof manifest.framework === "string" &&
    !(FRONTEND_FRAMEWORK_IDS as readonly string[]).includes(manifest.framework)
  ) {
    bad("framework", `one of ${FRONTEND_FRAMEWORK_IDS.join(", ")}`);
  }
  if (manifest.appType === "frontend" && typeof replicas === "number" && replicas > 1) {
    // Compose is generated for one frontend container, so Tilt stops looking for "<name>-1" (backends scale; frontends do not).
    errors.push(
      `${displayPath}.replicas: a frontend runs as one container; replicas applies to backend services`,
    );
  }
  if (typeof manifest.language === "string" && !/^[a-z][a-z0-9-]*$/.test(manifest.language)) {
    bad("language", "a lowercase id such as bun, python or go");
  }
  const build = isPlainObject(manifest.build) ? manifest.build : {};
  const dev = isPlainObject(manifest.dev) ? manifest.dev : {};
  const paths: Array<[string, unknown]> = [
    ["dockerfile", manifest.dockerfile],
    ["buildContext", manifest.buildContext],
    ["build.dockerfile", build.dockerfile],
    ["build.context", build.context],
    ...(Array.isArray(dev.watch)
      ? dev.watch.map((entry, i): [string, unknown] => [`dev.watch[${i}]`, entry])
      : []),
  ];
  for (const [field, value] of paths) {
    if (typeof value === "string" && isAbsoluteBuildPath(value)) {
      errors.push(
        `${displayPath}.${field}: must be a path relative to the service directory (no leading "/" or drive)`,
      );
    }
  }
  for (const field of ["dockerfile", "buildContext"] as const) {
    const nested = field === "dockerfile" ? build.dockerfile : build.context;
    if (nested !== undefined && nested !== null && typeof nested !== "string") {
      bad(`build.${field === "dockerfile" ? "dockerfile" : "context"}`, "a string");
    }
  }
  if (
    typeof dev.command !== "undefined" &&
    dev.command !== null &&
    typeof dev.command !== "string"
  ) {
    bad("dev.command", "a string");
  } else if (typeof dev.command === "string" && dev.command.trim() === "") {
    // Worded like an empty top-level command (validateNativeServiceFields), so both read the same (#4191).
    errors.push(
      `${displayPath}: service ${serviceLabel(manifest)}: dev.command must be a non-empty string`,
    );
  }
  if (
    typeof dev.watch !== "undefined" &&
    dev.watch !== null &&
    !(Array.isArray(dev.watch) && dev.watch.every((e) => typeof e === "string"))
  ) {
    bad("dev.watch", "an array of strings");
  }
  if (
    typeof dev.liveReload !== "undefined" &&
    dev.liveReload !== null &&
    typeof dev.liveReload !== "boolean"
  ) {
    bad("dev.liveReload", "true or false");
  }
  if (typeof dev.testOnSave !== "undefined") {
    if (dev.testOnSave === null) {
      bad(
        "dev.testOnSave",
        'true or false, or an object such as { "enabled": true, "path": "tests" }',
      );
    } else if (typeof dev.testOnSave === "boolean") {
      // boolean is valid
    } else if (isPlainObject(dev.testOnSave)) {
      const testOnSave = dev.testOnSave as Record<string, unknown>;
      for (const key of Object.keys(testOnSave)) {
        if (key !== "enabled" && key !== "path") {
          errors.push(
            `${displayPath}.dev.testOnSave: unexpected key "${key}" (expected "enabled" or "path")`,
          );
        }
      }
      if (typeof testOnSave.enabled !== "undefined" && typeof testOnSave.enabled !== "boolean") {
        bad("dev.testOnSave.enabled", "true or false");
      }
      if (
        typeof testOnSave.path !== "undefined" &&
        (typeof testOnSave.path !== "string" || !testOnSave.path.trim())
      ) {
        bad("dev.testOnSave.path", "a non-empty string path such as 'tests'");
      } else if (typeof testOnSave.path === "string" && isAbsoluteBuildPath(testOnSave.path)) {
        errors.push(
          `${displayPath}.dev.testOnSave.path: must be a path relative to the service directory (no leading "/" or drive)`,
        );
      }
    } else {
      bad(
        "dev.testOnSave",
        'true or false, or an object such as { "enabled": true, "path": "tests" }',
      );
    }
  }
  if (
    typeof manifest.image === "string" &&
    manifest.image &&
    typeof manifest.dockerfile === "string" &&
    manifest.dockerfile
  ) {
    errors.push(
      `${displayPath}: set "image" or "dockerfile", not both; a service runs from one source`,
    );
  }
  return errors;
}

export interface ServiceManifestValidation {
  errors: string[];
  warnings: string[];
  manifest?: Record<string, unknown>;
}

const SERVICE_ROUTE_PATH_FIELDS = ["apiPath", "basePath"] as const;

export function getInvalidServiceRoutePathFields(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const manifest = value as Record<string, unknown>;
  return SERVICE_ROUTE_PATH_FIELDS.filter(
    (field) => field in manifest && typeof manifest[field] !== "string",
  );
}

/** `webUi` (#2997) is read for bring-your-own resources only: the app serves pages from `/`, so it gets a host name, not a path prefix. */
export function webUiErrors(manifest: Record<string, unknown>, displayPath: string): string[] {
  if (manifest.webUi === undefined || manifest.webUi === null) return [];
  if (manifest.appType !== "bring-your-own")
    return [
      `${displayPath}.webUi: only applies to bring-your-own resources (appType "bring-your-own")`,
    ];
  if (manifest.webUi === true && manifest.sidecarOf)
    return [
      `${displayPath}.webUi: does not apply to a sidecar (sidecarOf), which has no route of its own`,
    ];
  return [];
}

const RESTART_POLICIES = ["no", "on-failure", "unless-stopped", "always"];

/**
 * `restart` on a bring-your-own resource: no, on-failure, on-failure:N (N from 1 to 100), unless-stopped or always. Mirrors
 * byo_restart_policy in engine/.../compose/byo_container.star.
 */
export function restartErrors(manifest: Record<string, unknown>, displayPath: string): string[] {
  const { restart } = manifest;
  if (restart === undefined || restart === null || manifest.appType !== "bring-your-own") return [];
  if (typeof restart === "string") {
    if (RESTART_POLICIES.includes(restart)) return [];
    const count = /^on-failure:([1-9][0-9]{0,2})$/.exec(restart);
    if (count && Number(count[1]) <= 100) return [];
  }
  return [
    `${displayPath}.restart: expected one of no, on-failure, on-failure:N (N from 1 to 100), unless-stopped, always`,
  ];
}

/**
 * `sidecarOf` (#2908): a bring-your-own resource that shares another resource's network namespace. Mirrors
 * engine/.../compose/byo_sidecar.star. Whether the host exists in the same stack is checked across services (checkSidecars).
 */
export function sidecarErrors(manifest: Record<string, unknown>, displayPath: string): string[] {
  const host = manifest.sidecarOf;
  if (host === undefined || host === null) return [];
  const field = `${displayPath}.sidecarOf`;
  if (manifest.appType !== "bring-your-own") {
    return [`${field}: only applies to bring-your-own resources (appType "bring-your-own")`];
  }
  if (typeof host !== "string" || !/^[a-z0-9][a-z0-9_.-]*$/.test(host)) {
    return [`${field}: expected the appName of another resource in the same stack`];
  }
  const errors: string[] = [];
  if (host === manifest.appName) errors.push(`${field}: cannot name the resource itself`);
  if (Array.isArray(manifest.extraPorts) && manifest.extraPorts.length > 0) {
    errors.push(
      `${field}: a sidecar has no ports of its own; publish extraPorts on "${host}" instead`,
    );
  }
  if (manifest.replicas !== undefined && manifest.replicas !== 1) {
    errors.push(`${field}: needs a single container; remove replicas`);
  }
  return errors;
}

/** A model reference such as ai/smollm2, ai/qwen3:8B-Q4_K_M or hf.co/org/name. */
const MODEL_REFERENCE = "[A-Za-z0-9][A-Za-z0-9._/:@-]*";
/** `models[].model`: a model reference, or a Compose variable `${NAME}`, `${NAME:-<model reference>}` or `${NAME-<model reference>}`. */
const MODEL_VALUE_PATTERN = new RegExp(
  `^(${MODEL_REFERENCE}|\\$\\{[A-Za-z_][A-Za-z0-9_]*(:?-${MODEL_REFERENCE})?\\})$`,
);

/**
 * `models` (Compose / Docker Model Runner): models a bring-your-own resource uses, each `{ "name": "llm", "model": "ai/smollm2" }`.
 * The service gets `models: [llm]` and the stack's Compose file a top-level `models:` entry. `model` is written quoted into the
 * generated YAML, so only a model reference or a Compose variable is accepted. Mirrors engine/.../compose/byo_models.star.
 */
export function modelsErrors(manifest: Record<string, unknown>, displayPath: string): string[] {
  const models = manifest.models;
  if (models === undefined || models === null) return [];
  const field = `${displayPath}.models`;
  if (!Array.isArray(models)) {
    return [`${field}: expected a list such as [{"name": "llm", "model": "ai/smollm2"}]`];
  }
  if (manifest.appType !== "bring-your-own") {
    return [`${field}: only applies to bring-your-own resources (appType "bring-your-own")`];
  }
  const errors: string[] = [];
  const names = new Set<string>();
  models.forEach((entry: unknown, i) => {
    const at = `${field}[${i}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${at}: expected an object such as {"name": "llm", "model": "ai/smollm2"}`);
      return;
    }
    for (const key of Object.keys(entry)) {
      if (key !== "name" && key !== "model")
        errors.push(`${at}.${key}: unknown option (use name, model)`);
    }
    const { name, model } = entry;
    if (typeof name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) {
      errors.push(
        `${at}.name: expected a model name such as llm (letters, digits, '-', '_' and '.')`,
      );
    } else if (names.has(name)) {
      errors.push(`${at}.name: ${name} is listed twice`);
    } else {
      names.add(name);
    }
    if (typeof model !== "string" || !MODEL_VALUE_PATTERN.test(model)) {
      errors.push(
        `${at}.model: expected a model such as ai/smollm2, or a variable such as \${LLM_MODEL} or \${LLM_MODEL:-ai/smollm2}`,
      );
    }
  });
  return errors;
}

/**
 * `env` on a bring-your-own resource (#2923): plain, committed configuration written into the container's Compose `environment`.
 * A command service's `env` is checked with the other command-service fields (validateNativeServiceFields). Mirrors
 * engine/.../compose/byo_env.star.
 */
export function byoEnvErrors(manifest: Record<string, unknown>, displayPath: string): string[] {
  const env = manifest.env;
  if (env === undefined || env === null || manifest.appType !== "bring-your-own") return [];
  if (declaresCommand(manifest)) return [];
  const field = `${displayPath}.env`;
  if (!isPlainObject(env)) return [`${field}: expected an object of string values`];
  const errors: string[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (!ENV_NAME_PATTERN.test(name)) {
      errors.push(
        `${field}.${name}: names must be letters, digits or _, not starting with a digit`,
      );
    } else if (typeof value !== "string") {
      errors.push(`${field}.${name}: expected a string`);
    } else if (hasLineBreakOrControl(value)) {
      errors.push(`${field}.${name}: must not contain line breaks or control characters`);
    }
  }
  return errors;
}

/**
 * `provides`: the connection settings a resource gives the services that list it in `dependsOn` (REDIS_URL for a Redis).
 * Each one is written into the dependent's generated env file, which `flisk config verify` checks and which must hold no
 * secret, so the values are plain URLs and names. Mirrors _dependency_provides_lines in
 * engine/.../orchestrator/generators/env.star.
 */
export function providesErrors(manifest: Record<string, unknown>, displayPath: string): string[] {
  const provides = manifest.provides;
  if (provides === undefined || provides === null) return [];
  const field = `${displayPath}.provides`;
  if (!isPlainObject(provides)) {
    return [`${field}: expected an object such as { "REDIS_URL": "redis://cache:6379" }`];
  }
  const errors: string[] = [];
  for (const [key, value] of Object.entries(provides)) {
    if (!ENV_NAME_PATTERN.test(key)) {
      errors.push(`${field}.${key}: expected an environment variable name such as REDIS_URL`);
    }
    if (typeof value !== "string" || !/^[A-Za-z0-9_\-./:@%+=,]+$/.test(value)) {
      errors.push(`${field}.${key}: expected a URL or value without spaces, quotes or $`);
    }
  }
  return errors;
}

const PROVIDER_KEYS = ["url", "tokenSecret", "fallback", "required"];
const PROVIDER_TYPES = new Set(["backend", "worker", "mcp", "agent", "bring-your-own"]);

/** One entry of `providers`, with `required` resolved: a token is required unless the provider has a local fallback. */
export interface ProviderSpec {
  id: string;
  url: string;
  tokenSecret?: string;
  fallback?: string;
  required: boolean;
}

/** The well-formed entries of `providers` (malformed ones are reported by {@link providersErrors}). */
export function providersOf(manifest: Record<string, unknown> | undefined): ProviderSpec[] {
  const providers = manifest?.providers;
  if (!isPlainObject(providers)) return [];
  return Object.entries(providers).flatMap(([id, entry]) => {
    if (!isPlainObject(entry) || typeof entry.url !== "string") return [];
    const tokenSecret = typeof entry.tokenSecret === "string" ? entry.tokenSecret : undefined;
    const fallback = typeof entry.fallback === "string" ? entry.fallback : undefined;
    const required =
      typeof entry.required === "boolean"
        ? entry.required
        : tokenSecret !== undefined && fallback === undefined;
    return [{ id, url: entry.url, tokenSecret, fallback, required }];
  });
}

/**
 * `providers`: external endpoints a service calls (IBM Quantum, Amazon Braket, a hosted model API) with the secret that holds
 * their token, and optionally a local resource to use while the token is missing. Mirrors
 * engine/.../docker/secrets/providers.star, which refuses the same values.
 */
export function providersErrors(manifest: Record<string, unknown>, displayPath: string): string[] {
  const providers = manifest.providers;
  if (providers === undefined || providers === null) return [];
  const field = `${displayPath}.providers`;
  if (!isPlainObject(providers)) {
    return [`${field}: expected an object such as { "ibm-quantum": { "url": "https://..." } }`];
  }
  if (typeof manifest.command === "string" || !PROVIDER_TYPES.has(String(manifest.appType))) {
    return [
      `${field}: only applies to container services (backend, worker, mcp, agent, bring-your-own)`,
    ];
  }
  const dependsOn = Array.isArray(manifest.dependsOn) ? manifest.dependsOn : [];
  const errors: string[] = [];
  for (const [id, entry] of Object.entries(providers)) {
    const at = `${field}.${id}`;
    if (!/^[a-z][a-z0-9-]*$/.test(id)) {
      errors.push(`${at}: name it in lowercase letters, digits and '-', such as ibm-quantum`);
    }
    if (!isPlainObject(entry)) {
      errors.push(`${at}: expected an object such as { "url": "https://..." }`);
      continue;
    }
    for (const key of Object.keys(entry)) {
      if (!PROVIDER_KEYS.includes(key)) {
        errors.push(`${at}.${key}: unknown option (use ${PROVIDER_KEYS.join(", ")})`);
      }
    }
    if (typeof entry.url !== "string" || !/^https?:\/\/[A-Za-z0-9_\-./:@%+=,~]+$/.test(entry.url)) {
      errors.push(`${at}.url: expected an http(s) URL without spaces, quotes or $`);
    }
    const token = entry.tokenSecret;
    if (token !== undefined && !(typeof token === "string" && ENV_NAME_PATTERN.test(token))) {
      errors.push(
        `${at}.tokenSecret: expected an environment variable name such as IBM_QUANTUM_TOKEN`,
      );
    }
    const fallback = entry.fallback;
    if (fallback !== undefined) {
      if (!(typeof fallback === "string" && /^[a-z][a-z0-9-]*$/.test(fallback))) {
        errors.push(`${at}.fallback: expected a resource name such as quantum-sim`);
      } else if (!dependsOn.includes(fallback)) {
        errors.push(`${at}.fallback: list ${fallback} in dependsOn too, so it starts first`);
      }
    }
    if (entry.required !== undefined && typeof entry.required !== "boolean") {
      errors.push(`${at}.required: expected true or false`);
    } else if (entry.required === true && token === undefined) {
      errors.push(`${at}.required: needs a tokenSecret`);
    }
  }
  return errors;
}

const RESOURCE_FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const RESOURCE_FILE_PATH_PATTERN =
  /^(?!\.$)(?:[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*|\.{1,2}(?:\/[A-Za-z0-9_.-]+)+)$/;
const SECRET_CONFIG_FILE_KEYS = ["name", "source", "target", "uid", "gid", "mode"];
const CONTAINER_TARGET_PATTERN = /^\/[A-Za-z0-9_./-]*$/;

function validateSecretConfigFileEntry(
  entry: unknown,
  field: string,
  kind: "secret" | "config",
): string[] {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return [
      `${field}: expected an object like { "name": "...", "source": "...", "target": "..." }`,
    ];
  }
  const errors: string[] = [];
  const rec = entry as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    if (!SECRET_CONFIG_FILE_KEYS.includes(key)) {
      errors.push(`${field}.${key}: unknown option (use ${SECRET_CONFIG_FILE_KEYS.join(", ")})`);
    }
  }
  const name = rec.name;
  if (typeof name !== "string" || !RESOURCE_FILE_NAME_PATTERN.test(name)) {
    errors.push(
      `${field}.name: ${JSON.stringify(name)} is not a valid ${kind} identifier name (letters, digits, dashes, dots and underscores)`,
    );
  }
  const source = rec.source;
  if (
    typeof source !== "string" ||
    !RESOURCE_FILE_PATH_PATTERN.test(source) ||
    source.includes("/../") ||
    source.endsWith("/..")
  ) {
    errors.push(
      `${field}.source: expected a relative path inside the project such as ./config or ./file.txt`,
    );
  }
  const target = rec.target;
  if (
    target !== undefined &&
    (typeof target !== "string" || !CONTAINER_TARGET_PATTERN.test(target))
  ) {
    errors.push(`${field}.target: expected an absolute container path such as /etc/config`);
  }
  const uid = rec.uid;
  if (uid !== undefined && typeof uid !== "string" && typeof uid !== "number") {
    errors.push(`${field}.uid: expected a string or number user ID`);
  }
  const gid = rec.gid;
  if (gid !== undefined && typeof gid !== "string" && typeof gid !== "number") {
    errors.push(`${field}.gid: expected a string or number group ID`);
  }
  const mode = rec.mode;
  const numericModeOk =
    typeof mode === "number" && Number.isInteger(mode) && mode >= 0 && mode <= 0o7777;
  const stringModeOk = typeof mode === "string" && /^0?[0-7]{3,4}$/.test(mode);
  if (mode !== undefined && !numericModeOk && !stringModeOk) {
    errors.push(`${field}.mode: expected an octal file mode such as 0440, "0440" or 288`);
  }
  return errors;
}

/** `secrets` must be { required?: string[], optional?: string[], generate?: object, files?: array }: the generator fails on anything else. */
export function secretsErrors(manifest: Record<string, unknown>, displayPath: string): string[] {
  const secrets = manifest.secrets;
  if (secrets === undefined || secrets === null) return [];
  if (typeof secrets !== "object" || Array.isArray(secrets))
    return [`${displayPath}.secrets: expected an object like { "required": ["NAME"] }`];
  const errors: string[] = [];
  for (const kind of ["required", "optional"] as const) {
    const names: unknown = (secrets as Record<string, unknown>)[kind];
    if (names === undefined) continue;
    if (!Array.isArray(names)) {
      errors.push(`${displayPath}.secrets.${kind}: expected a list of environment variable names`);
      continue;
    }
    for (const name of names) {
      if (typeof name !== "string" || !ENV_NAME_PATTERN.test(name))
        errors.push(
          `${displayPath}.secrets.${kind}: ${JSON.stringify(name)} is not an environment variable name (letters, digits and underscores, not starting with a digit)`,
        );
    }
  }
  const files: unknown = (secrets as Record<string, unknown>).files;
  if (files !== undefined && files !== null) {
    if (manifest.appType !== "bring-your-own") {
      errors.push(
        `${displayPath}.secrets.files: only applies to bring-your-own resources (appType "bring-your-own")`,
      );
    } else if (!Array.isArray(files)) {
      errors.push(`${displayPath}.secrets.files: expected an array of { name, source, target }`);
    } else {
      for (let i = 0; i < files.length; i++) {
        const field = `${displayPath}.secrets.files[${i}]`;
        errors.push(...validateSecretConfigFileEntry(files[i], field, "secret"));
      }
    }
  }
  errors.push(...generateSecretErrors(manifest, secrets as Record<string, unknown>, displayPath));
  return errors;
}

/** `configs` must be an array of { name, source, target, uid?, gid?, mode? } (#3059). */
export function configsErrors(manifest: Record<string, unknown>, displayPath: string): string[] {
  const configs = manifest.configs;
  if (configs === undefined || configs === null) return [];
  if (manifest.appType !== "bring-your-own") {
    return [
      `${displayPath}.configs: only applies to bring-your-own resources (appType "bring-your-own")`,
    ];
  }
  if (!Array.isArray(configs)) {
    return [`${displayPath}.configs: expected an array of { name, source, target }`];
  }
  const errors: string[] = [];
  for (let i = 0; i < configs.length; i++) {
    const field = `${displayPath}.configs[${i}]`;
    errors.push(...validateSecretConfigFileEntry(configs[i], field, "config"));
  }
  return errors;
}

/** `secrets.generate` (#3140): valid specs, valid names, and no fixed value in `env`/`params` for a generated name. */
function generateSecretErrors(
  manifest: Record<string, unknown>,
  secrets: Record<string, unknown>,
  displayPath: string,
): string[] {
  const generate = secrets.generate;
  if (generate === undefined) return [];
  if (!generate || typeof generate !== "object" || Array.isArray(generate))
    return [`${displayPath}.secrets.generate: expected an object like { "NAME": "hex:32" }`];
  const errors: string[] = [];
  for (const [name, spec] of Object.entries(generate)) {
    if (!isGenerateName(name))
      errors.push(
        `${displayPath}.secrets.generate: ${JSON.stringify(name)} is not an environment variable name (letters, digits and underscores, not starting with a digit)`,
      );
    const parsed = parseGenerateSpec(spec);
    if (typeof parsed === "string")
      errors.push(`${displayPath}.secrets.generate.${name}: ${parsed}`);
    for (const field of ["env", "params"] as const) {
      const values = manifest[field];
      if (values && typeof values === "object" && !Array.isArray(values) && name in values)
        errors.push(
          `${displayPath}.${field}.${name}: also generated by secrets.generate, so this fixed value would replace the generated one; remove one of them`,
        );
    }
  }
  return errors;
}

export function secretConflictWarnings(
  manifest: Record<string, unknown>,
  displayPath: string,
): string[] {
  const secrets = manifest.secrets;
  if (!secrets || typeof secrets !== "object") return [];
  const declared = new Set<string>();
  for (const kind of ["required", "optional"] as const) {
    const names: unknown = (secrets as Record<string, unknown>)[kind];
    if (Array.isArray(names))
      for (const name of names) if (typeof name === "string") declared.add(name);
  }
  const warnings: string[] = [];
  for (const field of ["params", "env"] as const) {
    const values: unknown = manifest[field];
    if (!values || typeof values !== "object" || Array.isArray(values)) continue;
    for (const name of Object.keys(values)) {
      if (declared.has(name))
        warnings.push(
          `${displayPath}.${field}.${name}: also listed in secrets, so this literal value is used and the secret from .env is ignored; remove one of them`,
        );
    }
  }
  return warnings;
}

export interface ParsedHealthCheckConfig {
  enabled: boolean;
  interval?: number;
  timeout?: number;
  retries?: number;
  startPeriod?: number;
  path?: string;
}

const HEALTH_CHECK_CONFIG_KEYS = new Set([
  "enabled",
  "interval",
  "timeout",
  "startPeriod",
  "retries",
  "path",
  "port",
  "command",
]);

/**
 * Validates the optional `healthCheck` field: boolean (e.g. false to disable) or an object
 * configuring enabled, interval, timeout, retries, and path.
 */
export function healthCheckErrors(
  manifest: Record<string, unknown>,
  displayPath: string,
): string[] {
  const value = manifest.healthCheck;
  if (value === undefined || value === null) return [];
  if (typeof value === "boolean") return [];
  if (!isPlainObject(value)) {
    return [
      `${displayPath}.healthCheck: expected true or false, or an object such as { "enabled": true, "path": "/health" }`,
    ];
  }
  const errors: string[] = [];
  const hc = value as Record<string, unknown>;
  for (const key of Object.keys(hc)) {
    if (!HEALTH_CHECK_CONFIG_KEYS.has(key)) {
      errors.push(
        `${displayPath}.healthCheck: unexpected key "${key}" (expected "enabled", "interval", "timeout", "startPeriod", "retries", "path", "port", or "command")`,
      );
    }
  }
  if (hc.enabled !== undefined && typeof hc.enabled !== "boolean") {
    errors.push(`${displayPath}.healthCheck.enabled: expected true or false`);
  }
  if (hc.interval !== undefined) {
    if (typeof hc.interval !== "number" || !Number.isFinite(hc.interval) || hc.interval <= 0) {
      errors.push(`${displayPath}.healthCheck.interval: expected a positive number`);
    }
  }
  if (hc.timeout !== undefined) {
    if (typeof hc.timeout !== "number" || !Number.isFinite(hc.timeout) || hc.timeout <= 0) {
      errors.push(`${displayPath}.healthCheck.timeout: expected a positive number`);
    }
  }
  if (hc.startPeriod !== undefined) {
    if (
      typeof hc.startPeriod !== "number" ||
      !Number.isFinite(hc.startPeriod) ||
      hc.startPeriod <= 0
    ) {
      errors.push(`${displayPath}.healthCheck.startPeriod: expected a positive number`);
    }
  }
  if (hc.retries !== undefined) {
    if (typeof hc.retries !== "number" || !Number.isInteger(hc.retries) || hc.retries < 0) {
      errors.push(`${displayPath}.healthCheck.retries: expected a non-negative integer`);
    }
  }
  if (hc.path !== undefined) {
    if (typeof hc.path !== "string") {
      errors.push(`${displayPath}.healthCheck.path: expected a string`);
    } else if (!/^\/[a-z0-9/-]*$/.test(hc.path)) {
      errors.push(
        `${displayPath}.healthCheck.path: must be a path such as /health (no spaces, line breaks or YAML syntax)`,
      );
    }
  }
  if (hc.port !== undefined) {
    if (
      typeof hc.port !== "number" ||
      !Number.isInteger(hc.port) ||
      hc.port < 1 ||
      hc.port > 65535
    ) {
      errors.push(`${displayPath}.healthCheck.port: expected a port from 1 to 65535`);
    }
  }
  if (hc.command !== undefined) {
    if (
      !Array.isArray(hc.command) ||
      hc.command.length === 0 ||
      !hc.command.every((part) => typeof part === "string" && part.length > 0)
    ) {
      errors.push(
        `${displayPath}.healthCheck.command: expected the program and its arguments, such as ["grpc_health_probe", "-addr=:9090"]`,
      );
    }
  }
  const probes = (["path", "port", "command"] as const).filter((key) => hc[key] !== undefined);
  if (probes.length > 1) {
    errors.push(
      `${displayPath}.healthCheck: set only one of "path", "port" or "command" (got ${probes.map((key) => `"${key}"`).join(" and ")})`,
    );
  }
  return errors;
}

/** How a service shows it is ready: an HTTP path, an open TCP port, or a command that exits 0 (#2875). */
export type ReadinessProbe =
  | { kind: "port"; port: number }
  | { kind: "command"; command: string[] };

/** `healthCheck.port` or `healthCheck.command`, when the service set one instead of an HTTP path. */
export function readinessProbeOf(manifest?: HealthCheckSource): ReadinessProbe | undefined {
  if (isHealthCheckDisabled(manifest)) return undefined;
  const { port, command } = healthCheckObject(manifest);
  if (typeof port === "number" && Number.isInteger(port) && port > 0 && port < 65536) {
    return { kind: "port", port };
  }
  if (
    Array.isArray(command) &&
    command.length > 0 &&
    command.every((part) => typeof part === "string")
  ) {
    return { kind: "command", command: [...command] };
  }
  return undefined;
}

/** A manifest, or the `config` of a discovered resource, as the health check helpers read it. */
type HealthCheckSource =
  | { healthCheck?: unknown; healthCheckPath?: unknown }
  | Readonly<Record<string, unknown>>;

/** The `healthCheck` object of a manifest, or an empty one when it is a boolean or absent. */
function healthCheckObject(manifest?: HealthCheckSource): HealthCheckObjectConfig {
  return isPlainObject(manifest?.healthCheck)
    ? (manifest.healthCheck as HealthCheckObjectConfig)
    : {};
}

/**
 * The one rule for turning health checks off: `healthCheck: false` or `healthCheck: { enabled: false }`.
 * Nothing else disables them: a service without a health path still gets its default readiness
 * signal (its port for a native `command` service, `/health` for a container).
 */
export function isHealthCheckDisabled(manifest?: HealthCheckSource): boolean {
  const value = manifest?.healthCheck;
  return value === false || (isPlainObject(value) && value.enabled === false);
}

/** The HTTP path to probe: `healthCheck.path`, then `healthCheckPath`, then `fallback`. */
export function healthCheckPathOf(
  manifest?: HealthCheckSource,
  fallback?: string,
): string | undefined {
  // A port or command probe replaces the HTTP one.
  if (readinessProbeOf(manifest)) return undefined;
  const path = healthCheckObject(manifest).path;
  if (typeof path === "string") return path;
  return typeof manifest?.healthCheckPath === "string" ? manifest.healthCheckPath : fallback;
}

/**
 * Reads a manifest's health check settings. `enabled` follows {@link isHealthCheckDisabled}; `path` follows
 * {@link healthCheckPathOf} and is absent when neither the manifest nor `options.defaultPath` gives one.
 */
export function parseHealthCheckConfig(
  manifest?: HealthCheckSource,
  options: { defaultPath?: string } = {},
): ParsedHealthCheckConfig {
  if (isHealthCheckDisabled(manifest)) return { enabled: false };
  const { interval, timeout, retries, startPeriod } = healthCheckObject(manifest);
  const path = healthCheckPathOf(manifest, options.defaultPath);
  return {
    enabled: true,
    ...(path !== undefined ? { path } : {}),
    ...(interval !== undefined ? { interval } : {}),
    ...(timeout !== undefined ? { timeout } : {}),
    ...(retries !== undefined ? { retries } : {}),
    ...(startPeriod !== undefined ? { startPeriod } : {}),
  };
}

// App types whose Bun image runs the `dev` script under a watcher (mirrors BUN_LIVE_RELOAD_APP_TYPES in language_dockerfile.star).
const BUN_LIVE_RELOAD_APP_TYPES = new Set(["backend", "worker", "agent", "mcp"]);

function liveReloadApplies(manifest: Record<string, unknown>): boolean {
  const language = manifest.language ?? "bun";
  if (language === "go") return true;
  return language === "bun" && BUN_LIVE_RELOAD_APP_TYPES.has(String(manifest.appType ?? "backend"));
}

const PORT_MIN = 1;
const PORT_MAX = 65535;

/**
 * An appType outside the published enum, or a port that is not an integer from 1 to 65535. Tilt discovery only logs these as
 * warnings during `flisk up` (runtime/discovery/validation.star), so `flisk config verify` reports them first. The schema's
 * per-appType port ranges are not applied here: discovery uses different ranges, so the shared bound is the one both accept.
 */
/** A value short and plain enough to echo in an error (a line break in it could forge a second line, see lineBreakErrors). */
function echoValue(value: unknown): string {
  const text = JSON.stringify(value);
  return text !== undefined && /^[\w".:+-]{1,40}$/.test(text) ? ` ${text}` : "";
}

export function appTypeAndPortErrors(
  manifest: Record<string, unknown>,
  displayPath: string,
): string[] {
  const errors: string[] = [];
  const appType = manifest.appType;
  if (
    typeof appType === "string" &&
    !(RESOURCE_CONFIG_APP_TYPES as readonly string[]).includes(appType)
  ) {
    errors.push(
      `${displayPath}.appType: unknown type${echoValue(appType)}; expected one of ${RESOURCE_CONFIG_APP_TYPES.join(", ")}`,
    );
  }
  const port = manifest.port;
  if (
    port !== undefined &&
    port !== null &&
    !(typeof port === "number" && Number.isInteger(port) && port >= PORT_MIN && port <= PORT_MAX)
  ) {
    errors.push(
      `${displayPath}.port: expected an integer from ${PORT_MIN} to ${PORT_MAX}${echoValue(port) ? `, got${echoValue(port)}` : ""}`,
    );
  }
  return errors;
}

export function validateServiceManifest(
  value: unknown,
  displayPath: string,
): ServiceManifestValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { errors: [`${displayPath}: expected a JSON object`], warnings: [] };
  }

  const manifest = value as Record<string, unknown>;
  const errors: string[] = [];
  // A `command` service runs as a local process, so it has no stack to group generated output by (the minimal contract in
  // utils/native-service.ts). Every other service keeps the full set.
  const requiredFields = declaresCommand(manifest)
    ? (["appName", "appType", "schemaVersion"] as const)
    : (["appName", "appType", "stack", "schemaVersion"] as const);
  for (const field of requiredFields) {
    if (!(field in manifest)) errors.push(`${displayPath}.${field}: required field is missing`);
  }
  for (const field of ["appName", "appType", "stack"] as const) {
    if (field in manifest && typeof manifest[field] !== "string") {
      errors.push(`${displayPath}.${field}: expected a string`);
    }
  }
  errors.push(...appTypeAndPortErrors(manifest, displayPath));
  if ("schemaVersion" in manifest && manifest.schemaVersion !== SERVICE_MANIFEST_SCHEMA_VERSION) {
    errors.push(
      `${displayPath}.schemaVersion: unsupported version ${String(manifest.schemaVersion)} (supported: ${SERVICE_MANIFEST_SCHEMA_VERSION})`,
    );
  }
  for (const field of getInvalidServiceRoutePathFields(manifest)) {
    errors.push(`${displayPath}.${field}: expected a string`);
  }
  const dev = manifest.dev;
  const liveReload =
    dev && typeof dev === "object" && !Array.isArray(dev)
      ? (dev as Record<string, unknown>).liveReload
      : undefined;
  if (liveReload !== undefined && typeof liveReload !== "boolean") {
    errors.push(`${displayPath}.dev.liveReload: expected true or false`);
  }
  errors.push(...validateGeneratedStringFields(manifest, displayPath));
  errors.push(...dockerNameErrors(manifest, displayPath));
  errors.push(...fieldTypeErrors(manifest, displayPath));
  errors.push(...validateNativeServiceFields(manifest).map((error) => `${displayPath}: ${error}`));
  errors.push(...secretsErrors(manifest, displayPath));
  errors.push(...configsErrors(manifest, displayPath));
  errors.push(...containerErrors(manifest, displayPath));
  errors.push(...extraPortsErrors(manifest, displayPath));
  errors.push(...providesErrors(manifest, displayPath));
  errors.push(...providersErrors(manifest, displayPath));
  errors.push(...sidecarErrors(manifest, displayPath));
  errors.push(...volumesErrors(manifest, displayPath));
  errors.push(...envFileErrors(manifest, displayPath));
  errors.push(...modelsErrors(manifest, displayPath));
  errors.push(...restartErrors(manifest, displayPath));
  errors.push(...webUiErrors(manifest, displayPath));
  errors.push(...dependsOnErrors(manifest, displayPath));
  errors.push(...buildArgsErrors(manifest, displayPath));
  errors.push(...loggingErrors(manifest, displayPath));
  errors.push(...byoEnvErrors(manifest, displayPath));
  errors.push(...healthCheckErrors(manifest, displayPath));
  if ("profiles" in manifest) {
    const profiles = manifest.profiles;
    if (
      !Array.isArray(profiles) ||
      profiles.length === 0 ||
      !profiles.every((name) => typeof name === "string" && /^[a-z0-9][a-z0-9-]*$/.test(name))
    ) {
      errors.push(
        `${displayPath}.profiles: expected a list of profile names such as ["admin"] (lowercase letters, digits and hyphens)`,
      );
    }
  }

  if ("smoke" in manifest) {
    for (const message of validateSmoke(manifest.smoke)) errors.push(`${displayPath}.${message}`);
  }

  const warnings = Object.keys(manifest).flatMap((field) => {
    const deprecation = DEPRECATED_FIELDS[field];
    if (deprecation) return [`${displayPath}.${field}: ${deprecation}`];
    if (!KNOWN_SERVICE_FIELDS.has(field))
      return [`${displayPath}.${field}: unknown field is preserved`];
    return [];
  });
  warnings.push(...secretConflictWarnings(manifest, displayPath));
  // Go opts in with `true`. A Bun backend, worker, agent or MCP server reloads by default (#3395), so `true` only restates that; other
  // Bun app types (frontend, bring-your-own, library, SDK) have no watcher, and any other language ignores it.
  if (liveReload === true && !liveReloadApplies(manifest)) {
    warnings.push(
      `${displayPath}.dev.liveReload: only applies to Go services and Bun backends, workers, agents and MCP servers; it is ignored here`,
    );
  }
  const testOnSave =
    dev && typeof dev === "object" && !Array.isArray(dev)
      ? (dev as Record<string, unknown>).testOnSave
      : undefined;
  const testOnSaveEnabled =
    testOnSave === true ||
    (testOnSave &&
      typeof testOnSave === "object" &&
      !Array.isArray(testOnSave) &&
      (testOnSave as Record<string, unknown>).enabled !== false);
  if (testOnSaveEnabled && manifest.language !== "python") {
    warnings.push(
      `${displayPath}.dev.testOnSave: only applies to Python services (language "python"); it is ignored here`,
    );
  }
  if (
    manifest.env &&
    typeof manifest.env === "object" &&
    Object.keys(manifest.env).length > 0 &&
    manifest.appType !== "bring-your-own" &&
    !declaresCommand(manifest)
  ) {
    warnings.push(
      `${displayPath}.env: only applies to a service that declares a "command" (a local process) or to a bring-your-own resource; it is ignored here. Use "params" for non-secret values and "secrets" for secrets`,
    );
  }
  return { errors: [...new Set(errors)], warnings, manifest };
}

/**
 * Generated-output errors for one service.json. A file that cannot be read or parsed returns none here, because
 * validateServiceManifestFile reports that case.
 */
export function generatedFieldErrorsForFile(filePath: string, displayPath: string): string[] {
  if (!existsSync(filePath)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf-8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    return validateGeneratedStringFields(parsed as Record<string, unknown>, displayPath);
  } catch {
    return [];
  }
}

export function validateServiceManifestFile(
  filePath: string,
  displayPath: string,
): ServiceManifestValidation {
  if (!existsSync(filePath)) {
    return { errors: [`${displayPath}: file is missing`], warnings: [] };
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf-8"));
    return validateServiceManifest(parsed, displayPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { errors: [`${displayPath}: invalid JSON (${message})`], warnings: [] };
  }
}
