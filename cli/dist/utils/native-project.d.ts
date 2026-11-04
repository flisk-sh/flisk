import type { DiscoveredResource } from "../types/index.js";
/** True when `dir` or a directory up to two levels below it has a service.json; a cheap test before a full discovery scan. */
export declare function hasNearbyServiceJson(dir: string, depth?: number): boolean;
/**
 * The project a command for local processes works on: the Flisk project around `cwd`, or, before the first `flisk up` wrote
 * .flisk/project.json, `cwd` itself when every service.json near it declares `command` (the directory `flisk up` adopts).
 * Returns its services only when they all declare `command`; null otherwise, including outside any project.
 */
export declare function findNativeProject(cwd?: string): {
    projectRoot: string;
    resources: DiscoveredResource[];
} | null;
