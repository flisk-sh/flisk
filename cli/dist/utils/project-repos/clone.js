// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmdirSync, rmSync, statSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { readProjectConfig } from "../../generator/template-engine.js";
import { FliskError } from "../errors.js";
import { validateRepoDir, validateRepoList, validateRepoUrl } from "./validate.js";
const execFilePromise = promisify(execFile);
const GIT_TIMEOUT_MS = 120_000;
export const defaultGitRunner = async (args, options) => {
    const { stdout } = await execFilePromise("git", args, {
        cwd: options?.cwd,
        encoding: "utf-8",
        timeout: GIT_TIMEOUT_MS,
        windowsHide: true,
    });
    return stdout;
};
function firstLine(error) {
    const stderr = String(error.stderr ?? error).trim();
    return stderr.split(/\r?\n/)[0] ?? "";
}
/** Replaces user-info (tokens, passwords) in any URL inside a string, so it can be printed safely. */
export function redactRepoUrl(text) {
    return text.replace(/([a-z][a-z0-9+.-]*:\/\/)[^@/\s]+@/gi, "$1***@");
}
/**
 * Collects the ancestors of `targetPath` that do not exist yet, from the outermost to the innermost.
 * These are exactly the directories this clone attempt may create, so a failed attempt can remove
 * them without touching a parent folder that was already present.
 */
function missingAncestors(targetPath, projectRoot) {
    const missing = [];
    const root = resolve(projectRoot);
    const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
    let current = dirname(targetPath);
    while (current !== root && current.startsWith(prefix)) {
        if (existsSync(current))
            break;
        missing.unshift(current);
        const parent = dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    return missing;
}
/** Removes empty directories created by this clone attempt, leaving pre-existing parents intact. */
function cleanupCreatedParents(paths) {
    // Remove the deepest directory first, so each parent is empty when the loop reaches it.
    for (const path of [...paths].reverse()) {
        try {
            rmdirSync(path);
        }
        catch {
            // Keep the clone error as the failure; a directory that is no longer empty is left in place.
        }
    }
}
/**
 * Clones a single repository if its destination directory does not already exist.
 * Leaves existing directories untouched.
 */
export async function cloneRepo(repo, projectRoot, runner = defaultGitRunner) {
    const dirValidation = validateRepoDir(repo.dir, projectRoot);
    if (!dirValidation.valid || !dirValidation.targetPath) {
        throw new FliskError(`Invalid repository destination "${repo.dir}": ${dirValidation.reason}`, [
            "Specify a path relative to the project root, such as services/shop/orders-api",
        ]);
    }
    const urlValidation = validateRepoUrl(repo.url);
    if (!urlValidation.valid) {
        throw new FliskError(`Invalid repository URL "${repo.url}": ${urlValidation.reason}`, [
            "Specify a valid git clone URL, such as git@github.com:org/repo.git or https://github.com/org/repo.git",
        ]);
    }
    const targetPath = dirValidation.targetPath;
    if (existsSync(targetPath)) {
        if (!statSync(targetPath).isDirectory()) {
            throw new FliskError(`Cannot clone "${redactRepoUrl(repo.url)}": "${repo.dir}" exists and is not a directory`, ["Move or remove the file, then run flisk repos clone again"]);
        }
        return {
            url: repo.url,
            dir: repo.dir,
            cloned: false,
            skipped: true,
            reason: "destination directory already exists",
        };
    }
    const createdParents = missingAncestors(targetPath, projectRoot);
    try {
        mkdirSync(dirname(targetPath), { recursive: true });
    }
    catch (error) {
        cleanupCreatedParents(createdParents);
        throw new FliskError(`Failed to create the parent directory for "${redactRepoUrl(repo.url)}" at "${repo.dir}": ${error.message}`, ["Check that the parent path is writable and is not a file"]);
    }
    // Clone into a sibling temp directory and rename it into place, so a concurrent clone of the same
    // destination is never removed by this process, and a failed clone leaves nothing at targetPath.
    const tempPath = `${targetPath}.flisk-clone-${process.pid}-${Date.now()}`;
    const gitArgs = [
        "clone",
        "--quiet",
        ...(repo.branch ? ["--branch", repo.branch] : []),
        "--",
        repo.url,
        tempPath,
    ];
    try {
        await runner(gitArgs, { cwd: projectRoot });
    }
    catch (error) {
        rmSync(tempPath, { recursive: true, force: true });
        cleanupCreatedParents(createdParents);
        const hint = redactRepoUrl(firstLine(error));
        throw new FliskError(`Failed to clone repository "${redactRepoUrl(repo.url)}" into "${repo.dir}": ${hint || "git clone failed"}`, [
            "Verify your Git network access and authentication (SSH keys or personal access tokens)",
            `Try cloning manually to inspect details: git clone ${redactRepoUrl(repo.url)} ${repo.dir}`,
        ]);
    }
    if (existsSync(targetPath)) {
        // Another process created the destination while this clone ran; keep its copy.
        rmSync(tempPath, { recursive: true, force: true });
        return {
            url: repo.url,
            dir: repo.dir,
            cloned: false,
            skipped: true,
            reason: "destination directory already exists",
        };
    }
    renameSync(tempPath, targetPath);
    return {
        url: repo.url,
        dir: repo.dir,
        cloned: true,
        skipped: false,
    };
}
/**
 * Clones all missing repositories configured in the project.
 */
export async function cloneMissingRepos(projectRoot, repos, runner = defaultGitRunner) {
    const repoList = repos ?? readProjectConfig(projectRoot).repos ?? [];
    if (repoList.length === 0)
        return [];
    const listValidation = validateRepoList(repoList, projectRoot);
    if (!listValidation.valid) {
        throw new FliskError(`Invalid repos configuration in project: ${listValidation.reason}`, [
            "Review the repos entry in .flisk/project.json",
        ]);
    }
    const results = [];
    for (const repo of repoList) {
        const result = await cloneRepo(repo, projectRoot, runner);
        results.push(result);
    }
    return results;
}
