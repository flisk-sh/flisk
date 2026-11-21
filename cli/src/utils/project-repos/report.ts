// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { readProjectConfig } from "../../generator/template-engine.js";
import type { CheckResult, RepoConfig } from "../../types/index.js";
import { defaultGitRunner, type GitRunner } from "./clone.js";
import { validateRepoList } from "./validate.js";

/**
 * Doctor check for configured service repositories. Read-only: never modifies repository state.
 */
export async function checkProjectRepos(
  projectRoot: string,
  repos?: RepoConfig[],
  runner: GitRunner = defaultGitRunner,
  options: { strict?: boolean } = {},
): Promise<CheckResult> {
  let repoList = repos;
  if (!repoList) {
    try {
      repoList = readProjectConfig(projectRoot).repos;
    } catch {
      // Handled by other doctor config checks
      return {
        name: "Service Repositories",
        didPass: true,
        isSkipped: true,
        message: "Could not read project configuration",
      };
    }
  }

  if (!repoList || repoList.length === 0) {
    return {
      name: "Service Repositories",
      didPass: true,
      isSkipped: true,
      message: "No external repositories configured",
    };
  }

  const listValidation = validateRepoList(repoList, projectRoot);
  if (!listValidation.valid) {
    return {
      name: "Service Repositories",
      didPass: false,
      message: `Invalid repository configuration: ${listValidation.reason}`,
      fix: "Edit .flisk/project.json and correct the repos list.",
    };
  }

  const missing: string[] = [];
  const warnings: string[] = [];
  const present: string[] = [];

  for (const repo of repoList) {
    const targetPath = resolve(projectRoot, repo.dir);
    if (!existsSync(targetPath)) {
      missing.push(`${repo.url} at ${repo.dir}`);
      continue;
    }

    // Target exists: verify it is the top level of its own git repo. Git searches parent directories,
    // so a plain folder inside another repository would otherwise be checked against that repository.
    let isGit = false;
    try {
      const topLevel = (await runner(["rev-parse", "--show-toplevel"], { cwd: targetPath })).trim();
      isGit = realpathSync(topLevel) === realpathSync(targetPath);
    } catch {
      isGit = false;
    }

    if (!isGit) {
      missing.push(`${repo.dir} (folder exists but is not a Git repository)`);
      continue;
    }

    // Check branch if configured
    if (repo.branch) {
      try {
        const branchOutput = await runner(["rev-parse", "--abbrev-ref", "HEAD"], {
          cwd: targetPath,
        });
        const currentBranch = branchOutput.trim();
        if (currentBranch !== repo.branch) {
          warnings.push(`${repo.dir} is on branch "${currentBranch}", expected "${repo.branch}"`);
        }
      } catch {
        warnings.push(`${repo.dir} could not determine current branch`);
      }
    }

    // Check uncommitted changes
    try {
      const statusOutput = await runner(["status", "--porcelain"], { cwd: targetPath });
      if (statusOutput.trim().length > 0) {
        warnings.push(`${repo.dir} has local uncommitted changes`);
      }
    } catch {
      warnings.push(`${repo.dir} could not be checked for uncommitted changes`);
    }

    present.push(repo.dir);
  }

  if (missing.length > 0) {
    return {
      name: "Service Repositories",
      didPass: false,
      message: `${missing.length} service repository missing: ${missing.join("; ")}`,
      fix: "Run flisk repos clone; or run flisk up to clone missing repositories.",
    };
  }

  if (warnings.length > 0) {
    return {
      name: "Service Repositories",
      didPass: false,
      isWarning: !options.strict,
      message: `${present.length} repository cloned, with notes: ${warnings.join("; ")}`,
      fix: "Check your local Git branches and uncommitted changes.",
    };
  }

  return {
    name: "Service Repositories",
    didPass: true,
    message: `All ${present.length} service repositories cloned and clean`,
  };
}
