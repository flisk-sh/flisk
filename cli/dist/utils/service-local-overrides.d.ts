import type { DiscoveredResource, LocalOverride, LocalOverrideField } from "../types/index.js";
/** The only fields a sibling `service.local.json` may change. */
export declare const LOCAL_OVERRIDE_FIELDS: readonly LocalOverrideField[];
export interface ServiceLocalOverrideResult {
    /** Copies of the input resources with local fields applied. The cache-owned originals are never mutated. */
    resources: DiscoveredResource[];
    /** One entry per applied field, in resource order. Empty when no local file has an override. */
    overrides: LocalOverride[];
    /**
     * With `skipInvalidFiles`: one message per local file that was ignored, so a reporting command can
     * say which service fell back to its committed fields. Empty in the default mode, which throws
     * on the first invalid file instead.
     */
    invalidFiles: string[];
}
/**
 * Merges every sibling `service.local.json` into a copy of its discovered resource.
 *
 * Generation never calls this: it reads the committed `service.json` only. Callers that start local
 * processes (`flisk up`'s native path and `flisk run`) and commands that report active overrides use
 * this one helper, so the field whitelist and the `env` merge rule live in a single place.
 *
 * The default throws on the first invalid local file: a run must refuse a broken file, not start
 * half of it. `skipInvalidFiles` is for read-only reporting (`flisk status`): one malformed file is
 * one service's problem, so that service falls back to its committed fields while every other
 * service keeps its valid override — a locally disabled service must not come back to life in
 * health totals because some other file is broken. The skipped file is named in `invalidFiles`;
 * `flisk up` and `config verify` keep reporting it as an error.
 */
export declare function applyServiceLocalOverrides(resources: readonly DiscoveredResource[], options?: {
    skipInvalidFiles?: boolean;
}): ServiceLocalOverrideResult;
