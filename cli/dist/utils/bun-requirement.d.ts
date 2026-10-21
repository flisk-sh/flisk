import type { DiscoveredResource } from "../types/index.js";
/**
 * Bun runs the generated JS services. A project without any has nothing for Bun to run, so neither `flisk doctor` nor
 * `flisk up` needs it. Doctor and the start-up preflight share this rule so they cannot disagree.
 */
export declare function projectNeedsBun(resources: readonly DiscoveredResource[]): boolean;
