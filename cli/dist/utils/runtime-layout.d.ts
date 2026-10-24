export declare const EXTENSION_DIRS: readonly ["engine", "discovery", "specs", "ext"];
export declare function resolveExtensionDir(sourceRoot: string, name: string): string;
export declare function resolveTiltfile(sourceRoot: string): string;
export type ExtensionLayoutKind = "nested" | "flat" | "mixed" | "incomplete";
export interface ExtensionLayoutReport {
    ok: boolean;
    kind: ExtensionLayoutKind;
    /** Entries (Tiltfile and the extension directories) the chosen layout is missing. */
    missing: string[];
    /** Entries that exist only in the other layout, so a resolver would combine two layouts. */
    mixed: string[];
}
export declare function inspectExtensionLayout(sourceRoot: string): ExtensionLayoutReport;
export declare function describeLayoutProblems(sourceRoot: string, report?: ExtensionLayoutReport): string;
export declare function hasExtensionLayout(sourceRoot: string): boolean;
