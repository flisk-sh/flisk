// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { resolve } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { readProjectConfig } from "../generator/template-engine.js";
import { addYesOption, handleDryRun } from "../utils/command-helpers.js";
import { pruneDockerBuildCache, validateCacheUntil } from "../utils/docker-build-cache.js";
import {
  type ComposeFallbackResult,
  findRunningFliskProjects,
  pruneProjectNetworks,
  stopProjectComposeProjects,
  stopProjectTiltUp,
  waitForTiltUpExit,
} from "../utils/down-cleanup.js";
import { errorFactories, FliskError, handleTiltFailure, withTiltCheck } from "../utils/errors.js";
import { createJsonEmitter } from "../utils/json-output.js";
import { writeMachineError } from "../utils/machine-output.js";
import { readNativeRunState, stopNativeRun } from "../utils/native-runtime.js";
import { isNativeProject } from "../utils/native-service.js";
import { findProjectRoot } from "../utils/paths.js";
import { promptConfirm } from "../utils/prompt.js";
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
  .option(
    "--prune-cache [age]",
    "Also prune Docker build cache (shared across all projects on this machine; default age: 24h)",
    false,
  )
  .option(
    "--cache-until <age>",
    "With --prune-cache: age filter for prune (e.g. 24h, 168h, 7d; default: 24h)",
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

    const shouldPruneCache = Boolean(options.pruneCache);
    const cacheUntil =
      typeof options.pruneCache === "string" ? options.pruneCache : options.cacheUntil || "24h";

    if (shouldPruneCache && !validateCacheUntil(cacheUntil)) {
      const error = new FliskError(`Invalid --cache-until format: "${cacheUntil}"`, [
        "Use a duration such as 24h, 168h, 7d, or 2h30m",
      ]);
      if (options.json) writeMachineError(error);
      return error.exit();
    }
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
        emit({
          ok: true,
          dryRun: true,
          runtime: "native",
          ...(shouldPruneCache ? { wouldPruneCache: { until: cacheUntil } } : {}),
        });
        return;
      }
      if (
        handleDryRun(
          options,
          "not stopping local processes",
          "stop the local processes of this project",
        )
      ) {
        if (shouldPruneCache) {
          console.log(
            chalk.gray(
              `Dry run - not pruning Docker build cache (would run: docker builder prune -f --filter until=${cacheUntil})`,
            ),
          );
        }
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
        emit({
          ok: true,
          dryRun: true,
          ...(shouldPruneCache ? { wouldPruneCache: { until: cacheUntil } } : {}),
        });
        return;
      }
      if (handleDryRun(options, "not stopping resources", "tilt down")) {
        if (shouldPruneCache) {
          console.log(
            chalk.gray(
              `Dry run - not pruning Docker build cache (would run: docker builder prune -f --filter until=${cacheUntil})`,
            ),
          );
        }
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

      // `tilt down` evaluates the Tiltfile, so a Tiltfile that fails (stale after an upgrade, a broken edit) leaves the stack
      // running. Stop this project's Compose projects directly instead (#2899).
      let composeFallback: (ComposeFallbackResult & { tiltDownExitCode: number }) | undefined;
      if (result.exitCode !== 0) {
        let fallback: ComposeFallbackResult;
        try {
          fallback = stopProjectComposeProjects(projectRoot);
        } catch {
          handleTiltFailure("down", result.exitCode);
        }
        if (fallback.failed.length > 0) {
          for (const failed of fallback.failed) {
            console.error(
              chalk.red(`Could not stop Compose project ${failed.name}: ${failed.reason}`),
            );
          }
          handleTiltFailure("down", result.exitCode);
        }
        composeFallback = { ...fallback, tiltDownExitCode: result.exitCode };
        if (!options.json) {
          console.log(
            chalk.yellow(
              fallback.stopped.length > 0
                ? `tilt down failed (exit ${result.exitCode}); stopped this project's containers with docker compose down instead: ${fallback.stopped.join(", ")}`
                : `tilt down failed (exit ${result.exitCode}); no containers of this project are left to stop.`,
            ),
          );
        }
      }

      let networks: ReturnType<typeof pruneProjectNetworks> | undefined;
      if (options.pruneNetworks) {
        networks = pruneNetworksOrWarn(options.json);
      }

      let cachePruneResult:
        | { until: string; reclaimed?: string; skipped?: boolean; reason?: string }
        | undefined;
      if (shouldPruneCache) {
        let confirmed = Boolean(options.yes);
        if (!confirmed) {
          if (options.json || !process.stdin.isTTY) {
            cachePruneResult = {
              until: cacheUntil,
              skipped: true,
              reason: "confirmation required; run in a terminal or pass --yes",
            };
            if (!options.json) {
              console.log(
                chalk.yellow(
                  "Skipping Docker build cache prune: confirmation required; run in a terminal or pass --yes.",
                ),
              );
            }
          } else {
            console.log(
              chalk.yellow(
                "Notice: Docker build cache is shared across all projects on this machine.\nPruning it affects other projects and may increase subsequent build times.",
              ),
            );
            try {
              confirmed = await promptConfirm({
                message: `Prune Docker build cache older than ${cacheUntil}?`,
                initial: false,
              });
            } catch {
              confirmed = false;
            }
            if (!confirmed) {
              cachePruneResult = { until: cacheUntil, skipped: true, reason: "not confirmed" };
              console.log(chalk.gray("Skipped Docker build cache prune."));
            }
          }
        }

        if (confirmed) {
          try {
            const pruned = await pruneDockerBuildCache({ until: cacheUntil });
            cachePruneResult = { until: cacheUntil, reclaimed: pruned.reclaimed };
            if (!options.json) {
              console.log(
                chalk.gray(
                  `Pruned Docker build cache: ${pruned.reclaimed} reclaimed (filter: until=${cacheUntil}).`,
                ),
              );
            }
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            cachePruneResult = { until: cacheUntil, skipped: true, reason };
            if (!options.json) {
              console.log(chalk.yellow(`Could not prune Docker build cache: ${reason}`));
            }
          }
        }
      }

      emit?.({
        ok: true,
        stoppedTilt,
        ...(composeFallback
          ? {
              composeFallback: {
                tiltDownExitCode: composeFallback.tiltDownExitCode,
                stopped: composeFallback.stopped,
              },
            }
          : {}),
        ...(networks ? { removedNetworks: networks.removed, keptNetworks: networks.kept } : {}),
        ...(cachePruneResult ? { prunedCache: cachePruneResult } : {}),
      });
    });
  });
