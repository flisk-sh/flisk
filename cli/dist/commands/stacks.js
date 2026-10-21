// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import { Command } from "commander";
import { createDiscoveryContext } from "../utils/discovery-context.js";
import { errorFactories, runCommand } from "../utils/errors.js";
import { formatCount, showDetail, showEmptyState, showStep } from "../utils/formatting.js";
import { createMachineEnvelope, writeMachineError } from "../utils/machine-output.js";
import { findProjectRoot } from "../utils/paths.js";
export const stacksCommand = new Command("stacks")
    .description("List all stacks and their resources")
    .alias("ls") // Keep 'flisk ls' as shorthand
    .option("-v, --verbose", "Show detailed information about each stack", false)
    .option("--services", "Include list of services in each stack", false)
    .option("--json", "Output a versioned JSON stack report", false)
    .action(async (options) => {
    const action = async () => {
        if (options.json && !findProjectRoot()) {
            writeMachineError(errorFactories.notInProject());
        }
        const discovery = createDiscoveryContext();
        const verbose = options.verbose || stacksCommand.parent?.opts().verbose === true;
        if (options.json) {
            const stacks = discovery.stacks.map((stack) => ({
                name: stack.name,
                resourceCount: stack.resourceCount,
                ...(verbose ? { description: stack.description } : {}),
                ...(options.services ? { services: stack.resources.map((service) => service.name) } : {}),
            }));
            console.log(JSON.stringify(createMachineEnvelope({ stacks })));
            return;
        }
        if (discovery.stackNames.length === 0) {
            showEmptyState("stacks");
            return;
        }
        if (verbose || options.services) {
            showStep(`Found ${formatCount(discovery.stacks.length, "stack")}:\n`);
            for (const stack of discovery.stacks) {
                console.log(chalk.bold(`${stack.name}`));
                showDetail(`${stack.description}`);
                if (options.services) {
                    showDetail("Services:");
                    for (const service of stack.resources) {
                        showDetail(`${service.name}`, 4);
                    }
                }
                console.log();
            }
        }
        else {
            showStep(`Found ${formatCount(discovery.stackNames.length, "stack")}:\n`);
            for (const name of discovery.stackNames) {
                const serviceCount = discovery.resourcesByStack.get(name)?.length || 0;
                console.log(chalk.bold(`  ${name}`));
                showDetail(`${formatCount(serviceCount, "service")}`, 4);
            }
            showDetail("\nRun with --verbose for more details, or --services to see all services in each stack.", 0);
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
