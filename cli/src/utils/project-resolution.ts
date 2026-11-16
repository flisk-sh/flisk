// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { resolve } from "node:path";
import chalk from "chalk";
import { findRunningFliskProjects } from "./down-cleanup.js";
import { errorFactories, FliskError } from "./errors.js";
import { writeMachineError } from "./machine-output.js";
import { findProjectRoot } from "./paths.js";

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
            running.map((root) => `flisk ${commandName} --project ${root}`),
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
