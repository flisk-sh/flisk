/**
 * Hub for the `flisk repos` jobs, split into one module per job (see #4914):
 * - `./project-repos/validate.ts` — pure validation (URL, branch, dir, whole list)
 * - `./project-repos/clone.ts` — cloning (one repo, the missing loop, the git runner)
 * - `./project-repos/report.ts` — the read-only doctor drift report
 *
 * Existing importers keep importing from here; the leaf modules are the new home.
 */
export { type CloneRepoResult, cloneMissingRepos, cloneRepo, defaultGitRunner, type GitRunner, redactRepoUrl, } from "./project-repos/clone.js";
export { checkProjectRepos } from "./project-repos/report.js";
export { validateRepoBranch, validateRepoDir, validateRepoList, validateRepoUrl, } from "./project-repos/validate.js";
