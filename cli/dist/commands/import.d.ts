import { type SpawnOptions, spawn } from "node:child_process";
import { Command } from "commander";
import { JsonCommandError } from "../utils/json-command.js";
/**
 * The importer lives in its own repo so it can ship without a CLI release, and is run from npm at a
 * pinned version so a push to its main branch cannot change what `flisk import` does. Move the pin
 * when a new importer is published. `FLISK_IMPORT_PACKAGE` overrides the package spec.
 */
export declare const IMPORT_PACKAGE = "flisk-import@0.2.2";
/** Minimum Flisk core release supporting buildContext required by flisk import (#634). */
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
 * Checks whether the running Flisk CLI meets the minimum version required to adopt Compose repos.
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
/** Runs flisk-import with the caller's terminal and resolves to its exit code. */
export declare function runImport(args: string[], spawnFn?: SpawnFn, getVersionFn?: () => string): Promise<number>;
/** What flisk-import printed and how it exited, for `flisk import --json`. */
export interface ImportRun {
    exitCode: number;
    stdout: string;
    stderr: string;
}
/**
 * Runs flisk-import with its output piped instead of the caller's terminal and no stdin, so it can never prompt, and
 * resolves to what it printed and its exit code. A refusal of the core version gate or a missing npx is a run too.
 */
export declare function runImportCaptured(args: string[], spawnFn?: SpawnFn, getVersionFn?: () => string): Promise<ImportRun>;
export declare function buildForwardedImportArgs(args: string[], options?: {
    yes?: boolean;
    force?: boolean;
    dryRun?: boolean;
}): string[];
/** What `flisk import --json` reports. `written` lists the service.json files the importer says it wrote. */
export interface ImportReport {
    dir: string;
    dryRun: boolean;
    force: boolean;
    written: string[];
    output: string;
}
/** The report of a successful run, read from the forwarded arguments and the importer's "  wrote <path>" lines. */
export declare function importReport(forwardedArgs: string[], run: ImportRun): ImportReport;
/**
 * The error of a failed run: the importer's "Error: ..." line (or whatever it printed last) and its "-> ..." hints. The
 * importer prints "Nothing to import: ..." on stdout, so stdout is read when stderr says nothing.
 */
export declare function importFailure(run: ImportRun): JsonCommandError;
export declare const importCommand: Command;
export {};
