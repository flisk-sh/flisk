import type { CheckResult, DoctorAction, HostPortPlan } from "../types/index.js";
import type { HostInfo } from "./agent-host.js";
import type { ColimaDiskReport } from "./colima-disk.js";
import type { DockerBuildCacheReport } from "./docker-build-cache.js";
import { type RankedFix } from "./doctor-fix-first.js";
import { SCHEMA_VERSION } from "./machine-output.js";
export interface DoctorError {
    code: "USAGE" | "INTERNAL" | "ENV_UNREADABLE";
    message: string;
}
export interface DoctorReport {
    schemaVersion: typeof SCHEMA_VERSION;
    data: {
        ready: boolean;
        inProject: boolean;
        checks: CheckResult[];
        capabilities?: string[];
        commit?: string;
        commitSha?: string;
        /** Present only when a failing check has a runnable command: most blocking first. */
        fixFirst?: RankedFix[];
        /** Present only with `--fix`: every repair planned, applied, skipped or failed. */
        actions?: DoctorAction[];
        /** Number of repair actions that are repairable (planned or applied). */
        repairableCount?: number;
        /** Number of failed checks that need manual action. */
        needsActionCount?: number;
        repairable?: number;
        needsAction?: number;
        host?: HostInfo & {
            containerRuntimeReachable: boolean | null;
        };
        buildCache?: DockerBuildCacheReport;
        /** Colima disk file on the Mac against what Docker reports; present only on a running Colima VM. */
        colimaDisk?: ColimaDiskReport;
        ports?: {
            http: {
                requested: number;
                chosen: number | null;
                explicit: boolean;
                reason: string;
            };
            https: {
                requested: number;
                chosen: number | null;
                explicit: boolean;
                reason: string;
            };
            postgres?: {
                requested: number;
                chosen: number | null;
                explicit: boolean;
                reason: string;
            };
        };
        observed?: unknown;
    };
    errors: DoctorError[];
}
type DoctorCheck = () => CheckResult | Promise<CheckResult>;
/** Wait for concurrent probes to finish even if one throws, so they can release resources. */
export declare function collectDoctorChecks(machineChecks: DoctorCheck[], projectChecks: DoctorCheck[]): Promise<{
    checks: CheckResult[];
    errors: DoctorError[];
}>;
/**
 * Usage errors are raised before any probe runs, so there is no report to describe. `data: null` keeps a consumer
 * from reading placeholder values (`inProject: false`, `checks: []`) as measurements, the same shape `logs` uses.
 */
export interface DoctorUsageReport {
    schemaVersion: typeof SCHEMA_VERSION;
    data: null;
    errors: DoctorError[];
}
export declare function createDoctorUsageReport(errors: DoctorError[]): DoctorUsageReport;
/** Produce the same readiness decision for human and machine consumers. */
export declare function createDoctorReport(checks: CheckResult[], inProject: boolean, errors?: DoctorError[], portPlan?: HostPortPlan | null, host?: HostInfo, capabilities?: string[], buildCache?: DockerBuildCacheReport, commit?: string): DoctorReport;
/** 0: ready (warnings permitted), 1: blocking findings, 2: usage/internal failure. */
export declare function getDoctorExitCode(report: DoctorReport): 0 | 1 | 2;
/**
 * Splits a `--fix` run into repairs and manual work. A failed check that a planned (dry-run) repair
 * covers counts as repairable only; a failure that remains after an applied repair stays manual work; `needsActionCount` keeps the failures nobody will repair automatically.
 */
export declare function summarizeDoctorFix(results: CheckResult[], actions: DoctorAction[]): {
    repairableCount: number;
    needsActionCount: number;
};
export {};
