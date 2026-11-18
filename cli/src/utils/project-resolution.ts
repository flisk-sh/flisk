// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { statSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import type { Command } from "commander";
import { findRunningFliskProjects } from "./down-cleanup.js";
import { errorFactories, FliskError } from "./errors.js";
import { writeMachineError } from "./machine-output.js";
import { shellQuote } from "./native-container.js";
import { findProjectRoot } from "./paths.js";

/** The one --project declaration shared by every command that reads project state. */
export const PROJECT_OPTION_FLAGS = "--project <path>";
export const PROJECT_OPTION_DESCRIPTION =
  "Use the Flisk project in this folder (default: the current project)";

/**
 * Declares the shared --project option and resolves the target project before the action runs.
 * Only an explicit --project is resolved, so commands keep their existing behaviour without it.
 * The value is replaced with an absolute path so commands that resolve it again stay correct.
 */
export function addProjectOption(
  command: Command,
  commandName = command.name(),
  flags: string = PROJECT_OPTION_FLAGS,
): Command {
  command.option(flags, PROJECT_OPTION_DESCRIPTION);
  command.hook("preAction", (thisCommand: Command, actionCommand: Command) => {
    // Subcommands such as `config verify` declare --json themselves, so read both scopes.
    const opts = actionCommand.optsWithGlobals() as {
      project?: string | boolean;
      json?: boolean;
    };
    if (opts.project === "") {
      const error = new FliskError("Missing value for --project <path>", [
        `Pass the folder of a Flisk project: flisk ${commandName} --project <path>`,
      ]);
      if (opts.json) writeMachineError(error);
      error.exit();
    }
    if (typeof opts.project !== "string" || opts.project.length === 0) return;
    const absolute = resolve(opts.project);
    thisCommand.setOptionValueWithSource("project", absolute, "cli");
    resolveCommandProject({ commandName, project: absolute, json: Boolean(opts.json) });
  });
  return command;
}

/**
 * Rewrites an explicit relative `--project <path>` in a child CLI invocation to the absolute path.
 * `addProjectOption` changes the working directory to the resolved project root before the action
 * runs, so a detached child started with the caller's raw argv would resolve the same relative
 * path a second time from the new directory and target the wrong project.
 */
export function absoluteProjectArgs(
  argv: readonly string[],
  cwd: string = process.cwd(),
  resolvedProject?: string,
): string[] {
  const out = [...argv];
  for (let i = 0; i < out.length; i++) {
    const arg = out[i] as string;
    if (arg === "--project") {
      const value = out[i + 1];
      if (value !== undefined && !value.startsWith("-")) {
        out[i + 1] = resolvedProject ?? resolve(cwd, value);
        i++;
      }
      continue;
    }
    if (arg.startsWith("--project=")) {
      out[i] = `--project=${resolvedProject ?? resolve(cwd, arg.slice("--project=".length))}`;
    }
  }
  return out;
}

export interface ResolveProjectOptions {
  /** Name of the command requesting resolution (e.g. "logs", "restart", "status"). */
  commandName: string;
  /** Explicit project path passed via `--project <path>`. */
  project?: string;
  /** Whether the command is running in JSON mode (`--json`). */
  json?: boolean;
  /**
   * If true, and exactly one project is running when outside a project, automatically select it.
   * `down` uses this; `logs`, `restart`, and `status` do not.
   */
  autoSelectSingleRunning?: boolean;
  /**
   * Optional custom failure handler if the caller needs to format or throw errors differently.
   */
  onFail?: (error: FliskError) => never;
}

/**
 * Resolves the target project root for a Flisk command:
 * 1. If `options.project` is passed, resolves that directory. Fails if no Flisk project exists there.
 * 2. Otherwise, checks the current working directory (`findProjectRoot()`).
 * 3. If outside a project, inspects running Flisk projects:
 *    - If `autoSelectSingleRunning` is true and exactly 1 project is running, selects it.
 *    - If 1 or more projects are running, fails with a list of running projects and suggestions to run `flisk <command> --project <root>`.
 *    - If 0 projects are running, fails with the standard `notInProject` error and suggestions.
 * 4. Changes `process.cwd()` to the resolved project root if it differs from current root.
 */
export function resolveCommandProject(options: ResolveProjectOptions): string {
  const { commandName, project, json = false, autoSelectSingleRunning = false } = options;

  const fail = (error: FliskError): never => {
    if (options.onFail) {
      return options.onFail(error);
    }
    if (json) {
      writeMachineError(error);
    }
    return error.exit();
  };

  let resolvedRoot: string;

  if (project) {
    const targetPath = resolve(project);
    // findProjectRoot walks up to ancestors, so an explicit path that does not
    // exist (or is a file) must be rejected before it can match a parent project.
    let isDirectory = false;
    try {
      isDirectory = statSync(targetPath).isDirectory();
    } catch {
      isDirectory = false;
    }
    if (!isDirectory) {
      return fail(
        new FliskError(`No Flisk project at ${targetPath} (not an existing directory)`, [
          `Pass the folder of a Flisk project: flisk ${commandName} --project <path>`,
        ]),
      );
    }
    const root = findProjectRoot(targetPath);
    if (!root) {
      return fail(
        new FliskError(`No Flisk project at ${targetPath} (no .flisk/project.json found)`, [
          `Pass the folder of a Flisk project: flisk ${commandName} --project <path>`,
        ]),
      );
    }
    resolvedRoot = root;
  } else {
    const here = findProjectRoot();
    if (here) {
      resolvedRoot = here;
    } else {
      const running = findRunningFliskProjects();
      if (autoSelectSingleRunning && running.length === 1) {
        const root = running[0] as string;
        if (!json) {
          console.log(
            chalk.gray(`Not in a Flisk project; stopping the one that is running: ${root}`),
          );
        }
        resolvedRoot = root;
      } else if (running.length > 0) {
        const countText =
          running.length === 1
            ? "1 Flisk project is running"
            : `${running.length} Flisk projects are running`;
        return fail(
          new FliskError(
            `Not in a Flisk project, and ${countText}`,
            running.map((root) => `flisk ${commandName} --project ${shellQuote(root)}`),
          ),
        );
      } else {
        const notInProject = errorFactories.notInProject();
        const suggestions = [...notInProject.suggestions];
        if (autoSelectSingleRunning) {
          suggestions.push(
            `Or name the project to stop from anywhere: flisk ${commandName} --project <path>`,
          );
        }
        return fail(new FliskError(notInProject.message, suggestions, notInProject.exitCode));
      }
    }
  }

  if (findProjectRoot() !== resolvedRoot) {
    process.chdir(resolvedRoot);
  }

  return resolvedRoot;
}
