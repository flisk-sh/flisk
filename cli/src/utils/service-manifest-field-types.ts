// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { FRONTEND_FRAMEWORK_IDS } from "./frontend-framework-ids.js";
import { isPlainObject } from "./is-plain-object.js";
import { declaresCommand, serviceLabel } from "./native-service.js";

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
