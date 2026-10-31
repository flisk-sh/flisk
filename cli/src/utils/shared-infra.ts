// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DiscoveredResource, DiscoveredStack, ProjectCapabilities, ProjectConfig } from "../types/index.js";
import { DEFAULT_CAPABILITIES } from "../config/platform-standards.js";
import { DATABASE_MANAGEMENT_FEATURE, PROJECT_JSON } from "./constants.js";
import { POSTGRES_DEPENDENCY_NAMES } from "./shared-platform-postgres.js";

/**
 * Groups the shared platform Postgres for `flisk status`.
 *
 * One Postgres instance serves the whole project. Each stack that uses it gets its own database named
 * `<project>_<stack>` (see #584), and the services in that stack use that database. `groupSharedPostgres` is pure: it
 * takes discovered stacks and does no I/O, so it can be tested without Docker or Tilt. `readProjectName` is the only
 * function here that reads a file.
 */

export interface SharedInfraDatabase {
  name: string;
  stack: string;
  services: string[];
}

export interface SharedPostgresInstance {
  name: "postgres";
  databases: SharedInfraDatabase[];
}

export interface SharedInfraItem {
  name: string;
  capability: string;
  description: string;
}

export const SHARED_INFRA_SERVICES = {
  traefik: {
    name: "traefik",
    capability: "gateway",
    description: "Traefik reverse proxy",
  },
  postgres: {
    name: "postgres",
    capability: "database",
    description: "PostgreSQL database",
  },
} as const;

export type CapabilityConfigInput =
  | ProjectConfig
  | { capabilities?: ProjectCapabilities; gateway?: boolean }
  | ProjectCapabilities
  | string
  | null
  | undefined;

/**
 * Reads the capabilities block from `.flisk/project.json` when present.
 */
export function readProjectCapabilities(projectRoot: string): ProjectCapabilities | null {
  try {
    const parsed = JSON.parse(readFileSync(join(projectRoot, ".flisk", PROJECT_JSON), "utf-8"));
    return parsed && typeof parsed === "object" && parsed.capabilities && typeof parsed.capabilities === "object"
      ? (parsed.capabilities as ProjectCapabilities)
      : null;
  } catch {
    return null;
  }
}

/**
 * Checks whether a given capability is enabled.
 * Defaults to true if unspecified.
 */
export function isCapabilityEnabled(
  configOrOptions: CapabilityConfigInput,
  capabilityName: string,
): boolean {
  if (configOrOptions === null || configOrOptions === undefined) {
    return true;
  }
  if (typeof configOrOptions === "string") {
    const fileCaps = readProjectCapabilities(configOrOptions);
    if (fileCaps && typeof fileCaps[capabilityName] === "boolean") {
      return fileCaps[capabilityName]!;
    }
    return true;
  }
  if (typeof configOrOptions === "object") {
    const direct = (configOrOptions as Record<string, unknown>)[capabilityName];
    if (typeof direct === "boolean") {
      return direct;
    }
    const caps = (configOrOptions as { capabilities?: ProjectCapabilities }).capabilities;
    if (caps && typeof caps === "object" && typeof caps[capabilityName] === "boolean") {
      return caps[capabilityName]!;
    }
  }
  return true;
}

/**
 * Returns whether the gateway capability is enabled.
 */
export function isGatewayEnabled(configOrOptions?: CapabilityConfigInput): boolean {
  return isCapabilityEnabled(configOrOptions, "gateway");
}

/**
 * Returns a list of capability names that remain enabled.
 */
export function getEnabledCapabilities(configOrOptions?: CapabilityConfigInput): string[] {
  const standardKeys = Object.keys(DEFAULT_CAPABILITIES);
  const extraKeys: string[] = [];

  if (typeof configOrOptions === "string") {
    const fileCaps = readProjectCapabilities(configOrOptions);
    if (fileCaps) {
      for (const k of Object.keys(fileCaps)) {
        if (!standardKeys.includes(k) && typeof fileCaps[k] === "boolean") {
          extraKeys.push(k);
        }
      }
    }
  } else if (typeof configOrOptions === "object" && configOrOptions !== null) {
    const caps = (configOrOptions as { capabilities?: ProjectCapabilities }).capabilities ?? configOrOptions;
    if (typeof caps === "object" && caps !== null) {
      for (const k of Object.keys(caps)) {
        if (!standardKeys.includes(k) && typeof (caps as Record<string, unknown>)[k] === "boolean") {
          extraKeys.push(k);
        }
      }
    }
  }

  const allKeys = [...standardKeys, ...extraKeys];
  return allKeys.filter((cap) => isCapabilityEnabled(configOrOptions, cap));
}

/**
 * Returns the list of shared infrastructure service names based on enabled capabilities.
 * When gateway is disabled, Traefik is excluded.
 */
export function getSharedInfrastructureList(configOrOptions?: CapabilityConfigInput): string[] {
  const list: string[] = [];
  if (isGatewayEnabled(configOrOptions)) {
    list.push(SHARED_INFRA_SERVICES.traefik.name);
  }
  if (isCapabilityEnabled(configOrOptions, "database")) {
    list.push(SHARED_INFRA_SERVICES.postgres.name);
  }
  return list;
}

/**
 * Returns detailed shared infrastructure items based on enabled capabilities.
 */
export function getSharedInfrastructureItems(configOrOptions?: CapabilityConfigInput): SharedInfraItem[] {
  const list = getSharedInfrastructureList(configOrOptions);
  return list
    .map((name) => (SHARED_INFRA_SERVICES as Record<string, SharedInfraItem>)[name])
    .filter(Boolean);
}

/** A resource uses the shared database when its features or dependsOn ask for it. */
export function usesSharedPostgres(resource: DiscoveredResource): boolean {
  const config = resource.config;
  if (!config) return false;
  // service.json is not type-checked here, so a malformed value must not throw inside `flisk status`.
  if (
    Array.isArray(config.featuresEnabled) &&
    config.featuresEnabled.includes(DATABASE_MANAGEMENT_FEATURE)
  )
    return true;
  const dependsOn = Array.isArray(config.dependsOn) ? config.dependsOn : [];
  return dependsOn.some((name) => (POSTGRES_DEPENDENCY_NAMES as readonly string[]).includes(name));
}

export function groupSharedPostgres(
  projectName: string,
  stacks: DiscoveredStack[],
): SharedPostgresInstance | null {
  const prefix = projectName.replace(/-/g, "_");
  const databases: SharedInfraDatabase[] = [];

  for (const stack of [...stacks].sort((a, b) => a.name.localeCompare(b.name))) {
    const services = stack.resources.filter(usesSharedPostgres).map((resource) => resource.name);
    if (services.length === 0) continue;
    databases.push({
      name: `${prefix}_${stack.name.replace(/-/g, "_")}`,
      stack: stack.name,
      services: services.sort(),
    });
  }

  if (databases.length === 0) return null;
  return { name: "postgres", databases };
}

/** `project.name` from `.flisk/project.json`, or null when the project file is missing or unreadable. */
export function readProjectName(projectRoot: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(join(projectRoot, ".flisk", PROJECT_JSON), "utf-8"));
    return typeof parsed?.project?.name === "string" ? parsed.project.name : null;
  } catch {
    return null;
  }
}
