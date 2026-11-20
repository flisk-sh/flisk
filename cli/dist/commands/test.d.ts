import { type SpawnSyncReturns } from "node:child_process";
import { Command } from "commander";
import type { DiscoveredResource } from "../types/index.js";
import { type RunTarget } from "./run.js";
export type ServiceTestStatus = "passed" | "failed" | "skipped";
export interface ServiceTestResult {
    service: string;
    /** The command that was declared, or `null` when the service has no test command. */
    command: string | null;
    /** `null` means the test did not run because no command was declared. */
    ok: boolean | null;
    status: ServiceTestStatus;
    durationMs: number;
    outputTail: string;
}
export interface TestRunResult {
    /** `false` when at least one declared test failed, so `--json` consumers and MCP can detect the failure. */
    ok: boolean;
    stack: string | null;
    results: ServiceTestResult[];
    summary: {
        passed: number;
        failed: number;
        skipped: number;
    };
}
type ResolveTarget = (projectRoot: string, service: string, command: string[], options?: {
    interactive: boolean;
    resources?: DiscoveredResource[];
}) => RunTarget;
type Execute = (target: RunTarget) => SpawnSyncReturns<string>;
export interface RunServiceTestsOptions {
    stack?: string;
    resources?: DiscoveredResource[];
    resolveTarget?: ResolveTarget;
    execute?: Execute;
    now?: () => number;
}
/** The declared test command, trimmed, or `null` when the service has none. */
export declare function resolveServiceTestCommand(resource: Pick<DiscoveredResource, "config">): string | null;
/** Splits a declared test command into the program and its arguments, honouring quotes. */
export declare function splitTestCommand(command: string): string[];
/**
 * Runs every selected service's declared test command. `resolveTarget` and `execute` are injectable so a unit test can
 * prove the environment plumbing is reused without starting a real process or a container.
 */
export declare function runServiceTests(projectRoot: string, options?: RunServiceTestsOptions): Promise<TestRunResult>;
export declare const testCommand: Command;
export {};
