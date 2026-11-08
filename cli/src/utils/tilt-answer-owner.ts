// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

/**
 * Whether a Tilt answer (from `tilt get uiresources`) came from another project.
 * A foreign Tilt is detected when it names no resource of this project: a Tilt that is
 * answering but running a different stack.
 * Returns false for inconclusive answers: unparseable, no items, only platform resources.
 */
export function tiltAnswerIsForeign(
  resources: unknown,
  projectResourceNames: Set<string>,
): boolean {
  if (
    !resources ||
    typeof resources !== "object" ||
    !Array.isArray((resources as Record<string, unknown>).items)
  ) {
    return false; // Unparseable; treat as not foreign (status quo: no gate).
  }

  const items = (resources as Record<string, unknown[]>).items;
  if (items.length === 0) {
    return false; // No resources; inconclusive.
  }

  // Check if any item is a project resource (not a platform resource like traefik, service-discovery-daemon).
  const platformResources = new Set([
    "traefik",
    "service-discovery-daemon",
    "(Tiltfile)", // Tiltfile errors don't indicate a foreign Tilt; they belong to the running project.
  ]);

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const name = (item as Record<string, unknown>).metadata;
    if (!name || typeof name !== "object") continue;
    const resourceName = (name as Record<string, unknown>).name;
    if (typeof resourceName !== "string") continue;

    // If this Tilt is answering with a project resource, it's ours (or unknown owner, treat as ours).
    if (projectResourceNames.has(resourceName)) {
      return false;
    }
  }

  // If we see any non-platform resources that are not project resources, this is a foreign Tilt.
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const name = (item as Record<string, unknown>).metadata;
    if (!name || typeof name !== "object") continue;
    const resourceName = (name as Record<string, unknown>).name;
    if (typeof resourceName !== "string") continue;

    // Platform resources don't count.
    if (platformResources.has(resourceName)) {
      continue;
    }
    // Found a non-platform resource that's not ours; this is a foreign Tilt.
    return true;
  }

  // Only platform resources; inconclusive.
  return false;
}
