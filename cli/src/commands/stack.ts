// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import chalk from "chalk";
import { Command } from "commander";
import { addYesOption, assertValid, confirmOrCancel } from "../utils/command-helpers.js";
import { clearDiscoveryCache, createDiscoveryContext } from "../utils/discovery-context.js";
import { errorFactories, requireProjectRoot, runCommand, TdkError } from "../utils/errors.js";
import { writeJsonFile } from "../utils/file-helpers.js";
import {
  formatCount,
  showAllSatisfyCondition,
  showCommandHeader,
  showDetail,
  showSuccess,
} from "../utils/formatting.js";
import { promptMultiSelect, promptText } from "../utils/prompt.js";
import { createKebabCaseValidator, validateStackName } from "../utils/validation.js";

type StackResourceConfig = {
  [key: string]: unknown;
  appName?: string;
  stack?: string;
};

export function parseStackResourceConfig(content: string, configPath: string): StackResourceConfig {
  try {
    return JSON.parse(content) as StackResourceConfig;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new TdkError(`Could not parse service.json at ${configPath}: ${reason}`);
  }
}

function normalizeResourceNames(names: string[]): string[] {
  const normalizedNames = names.flatMap((name) =>
    name
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
  return [...new Set(normalizedNames)];
}

export const stackCommand = addYesOption(new Command("stack"))
  .description("Organize resources into stacks (groups)")
  .argument("[stack-name]", "Stack name to assign to resources")
  .option("--list", "List resources without a stack", false)
  .option("--resources <names...>", "Resource names to add (comma- or space-separated)")
  .action(async (stackName, options) => {
    await runCommand(async () => {
      requireProjectRoot();

      showCommandHeader("Stack Management");

      const discovery = createDiscoveryContext();

      if (discovery.resources.length === 0 && options.resources === undefined) {
        console.log(
          chalk.yellow(
            "No resources discovered. Make sure you're in a project with service.json files.",
          ),
        );
        return;
      }

      showDetail(`Found ${formatCount(discovery.resources.length, "resource")}\n`, 0);

      if (discovery.stackNames.length > 0) {
        console.log(chalk.bold("Existing stacks:"));
        for (const name of discovery.stackNames) {
          const count = discovery.resourcesByStack.get(name)?.length || 0;
          showDetail(`${name} (${formatCount(count, "resource")})`);
        }
        console.log();
      }

      if (options.list) {
        if (discovery.unassignedResources.length === 0) {
          showAllSatisfyCondition("resources", "already assigned to a stack");
          return;
        }

        console.log(
          chalk.bold(`${discovery.unassignedResources.length} resources without a stack:`),
        );
        for (const resource of discovery.unassignedResources) {
          showDetail(`${resource.name}`);
          showDetail(`${resource.configPath}`, 4);
        }
        return;
      }

      if (!process.stdin.isTTY) {
        if (options.resources === undefined) {
          throw new TdkError("Interactive resource selection requires a TTY.", [
            "Pass --resources <name...> to select resources without a prompt.",
            "Use --list to inspect unassigned resources without changing them.",
          ]);
        }
        if (!stackName) {
          throw new TdkError("A stack name is required when stdin is not a TTY.", [
            "Use: tdk stack <stack-name> --resources <name...> [--yes]",
          ]);
        }
        if (!options.yes) {
          throw new TdkError("Confirmation requires a TTY.", [
            "Pass --yes to skip confirmation when assigning resources without a TTY.",
          ]);
        }
      }

      if (stackName) assertValid(validateStackName(stackName));
      let targetStack = stackName;
      if (!targetStack) {
        const name = await promptText({
          message: "Stack name (kebab-case recommended):",
          validate: (input: string) => {
            const validation = createKebabCaseValidator("stack")(input);
            return validation === true || validation;
          },
        });
        targetStack = name;
      }

      const resourcesToUpdate = discovery.unassignedResources;
      const selectedResources: string[] = [];

      if (options.resources !== undefined) {
        const requestedNames = normalizeResourceNames(options.resources);
        if (requestedNames.length === 0) {
          throw new TdkError("Pass at least one resource name to --resources.", [
            "Example: `tdk stack api --resources users-api orders-api --yes`",
          ]);
        }

        const configPathsByName = new Map<string, string[]>();
        for (const resource of discovery.resources) {
          const configPaths = configPathsByName.get(resource.name) ?? [];
          configPaths.push(resource.configPath);
          configPathsByName.set(resource.name, configPaths);
        }

        const duplicates = [...configPathsByName].filter(
          ([, configPaths]) => configPaths.length > 1,
        );
        if (duplicates.length > 0) {
          throw new TdkError(
            "Cannot assign resources while duplicate names are present.",
            duplicates.map(
              ([name, configPaths]) => `Duplicate "${name}" found in ${configPaths.join(" and ")}`,
            ),
          );
        }

        const validNames = [...configPathsByName.keys()].sort();
        const resourceByName = new Map(
          discovery.resources.map((resource) => [resource.name, resource] as const),
        );

        for (const name of requestedNames) {
          const resource = resourceByName.get(name);
          if (!resource) {
            const error = errorFactories.resourceNotFound(name, validNames);
            error.suggestions.unshift(`Valid resources: ${validNames.join(", ")}`);
            throw error;
          }
          if (resource.stack) {
            throw new TdkError(
              `Resource "${name}" is already assigned to stack "${resource.stack}".`,
              ["Run `tdk resources` to review current assignments."],
            );
          }
          selectedResources.push(resource.configPath);
        }
      } else {
        if (resourcesToUpdate.length === 0) {
          console.log(chalk.yellow("\nNo resources available to add to this stack."));
          return;
        }

        const promptedResources = await promptMultiSelect({
          message: `Select resources to add to stack "${targetStack}":`,
          choices: resourcesToUpdate.map((resource) => ({
            title: resource.name,
            value: resource.configPath,
          })),
          validate: (input: string[]) => {
            if (input.length === 0) return "Select at least one resource";
            return true;
          },
        });

        if (promptedResources.length === 0) {
          console.log(chalk.yellow("No resources selected. Exiting."));
          return;
        }
        selectedResources.push(...promptedResources);
      }

      showDetail(
        `\nWill add "stack": "${targetStack}" to ${formatCount(selectedResources.length, "resource")}.`,
        0,
      );

      const confirmed = options.yes || (await confirmOrCancel("Proceed?"));
      if (!confirmed) return;

      // Clear cache since we're about to modify resources
      clearDiscoveryCache();

      let updated = 0;
      for (const configPath of selectedResources) {
        const content = readFileSync(configPath, "utf-8");
        const config = parseStackResourceConfig(content, configPath);
        config.stack = targetStack;
        writeJsonFile(configPath, config);

        updated++;
        showSuccess(`${config.appName || configPath}`);
      }

      console.log();
      showSuccess(`Updated ${formatCount(updated, "resource")}.`);
      showDetail(`\nYou can now run: tdk up ${targetStack}`, 0);
    });
  });
