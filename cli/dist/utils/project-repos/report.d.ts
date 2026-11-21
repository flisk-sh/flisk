import type { CheckResult, RepoConfig } from "../../types/index.js";
import { type GitRunner } from "./clone.js";
/**
 * Doctor check for configured service repositories. Read-only: never modifies repository state.
 */
export declare function checkProjectRepos(projectRoot: string, repos?: RepoConfig[], runner?: GitRunner, options?: {
    strict?: boolean;
}): Promise<CheckResult>;
