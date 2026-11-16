/** Runs doctor checks, skips container checks once the runtime failed, and orders and summarises results. */
import type { CheckResult } from "../types/index.js";
import type { ExecAsync } from "./exec-async.js";
/** Failures are shown before passing statuses, with a 5432 conflict first. */
export declare function orderDoctorResults(results: CheckResult[]): CheckResult[];
export declare function getDoctorOutcomeMessage(inProject: boolean, allPassed: boolean): string;
export type DoctorCheckFn = ((exec?: ExecAsync) => CheckResult | Promise<CheckResult>) & {
    requiresContainerRuntime?: boolean;
    checkName?: string;
};
export declare const CONTAINER_CHECK_NAMES_MAP: Record<string, string>;
export declare const CONTAINER_DEPENDENT_CHECK_NAMES: Set<string>;
export declare function isContainerDependentCheck(check: DoctorCheckFn): boolean;
export declare function requiresContainerRuntime(checkName: string, check: () => CheckResult | Promise<CheckResult>): DoctorCheckFn;
export declare function runChecks(checks: DoctorCheckFn[], options?: {
    all?: boolean;
    containerRuntimeFailed?: boolean;
}): Promise<CheckResult[]>;
export declare function formatDoctorSummary(results: CheckResult[]): string;
