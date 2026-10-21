/** `discovery.paths` from .tdk/project.json, or the generic default when unset/unreadable. */
export declare function readDiscoveryPaths(projectRoot: string): string[];
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
