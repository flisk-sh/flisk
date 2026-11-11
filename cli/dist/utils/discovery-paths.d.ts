/**
 * `discovery.paths` from .flisk/project.json, or the generic default when unset/unreadable.
 * `quiet` drops the warning about an invalid configuration, for callers that run on every command.
 */
export declare function readDiscoveryPaths(projectRoot: string, { quiet }?: {
    quiet?: boolean | undefined;
}): string[];
/**
 * Whether a `discovery.paths` pattern names the directory at `dirSegments` (relative to the
 * project root, last segment included) with a literal segment, on the pattern itself or on the
 * way to it. The service walk uses this to enter a folder it would otherwise skip (such as
 * `vendor`) when the project points discovery at it, e.g. `vendor/*`. A wildcard segment does
 * not count, so a pattern such as `services/*` does not open every skipped folder at that level.
 */
export declare function namesDirectoryLiterally(projectRoot: string, dirSegments: string[], patterns: string[]): boolean;
/** Whether Tilt's discovery would find a service.json in `resourceDir` given `patterns`. */
export declare function isPathDiscovered(projectRoot: string, resourceDir: string, patterns: string[]): boolean;
export interface ChosenResourcePath {
    path: string;
    /** Set when the type's conventional folder is not discovered and another was picked. */
    adjustedFrom?: string;
}
/**
 * Picks the folder for a new resource without an explicit --path. The conventional folder
 * per type (apps/, workers/, packages/) is kept when discovery covers it; otherwise the
 * resource goes under services/<stack>/, which the default discovery paths cover, because a
 * resource outside every discovery path is scaffolded but never started by `flisk up`.
 */
export declare function chooseResourcePath(projectRoot: string, conventionalPath: string, stack: string, name: string): ChosenResourcePath;
