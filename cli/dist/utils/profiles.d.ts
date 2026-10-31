import type { DiscoveredResource } from "../types/index.js";
/**
 * Opt-in profiles (#2873).
 *
 * A heavy service that is not needed every day (an admin UI, a dashboard, a workflow engine) can list `"profiles"` in its
 * service.json. `flisk up` then leaves it out unless `--profile <name>` names one of its profiles, so the default run stays
 * small. A service without `profiles` always starts, and a service named with `--only` starts whatever its profiles.
 */
export declare const PROFILE_NAME: RegExp;
/** The profiles a service declares; empty when it has none (it then always starts). */
export declare function profilesOf(resource: DiscoveredResource): string[];
export interface ProfileSelection {
    kept: DiscoveredResource[];
    /** Services left out, each with the profiles that would start it. */
    skipped: Array<{
        name: string;
        profiles: string[];
    }>;
}
/**
 * Keeps the services that start with these profiles: those without `profiles`, those in an active profile, and those asked
 * for by name (`--only`).
 */
export declare function applyProfiles(resources: readonly DiscoveredResource[], activeProfiles?: readonly string[], requested?: readonly string[]): ProfileSelection;
/** Every profile the project declares, sorted: what `--profile` accepts. */
export declare function declaredProfiles(resources: readonly DiscoveredResource[]): string[];
/** "admin-ui (profile admin), temporal (profiles workflow, all)". */
export declare function describeSkipped(skipped: ProfileSelection["skipped"]): string;
