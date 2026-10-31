import type { CheckResult, DiscoveredResource } from "../types/index.js";
export declare const TOOLCHAIN_PATTERN: RegExp;
export interface Toolchain {
    tool: string;
    version: string;
    /** Where it was declared: `service.json` (binding) or a version file (a hint). */
    source: string;
    isHint: boolean;
}
export interface ToolchainFinding extends Toolchain {
    service: string;
    /** The version on PATH, or null when the program is not installed or did not say its version. */
    found: string | null;
    /** The program is on PATH, but its version output named no version. */
    isUnreadable?: boolean;
    /** An unknown tool or a malformed toolchain value. */
    problem?: string;
}
/** Runs `<program> <args>` and returns its output, or null when it is not installed. */
export type VersionProbe = (program: string, args: string[]) => string | null;
export declare const probeVersion: VersionProbe;
/** The toolchain a service declares in service.json, else the hint from a version file in its folder. */
export declare function declaredToolchain(resource: DiscoveredResource): Toolchain | {
    problem: string;
} | null;
/** True when `found` satisfies `wanted`: every part `wanted` gives must match (`24` matches 24.1.0, `3.12` matches 3.12.4). */
export declare function versionMatches(wanted: string, found: string): boolean;
/** The version of a tool on PATH, or null when none of its programs is installed. */
export declare function installedVersion(tool: string, probe?: VersionProbe): string | null;
/** Every local-process service whose declared (or hinted) toolchain is not the one on PATH. */
export declare function findToolchainMismatches(resources: readonly DiscoveredResource[], probe?: VersionProbe, isInstalled?: (tool: string) => boolean): ToolchainFinding[];
export declare function describeToolchainFinding(finding: ToolchainFinding): string;
/**
 * `flisk doctor` for local-process services: a binding `toolchain` that does not match fails, a hint from a version file
 * only warns.
 */
export declare function checkToolchains(resources: readonly DiscoveredResource[], probe?: VersionProbe, isInstalled?: (tool: string) => boolean): CheckResult;
