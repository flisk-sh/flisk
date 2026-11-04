// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { DiscoveredResource } from "../types/index.js";
import { dependencyEdges } from "./dependency-graph.js";

export interface OnlySelection {
  /** Resources to start: the requested ones plus everything they depend on, in discovery order. */
  selected: DiscoveredResource[];
  /** Names pulled in only because a requested service lists them in `dependsOn`. */
  dependencies: string[];
}

/** Requested names that match no discovered service (the Tiltfile silently enables everything for an unknown focus name). */
export function findUnknownServices(
  requested: string[],
  candidates: DiscoveredResource[],
): string[] {
  const known = new Set(candidates.map((resource) => resource.name));
  return requested.filter((name) => !known.has(name));
}

/**
 * The requested services plus their `dependsOn` closure. This mirrors what the generated Tiltfile enables for
 * `--focus=<service>` (see get_all_needed_services in engine/topologies/tilt/config/profiles.star) so the CLI can report
 * the same set. Shared infrastructure (Postgres, Traefik, the golden images) is always enabled by the Tiltfile and is not listed here.
 * The edges are the ones the Tiltfile waits on (utils/dependency-graph.ts): services and stacks named in `dependsOn`, and a
 * frontend's `backendName`. A dependsOn entry that is neither is ignored.
 */
export function resolveOnlySelection(
  requested: string[],
  all: DiscoveredResource[],
): OnlySelection {
  const edges = dependencyEdges(all);
  const wanted = new Set<string>();
  const visit = (name: string): void => {
    if (wanted.has(name) || !edges.has(name)) return;
    wanted.add(name);
    for (const dep of edges.get(name) ?? []) visit(dep);
  };
  for (const name of requested) visit(name);
  return {
    selected: all.filter((resource) => wanted.has(resource.name)),
    dependencies: all.map((r) => r.name).filter((n) => wanted.has(n) && !requested.includes(n)),
  };
}
