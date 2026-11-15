// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { generateMasterConfigs } from "../generator/template-engine.js";
import type { JsonCommandResult } from "../types/index.js";
import { addYesOption, assertValid, confirmOrCancel } from "../utils/command-helpers.js";
import { clearDiscoveryCache, createDiscoveryContext } from "../utils/discovery-context.js";
import { errorFactories, FliskError, requireProjectRoot, runCommand } from "../utils/errors.js";
import { writeJsonFile } from "../utils/file-helpers.js";
import { enforceFliskVersionGate } from "../utils/flisk-version-gate.js";
import {
  formatCount,
  showAllSatisfyCondition,
  showCommandHeader,
  showDetail,
  showSuccess,
} from "../utils/formatting.js";
import { runJsonCommand } from "../utils/json-command.js";
import { findProjectRoot } from "../utils/paths.js";
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
    throw new FliskError(`Could not parse service.json at ${configPath}: ${reason}`, [
      "Fix the JSON syntax in that file",
      "Check every service.json with: flisk config verify",
    ]);
  }
}

export function normalizeResourceNames(names: string[]): string[] {
  const normalizedNames = names.flatMap((name) =>
    name
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
  return [...new Set(normalizedNames)];
}

/**
 * What `flisk stack --json` reports: the stacks with their resource counts and the resources without a stack, both as
 * they are after the run, plus the target stack (null for --list/--remove) and the resources assigned or removed.
 */
export interface StackReport {
  stacks: { name: string; resourceCount: number }[];
  unassigned: { name: string; configPath: string }[];
  stack: string | null;
  assigned: { name: string; configPath: string }[];
  removed?: { name: string; configPath: string }[];
}

export const stackCommand = addYesOption(new Command("stack"))
  .description("Organize resources into stacks (groups)")
  .argument("[stack-name]", "Stack name to assign to resources")
  .option("--list", "List resources without a stack", false)
  .option("--resources <names...>", "Resource names to update (comma- or space-separated)")
  .option("--move", "Allow moving named resources from another stack", false)
  .option("--remove", "Remove the stack field from named resources", false)
  .option(
    "--ignore-version",
    "Continue even if the CLI does not match the project's version requirements",
    false,
  )
  .option(
    "--json",
    "Print one JSON envelope on stdout; implies --yes and needs --list, <stack-name> --resources, or --remove --resources",
    false,
  )
  .addHelpText(
    "after",
    "\nExamples:\n  flisk stack --list\n  flisk stack shop --resources orders-api web\n  flisk stack shop --move --resources orders-api --yes\n  flisk stack --remove --resources orders-api --yes",
  )
  .action(async (stackName, options) => {
    const action = async (): Promise<JsonCommandResult> => {
      const projectRoot = options.json ? findProjectRoot() : requireProjectRoot();

      if (!projectRoot) throw errorFactories.notInProject();

      enforceFliskVersionGate(projectRoot, {
        ignoreVersion: options.ignoreVersion,
        json: options.json,
      });

      showCommandHeader("Stack Management");

      if (options.move && options.remove) {
        throw new FliskError("--move and --remove cannot be used together.", [
          "Use --move to assign resources to another stack, or --remove to leave them unassigned.",
        ]);
      }
      if (options.list && (options.move || options.remove)) {
        throw new FliskError("--list cannot be combined with --move or --remove.", [
          "Run flisk stack --list separately to inspect assignments without changing them.",
        ]);
      }
      if (options.remove && stackName) {
        throw new FliskError("--remove does not take a stack name.", [
          "Use: flisk stack --remove --resources <name...> --yes",
        ]);
      }
      if ((options.move || options.remove) && options.resources === undefined) {
        throw new FliskError("--move and --remove require --resources <name...>.", [
          "Pass --resources <name...> to name the resources you want to update.",
          "Run flisk resources to see the available resource names.",
        ]);
      }

      // `flisk stack list` reads as the listing verb, but the positional is a
      // stack name, so the bare word is treated as a stack called "list" and
      // opens the assignment wizard. Treat it as --list instead; the MCP tool is
      // already called `stack_list`.
      const bareListRequested = stackName?.toLowerCase() === "list";
      if (bareListRequested && options.resources !== undefined) {
        throw new FliskError(
          '"list" is reserved for listing stacks and cannot be used as a stack name.',
          [
            "Use: flisk stack --list",
            "Pick another stack name, for example: flisk stack core --resources <name...>",
          ],
        );
      }
      const listRequested = options.list || bareListRequested;

      const discovery = createDiscoveryContext();
      const report = (
        updated: StackReport["assigned"] = [],
        stack: string | null = listRequested || options.remove ? null : (stackName ?? null),
        changedPaths = new Set(updated.map((resource) => resource.configPath)),
      ): JsonCommandResult => {
        const counts = new Map<string, number>();
        const unassigned: StackReport["unassigned"] = [];
        for (const resource of discovery.resources) {
          const currentStack = changedPaths.has(resource.configPath) ? stack : resource.stack;
          if (currentStack) {
            counts.set(currentStack, (counts.get(currentStack) ?? 0) + 1);
          } else {
            unassigned.push({ name: resource.name, configPath: resource.configPath });
          }
        }
        return {
          data: {
            stacks: [...counts.keys()].sort().map((name) => ({
              name,
              resourceCount: counts.get(name) ?? 0,
            })),
            unassigned,
            stack,
            assigned: options.remove ? [] : updated,
            ...(options.remove ? { removed: updated } : {}),
          } satisfies StackReport,
        };
      };

      if (discovery.resources.length === 0 && options.resources === undefined) {
        console.log(
          chalk.yellow(
            "No resources discovered. Make sure you're in a project with service.json files.",
          ),
        );
        return report();
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

      if (listRequested) {
        if (discovery.unassignedResources.length === 0) {
          showAllSatisfyCondition("resources", "already assigned to a stack");
          return report();
        }

        console.log(
          chalk.bold(`${discovery.unassignedResources.length} resources without a stack:`),
        );
        for (const resource of discovery.unassignedResources) {
          showDetail(`${resource.name}`);
          showDetail(`${resource.configPath}`, 4);
        }
        return report();
      }

      // --json never prompts: it takes the same arguments as a run without a terminal.
      if (!process.stdin.isTTY || options.json) {
        if (options.resources === undefined) {
          throw new FliskError("Interactive resource selection requires a TTY.", [
            "Pass --resources <name...> to select resources without a prompt.",
            "Use --list to inspect unassigned resources without changing them.",
          ]);
        }
        if (!stackName && !options.remove) {
          throw new FliskError("A stack name is required when stdin is not a TTY.", [
            "Use: flisk stack <stack-name> --resources <name...> [--yes]",
          ]);
        }
        if (!options.yes && !options.json) {
          throw new FliskError("Confirmation requires a TTY.", [
            "Pass --yes to skip confirmation when updating resources without a TTY.",
          ]);
        }
      }

      if (stackName) assertValid(validateStackName(stackName));
      let targetStack = options.remove ? null : stackName;
      if (!targetStack && !options.remove) {
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
      // Canonical service.json paths that move to another stack's folder, old path -> new path.
      const relocations = new Map<string, string>();
      // Two resources from different stacks can share a folder basename, so two
      // planned moves can land on one target folder. The existsSync check runs at
      // selection time, before anything is moved, so it passes for both and the
      // second rename then fails after the first move already happened. Claim
      // each target up front instead.
      const moveTargets = new Map<string, string>();

      if (options.resources !== undefined) {
        const requestedNames = normalizeResourceNames(options.resources);
        if (requestedNames.length === 0) {
          throw new FliskError("Pass at least one resource name to --resources.", [
            "Example: `flisk stack api --resources users-api orders-api --yes`",
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
          throw new FliskError(
            "Cannot update resources while duplicate names are present.",
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
          if (resource.stack && !options.move && !options.remove) {
            throw new FliskError(
              `Resource "${name}" is already assigned to stack "${resource.stack}".`,
              ["Pass --move to move it, or --remove to clear its stack assignment."],
            );
          }
          if (options.move && targetStack && resource.stack && resource.stack !== targetStack) {
            const resourceDir = dirname(resource.configPath);
            if (
              resolve(dirname(resourceDir)) === resolve(projectRoot, "services", resource.stack)
            ) {
              const targetDir = join(projectRoot, "services", targetStack, basename(resourceDir));
              const claimedBy = moveTargets.get(resolve(targetDir));
              if (claimedBy) {
                throw new FliskError(
                  `Cannot move "${name}" to stack "${targetStack}": "${claimedBy}" already moves to ${targetDir}.`,
                  [
                    "Two resources from different stacks share this folder name; rename one of them first.",
                  ],
                );
              }
              if (existsSync(targetDir)) {
                throw new FliskError(
                  `Cannot move "${name}" to stack "${targetStack}": ${targetDir} already exists.`,
                  ["Move or rename the existing folder, then run the command again."],
                );
              }
              moveTargets.set(resolve(targetDir), name);
              relocations.set(resource.configPath, join(targetDir, basename(resource.configPath)));
            }
          }
          selectedResources.push(resource.configPath);
        }
      } else {
        if (resourcesToUpdate.length === 0) {
          console.log(chalk.yellow("\nNo resources available to add to this stack."));
          return report();
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
          return report();
        }
        selectedResources.push(...promptedResources);
      }

      showDetail(
        options.remove
          ? `\nWill remove the stack field from ${formatCount(selectedResources.length, "resource")}.`
          : `\nWill set "stack": "${targetStack}" on ${formatCount(selectedResources.length, "resource")}.`,
        0,
      );

      const confirmed = options.yes || options.json || (await confirmOrCancel("Proceed?"));
      if (!confirmed) return report([], targetStack);

      // Clear cache since we're about to modify resources
      clearDiscoveryCache();

      const nameByConfigPath = new Map(
        discovery.resources.map((resource) => [resource.configPath, resource.name] as const),
      );
      const previousStackByConfigPath = new Map(
        discovery.resources.map((resource) => [resource.configPath, resource.stack] as const),
      );
      const assigned: { name: string; configPath: string }[] = [];
      const changedPaths = new Set<string>();
      for (const configPath of selectedResources) {
        const content = readFileSync(configPath, "utf-8");
        const config = parseStackResourceConfig(content, configPath);
        if (options.remove) delete config.stack;
        else config.stack = targetStack;

        const name = nameByConfigPath.get(configPath) ?? config.appName ?? configPath;
        let finalPath = configPath;
        const movedTo = relocations.get(configPath);
        if (movedTo) {
          mkdirSync(dirname(dirname(movedTo)), { recursive: true });
          writeJsonFile(configPath, config);
          try {
            renameSync(dirname(configPath), dirname(movedTo));
          } catch (error) {
            // The manifest already names the new stack, and the retry guard above
            // skips relocation once it does — so a failed rename would leave the
            // resource stranded in the old folder with no way to finish the move.
            // Put the old content back before rethrowing.
            writeFileSync(configPath, content);
            throw error;
          }
          finalPath = movedTo;
          showDetail(
            `moved ${name}: ${previousStackByConfigPath.get(configPath)} -> ${targetStack}`,
          );
        } else {
          writeJsonFile(configPath, config);
        }

        changedPaths.add(configPath);
        changedPaths.add(finalPath);
        assigned.push({ name, configPath: finalPath });
        showSuccess(`${config.appName || configPath}`);
      }

      if (relocations.size > 0) {
        // A move does not authorize discarding hand edits to the root .tiltignore;
        // that stays behind `flisk config regenerate` (`discardHandEdits`).
        await generateMasterConfigs(projectRoot, { quiet: true });
      }

      console.log();
      showSuccess(`Updated ${formatCount(assigned.length, "resource")}.`);
      if (!options.remove) showDetail(`\nYou can now run: flisk up ${targetStack}`, 0);
      return report(assigned, targetStack, changedPaths);
    };

    if (options.json) {
      await runJsonCommand("STACK_FAILED", "flisk stack", action);
      return;
    }
    await runCommand(action);
  });
