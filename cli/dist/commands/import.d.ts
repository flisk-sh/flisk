import { type SpawnOptions, spawn } from "node:child_process";
import { Command } from "commander";
/**
 * The importer lives in its own repo so it can ship without a CLI release, and is run from npm at a
 * pinned version so a push to its main branch cannot change what `tdk import` does. Move the pin
 * when a new importer is published. `TDK_IMPORT_PACKAGE` overrides the package spec.
 */
export declare const IMPORT_PACKAGE = "@tdk-landscape/tdk-import@0.2.1";
/** Minimum TDK core release supporting buildContext required by tdk import (#634). */
export declare const MIN_CORE_VERSION = "1.3.104";
/** Recommended core version with automatic Tiltfile bootstrapping for imported stacks (#1018). */
export declare const RECOMMENDED_CORE_VERSION = "1.3.145";
type SpawnFn = (command: string, args: string[], options: SpawnOptions) => ReturnType<typeof spawn>;
interface ParsedSemver {
    major: number;
    minor: number;
    patch: number;
    prerelease: (string | number)[];
}
/** Parses a semver version string, extracting major, minor, patch, and prerelease identifiers. */
export declare function parseSemver(raw: string): ParsedSemver | null;
/**
 * Compares two semver version strings per the SemVer 2.0.0 specification:
 * Returns 1 if a > b, -1 if a < b, 0 if a === b, or null if either is unparseable.
 */
export declare function compareSemver(aStr: string, bStr: string): number | null;
/** Compares two semver version strings. Returns true if current >= minimum. */
export declare function isVersionAtLeast(current: string, minimum: string): boolean;
/**
 * Checks whether the running TDK CLI meets the minimum version required to adopt Compose repos.
 * If the installed core is older than the buildContext release (1.3.104), exit before writing
 * and print the upgrade command.
 */
export declare function checkCoreVersion(currentVersion?: string, args?: string[]): {
    ok: boolean;
    message?: string;
};
export declare function importInvocation(args: string[], env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform): {
    command: string;
    args: string[];
    shell: boolean;
};
/** Runs tdk-import with the caller's terminal and resolves to its exit code. */
export declare function runImport(args: string[], spawnFn?: SpawnFn, getVersionFn?: () => string): Promise<number>;
export declare const importCommand: Command;
export {};
