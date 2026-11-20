import type { DiscoveredResource, ServiceRuntimeState } from "../types/index.js";
import type { ReadinessResult } from "./up-readiness.js";
/**
 * The services `--strict`, `wait` and other readiness gates fail on: the failing or still starting ones. Null when nothing
 * of the project is running (no state at all, or every service with a process of its own is unknown), which is also not
 * ready. A project with no services has nothing to wait for.
 */
export declare function strictNotReady(resources: readonly Pick<DiscoveredResource, "name" | "type">[], states: Record<string, ServiceRuntimeState> | null): string[] | null;
/**
 * A local-process run's answer to the readiness question agents read from `status --json`. It deliberately carries no
 * failures: a local run records each service's own state, which `status` and `wait` report per service instead.
 */
export declare function readinessFromNativeStates(states: Record<string, ServiceRuntimeState>): ReadinessResult | null;
