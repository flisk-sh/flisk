import type { DiscoveredResource } from "../types/index.js";
export interface OnlySelection {
    /** Resources to start: the requested ones plus everything they depend on, in discovery order. */
    selected: DiscoveredResource[];
    /** Names pulled in only because a requested service lists them in `dependsOn`. */
    dependencies: string[];
}
/** Requested names that match no discovered service (the Tiltfile silently enables everything for an unknown focus name). */
export declare function findUnknownServices(requested: string[], candidates: DiscoveredResource[]): string[];
/**
 * The requested services plus their `dependsOn` closure. This mirrors what the generated Tiltfile enables for
 * `--focus=<service>` (see get_all_needed_services in engine/topologies/tilt/config/profiles.star) so the CLI can report
 * the same set. Shared infrastructure (Postgres, Traefik, the golden images) is always enabled by the Tiltfile and is not listed here.
 * The edges are the ones the Tiltfile waits on (utils/dependency-graph.ts): services and stacks named in `dependsOn`, and a
 * frontend's `backendName`. A dependsOn entry that is neither is ignored.
 */
export declare function resolveOnlySelection(requested: string[], all: DiscoveredResource[]): OnlySelection;
