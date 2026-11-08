// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { MASTER_CONFIG_FILES } from "../utils/constants.js";
import { createDiscoveryContext } from "../utils/discovery-context.js";
import { errorFactories, FliskError, requireProjectRoot, runCommand } from "../utils/errors.js";
import { formatCount } from "../utils/formatting.js";
import { createMachineEnvelope, writeMachineError } from "../utils/machine-output.js";
import { findProjectRoot } from "../utils/paths.js";
import { findStaleProjects, pruneStaleProjects } from "../utils/stale-projects.js";
export const projectsCommand = new Command("projects")
    .description("Show project information and configuration status")
    .alias("info")
    .option("--check", "Check if project is properly configured", false)
    .option("--stale", "List stale projects whose directory is gone but Docker resources remain", false)
    .option("--prune", "With --stale: delete the containers, volumes (database data), networks and images those projects left", false)
    .option("--json", "Output a versioned JSON response")
    .action(async (options) => {
    const action = async () => {
        if (options.prune && !options.stale) {
            throw new FliskError("--prune only works with --stale", [
                "List what stale projects left: flisk projects --stale",
                "Then delete it: flisk projects --stale --prune",
            ]);
        }
        if (options.stale) {
            const report = findStaleProjects();
            if (options.prune) {
                const pruned = pruneStaleProjects(report.staleProjects);
                if (options.json) {
                    console.log(JSON.stringify(createMachineEnvelope(pruned), null, 2));
                }
                else if (pruned.projects.length === 0 && pruned.skipped.length === 0) {
                    console.log(chalk.green("✓ No stale projects found; nothing to delete."));
                }
                else {
                    for (const project of pruned.projects) {
                        console.log(chalk.bold(`• ${project.name}`));
                        const removed = Object.entries(project.removed).filter(([, names]) => names.length > 0);
                        for (const [kind, names] of removed) {
                            console.log(chalk.gray(`  Removed ${kind}: ${names.join(", ")}`));
                        }
                        for (const kept of project.kept) {
                            console.log(chalk.yellow(`  Kept ${kept.name}: ${kept.reason}`));
                        }
                    }
                }
                if (!options.json && pruned.skipped.length > 0) {
                    console.log(chalk.yellow(`Left alone, not recorded by flisk up (they may not be Flisk's): ${pruned.skipped.join(", ")}`));
                }
                if (pruned.projects.some((project) => project.kept.length > 0))
                    process.exitCode = 1;
                return;
            }
            if (options.json) {
                console.log(JSON.stringify(createMachineEnvelope({
                    staleProjects: report.staleProjects,
                    totalContainers: report.totalContainers,
                    totalVolumes: report.totalVolumes,
                    totalNetworks: report.totalNetworks,
                    totalImages: report.totalImages,
                    totalProjects: report.totalProjects,
                    totalSize: report.totalSize,
                }), null, 2));
                if (options.check) {
                    process.exitCode = report.totalProjects === 0 ? 0 : 1;
                }
                return;
            }
            console.log(chalk.blue("Stale Projects Discovery\n"));
            if (report.totalProjects === 0) {
                console.log(chalk.green("✓ No stale projects found."));
                console.log(chalk.gray("All active Docker containers and volumes correspond to existing project directories.\n"));
                if (options.check) {
                    process.exitCode = 0;
                }
                return;
            }
            console.log(chalk.yellow(`Found ${formatCount(report.totalProjects, "stale project")} (${report.totalSize} total space used):\n`));
            for (const proj of report.staleProjects) {
                console.log(chalk.bold(`• ${proj.name}`));
                if (proj.recordedPath) {
                    console.log(chalk.gray(`  Recorded Path:  ${proj.recordedPath} (deleted)`));
                }
                if (proj.containerCount > 0) {
                    console.log(chalk.gray(`  Containers:     ${formatCount(proj.containerCount, "container")}`));
                }
                if (proj.volumeCount > 0) {
                    console.log(chalk.gray(`  Volumes:        ${formatCount(proj.volumeCount, "volume")}`));
                }
                if (proj.networkCount > 0) {
                    console.log(chalk.gray(`  Networks:       ${formatCount(proj.networkCount, "network")}`));
                }
                if (proj.imageCount > 0) {
                    console.log(chalk.gray(`  Images:         ${formatCount(proj.imageCount, "image")}`));
                }
                if (proj.estimatedSizeBytes > 0) {
                    console.log(chalk.gray(`  Estimated Size: ${proj.estimatedSize}`));
                }
                console.log(chalk.cyan(`  Cleanup:        ${proj.cleanupCommand}\n`));
            }
            console.log(chalk.gray("Each project's Cleanup line says how to remove it; --prune deletes the ones Flisk recorded, database volumes included.\n"));
            if (options.check) {
                process.exitCode = 1;
            }
            return;
        }
        const projectRoot = options.json ? findProjectRoot() : requireProjectRoot();
        if (!projectRoot) {
            throw errorFactories.notInProject();
        }
        const outDir = join(projectRoot, ".flisk", ".flisk-out");
        const missing = MASTER_CONFIG_FILES.filter((file) => !existsSync(join(outDir, file)));
        if (options.json) {
            const discovery = createDiscoveryContext();
            console.log(JSON.stringify(createMachineEnvelope({
                projectRoot,
                configured: missing.length === 0,
                missingFiles: missing,
                resources: discovery.resources.length,
                stacks: discovery.stackNames,
                unassignedResources: discovery.unassignedResources.length,
            }), null, 2));
            if (options.check) {
                process.exitCode = missing.length === 0 ? 0 : 1;
            }
            return;
        }
        console.log(chalk.blue("Project Information\n"));
        console.log(chalk.bold("Project Root:"));
        console.log(chalk.gray(`  ${projectRoot}`));
        console.log();
        console.log(chalk.bold("Master Configuration:"));
        if (missing.length === 0) {
            for (const file of MASTER_CONFIG_FILES) {
                console.log(chalk.green(`  ✓ ${file}`));
            }
        }
        else {
            for (const file of MASTER_CONFIG_FILES) {
                const exists = !missing.includes(file);
                if (exists) {
                    console.log(chalk.green(`  ✓ ${file}`));
                }
                else {
                    console.log(chalk.red(`  ✗ ${file} (missing)`));
                }
            }
        }
        console.log();
        const discovery = createDiscoveryContext();
        console.log(chalk.bold("Project Stats:"));
        console.log(chalk.gray(`  Resources: ${discovery.resources.length}`));
        console.log(chalk.gray(`  Stacks:    ${discovery.stackNames.length}`));
        if (discovery.unassignedResources.length > 0) {
            console.log(chalk.yellow(`  ⚠ Unassigned: ${formatCount(discovery.unassignedResources.length, "resource")}`));
        }
        console.log();
        if (discovery.stackNames.length > 0) {
            console.log(chalk.bold("Stacks:"));
            for (const name of discovery.stackNames) {
                const count = discovery.resourcesByStack.get(name)?.length || 0;
                console.log(chalk.gray(`  ${name} (${formatCount(count, "resource")})`));
            }
            console.log();
        }
        if (missing.length > 0) {
            console.log(chalk.yellow("Project not fully configured!"));
            console.log(chalk.gray('Run "flisk project" to create master config files.\n'));
        }
        else {
            console.log(chalk.gray("Quick commands:"));
            console.log(chalk.gray("  flisk resource    - Create a new resource"));
            console.log(chalk.gray("  flisk stack       - Organize resources into stacks"));
            console.log(chalk.gray("  flisk up <stack>  - Start a stack"));
        }
        if (options.check) {
            process.exit(missing.length === 0 ? 0 : 1);
        }
    };
    if (options.json) {
        try {
            await action();
        }
        catch (error) {
            writeMachineError(error);
        }
        return;
    }
    await runCommand(action);
});
