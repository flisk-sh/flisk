import type { DiscoveredResource, LocalOverride, LocalOverrideField } from "../types/index.js";
/** The only fields a sibling `service.local.json` may change. */
export declare const LOCAL_OVERRIDE_FIELDS: readonly LocalOverrideField[];
export interface ServiceLocalOverrideResult {
    /** Copies of the input resources with local fields applied. The cache-owned originals are never mutated. */
    resources: DiscoveredResource[];
    /** One entry per applied field, in resource order. Empty when no local file has an override. */
    overrides: LocalOverride[];
}
/**
 * Merges every sibling `service.local.json` into a copy of its discovered resource.
 *
 * Generation never calls this: it reads the committed `service.json` only. Callers that start local
 * processes (`flisk up`'s native path and `flisk run`) and commands that report active overrides use
 * this one helper, so the field whitelist and the `env` merge rule live in a single place.
 */
export declare function applyServiceLocalOverrides(resources: readonly DiscoveredResource[]): ServiceLocalOverrideResult;
