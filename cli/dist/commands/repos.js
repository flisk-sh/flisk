// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import { Command } from "commander";
import { readProjectConfig } from "../generator/template-engine.js";
import { handleDryRun } from "../utils/command-helpers.js";
import { requireProjectRoot } from "../utils/errors.js";
import { createMachineEnvelope, toMachineError } from "../utils/machine-output.js";
import { cloneMissingRepos, planRepoClones, } from "../utils/project-repos.js";
function repoFields(entry) {
    return {
        url: entry.url,
        dir: entry.dir,
        ...(entry.branch ? { branch: entry.branch } : {}),
    };
}
/** Both modes report the same two lists: destinations that will be cloned, and ones kept as present. */
function summarize(entries) {
    return {
        cloned: entries
            .filter((entry) => entry.action === "clone" || entry.cloned === true)
            .map(repoFields),
        existing: entries
            .filter((entry) => entry.action === "keep" || entry.skipped === true)
            .map(repoFields),
    };
}
function printPlan(plan) {
    for (const entry of plan) {
        const branch = entry.branch ? ` (branch: ${entry.branch})` : "";
        if (entry.action === "clone") {
            console.log(`Would clone: ${entry.url} into ${entry.dir}${branch}`);
        }
        else {
            console.log(`Would keep existing folder ${entry.dir} untouched`);
        }
    }
    if (plan.length === 0)
        console.log("No external repositories configured in .flisk/project.json.");
}
export const reposCommand = new Command("repos").description("Clone the Git repositories listed in .flisk/project.json");
reposCommand
    .command("clone")
    .description("Clone missing service repositories configured in .flisk/project.json")
    .addHelpText("after", '\nEach entry of "repos" in .flisk/project.json has url, dir (relative to the project root), and optional branch.\nExisting directories are left untouched. flisk up also clones missing repositories.\n\nExamples:\n  flisk repos clone\n  flisk repos clone --dry-run\n  flisk repos clone --json\n  flisk repos clone --dry-run --json\n\nDocs: https://github.com/flisk-sh/flisk/blob/main/docs/layout.md')
    .option("--dry-run", "List the repositories that would be cloned, without creating folders or running git", false)
    .option("--json", "Output JSON result", false)
    .action(async (options) => {
    if (options.json) {
        try {
            const projectRoot = requireProjectRoot();
            const repos = readProjectConfig(projectRoot).repos ?? [];
            if (options.dryRun) {
                const plan = planRepoClones(projectRoot, repos);
                console.log(JSON.stringify(createMachineEnvelope({ dryRun: true, ...summarize(plan) })));
                return;
            }
            const results = repos.length > 0 ? await cloneMissingRepos(projectRoot, repos) : [];
            console.log(JSON.stringify(createMachineEnvelope({ dryRun: false, ...summarize(results) })));
        }
        catch (error) {
            // Every --json failure writes one error envelope on stdout, as the other --json commands do.
            const { error: machineError, exitCode } = toMachineError(error);
            console.log(JSON.stringify(createMachineEnvelope(null, [{ ...machineError, code: "REPOS_FAILED" }])));
            process.exitCode = exitCode;
        }
        return;
    }
    const projectRoot = requireProjectRoot();
    const config = readProjectConfig(projectRoot);
    const repos = config.repos ?? [];
    if (options.dryRun) {
        const plan = planRepoClones(projectRoot, repos);
        handleDryRun(options, `clone ${plan.filter((entry) => entry.action === "clone").length} missing repositories`, "flisk repos clone");
        printPlan(plan);
        return;
    }
    if (repos.length === 0) {
        console.log(chalk.gray("No external repositories configured in .flisk/project.json."));
        return;
    }
    const results = await cloneMissingRepos(projectRoot, repos);
    for (const item of results) {
        if (item.cloned) {
            console.log(chalk.green(`✓ Cloned ${item.url} into ${item.dir}`));
        }
        else {
            console.log(chalk.gray(`○ Kept existing folder ${item.dir} untouched`));
        }
    }
});
