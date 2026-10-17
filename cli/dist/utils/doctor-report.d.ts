import type { CheckResult } from "../types/index.js";
import type { HostInfo } from "./agent-host.js";
import type { DoctorAction } from "./doctor-fix.js";
import type { HostPortPlan } from "./host-port-plan.js";
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
        /** Present only with `--fix`: every repair planned, applied, skipped or failed. */
        actions?: DoctorAction[];
        host?: HostInfo & {
            containerRuntimeReachable: boolean | null;
        };
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
            postgres: {
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
export declare function createDoctorReport(checks: CheckResult[], inProject: boolean, errors?: DoctorError[], portPlan?: HostPortPlan | null, host?: HostInfo): DoctorReport;
/** 0: ready (warnings permitted), 1: blocking findings, 2: usage/internal failure. */
export declare function getDoctorExitCode(report: DoctorReport): 0 | 1 | 2;
export {};
