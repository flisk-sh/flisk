import type { DiscoveredResource } from "../types/index.js";
/**
 * The one place that turns service.json `dependsOn` into a graph, so `flisk up --only`, the circular-dependency gate and
 * `flisk config verify` cannot disagree about it. The rules follow the service schema and the generated Tiltfile:
 * - an entry is a service name, or a stack name (the stack's other services, not its frontends, as with `--focus`);
 * - a frontend also waits for its `backendName`;
 * - a name that is neither (a typo, the shared Postgres) is not an edge;
 * - a `dependsOn` that is not a list of strings cannot be followed and gives no edges.
 */
/** The dependsOn names a service declares: none when absent, null when it is not an array of strings. */
export declare function declaredDependsOn(config: {
    dependsOn?: unknown;
} | undefined): string[] | null;
/**
 * The dependency names that can be followed: `dependsOn`, plus the deprecated `dependencies` key the generators still read, plus
 * a bring-your-own sidecar's host (`sidecarOf`, #2908), which has to be up first. A wrong-typed value reads as none (the shape
 * check reports it). Keep in step with declared_dependencies in runtime/engine/topologies/tilt/common/dependencies.star.
 */
export declare function dependsOnOf(config: {
    dependsOn?: unknown;
    dependencies?: unknown;
    appType?: unknown;
    sidecarOf?: unknown;
} | undefined): string[];
/** service name -> the services it waits for, sorted. A self entry stays, so the cycle check can report it. */
export declare function dependencyEdges(resources: DiscoveredResource[]): Map<string, string[]>;
/** Frontends whose `backendName` is no service of this project: nothing for the frontend to wait for or call. */
export declare function unknownBackendNames(resources: DiscoveredResource[]): Array<{
    resource: string;
    name: string;
}>;
/** `dependsOn` entries that are neither a service nor a stack of this project (the caller adds its own known names). */
export declare function unnamedEntries(resources: DiscoveredResource[], alsoKnown?: ReadonlySet<string>): Array<{
    resource: string;
    name: string;
}>;
