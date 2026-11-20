// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import { Command } from "commander";
import { routeUsageErrorsToJson } from "../utils/command-helpers.js";
import { createDiscoveryContext } from "../utils/discovery-context.js";
import { errorFactories, FliskError, runCommand } from "../utils/errors.js";
import { formatCount, showDetail, showEmptyState, showStep } from "../utils/formatting.js";
import { createMachineEnvelope, writeMachineError } from "../utils/machine-output.js";
import { findProjectRoot } from "../utils/paths.js";
import { skippedServiceFiles, stackExists } from "../utils/services.js";

export const stacksCommand = routeUsageErrorsToJson(new Command("stacks"))
  .description("List all stacks and their resources")
  .alias("ls") // Keep 'flisk ls' as shorthand
  .argument("[stack]", "Only show this stack (default: all stacks)")
  .option("-v, --verbose", "Show detailed information about each stack", false)
  .option("--services", "Include list of services in each stack", false)
  .option("--stack <name>", "Only show this stack")
  .option("--json", "Output a versioned JSON stack report", false)
  .addHelpText(
    "after",
    "\nExamples:\n  flisk stacks\n  flisk stacks app\n  flisk stacks --stack app\n  flisk stacks app --json\n  flisk stacks --services\n  flisk stacks --json\n\nTo list the resources of one stack, run: flisk resources --stack <name>",
  )
  .action(async (stackArg: string | undefined, options) => {
    const action = async (): Promise<void> => {
      if (options.json && !findProjectRoot()) {
        writeMachineError(errorFactories.notInProject());
      }

      const discovery = createDiscoveryContext();
      const verbose = options.verbose || stacksCommand.parent?.opts().verbose === true;
      if (typeof stackArg === "string" && typeof options.stack === "string") {
        throw new FliskError(
          "Choose one of [stack] and --stack <name>",
          ["Pass the stack as a positional argument or with --stack, not both"],
          2,
        );
      }
      const stackName =
        typeof stackArg === "string"
          ? stackArg
          : typeof options.stack === "string"
            ? options.stack
            : undefined;
      // An empty selector is never a stack: a service.json with `"stack": ""` would otherwise pass the existence check.
      if (
        stackName !== undefined &&
        (stackName === "" || !stackExists(stackName, discovery.resources))
      ) {
        throw errorFactories.stackNotFound(stackName, discovery.stackNames);
      }
      const visibleStacks =
        stackName !== undefined
          ? discovery.stacks.filter((stack) => stack.name === stackName)
          : discovery.stacks;
      const visibleNames = visibleStacks.map((stack) => stack.name);

      if (options.json) {
        const stacks = visibleStacks.map((stack) => ({
          name: stack.name,
          resourceCount: stack.resourceCount,
          ...(verbose ? { description: stack.description } : {}),
          ...(options.services ? { services: stack.resources.map((service) => service.name) } : {}),
        }));
        console.log(
          JSON.stringify(
            createMachineEnvelope({ stacks, ...skippedServiceFiles(discovery.problems) }),
          ),
        );
        return;
      }

      if (visibleNames.length === 0) {
        showEmptyState("stacks");
        return;
      }

      if (verbose || options.services) {
        showStep(`Found ${formatCount(visibleStacks.length, "stack")}:\n`);

        for (const stack of visibleStacks) {
          console.log(chalk.bold(`${stack.name}`));
          showDetail(`${stack.description}`);

          if (verbose) {
            // --verbose adds real detail over the default listing: the service count
            // (same "services" wording as the default branch) plus each resource's type and port.
            showDetail(formatCount(stack.resources.length, "service"));
            for (const service of stack.resources) {
              const type = service.config?.appType ?? service.type ?? "unknown";
              const port = service.port ? `  :${service.port}` : "";
              showDetail(`${service.name}  ${type}${port}`, 4);
            }
          } else if (options.services) {
            showDetail("Services:");
            for (const service of stack.resources) {
              showDetail(`${service.name}`, 4);
            }
          }

          console.log();
        }
      } else {
        showStep(`Found ${formatCount(visibleNames.length, "stack")}:\n`);

        for (const name of visibleNames) {
          const serviceCount = discovery.resourcesByStack.get(name)?.length || 0;
          console.log(chalk.bold(`  ${name}`));
          showDetail(`${formatCount(serviceCount, "service")}`, 4);
        }

        showDetail(
          stackName !== undefined
            ? `\nRun with --verbose for more details, --services to list its services, or "flisk resources --stack ${stackName}" to list its resources.`
            : "\nRun with --verbose for more details, or --services to see all services in each stack.",
          0,
        );
      }
    };

    if (options.json) {
      try {
        await action();
      } catch (error) {
        writeMachineError(error);
      }
      return;
    }

    await runCommand(action);
  });
