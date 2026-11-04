// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { homedir } from "node:os";
import path from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { CONNECT_HOSTS, connectAgentHost, resolveConnectHost, } from "../utils/agent-connect.js";
import { FliskError, runCommand } from "../utils/errors.js";
import { createMachineEnvelope, writeMachineError } from "../utils/machine-output.js";
import { findProjectRoot } from "../utils/paths.js";
const ACTION_COLORS = {
    create: chalk.green,
    update: chalk.yellow,
    unchanged: chalk.gray,
    kept: chalk.magenta,
};
function displayPath(file, projectRoot) {
    const home = homedir();
    const rel = path.relative(projectRoot, file);
    if (!rel.startsWith("..") && !path.isAbsolute(rel))
        return rel;
    return file.startsWith(home) ? `~${file.slice(home.length)}` : file;
}
function printResult(result) {
    const isUpToDate = result.changes.every((change) => change.action === "unchanged");
    const where = result.scope === "global" ? "user config" : result.projectRoot;
    const heading = result.dryRun
        ? `Dry run - would connect Flisk to ${result.label} (${where})`
        : isUpToDate
            ? `Flisk is already connected to ${result.label} (${where}); nothing changed`
            : `Connected Flisk to ${result.label} (${where})`;
    console.log(heading);
    const mcp = result.changes.filter((change) => change.kind === "mcp");
    for (const change of mcp) {
        const action = ACTION_COLORS[change.action](change.action.padEnd(9));
        console.log(`  ${action} ${displayPath(change.path, result.projectRoot)}  (MCP server "flisk")`);
    }
    const skills = result.changes.filter((change) => change.kind === "skill");
    const dirs = [...new Set(skills.map((change) => path.dirname(path.dirname(change.path))))];
    for (const dir of dirs) {
        const inDir = skills.filter((change) => path.dirname(path.dirname(change.path)) === dir);
        for (const action of ["create", "update", "unchanged", "kept"]) {
            const count = inDir.filter((change) => change.action === action).length;
            if (count === 0)
                continue;
            const label = ACTION_COLORS[action](action.padEnd(9));
            console.log(`  ${label} ${displayPath(dir, result.projectRoot)}/  (${count} Flisk skill${count === 1 ? "" : "s"})`);
        }
    }
    if (result.changes.some((change) => change.action === "kept")) {
        console.log(chalk.gray("  kept = a different version is already there; rerun with --force to replace it"));
    }
    if (result.dryRun) {
        console.log("No files were written. Run again without --dry-run to apply.");
        return;
    }
    console.log("\nNext:");
    for (const line of result.next)
        console.log(`  - ${line}`);
    console.log('  - Then ask the agent: "Run Flisk doctor, then start this project\'s stack and check its status."');
}
export const connectCommand = new Command("connect")
    .description("Connect a coding agent to Flisk: write the flisk mcp server entry and the Flisk skills")
    .argument("<host>", `Agent host: ${CONNECT_HOSTS.join(", ")}`)
    .option("--project", "Write into this project (default)")
    .option("--global", "Write the MCP entry to the host's user config instead (no skills)")
    .option("--dry-run", "Print what would be written, without changing any file", false)
    .option("--force", "Replace an existing, different flisk entry or edited Flisk skill", false)
    .option("--json", "Print the result as a JSON envelope")
    .action(async (hostArg, options) => {
    const run = () => {
        const host = resolveConnectHost(hostArg);
        if (options.global && options.project) {
            throw new FliskError("Choose one of --project and --global", [
                `Run \`flisk connect ${host}\` for this project, or \`flisk connect ${host} --global\` for your user config`,
            ], 2);
        }
        const projectRoot = findProjectRoot() ?? process.cwd();
        return connectAgentHost({
            host,
            scope: options.global ? "global" : "project",
            projectRoot,
            homeDir: homedir(),
            dryRun: options.dryRun === true,
            force: options.force === true,
        });
    };
    if (options.json) {
        let result;
        try {
            result = run();
        }
        catch (error) {
            writeMachineError(error);
        }
        console.log(JSON.stringify(createMachineEnvelope({ ok: true, ...result })));
        return;
    }
    await runCommand(async () => printResult(run()));
});
