// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import type { DiscoveredResource } from "../types/index.js";

/**
 * Opt-in profiles (#2873).
 *
 * A heavy service that is not needed every day (an admin UI, a dashboard, a workflow engine) can list `"profiles"` in its
 * service.json. `flisk up` then leaves it out unless `--profile <name>` names one of its profiles, so the default run stays
 * small. A service without `profiles` always starts, and a service named with `--only` starts whatever its profiles.
 */

export const PROFILE_NAME = /^[a-z0-9][a-z0-9-]*$/;

/** The profiles a service declares; empty when it has none (it then always starts). */
export function profilesOf(resource: DiscoveredResource): string[] {
  const raw = (resource.config as Record<string, unknown> | undefined)?.profiles;
  return Array.isArray(raw)
    ? raw.filter((name): name is string => typeof name === "string" && name.length > 0)
    : [];
}

export interface ProfileSelection {
  kept: DiscoveredResource[];
  /** Services left out, each with the profiles that would start it. */
  skipped: Array<{ name: string; profiles: string[] }>;
}

/**
 * Keeps the services that start with these profiles: those without `profiles`, those in an active profile, and those asked
 * for by name (`--only`).
 */
export function applyProfiles(
  resources: readonly DiscoveredResource[],
  activeProfiles: readonly string[] = [],
  requested: readonly string[] = [],
): ProfileSelection {
  const active = new Set(activeProfiles);
  const named = new Set(requested);
  const kept: DiscoveredResource[] = [];
  const skipped: ProfileSelection["skipped"] = [];
  for (const resource of resources) {
    const profiles = profilesOf(resource);
    if (profiles.length === 0 || named.has(resource.name) || profiles.some((p) => active.has(p))) {
      kept.push(resource);
    } else {
      skipped.push({ name: resource.name, profiles });
    }
  }
  return { kept, skipped };
}

/** Every profile the project declares, sorted: what `--profile` accepts. */
export function declaredProfiles(resources: readonly DiscoveredResource[]): string[] {
  return [...new Set(resources.flatMap(profilesOf))].sort();
}

/** "admin-ui (profile admin), temporal (profiles workflow, all)". */
export function describeSkipped(skipped: ProfileSelection["skipped"]): string {
  return skipped
    .map(
      ({ name, profiles }) =>
        `${name} (${profiles.length === 1 ? "profile" : "profiles"} ${profiles.join(", ")})`,
    )
    .join(", ");
}
