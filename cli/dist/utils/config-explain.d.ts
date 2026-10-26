export type ConfigFileOwnership = "generated" | "user-owned" | "unknown";
/** What editing the file does on `flisk up`: blocked by the drift gate, not checked, or not decidable. */
export type ConfigFileDrift = "blocks-up" | "none" | "unknown";
export interface ConfigFileExplanation {
    /** Project-relative path with forward slashes. */
    file: string;
    ownership: ConfigFileOwnership;
    reason: string;
    /** Project-relative input the file is generated from, or null when Flisk does not record one. */
    source: string | null;
    driftOnUp: ConfigFileDrift;
    /** True when the file currently differs from its snapshot, so `flisk up` would refuse. */
    isEditedNow: boolean;
    /** Suggested next steps, in order. */
    next: string[];
}
/**
 * Explains one project file using the generated-path allowlist and the hand-edit check that `flisk up` runs.
 * `file` resolves against the current directory, as shell paths do. Throws a FliskError for a path outside the
 * project, a missing file, or a directory.
 */
export declare function explainConfigFile(projectRoot: string, file: string): ConfigFileExplanation;
