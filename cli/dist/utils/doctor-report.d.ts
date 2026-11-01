import type { CheckResult, DoctorAction, HostPortPlan } from "../types/index.js";
import type { HostInfo } from "./agent-host.js";
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
        /** Present only when a failing check has a runnable command: most blocking first. */
        fixFirst?: RankedFix[];
        /** Present only with `--fix`: every repair planned, applied, skipped or failed. */
        actions?: DoctorAction[];
        host?: HostInfo & {
            containerRuntimeReachable: boolean | null;
        };
        buildCache?: DockerBuildCacheReport;
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
    };
    errors: DoctorError[];
}
type DoctorCheck = () => CheckResult | Promise<CheckResult>;
/** Wait for concurrent probes to finish even if one throws, so they can release resources. */
export declare function collectDoctorChecks(machineChecks: DoctorCheck[], projectChecks: DoctorCheck[]): Promise<{
    checks: CheckResult[];
    errors: DoctorError[];
}>;
/** Produce the same readiness decision for human and machine consumers. */
export declare function createDoctorReport(checks: CheckResult[], inProject: boolean, errors?: DoctorError[], portPlan?: HostPortPlan | null, host?: HostInfo, capabilities?: string[], buildCache?: DockerBuildCacheReport): DoctorReport;
/** 0: ready (warnings permitted), 1: blocking findings, 2: usage/internal failure. */
export declare function getDoctorExitCode(report: DoctorReport): 0 | 1 | 2;
export {};
