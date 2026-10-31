import type { CheckResult, ProjectCapabilities } from "../types/index.js";
export type PreflightItem = {
    id: "node" | "docker" | "compose" | "tilt" | "bun" | "ports" | "nats" | "prisma" | "colima";
    ok: boolean;
    message: string;
    fix?: string;
};
/**
 * Which prerequisites a command needs.
 *
 * - `runtime` starts the local stack, so it needs Docker, Compose and Tilt.
 * - `scaffold` only writes project files, so it needs neither. The runtime
 *   executables are checked for the next-step hint, never to block setup.
 */
export type PreflightScope = "runtime" | "scaffold";
/**
 * The scope a preflight actually ran with: a requested `runtime` scope becomes `native` in a project whose services all
 * declare `command`, where only Node (and Bun, when a service needs it) can block.
 */
export type EffectivePreflightScope = PreflightScope | "native";
/** Checks a project of `command` services needs: no container runtime, no Tilt, no gateway or database ports. */
export declare const NATIVE_CHECK_IDS: readonly PreflightItem["id"][];
/** Checks that only the local runtime (starting a stack) needs. */
export declare const RUNTIME_CHECK_IDS: readonly PreflightItem["id"][];
/** Checks that writing project configuration needs. */
export declare const SCAFFOLD_CHECK_IDS: readonly PreflightItem["id"][];
/** Every check that blocks a cold start, in report order. */
export declare const MACHINE_CHECK_IDS: readonly PreflightItem["id"][];
export type PreflightResult = {
    ok: boolean;
    inProject: boolean;
    /** `native` when the project's services all run as local processes and the container checks were not run. */
    scope: EffectivePreflightScope;
    items: PreflightItem[];
    header: string;
    footer: string;
};
/** Returns whether a Node version is below the CLI's 22.12 minimum. */
export declare function nodeTooOld(version: string): boolean;
/** Requires a Docker engine and Compose version check to complete successfully. */
export declare function requireVerifiedDockerVersions(result: CheckResult): CheckResult;
export declare function usesPrisma(projectRoot: string): boolean;
export declare function runColdPreflight(opts?: {
    cwd?: string;
    scope?: PreflightScope;
    database?: boolean;
    capabilities?: ProjectCapabilities;
    [key: string]: unknown;
}): Promise<PreflightResult>;
/** Formats only failed preflight checks and the applicable readiness message. */
export declare function formatColdPreflight(result: PreflightResult, options?: {
    includeSuccessFooter?: boolean;
}): string;
/** Exits before machine-dependent command work when any machine check fails. */
export declare function assertMachineReadyOrExit(opts?: {
    scope?: PreflightScope;
    hints?: string[];
}): Promise<void>;
export type RuntimePrerequisiteStatus = {
    hasDockerCli: boolean;
    hasTiltCli: boolean;
};
/**
 * Reports which runtime executables are installed.
 *
 * It only looks at `PATH`: no Docker daemon is contacted, so a machine without
 * Docker still gets a usable answer.
 */
export declare function detectRuntimePrerequisites(find?: (command: string) => string | null): RuntimePrerequisiteStatus;
/**
 * Builds the next-step lines shown after project setup.
 *
 * Docker and Tilt are only needed to start the stack, so a missing runtime is
 * reported as a hint instead of a failure.
 */
export declare function formatRuntimeNextSteps(status: RuntimePrerequisiteStatus): string[];
