// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import type { DiscoveredResource } from "../types/index.js";
import { BRING_YOUR_OWN_TYPE, DATABASE_MANAGEMENT_FEATURE } from "./constants.js";
import { dependsOnOf } from "./dependency-graph.js";

/**
 * Whether the project needs Flisk's own platform services, and why (#2963). The router (Traefik) serves every routed service;
 * the shared PostgreSQL serves every `database` resource and every `dependsOn: postgres`. A project of only bring-your-own
 * containers that publish their own ports and bring their own database needs neither.
 */
export interface PlatformServiceNeed {
  /** True when some resource of the project uses this platform service. */
  isNeeded: boolean;
  /** The resources that use it, sorted. Empty when `isNeeded` is false. */
  users: string[];
  /** One line for `flisk status`: who needs it, or why nothing does. */
  reason: string;
}

export interface PlatformServiceNeeds {
  gateway: PlatformServiceNeed;
  database: PlatformServiceNeed;
}

const POSTGRES_NAMES: readonly string[] = ["postgres", DATABASE_MANAGEMENT_FEATURE];

function isBringYourOwn(resource: DiscoveredResource): boolean {
  return resource.config?.appType === BRING_YOUR_OWN_TYPE;
}

function listUsers(users: string[]): string {
  const shown = users.slice(0, 4).join(", ");
  return users.length > 4 ? `${shown} and ${users.length - 4} more` : shown;
}

function wantsSharedPostgres(resource: DiscoveredResource, databaseNames: string[]): boolean {
  const features = resource.config?.featuresEnabled;
  if (Array.isArray(features) && features.includes(DATABASE_MANAGEMENT_FEATURE)) return true;
  return dependsOnOf(resource.config).some(
    (name) => POSTGRES_NAMES.includes(name) || databaseNames.includes(name),
  );
}

/**
 * What the resources need. Conservative: only a project whose resources are all bring-your-own is ever found not to need
 * something. Any other resource type (backend, agent, worker, frontend, MCP) keeps both services, as before.
 */
export function evaluatePlatformServiceNeeds(
  resources: readonly DiscoveredResource[],
): PlatformServiceNeeds {
  // A `database` resource only names the shared Postgres: it has no route and nothing else to start.
  const others = resources
    .filter((resource) => !isBringYourOwn(resource) && resource.config?.appType !== "database")
    .map((r) => r.name);
  const routed = resources
    .filter((resource) => isBringYourOwn(resource) && resource.config?.exposeViaProxy !== false)
    .map((r) => r.name);
  const databaseNames = resources
    .filter((resource) => resource.config?.appType === "database")
    .map((r) => r.name);
  const postgresUsers = resources
    .filter(
      (resource) =>
        databaseNames.includes(resource.name) || wantsSharedPostgres(resource, databaseNames),
    )
    .map((r) => r.name);

  const gatewayUsers = [...others, ...routed].sort();
  const databaseUsers = [...new Set([...others, ...postgresUsers])].sort();
  return {
    gateway: {
      isNeeded: gatewayUsers.length > 0,
      users: gatewayUsers,
      reason:
        gatewayUsers.length > 0
          ? `routed services: ${listUsers(gatewayUsers)}`
          : 'no routed service (every resource is bring-your-own with "exposeViaProxy": false)',
    },
    database: {
      isNeeded: databaseUsers.length > 0,
      users: databaseUsers,
      reason:
        databaseUsers.length > 0
          ? `used by: ${listUsers(databaseUsers)}`
          : "no database resource and no dependsOn postgres",
    },
  };
}
