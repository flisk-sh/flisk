// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import { Command } from "commander";
import { VALID_RESOURCE_TYPES } from "../utils/constants.js";
import { createDiscoveryContext } from "../utils/discovery-context.js";
import { errorFactories, requireProjectRoot, runCommand, TdkError } from "../utils/errors.js";
import {
  formatCount,
  showAllSatisfyCondition,
  showDetail,
  showEmptyState,
  showStep,
} from "../utils/formatting.js";
import { createMachineEnvelope, writeMachineError } from "../utils/machine-output.js";
import { findProjectRoot } from "../utils/paths.js";
import { stackExists } from "../utils/services.js";
import { includes } from "../utils/validation.js";

export const resourcesCommand = new Command("resources")
  .description("List all resources (services) in the project")
  .option("-v, --verbose", "Show detailed information about each resource", false)
  .option("-s, --stack <stack>", "Filter resources by stack name")
  .option("-t, --type <type>", "Filter resources by type")
  .option("--no-stack", "Show only resources without a stack")
  .option("--ports", "Show port assignments", false)
  .option("--json", "Output a versioned JSON resource report", false)
  .action(async (options) => {
    const action = async (): Promise<void> => {
      if (options.json) {
        if (!findProjectRoot()) {
          writeMachineError(errorFactories.notInProject());
        }
      } else {
        requireProjectRoot();
      }

      if (options.type !== undefined && !includes(VALID_RESOURCE_TYPES, options.type)) {
        throw new TdkError(`Invalid resource type "${options.type}"`, [
          `Valid types: ${VALID_RESOURCE_TYPES.join(", ")}`,
        ]);
      }

      const discovery = createDiscoveryContext();
      if (options.stack && !stackExists(options.stack, discovery.resources)) {
        const error = errorFactories.stackNotFound(options.stack, discovery.stackNames);
        if (options.json) writeMachineError(error);
        error.exit();
      }
      const withoutStackFilter = options.noStack || options.stack === false;

      let resources = discovery.resources;

      if (options.stack) {
        resources = discovery.resourcesByStack.get(options.stack) || [];
        if (resources.length === 0 && !options.json && options.type === undefined) {
          showEmptyState("stack-services", ` in stack "${options.stack}"`);
          return;
        }
      }

      if (withoutStackFilter) {
        resources = discovery.unassignedResources;
        if (resources.length === 0 && !options.json && options.type === undefined) {
          showAllSatisfyCondition("resources", "assigned to a stack");
          return;
        }
      }

      if (options.type !== undefined) {
        resources = resources.filter(
          (resource) => (resource.config?.appType ?? resource.type) === options.type,
        );
      }

      if (options.json) {
        const data = resources.map((resource) => ({
          name: resource.name,
          stack: resource.stack ?? null,
          type: resource.config?.appType ?? resource.type ?? "unknown",
          port: resource.port ?? null,
          path: resource.configPath,
        }));
        console.log(JSON.stringify(createMachineEnvelope({ resources: data })));
        return;
      }

      if (resources.length === 0) {
        const stackContext = options.stack ? ` in stack "${options.stack}"` : "";
        const noStackContext = withoutStackFilter && !options.stack ? " without a stack" : "";
        const typeContext = options.type !== undefined ? ` with type "${options.type}"` : "";
        showEmptyState(
          options.stack ? "stack-services" : "resources",
          stackContext + noStackContext + typeContext,
        );
        return;
      }

      showStep(`Found ${formatCount(resources.length, "resource")}:\n`);

      if (options.verbose || options.ports) {
        for (const resource of resources) {
          console.log(chalk.bold(`${resource.name}`));

          if (resource.stack) {
            console.log(chalk.gray(`  Stack: ${resource.stack}`));
          } else {
            console.log(chalk.yellow(`  Stack: (not assigned)`));
          }

          if (options.ports && resource.port) {
            console.log(chalk.gray(`  Port: ${resource.port}`));
          }

          if (options.verbose) {
            console.log(chalk.gray(`  Type: ${resource.type || "unknown"}`));
            console.log(chalk.gray(`  Path: ${resource.configPath}`));
          }

          console.log();
        }
      } else {
        for (const resource of resources) {
          const stackInfo = resource.stack
            ? chalk.gray(` [${resource.stack}]`)
            : chalk.yellow(" [no stack]");
          console.log(`  ${resource.name}${stackInfo}`);
        }

        showDetail("\nRun with --verbose for more details or --ports to see port assignments.", 0);
      }

      const withoutStackCount =
        options.stack || options.type !== undefined
          ? resources.filter((r: { stack?: string }) => !r.stack).length
          : discovery.unassignedResources.length;

      if (withoutStackCount > 0 && !withoutStackFilter && !options.stack) {
        console.log(
          chalk.yellow(
            `\n${formatCount(withoutStackCount, "resource")} not assigned to any stack.`,
          ),
        );
        showDetail(
          'Run "flisk resources --no-stack" to see them, or "flisk stack" to assign them.',
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
