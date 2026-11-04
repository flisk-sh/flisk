import type { CheckResult } from "../types/index.js";
/** One entry of the "Fix first" list: a failing check and one command that can be pasted as is. */
export interface RankedFix {
    /** 1 is the fix that unblocks the most other checks. */
    rank: number;
    /** Stable kebab-case id derived from the check name (for example `container-runtime`). */
    checkId: string;
    /** Check name as shown in the report, so a consumer can find the matching `checks` entry. */
    check: string;
    command: string;
}
export declare function checkId(name: string): string;
/**
 * Failing checks ordered by how much they block, each with one runnable command. Hard failures come before
 * warnings (a low-disk warning never outranks a stopped daemon), and a port 5432 conflict leads the port tier.
 * Checks without a command that is valid on this platform are left out; their prose fix is still printed.
 */
export declare function rankDoctorFixes(results: CheckResult[], platform?: NodeJS.Platform): RankedFix[];
/** The human "Fix first" section, or an empty list when there is nothing to run. */
export declare function formatFixFirst(fixes: RankedFix[]): string[];
