// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DiscoveredResource, DiscoveredStack } from "../types/index.js";
import { DATABASE_MANAGEMENT_FEATURE, PROJECT_JSON } from "./constants.js";
import { POSTGRES_DEPENDENCY_NAMES } from "./shared-platform-postgres.js";

/**
 * Groups the shared platform Postgres for `tdk status`.
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

/** A resource uses the shared database when its features or dependsOn ask for it. */
export function usesSharedPostgres(resource: DiscoveredResource): boolean {
  const config = resource.config;
  if (!config) return false;
  if (config.featuresEnabled?.includes(DATABASE_MANAGEMENT_FEATURE)) return true;
  return (config.dependsOn ?? []).some((name) =>
    (POSTGRES_DEPENDENCY_NAMES as readonly string[]).includes(name),
  );
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

/** `project.name` from `.tdk/project.json`, or null when the project file is missing or unreadable. */
export function readProjectName(projectRoot: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(join(projectRoot, ".tdk", PROJECT_JSON), "utf-8"));
    return typeof parsed?.project?.name === "string" ? parsed.project.name : null;
  } catch {
    return null;
  }
}
