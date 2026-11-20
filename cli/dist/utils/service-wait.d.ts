import type { DiscoveredResource, ServiceRuntimeState } from "../types/index.js";
import type { ReadinessResult } from "./up-readiness.js";
import type { UnhealthyLogTail } from "./up-wait.js";
export type ServiceWaitState = "ready" | "failed" | "timeout" | "unknown-service";
/** One service's state in the single envelope `flisk wait --json` prints. */
export interface WaitServiceState extends ServiceRuntimeState {
    name: string;
    /** The last log lines, present for a service that failed or was still starting when the wait ended. */
    logs?: string[];
}
export interface WaitFailure {
    name: string;
    message: string;
}
export interface ServiceWaitOutcome {
    state: ServiceWaitState;
    ready: boolean;
    services: WaitServiceState[];
    /** Failing and still-starting services, in a stable order. */
    unhealthy: string[];
    failures: WaitFailure[];
    /** Names that matched no discovered resource, only when `state` is `unknown-service`. */
    unknown?: string[];
    message: string;
}
/** What one look at the running stack knows. `settled` means another look cannot change the answer. */
export interface ServiceWaitSnapshot {
    states: Record<string, ServiceRuntimeState>;
    /** The same readiness object `up --wait` and `status --json` evaluate. */
    readiness?: ReadinessResult | null;
    settled?: boolean;
}
export interface ServiceWaitDeps {
    snapshot: () => Promise<ServiceWaitSnapshot> | ServiceWaitSnapshot;
    /** The log tails `up --wait` prints, fetched only when the wait ends without being ready. */
    fetchLogTails?: (names: readonly string[]) => Promise<UnhealthyLogTail[]>;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    intervalMs?: number;
}
/**
 * Waits until the selected services are ready, using a snapshot provider backed by the same readiness evaluation as
 * `up --wait` and `status`. It only reads: the caller's snapshot and log lookup decide where the state comes from.
 */
export declare function waitForServices(resources: readonly DiscoveredResource[], requested: readonly string[], timeoutSeconds: number, deps: ServiceWaitDeps): Promise<ServiceWaitOutcome>;
