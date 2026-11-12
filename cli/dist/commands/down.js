// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { resolve } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { readProjectConfig } from "../generator/template-engine.js";
import { addYesOption, handleDryRun } from "../utils/command-helpers.js";
import { normalizeCacheUntil, pruneDockerBuildCache, validateCacheUntil, } from "../utils/docker-build-cache.js";
import { findRunningFliskProjects, lookupProjectTiltUpPids, planProjectNetworkPrune, projectComposeProjects, pruneProjectNetworks, stopProjectComposeProjects, stopProjectTiltUp, waitForTiltUpExit, } from "../utils/down-cleanup.js";
import { collectLeftovers, formatLeftovers } from "../utils/down-leftovers.js";
import { errorFactories, FliskError, handleTiltFailure, withTiltCheck } from "../utils/errors.js";
import { inferNodeProject, inferredStateRoot } from "../utils/inferred-node-project.js";
import { createJsonEmitter } from "../utils/json-output.js";
import { writeMachineError } from "../utils/machine-output.js";
import { readNativeRunState, stopNativeRun } from "../utils/native-runtime.js";
import { isNativeProject } from "../utils/native-service.js";
import { findProjectRoot } from "../utils/paths.js";
import { findForeignContainerOwners, findOtherRecordedFolders, purgeOwnerRefusal, } from "../utils/project-owner.js";
import { countArtifacts, listProjectArtifacts, removeProjectArtifacts, } from "../utils/project-purge.js";
import { projectNameAt, readProjectRecords } from "../utils/project-registry.js";
import { promptConfirm } from "../utils/prompt.js";
import { discoverResources, discoverResourcesFromRoot, discoverStacks } from "../utils/services.js";
import { buildTiltDownArgs, getTiltfilePath, runTilt } from "../utils/tilt.js";
import { pruneSupersededTiltImages } from "../utils/tilt-images.js";
function allStackNames() {
    try {
        const names = discoverStacks(discoverResources()).map((stack) => stack.name);
        return names.length > 0 ? names : undefined;
    }
    catch {
        return undefined;
    }
}
/** True when `flisk down` stops local processes instead of Tilt: a native run is on record, or every service declares `command`. */
function isNativeRun(projectRoot) {
    if (readNativeRunState(projectRoot))
        return true;
    try {
        return isNativeProject(discoverResourcesFromRoot(projectRoot));
    }
    catch {
        return false;
    }
}
/**
 * The project to stop: the one at `--project`, else the one around the current folder, else the only Flisk project with
 * a `tilt up` running. Exits with the project-root error when none is found, and lists them when several are running.
 */
function resolveDownProject(options) {
    const fail = (error) => {
        if (options.json)
            writeMachineError(error);
        return error.exit();
    };
    if (options.project) {
        const path = resolve(options.project);
        return (findProjectRoot(path) ??
            fail(new FliskError(`No Flisk project at ${path} (no .flisk/project.json found)`, [
                "Pass the folder of a Flisk project: flisk down --project <path>",
            ])));
    }
    const here = findProjectRoot();
    if (here)
        return here;
    const running = findRunningFliskProjects();
    if (running.length === 1) {
        const root = running[0];
        if (!options.json)
            console.log(chalk.gray(`Not in a Flisk project; stopping the one that is running: ${root}`));
        return root;
    }
    if (running.length > 1) {
        return fail(new FliskError(`Not in a Flisk project, and ${running.length} Flisk projects are running`, running.map((root) => `flisk down --project ${root}`)));
    }
    const notInProject = errorFactories.notInProject();
    return fail(new FliskError(notInProject.message, [
        ...notInProject.suggestions,
        "Or name the project to stop from anywhere: flisk down --project <path>",
    ]));
}
/**
 * True only when it is certain nothing of this project runs: no `tilt up` for its Tiltfile and no container of its
 * generated Compose projects (`docker ps -a`, about 0.03 s). Any doubt (`ps` or Docker cannot be asked) is "not idle", so
 * `tilt down` still runs. Loading the whole Tiltfile just to find nothing took 1.5 s (#3768).
 */
function isProjectIdle(projectRoot) {
    try {
        const tiltUp = lookupProjectTiltUpPids(getTiltfilePath());
        if (tiltUp === null || tiltUp.length > 0)
            return false;
        return projectComposeProjects(projectRoot).length === 0;
    }
    catch {
        return false;
    }
}
/**
 * Remove this project's networks that no container uses. `isExplicit` is true when the user passed `--prune-networks`;
 * the run that happens after every `flisk down` stays quiet about networks Docker keeps and about a Docker that cannot
 * be asked.
 */
function pruneNetworksOrWarn(json, isExplicit) {
    const root = findProjectRoot();
    if (!root)
        return undefined;
    try {
        const result = pruneProjectNetworks(readProjectConfig(root).project.name);
        if (!json) {
            if (result.removed.length > 0) {
                console.log(chalk.gray(`Removed networks: ${result.removed.join(", ")}`));
            }
            if (isExplicit) {
                for (const kept of result.kept) {
                    console.log(chalk.yellow(`Kept network ${kept.name}: ${kept.reason}`));
                }
            }
        }
        return result;
    }
    catch (err) {
        if (!json && isExplicit) {
            console.log(chalk.yellow(`Could not remove networks: ${err.message}`));
        }
        return undefined;
    }
}
/** What `--prune-networks` would remove and keep, for `--dry-run`; undefined when the networks cannot be checked. */
function planNetworkPruneOrWarn(projectRoot, json) {
    try {
        // `down` stops this project's stacks before it prunes, so their containers do not keep a network.
        return planProjectNetworkPrune(readProjectConfig(projectRoot).project.name, undefined, projectComposeProjects(projectRoot));
    }
    catch (err) {
        if (!json) {
            console.log(chalk.yellow(`Could not check networks: ${err.message}`));
        }
        return undefined;
    }
}
/** This project's Docker objects for `--purge`; undefined when the project name cannot be read. */
function projectArtifacts(projectRoot) {
    let name;
    try {
        name = readProjectConfig(projectRoot).project.name.toLowerCase();
    }
    catch {
        return undefined;
    }
    const records = readProjectRecords();
    // Stacks a project once had are on record; the ones it has now come from its folder.
    const recorded = records.find((record) => record.name === name)?.stacks ?? [];
    const stacks = [...new Set([...recorded, ...(allStackNames() ?? [])])];
    const knownNames = records.map((record) => record.name);
    return { name, artifacts: listProjectArtifacts(name, { stacks, knownNames }) };
}
function describeArtifacts(artifacts) {
    const out = [];
    if (artifacts.containers.length > 0)
        out.push(`containers: ${artifacts.containers.join(", ")}`);
    if (artifacts.volumes.length > 0)
        out.push(`volumes: ${artifacts.volumes.join(", ")}`);
    if (artifacts.networks.length > 0)
        out.push(`networks: ${artifacts.networks.join(", ")}`);
    if (artifacts.images.length > 0)
        out.push(`images: ${artifacts.images.join(", ")}`);
    return out;
}
function purgeOrWarn(projectRoot, json) {
    const found = projectArtifacts(projectRoot);
    if (!found) {
        if (!json)
            console.log(chalk.yellow("Could not read the project name; nothing purged."));
        return undefined;
    }
    const result = removeProjectArtifacts(found.artifacts);
    if (!json) {
        const removed = describeArtifacts(result.removed);
        console.log(removed.length > 0
            ? chalk.gray(`Removed ${countArtifacts(result.removed)} Docker objects of ${found.name}:\n  ${removed.join("\n  ")}`)
            : chalk.gray(`No volumes, networks or images of ${found.name} are left.`));
        for (const kept of result.kept) {
            console.log(chalk.yellow(`Kept ${kept.kind.slice(0, -1)} ${kept.name}: ${kept.reason}`));
        }
    }
    return result;
}
export const downCommand = addYesOption(new Command("down"))
    .description("Stop every running service of this project (local processes or Docker/Tilt)")
    .option("-v, --verbose", "Enable verbose output", false)
    .option("-f, --force", "Deprecated alias for --yes; accepted for script compatibility", false)
    .option("--prune-networks", "Remove this project's Docker networks that no container is attached to (the default; kept for scripts)")
    .option("--no-prune-networks", "Keep this project's Docker networks (by default the unused ones are removed, so Docker does not run out of address pools)")
    .option("--prune-cache [age]", "Also prune Docker build cache (shared across all projects on this machine; default age: 24h)", false)
    .option("--cache-until <age>", "With --prune-cache: age filter for prune (e.g. 24h, 168h, 7d; default: 24h)")
    .option("--purge", "Also delete this project's Docker volumes (database data), networks and images, so nothing of it is left in Docker", false)
    .option("--dry-run", "Show what would be stopped without stopping", false)
    .option("--json", "Print one JSON object on stdout; implies quiet human output", false)
    .option("--project <path>", "Stop the Flisk project in this folder (default: the current project, or the only running one)")
    .addHelpText("after", "\nAfter stopping a container project, down prints how much disk its images and the shared build cache still hold, and the command that frees it.\n\nExamples:\n  flisk down --dry-run\n  flisk down --json\n  flisk down --verbose")
    .action(async (options, command) => {
    // Check for inferred Node project first, before resolveDownProject tries to find a Flisk project
    const guess = inferNodeProject(process.cwd());
    if (guess && !options.project) {
        const emitInferred = options.json
            ? createJsonEmitter("DOWN_FAILED", "flisk down")
            : undefined;
        const stateRoot = inferredStateRoot(process.cwd());
        if (options.dryRun) {
            emitInferred?.({ ok: true, dryRun: true, runtime: "native", inferred: true });
            if (!options.json)
                console.log(chalk.gray("Dry run - not stopping the local process of this folder"));
            return;
        }
        const stopped = await stopNativeRun(stateRoot);
        emitInferred?.({ ok: true, runtime: "native", inferred: true, stopped: stopped.services });
        if (!options.json) {
            console.log(stopped.wasRunning
                ? chalk.blue(`Stopped local processes: ${stopped.services.join(", ")}`)
                : chalk.gray("Nothing is running for this folder."));
        }
        return;
    }
    // The root program also defines `--project` (the one-command template flow), and Commander gives a root option to
    // the root wherever it appears, so `flisk down --project <path>` arrives in the global options.
    const project = options.project ?? command.optsWithGlobals().project;
    const resolvedRoot = resolveDownProject({ ...options, project });
    const shouldPruneCache = Boolean(options.pruneCache);
    const rawCacheUntil = typeof options.pruneCache === "string" ? options.pruneCache : options.cacheUntil || "24h";
    if (shouldPruneCache && !validateCacheUntil(rawCacheUntil)) {
        const error = new FliskError(`Invalid --cache-until format: "${rawCacheUntil}"`, [
            "Use a duration such as 24h, 168h, 7d, or 2h30m",
        ]);
        if (options.json)
            writeMachineError(error);
        return error.exit();
    }
    // Normalize once here so the dry-run plan, the confirmation prompt and the real prune cannot
    // drift apart; pruneDockerBuildCache normalizes again defensively.
    const cacheUntil = normalizeCacheUntil(rawCacheUntil);
    // Everything below reads the project from the current folder (Tiltfile, stacks, networks), so stop from its root.
    if (findProjectRoot() !== resolvedRoot)
        process.chdir(resolvedRoot);
    if (options.force) {
        options.yes = true;
        if (!options.json) {
            console.warn(chalk.yellow("Note: --force (-f) on flisk down is deprecated; use --yes (-y) instead."));
        }
    }
    const emit = options.json ? createJsonEmitter("DOWN_FAILED", "flisk down") : undefined;
    // A project of `command` services (or one with a native run on record) stops without Docker or Tilt.
    const projectRoot = findProjectRoot();
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
        if (handleDryRun(options, "not stopping local processes", "stop the local processes of this project")) {
            if (shouldPruneCache) {
                console.log(chalk.gray(`Dry run - not pruning Docker build cache (would run: docker builder prune -f --filter until=${cacheUntil})`));
            }
            return;
        }
        const stopped = await stopNativeRun(projectRoot);
        if (!options.json) {
            console.log(stopped.wasRunning
                ? chalk.blue(`Stopped local processes: ${stopped.services.join(", ")}`)
                : chalk.gray("Nothing is running for this project."));
        }
        emit?.({ ok: true, runtime: "native", stopped: stopped.services });
        return;
    }
    // `--purge` deletes the volume, networks and images of the project NAME. Another folder with the same name uses them too
    // (#3961), so stop before anything is removed, in a dry run as well.
    if (options.purge) {
        const name = projectNameAt(projectRoot);
        if (name) {
            const records = readProjectRecords();
            const stacks = [
                ...new Set([
                    ...(records.find((record) => record.name === name)?.stacks ?? []),
                    ...(allStackNames() ?? []),
                ]),
            ];
            const refusal = purgeOwnerRefusal(name, findForeignContainerOwners(name, stacks, projectRoot), findOtherRecordedFolders(name, projectRoot));
            if (refusal) {
                const error = new FliskError(refusal.message, refusal.suggestions);
                if (options.json)
                    writeMachineError(error);
                return error.exit();
            }
        }
    }
    await withTiltCheck(async () => {
        const wouldPurge = options.purge && options.dryRun ? projectArtifacts(projectRoot) : undefined;
        // Unused networks go by default (--no-prune-networks opts out); --purge removes them too, so the preview is for the plain run.
        const wouldPruneNetworks = options.pruneNetworks !== false && !options.purge && options.dryRun
            ? planNetworkPruneOrWarn(projectRoot, Boolean(options.json))
            : undefined;
        if (emit && options.dryRun) {
            emit({
                ok: true,
                dryRun: true,
                ...(shouldPruneCache ? { wouldPruneCache: { until: cacheUntil } } : {}),
                ...(wouldPurge ? { wouldPurge: wouldPurge.artifacts } : {}),
                ...(wouldPruneNetworks ? { wouldPruneNetworks } : {}),
            });
            return;
        }
        if (handleDryRun(options, "not stopping resources", "tilt down")) {
            if (wouldPruneNetworks) {
                const keep = wouldPruneNetworks.keep.map((kept) => `${kept.name} (${kept.reason})`);
                console.log(chalk.gray(`Dry run - network prune would remove: ${wouldPruneNetworks.remove.join(", ") || "<none>"}\n` +
                    `          would keep: ${keep.join(", ") || "<none>"}`));
            }
            if (wouldPurge) {
                const listed = describeArtifacts(wouldPurge.artifacts);
                console.log(chalk.gray(listed.length > 0
                    ? `Dry run - --purge would delete:\n  ${listed.join("\n  ")}`
                    : `Dry run - --purge would delete nothing: no Docker objects of ${wouldPurge.name} exist.`));
            }
            if (shouldPruneCache) {
                console.log(chalk.gray(`Dry run - not pruning Docker build cache (would run: docker builder prune -f --filter until=${cacheUntil})`));
            }
            return;
        }
        // Unused networks go by default: stopped projects that kept theirs used up Docker's address pools (#3650).
        const shouldPruneNetworks = options.pruneNetworks !== false;
        const hasCleanup = Boolean(options.purge || shouldPruneCache);
        const idle = isProjectIdle(projectRoot);
        if (idle && !hasCleanup) {
            if (!options.json)
                console.log(chalk.gray("Nothing is running for this project."));
            // Networks an earlier `down` kept are still taken off the machine.
            const leftover = shouldPruneNetworks
                ? pruneNetworksOrWarn(options.json, options.pruneNetworks === true)
                : undefined;
            emit?.({
                ok: true,
                stoppedTilt: [],
                idle: true,
                ...(leftover ? { removedNetworks: leftover.removed, keptNetworks: leftover.kept } : {}),
            });
            return;
        }
        const tiltArgs = buildTiltDownArgs({
            focusTargets: allStackNames(),
        });
        // Stop `tilt up` first: `tilt down` does not end it, and a live Tilt re-creates the containers `tilt down` just removed.
        let stoppedTilt = [];
        if (!idle) {
            try {
                const tiltfile = getTiltfilePath();
                stoppedTilt = stopProjectTiltUp(tiltfile);
                if (stoppedTilt.length > 0)
                    await waitForTiltUpExit(tiltfile);
            }
            catch {
                // Not fatal: the containers are already down.
            }
        }
        if (stoppedTilt.length > 0 && !options.json) {
            console.log(chalk.gray(`Stopped tilt up (pid ${stoppedTilt.join(", ")}).`));
        }
        if (!idle && !options.json)
            console.log(chalk.blue("Stopping all tilt resources..."));
        if (!idle && options.verbose && !options.json) {
            console.log(chalk.gray("Running: tilt down -f .flisk/.flisk-out/Tiltfile"));
        }
        // Idle with a purge/prune flag: skip the Tiltfile load and go straight to the cleanup steps.
        const result = idle
            ? { exitCode: 0 }
            : await runTilt("down", tiltArgs, {
                verbose: options.verbose && !options.json,
                inheritStdio: !options.json,
            });
        // `tilt down` evaluates the Tiltfile, so a Tiltfile that fails (stale after an upgrade, a broken edit) leaves the stack
        // running. Stop this project's Compose projects directly instead (#2899).
        let composeFallback;
        if (result.exitCode !== 0) {
            let fallback;
            try {
                fallback = stopProjectComposeProjects(projectRoot);
            }
            catch {
                handleTiltFailure("down", result.exitCode);
            }
            if (fallback.failed.length > 0) {
                for (const failed of fallback.failed) {
                    console.error(chalk.red(`Could not stop Compose project ${failed.name}: ${failed.reason}`));
                }
                handleTiltFailure("down", result.exitCode);
            }
            composeFallback = { ...fallback, tiltDownExitCode: result.exitCode };
            if (!options.json) {
                console.log(chalk.yellow(fallback.stopped.length > 0
                    ? `tilt down failed (exit ${result.exitCode}); stopped this project's containers with docker compose down instead: ${fallback.stopped.join(", ")}`
                    : `tilt down failed (exit ${result.exitCode}); no containers of this project are left to stop.`));
            }
        }
        let networks;
        if (shouldPruneNetworks && !options.purge) {
            networks = pruneNetworksOrWarn(options.json, options.pruneNetworks === true);
        }
        // After the stack is down: containers no longer hold the volumes and networks.
        const purged = options.purge ? purgeOrWarn(projectRoot, options.json) : undefined;
        let cachePruneResult;
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
                        console.log(chalk.yellow("Skipping Docker build cache prune: confirmation required; run in a terminal or pass --yes."));
                    }
                }
                else {
                    console.log(chalk.yellow("Notice: Docker build cache is shared across all projects on this machine.\nPruning it affects other projects and may increase subsequent build times."));
                    try {
                        confirmed = await promptConfirm({
                            message: `Prune Docker build cache older than ${cacheUntil}?`,
                            initial: false,
                        });
                    }
                    catch {
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
                        console.log(chalk.gray(`Pruned Docker build cache: ${pruned.reclaimed} reclaimed (filter: until=${cacheUntil}).`));
                    }
                }
                catch (err) {
                    const reason = err instanceof Error ? err.message : String(err);
                    cachePruneResult = { until: cacheUntil, skipped: true, reason };
                    if (!options.json) {
                        console.log(chalk.yellow(`Could not prune Docker build cache: ${reason}`));
                    }
                }
            }
        }
        // Tilt tags every build tilt-<hash> and only a running Tilt cleans them up, so superseded builds pile up
        // (a day of rebuilds held 34 GB of images). Untag all but the newest per repo; running images are refused.
        let tiltImages;
        if (!options.dryRun) {
            tiltImages = await pruneSupersededTiltImages(1);
            if (tiltImages.removed.length > 0 && !options.json) {
                console.log(chalk.gray(`Removed ${tiltImages.removed.length} superseded tilt-* image(s) (up to ${(tiltImages.removedBytes / 1e9).toFixed(1)} GB).`));
            }
        }
        // The stack is down but its images, volumes and the shared build cache still fill the disk (#3708).
        let retained;
        try {
            const projectInfo = options.purge ? undefined : projectArtifacts(projectRoot);
            if (projectInfo) {
                retained = (await collectLeftovers(projectInfo.artifacts?.images ?? [])) ?? undefined;
                if (retained && !options.json) {
                    for (const line of formatLeftovers(retained, projectInfo.name)) {
                        console.log(chalk.yellow(line));
                    }
                }
            }
        }
        catch {
            // Only a report: a Docker that cannot be asked must not fail `down`.
        }
        emit?.({
            ok: true,
            stoppedTilt,
            ...(retained ? { retained } : {}),
            ...(tiltImages && tiltImages.removed.length > 0
                ? { prunedTiltImages: tiltImages.removed }
                : {}),
            ...(composeFallback
                ? {
                    composeFallback: {
                        tiltDownExitCode: composeFallback.tiltDownExitCode,
                        stopped: composeFallback.stopped,
                    },
                }
                : {}),
            ...(networks ? { removedNetworks: networks.removed, keptNetworks: networks.kept } : {}),
            ...(purged ? { purged: purged.removed, keptAfterPurge: purged.kept } : {}),
            ...(cachePruneResult ? { prunedCache: cachePruneResult } : {}),
        });
    });
});
