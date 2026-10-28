// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { resolve } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { readProjectConfig } from "../generator/template-engine.js";
import { addYesOption, handleDryRun } from "../utils/command-helpers.js";
import {
  findRunningFliskProjects,
  pruneProjectNetworks,
  stopProjectTiltUp,
  waitForTiltUpExit,
} from "../utils/down-cleanup.js";
import { errorFactories, FliskError, handleTiltFailure, withTiltCheck } from "../utils/errors.js";
import { createJsonEmitter } from "../utils/json-output.js";
import { writeMachineError } from "../utils/machine-output.js";
import { readNativeRunState, stopNativeRun } from "../utils/native-runtime.js";
import { isNativeProject } from "../utils/native-service.js";
import { findProjectRoot } from "../utils/paths.js";
import { discoverResources, discoverResourcesFromRoot, discoverStacks } from "../utils/services.js";
import { buildTiltDownArgs, getTiltfilePath, runTilt } from "../utils/tilt.js";

function allStackNames(): string[] | undefined {
  try {
    const names = discoverStacks(discoverResources()).map((stack) => stack.name);
    return names.length > 0 ? names : undefined;
  } catch {
    return undefined;
  }
}

/** True when `flisk down` stops local processes instead of Tilt: a native run is on record, or every service declares `command`. */
function isNativeRun(projectRoot: string): boolean {
  if (readNativeRunState(projectRoot)) return true;
  try {
    return isNativeProject(discoverResourcesFromRoot(projectRoot));
  } catch {
    return false;
  }
}

/**
 * The project to stop: the one at `--project`, else the one around the current folder, else the only Flisk project with
 * a `tilt up` running. Exits with the project-root error when none is found, and lists them when several are running.
 */
function resolveDownProject(options: { project?: string; json?: boolean }): string {
  const fail = (error: FliskError): never => {
    if (options.json) writeMachineError(error);
    return error.exit();
  };
  if (options.project) {
    const path = resolve(options.project);
    return (
      findProjectRoot(path) ??
      fail(
        new FliskError(`No Flisk project at ${path} (no .flisk/project.json found)`, [
          "Pass the folder of a Flisk project: flisk down --project <path>",
        ]),
      )
    );
  }
  const here = findProjectRoot();
  if (here) return here;

  const running = findRunningFliskProjects();
  if (running.length === 1) {
    const root = running[0] as string;
    if (!options.json)
      console.log(chalk.gray(`Not in a Flisk project; stopping the one that is running: ${root}`));
    return root;
  }
  if (running.length > 1) {
    return fail(
      new FliskError(
        `Not in a Flisk project, and ${running.length} Flisk projects are running`,
        running.map((root) => `flisk down --project ${root}`),
      ),
    );
  }
  const notInProject = errorFactories.notInProject();
  return fail(
    new FliskError(notInProject.message, [
      ...notInProject.suggestions,
      "Or name the project to stop from anywhere: flisk down --project <path>",
    ]),
  );
}

function pruneNetworksOrWarn(json: boolean): ReturnType<typeof pruneProjectNetworks> | undefined {
  const root = findProjectRoot();
  if (!root) return undefined;
  try {
    const result = pruneProjectNetworks(readProjectConfig(root).project.name);
    if (!json) {
      if (result.removed.length > 0) {
        console.log(chalk.gray(`Removed networks: ${result.removed.join(", ")}`));
      }
      for (const kept of result.kept) {
        console.log(chalk.yellow(`Kept network ${kept.name}: ${kept.reason}`));
      }
    }
    return result;
  } catch (err) {
    if (!json) {
      console.log(chalk.yellow(`Could not remove networks: ${(err as Error).message}`));
    }
    return undefined;
  }
}

export const downCommand = addYesOption(new Command("down"))
  .description("Stop all tilt resources")
  .option("-v, --verbose", "Enable verbose output", false)
  .option("-f, --force", "Deprecated alias for --yes; accepted for script compatibility", false)
  .option(
    "--prune-networks",
    "Also remove this project's Docker networks (only those no container is attached to)",
    false,
  )
  .option("--dry-run", "Show what would be stopped without stopping", false)
  .option("--json", "Print one JSON object on stdout; implies quiet human output", false)
  .option(
    "--project <path>",
    "Stop the Flisk project in this folder (default: the current project, or the only running one)",
  )
  .action(async (options, command: Command) => {
    // The root program also defines `--project` (the one-command template flow), and Commander gives a root option to
    // the root wherever it appears, so `flisk down --project <path>` arrives in the global options.
    const project: string | undefined = options.project ?? command.optsWithGlobals().project;
    const resolvedRoot = resolveDownProject({ ...options, project });
    // Everything below reads the project from the current folder (Tiltfile, stacks, networks), so stop from its root.
    if (findProjectRoot() !== resolvedRoot) process.chdir(resolvedRoot);

    if (options.force) {
      options.yes = true;
      if (!options.json) {
        console.warn(
          chalk.yellow("Note: --force (-f) on flisk down is deprecated; use --yes (-y) instead."),
        );
      }
    }

    const emit = options.json ? createJsonEmitter("DOWN_FAILED", "flisk down") : undefined;
    // A project of `command` services (or one with a native run on record) stops without Docker or Tilt.
    const projectRoot = findProjectRoot() as string;
    if (isNativeRun(projectRoot)) {
      if (emit && options.dryRun) {
        emit({ ok: true, dryRun: true, runtime: "native" });
        return;
      }
      if (
        handleDryRun(
          options,
          "not stopping local processes",
          "stop the local processes of this project",
        )
      ) {
        return;
      }
      const stopped = await stopNativeRun(projectRoot);
      if (!options.json) {
        console.log(
          stopped.wasRunning
            ? chalk.blue(`Stopped local processes: ${stopped.services.join(", ")}`)
            : chalk.gray("Nothing is running for this project."),
        );
      }
      emit?.({ ok: true, runtime: "native", stopped: stopped.services });
      return;
    }
    await withTiltCheck(async () => {
      if (emit && options.dryRun) {
        emit({ ok: true, dryRun: true });
        return;
      }
      if (handleDryRun(options, "not stopping resources", "tilt down")) {
        return;
      }

      const tiltArgs = buildTiltDownArgs({
        focusTargets: allStackNames(),
      });

      // Stop `tilt up` first: `tilt down` does not end it, and a live Tilt re-creates the containers `tilt down` just removed.
      let stoppedTilt: number[] = [];
      try {
        const tiltfile = getTiltfilePath();
        stoppedTilt = stopProjectTiltUp(tiltfile);
        if (stoppedTilt.length > 0) await waitForTiltUpExit(tiltfile);
      } catch {
        // Not fatal: the containers are already down.
      }
      if (stoppedTilt.length > 0 && !options.json) {
        console.log(chalk.gray(`Stopped tilt up (pid ${stoppedTilt.join(", ")}).`));
      }

      if (!options.json) console.log(chalk.blue("Stopping all tilt resources..."));

      if (options.verbose && !options.json) {
        console.log(chalk.gray("Running: tilt down -f .flisk/.flisk-out/Tiltfile"));
      }

      const result = await runTilt("down", tiltArgs, {
        verbose: options.verbose && !options.json,
        inheritStdio: !options.json,
      });

      if (result.exitCode !== 0) {
        handleTiltFailure("down", result.exitCode);
      }

      let networks: ReturnType<typeof pruneProjectNetworks> | undefined;
      if (options.pruneNetworks) {
        networks = pruneNetworksOrWarn(options.json);
      }
      emit?.({
        ok: true,
        stoppedTilt,
        ...(networks ? { removedNetworks: networks.removed, keptNetworks: networks.kept } : {}),
      });
    });
  });
