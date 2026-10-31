// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProjectCapabilities, ProjectConfig } from "../types/index.js";
import { PROJECT_JSON } from "./constants.js";
import { writeJsonFile } from "./file-helpers.js";
import { findProjectRoot } from "./paths.js";

/** Every capability is on unless `.flisk/project.json` or a flag turns it off. */
export const DEFAULT_CAPABILITIES: Readonly<Record<string, boolean>> = { database: true };

type CapabilitySource = string | ProjectConfig | Record<string, unknown> | null | undefined;

function readProjectJson(projectRoot: string): Record<string, unknown> | undefined {
  try {
    const file = join(projectRoot, ".flisk", PROJECT_JSON);
    if (!existsSync(file)) return undefined;
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return undefined;
  }
}

function applyBooleans(caps: Record<string, boolean>, source: unknown): void {
  if (!source || typeof source !== "object") return;
  for (const [key, val] of Object.entries(source)) {
    if (typeof val === "boolean") caps[key] = val;
  }
}

/**
 * The project's capabilities: the defaults, then `capabilities` in `.flisk/project.json` (or the config passed in), then flags.
 * A flag only turns a capability off. Commander sets `database: true` when `--no-database` is not given, so a `true` from
 * the options must not undo a project that opted out in project.json.
 */
export function resolveProjectCapabilities(
  projectRootOrConfig?: CapabilitySource,
  options?: Record<string, unknown>,
): ProjectCapabilities {
  const caps: Record<string, boolean> = { ...DEFAULT_CAPABILITIES };
  let configObj: Record<string, unknown> | undefined;
  if (typeof projectRootOrConfig === "string") {
    configObj = readProjectJson(projectRootOrConfig);
  } else if (projectRootOrConfig && typeof projectRootOrConfig === "object") {
    configObj = projectRootOrConfig as Record<string, unknown>;
  } else {
    const root = findProjectRoot();
    if (root) configObj = readProjectJson(root);
  }
  applyBooleans(caps, configObj?.capabilities);

  if (options && typeof options === "object") {
    if (options.database === false) caps.database = false;
    const optCaps = options.capabilities;
    if (optCaps && typeof optCaps === "object") {
      for (const [key, val] of Object.entries(optCaps)) {
        if (val === false) caps[key] = false;
      }
    }
  }
  return caps;
}

/** False when the project or a `--no-database` flag opted out of the bundled shared Postgres. */
export function isDatabaseCapabilityEnabled(
  projectRootOrConfig?: CapabilitySource,
  options?: Record<string, unknown>,
): boolean {
  return resolveProjectCapabilities(projectRootOrConfig, options).database !== false;
}

/** Names of the capabilities that are on, for `--json` output. */
export function getEnabledCapabilities(
  projectRootOrConfig?: CapabilitySource,
  options?: Record<string, unknown>,
): string[] {
  const caps = resolveProjectCapabilities(projectRootOrConfig, options);
  return Object.keys(caps).filter((name) => caps[name] === true);
}

/**
 * Saves `capabilities.database: false` in `.flisk/project.json`. Returns true when the file changed, so the caller knows the
 * generated files are now stale and must be regenerated.
 */
export function disableDatabaseCapability(projectRoot: string): boolean {
  const file = join(projectRoot, ".flisk", PROJECT_JSON);
  const config = readProjectJson(projectRoot);
  if (!config) return false;
  const current = config.capabilities;
  const caps =
    current && typeof current === "object" && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {};
  if (caps.database === false) return false;
  config.capabilities = { ...caps, database: false };
  writeJsonFile(file, config);
  return true;
}
