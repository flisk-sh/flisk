// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import { Command } from "commander";
import { readProjectConfig } from "../generator/template-engine.js";
import { addYesOption, handleDryRun } from "../utils/command-helpers.js";
import {
  pruneProjectNetworks,
  stopProjectTiltUp,
  waitForTiltUpExit,
} from "../utils/down-cleanup.js";
import { errorFactories, handleTiltFailure, withTiltCheck } from "../utils/errors.js";
import { createJsonEmitter } from "../utils/json-output.js";
import { writeMachineError } from "../utils/machine-output.js";
import { findProjectRoot } from "../utils/paths.js";
import { discoverResources, discoverStacks } from "../utils/services.js";
import { buildTiltDownArgs, getTiltfilePath, runTilt } from "../utils/tilt.js";

function allStackNames(): string[] | undefined {
  try {
    const names = discoverStacks(discoverResources()).map((stack) => stack.name);
    return names.length > 0 ? names : undefined;
  } catch {
    return undefined;
  }
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
  .action(async (options) => {
    if (!findProjectRoot()) {
      const projectRootError = errorFactories.notInProject();
      if (options.json) writeMachineError(projectRootError);
      projectRootError.exit();
    }

    if (options.force) {
      options.yes = true;
      if (!options.json) {
        console.warn(
          chalk.yellow("Note: --force (-f) on tdk down is deprecated; use --yes (-y) instead."),
        );
      }
    }

    const emit = options.json ? createJsonEmitter("DOWN_FAILED", "tdk down") : undefined;
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
        console.log(chalk.gray("Running: tilt down -f .tdk/.tdk-out/Tiltfile"));
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
