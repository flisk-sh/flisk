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

  const names = resourceNames((resources as Record<string, unknown[]>).items);
  // A project resource takes precedence over any foreign resources in the answer.
  if (names.some((name) => projectResourceNames.has(name))) {
    return false;
  }

  const platformResources = new Set([
    "traefik",
    "service-discovery-daemon",
    "(Tiltfile)", // Tiltfile errors don't indicate a foreign Tilt; they belong to the running project.
  ]);

  // Empty or platform-only answers remain inconclusive.
  return names.some((name) => !platformResources.has(name));
}

function resourceNames(items: unknown[]): string[] {
  const names: string[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const metadata = (item as Record<string, unknown>).metadata;
    if (!metadata || typeof metadata !== "object") continue;
    const resourceName = (metadata as Record<string, unknown>).name;
    if (typeof resourceName !== "string") continue;

    names.push(resourceName);
  }
  return names;
}
