import type { CheckResult, DoctorAction } from "../types/index.js";
export declare function printFixActions(actions: DoctorAction[], dryRun: boolean, failedCheckCount?: number): void;
export declare function printDoctorResults(list: CheckResult[], options?: {
    problemsOnly?: boolean;
}): void;
export declare function renderDoctorOutput(machineResults: CheckResult[], projectResults: CheckResult[], inProject: boolean, options?: {
    all?: boolean;
    problemsOnly?: boolean;
}, allResults?: CheckResult[]): void;
