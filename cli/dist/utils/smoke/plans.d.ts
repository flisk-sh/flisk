import type { DiscoveredResource } from "../../types/index.js";
import type { SmokePlan } from "./schema.js";
/** One plan per routable service that declares `smoke`. Workers and BYO with exposeViaProxy false have no public route. */
export declare function buildSmokePlans(resources: DiscoveredResource[], ingressPort?: number, options?: {
    gateway?: boolean;
}): SmokePlan[];
/**
 * The GET-only part of each smoke block, for `flisk doctor`. Doctor must never write to a service, and a step whose path reads
 * a value saved by an earlier write (`{{name}}`) cannot run on its own, so both are dropped. A service with no such steps is left out.
 * `bodyContains` is also cleared: it asserts on data that earlier writes created, so doctor would fail a healthy route whose data was removed.
 * The status check stays, which is what shows a route exists.
 */
export declare function readOnlySmokePlans(plans: SmokePlan[], options?: {
    timeoutSeconds?: number;
}): SmokePlan[];
