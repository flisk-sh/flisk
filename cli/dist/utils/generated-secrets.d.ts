import type { DiscoveredResource } from "../types/index.js";
/** `secrets.generate` (#3140): { NAME: "hex:N" | "base64:N" }, N bytes of random data. */
export declare const GENERATE_MIN_BYTES = 8;
export declare const GENERATE_MAX_BYTES = 128;
export interface GenerateSpec {
    format: "hex" | "base64";
    bytes: number;
}
/** Parses "hex:32" / "base64:32"; returns a message when the spec is bad. */
export declare function parseGenerateSpec(spec: unknown): GenerateSpec | string;
export declare function isGenerateName(name: string): boolean;
/** The valid `secrets.generate` entries of a manifest; invalid ones are reported by `secretsErrors`, not here. */
export declare function generateEntries(manifest: Record<string, unknown> | undefined): Map<string, GenerateSpec>;
export declare function generateSecretValue(spec: GenerateSpec): string;
/**
 * Appends every `secrets.generate` name that the env file lacks, once, with a random value. An existing line is never changed
 * or reordered, a new file is created with mode 0600, and a value set in the shell is left alone. Returns the names added (with
 * `dryRun`, the names that would be); the values are never returned, printed or logged.
 */
export declare function ensureGeneratedSecrets(projectRoot: string, resources: DiscoveredResource[], options?: {
    envFilePath?: string;
    env?: NodeJS.ProcessEnv;
    dryRun?: boolean;
}): string[];
