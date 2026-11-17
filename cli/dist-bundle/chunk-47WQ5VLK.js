import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  createJsonEmitter,
  findForeignContainerOwners,
  findOtherRecordedFolders,
  pruneSupersededTiltImages,
  purgeOwnerRefusal
} from "./chunk-XZMNCFVC.js";
import {
  inferNodeProject,
  inferredStateRoot
} from "./chunk-YJYXSQUB.js";
import {
  countArtifacts,
  listProjectArtifacts,
  removeProjectArtifacts
} from "./chunk-USXLA72A.js";
import {
  formatBytes,
  trimColimaAndMeasure
} from "./chunk-3P4YMCKC.js";
import {
  DISK_SAFE_CLEANUP,
  defaultDockerRunner,
  normalizeCacheUntil,
  parseDockerBuildCache,
  pruneDockerBuildCache,
  validateCacheUntil
} from "./chunk-X45DIH6R.js";
import {
  readNativeRunState,
  stopNativeRun
} from "./chunk-4L23R74S.js";
import {
  findRunningFliskProjects,
  lookupProjectTiltUpPids,
  planProjectNetworkPrune,
  projectComposeProjects,
  pruneProjectNetworks,
  stopProjectComposeProjects,
  stopProjectTiltUp,
  waitForTiltUpExit
} from "./chunk-QQ2PAYEU.js";
import {
  projectNameAt,
  readProjectRecords
} from "./chunk-ICMIEDFD.js";
import {
  readProjectConfig
} from "./chunk-RYTYYP36.js";
import {
  addYesOption,
  attachNoPositionalHint,
  handleDryRun
} from "./chunk-MJGDAK6E.js";
import {
  writeMachineError
} from "./chunk-3SNMUNQF.js";
import {
  promptConfirm
} from "./chunk-3EZ4UDYT.js";
import {
  discoverResources,
  discoverResourcesFromRoot,
  discoverStacks,
  isNativeProject
} from "./chunk-2BH5UW2N.js";
import {
  FliskError,
  buildTiltDownArgs,
  findProjectRoot,
  getTiltfilePath,
  handleTiltFailure,
  requireProjectBeforeDocker,
  runTilt,
  source_default,
  withTiltCheck
} from "./chunk-73W4Y4TI.js";

// dist/commands/down.js
import { resolve } from "node:path";
import { Command } from "commander";

// dist/utils/down-leftovers.js
var GIB = 1024 ** 3;
var NOTABLE_GIB = 0.5;
async function collectLeftovers(images, run = defaultDockerRunner) {
  try {
    const sizes = await Promise.all(images.map(async (ref) => {
      try {
        return Number((await run(["image", "inspect", "--format", "{{.Size}}", ref])).trim()) || 0;
      } catch {
        return 0;
      }
    }));
    const df = await run([
      "system",
      "df",
      "--format",
      "{{.Type}}	{{.TotalCount}}	{{.Size}}	{{.Reclaimable}}"
    ]);
    return {
      imageCount: images.length,
      imageGib: sizes.reduce((sum, bytes) => sum + bytes, 0) / GIB,
      cacheGib: parseDockerBuildCache(df)?.sizeGib ?? 0
    };
  } catch {
    return null;
  }
}
function formatLeftovers(left, projectName) {
  const out = [];
  if (left.imageGib >= NOTABLE_GIB) {
    out.push(`${projectName} still holds ${left.imageGib.toFixed(1)} GiB in ${left.imageCount} ${left.imageCount === 1 ? "image" : "images"}. Free it (also deletes the project's volumes): flisk down --purge`);
  }
  if (left.cacheGib >= NOTABLE_GIB) {
    out.push(`The build cache, shared by every project, holds ${left.cacheGib.toFixed(1)} GiB. Free it: ${DISK_SAFE_CLEANUP}`);
  }
  return out;
}

// dist/commands/down.js
function allStackNames() {
  try {
    const names = discoverStacks(discoverResources()).map((stack) => stack.name);
    return names.length > 0 ? names : void 0;
  } catch {
    return void 0;
  }
}
function printNativeStop(stopped, scope) {
  if (stopped.stale) {
    console.log(source_default.gray("Stale run record, nothing to stop: its processes are gone or their pids now belong to other programs."));
  } else if (stopped.wasRunning) {
    console.log(source_default.blue(`Stopped local processes: ${stopped.services.join(", ")}`));
  } else {
    console.log(source_default.gray(`Nothing is running for this ${scope}.`));
  }
  if (stopped.unverified?.length) {
    const list = stopped.unverified.map(({ name, pid }) => `${name} (pid ${pid})`).join(", ");
    console.log(source_default.yellow(`These processes were not stopped because the run record cannot prove Flisk started them: ${list}. Check them and stop them yourself if they are this project's.`));
  }
}
function isNativeRun(projectRoot) {
  if (readNativeRunState(projectRoot))
    return true;
  try {
    return isNativeProject(discoverResourcesFromRoot(projectRoot));
  } catch {
    return false;
  }
}
function resolveDownProject(options) {
  const fail = (error) => {
    if (options.json)
      writeMachineError(error);
    return error.exit();
  };
  if (options.project) {
    const path = resolve(options.project);
    return requireProjectBeforeDocker(() => findProjectRoot(path), () => fail(new FliskError(`No Flisk project at ${path} (no .flisk/project.json found)`, [
      "Pass the folder of a Flisk project: flisk down --project <path>"
    ])));
  }
  return requireProjectBeforeDocker(() => {
    const here = findProjectRoot();
    if (here)
      return here;
    const running = findRunningFliskProjects();
    if (running.length === 1) {
      const root = running[0];
      if (!options.json)
        console.log(source_default.gray(`Not in a Flisk project; stopping the one that is running: ${root}`));
      return root;
    }
    if (running.length > 1) {
      return fail(new FliskError(`Not in a Flisk project, and ${running.length} Flisk projects are running`, running.map((root) => `flisk down --project ${root}`)));
    }
    return null;
  }, (notInProject) => fail(new FliskError(notInProject.message, [
    ...notInProject.suggestions,
    "Or name the project to stop from anywhere: flisk down --project <path>"
  ])));
}
function isProjectIdle(projectRoot) {
  try {
    const tiltUp = lookupProjectTiltUpPids(getTiltfilePath());
    if (tiltUp === null || tiltUp.length > 0)
      return false;
    return projectComposeProjects(projectRoot).length === 0;
  } catch {
    return false;
  }
}
function pruneNetworksOrWarn(json, isExplicit) {
  const root = findProjectRoot();
  if (!root)
    return void 0;
  try {
    const result = pruneProjectNetworks(readProjectConfig(root).project.name);
    if (!json) {
      if (result.removed.length > 0) {
        console.log(source_default.gray(`Removed networks: ${result.removed.join(", ")}`));
      }
      if (isExplicit) {
        for (const kept of result.kept) {
          console.log(source_default.yellow(`Kept network ${kept.name}: ${kept.reason}`));
        }
      }
    }
    return result;
  } catch (err) {
    if (!json && isExplicit) {
      console.log(source_default.yellow(`Could not remove networks: ${err.message}`));
    }
    return void 0;
  }
}
function planNetworkPruneOrWarn(projectRoot, json) {
  try {
    return planProjectNetworkPrune(readProjectConfig(projectRoot).project.name, void 0, projectComposeProjects(projectRoot));
  } catch (err) {
    if (!json) {
      console.log(source_default.yellow(`Could not check networks: ${err.message}`));
    }
    return void 0;
  }
}
function projectArtifacts(projectRoot) {
  let name;
  try {
    name = readProjectConfig(projectRoot).project.name.toLowerCase();
  } catch {
    return void 0;
  }
  const records = readProjectRecords();
  const recorded = records.find((record) => record.name === name)?.stacks ?? [];
  const stacks = [.../* @__PURE__ */ new Set([...recorded, ...allStackNames() ?? []])];
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
      console.log(source_default.yellow("Could not read the project name; nothing purged."));
    return void 0;
  }
  const result = removeProjectArtifacts(found.artifacts);
  if (!json) {
    const removed = describeArtifacts(result.removed);
    console.log(removed.length > 0 ? source_default.gray(`Removed ${countArtifacts(result.removed)} Docker objects of ${found.name}:
  ${removed.join("\n  ")}`) : source_default.gray(`No volumes, networks or images of ${found.name} are left.`));
    for (const kept of result.kept) {
      console.log(source_default.yellow(`Kept ${kept.kind.slice(0, -1)} ${kept.name}: ${kept.reason}`));
    }
  }
  return result;
}
var downCommand = attachNoPositionalHint(addYesOption(new Command("down"))).description("Stop every running service of this project (local processes or Docker/Tilt)").option("-v, --verbose", "Enable verbose output", false).option("-f, --force", "Deprecated alias for --yes; accepted for script compatibility", false).option("--prune-networks", "Remove this project's Docker networks that no container is attached to (the default; kept for scripts)").option("--no-prune-networks", "Keep this project's Docker networks (by default the unused ones are removed, so Docker does not run out of address pools)").option("--prune-cache [age]", "Also prune Docker build cache (shared across all projects on this machine; default age: 24h)", false).option("--cache-until <age>", "With --prune-cache: age filter for prune (e.g. 24h, 168h, 7d; default: 24h)").option("--purge", "Also delete this project's Docker volumes (database data), networks and images, so nothing of it is left in Docker", false).option("--dry-run", "Show what would be stopped without stopping", false).option("--json", "Print one JSON object on stdout; implies quiet human output", false).option("--project <path>", "Stop the Flisk project in this folder (default: the current project, or the only running one)").addHelpText("after", "\nAfter stopping a container project, down prints how much disk its images and the shared build cache still hold, and the command that frees it.\n\nExamples:\n  flisk down --dry-run\n  flisk down --json\n  flisk down --verbose").action(async (options, command) => {
  const guess = inferNodeProject(process.cwd());
  if (guess && !options.project) {
    const emitInferred = options.json ? createJsonEmitter("DOWN_FAILED", "flisk down") : void 0;
    const stateRoot = inferredStateRoot(process.cwd());
    if (options.dryRun) {
      emitInferred?.({ ok: true, dryRun: true, runtime: "native", inferred: true });
      if (!options.json)
        console.log(source_default.gray("Dry run - not stopping the local process of this folder"));
      return;
    }
    const stopped = await stopNativeRun(stateRoot);
    emitInferred?.({
      ok: true,
      runtime: "native",
      inferred: true,
      stopped: stopped.services,
      ...stopped.stale ? { stale: true } : {},
      ...stopped.unverified?.length ? { unverified: stopped.unverified } : {}
    });
    if (!options.json)
      printNativeStop(stopped, "folder");
    return;
  }
  const project = options.project ?? command.optsWithGlobals().project;
  const resolvedRoot = resolveDownProject({ ...options, project });
  const shouldPruneCache = Boolean(options.pruneCache);
  const rawCacheUntil = typeof options.pruneCache === "string" ? options.pruneCache : options.cacheUntil || "24h";
  if (shouldPruneCache && !validateCacheUntil(rawCacheUntil)) {
    const error = new FliskError(`Invalid --cache-until format: "${rawCacheUntil}"`, [
      "Use a duration such as 24h, 168h, 7d, or 2h30m"
    ]);
    if (options.json)
      writeMachineError(error);
    return error.exit();
  }
  const cacheUntil = normalizeCacheUntil(rawCacheUntil);
  if (findProjectRoot() !== resolvedRoot)
    process.chdir(resolvedRoot);
  if (options.force) {
    options.yes = true;
    if (!options.json) {
      console.warn(source_default.yellow("Note: --force (-f) on flisk down is deprecated; use --yes (-y) instead."));
    }
  }
  const emit = options.json ? createJsonEmitter("DOWN_FAILED", "flisk down") : void 0;
  const projectRoot = findProjectRoot();
  if (isNativeRun(projectRoot)) {
    if (emit && options.dryRun) {
      emit({
        ok: true,
        dryRun: true,
        runtime: "native",
        ...shouldPruneCache ? { wouldPruneCache: { until: cacheUntil } } : {}
      });
      return;
    }
    if (handleDryRun(options, "not stopping local processes", "stop the local processes of this project")) {
      if (shouldPruneCache) {
        console.log(source_default.gray(`Dry run - not pruning Docker build cache (would run: docker builder prune -f --filter until=${cacheUntil})`));
      }
      return;
    }
    const stopped = await stopNativeRun(projectRoot);
    if (!options.json)
      printNativeStop(stopped, "project");
    emit?.({
      ok: true,
      runtime: "native",
      stopped: stopped.services,
      ...stopped.stale ? { stale: true } : {},
      ...stopped.unverified?.length ? { unverified: stopped.unverified } : {}
    });
    return;
  }
  if (options.purge) {
    const name = projectNameAt(projectRoot);
    if (name) {
      const records = readProjectRecords();
      const stacks = [
        .../* @__PURE__ */ new Set([
          ...records.find((record) => record.name === name)?.stacks ?? [],
          ...allStackNames() ?? []
        ])
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
    const wouldPurge = options.purge && options.dryRun ? projectArtifacts(projectRoot) : void 0;
    const wouldPruneNetworks = options.pruneNetworks !== false && !options.purge && options.dryRun ? planNetworkPruneOrWarn(projectRoot, Boolean(options.json)) : void 0;
    if (emit && options.dryRun) {
      emit({
        ok: true,
        dryRun: true,
        ...shouldPruneCache ? { wouldPruneCache: { until: cacheUntil } } : {},
        ...wouldPurge ? { wouldPurge: wouldPurge.artifacts } : {},
        ...wouldPruneNetworks ? { wouldPruneNetworks } : {}
      });
      return;
    }
    if (handleDryRun(options, "not stopping resources", "tilt down")) {
      if (wouldPruneNetworks) {
        const keep = wouldPruneNetworks.keep.map((kept) => `${kept.name} (${kept.reason})`);
        console.log(source_default.gray(`Dry run - network prune would remove: ${wouldPruneNetworks.remove.join(", ") || "<none>"}
          would keep: ${keep.join(", ") || "<none>"}`));
      }
      if (wouldPurge) {
        const listed = describeArtifacts(wouldPurge.artifacts);
        console.log(source_default.gray(listed.length > 0 ? `Dry run - --purge would delete:
  ${listed.join("\n  ")}` : `Dry run - --purge would delete nothing: no Docker objects of ${wouldPurge.name} exist.`));
      }
      if (shouldPruneCache) {
        console.log(source_default.gray(`Dry run - not pruning Docker build cache (would run: docker builder prune -f --filter until=${cacheUntil})`));
      }
      return;
    }
    const shouldPruneNetworks = options.pruneNetworks !== false;
    const hasCleanup = Boolean(options.purge || shouldPruneCache);
    const idle = isProjectIdle(projectRoot);
    if (idle && !hasCleanup) {
      if (!options.json)
        console.log(source_default.gray("Nothing is running for this project."));
      const leftover = shouldPruneNetworks ? pruneNetworksOrWarn(options.json, options.pruneNetworks === true) : void 0;
      emit?.({
        ok: true,
        stoppedTilt: [],
        idle: true,
        ...leftover ? { removedNetworks: leftover.removed, keptNetworks: leftover.kept } : {}
      });
      return;
    }
    const tiltArgs = buildTiltDownArgs({
      focusTargets: allStackNames()
    });
    let stoppedTilt = [];
    if (!idle) {
      try {
        const tiltfile = getTiltfilePath();
        stoppedTilt = stopProjectTiltUp(tiltfile);
        if (stoppedTilt.length > 0)
          await waitForTiltUpExit(tiltfile);
      } catch {
      }
    }
    if (stoppedTilt.length > 0 && !options.json) {
      console.log(source_default.gray(`Stopped tilt up (pid ${stoppedTilt.join(", ")}).`));
    }
    if (!idle && !options.json)
      console.log(source_default.blue("Stopping all tilt resources..."));
    if (!idle && options.verbose && !options.json) {
      console.log(source_default.gray("Running: tilt down -f .flisk/.flisk-out/Tiltfile"));
    }
    const result = idle ? { exitCode: 0 } : await runTilt("down", tiltArgs, {
      verbose: options.verbose && !options.json,
      inheritStdio: !options.json
    });
    let composeFallback;
    if (result.exitCode !== 0) {
      let fallback;
      try {
        fallback = stopProjectComposeProjects(projectRoot);
      } catch {
        handleTiltFailure("down", result.exitCode);
      }
      if (fallback.failed.length > 0) {
        for (const failed of fallback.failed) {
          console.error(source_default.red(`Could not stop Compose project ${failed.name}: ${failed.reason}`));
        }
        handleTiltFailure("down", result.exitCode);
      }
      composeFallback = { ...fallback, tiltDownExitCode: result.exitCode };
      if (!options.json) {
        console.log(source_default.yellow(fallback.stopped.length > 0 ? `tilt down failed (exit ${result.exitCode}); stopped this project's containers with docker compose down instead: ${fallback.stopped.join(", ")}` : `tilt down failed (exit ${result.exitCode}); no containers of this project are left to stop.`));
      }
    }
    let networks;
    if (shouldPruneNetworks && !options.purge) {
      networks = pruneNetworksOrWarn(options.json, options.pruneNetworks === true);
    }
    const purged = options.purge ? purgeOrWarn(projectRoot, options.json) : void 0;
    let cachePruneResult;
    if (shouldPruneCache) {
      let confirmed = Boolean(options.yes);
      if (!confirmed) {
        if (options.json || !process.stdin.isTTY) {
          cachePruneResult = {
            until: cacheUntil,
            skipped: true,
            reason: "confirmation required; run in a terminal or pass --yes"
          };
          if (!options.json) {
            console.log(source_default.yellow("Skipping Docker build cache prune: confirmation required; run in a terminal or pass --yes."));
          }
        } else {
          console.log(source_default.yellow("Notice: Docker build cache is shared across all projects on this machine.\nPruning it affects other projects and may increase subsequent build times."));
          try {
            confirmed = await promptConfirm({
              message: `Prune Docker build cache older than ${cacheUntil}?`,
              initial: false
            });
          } catch {
            confirmed = false;
          }
          if (!confirmed) {
            cachePruneResult = { until: cacheUntil, skipped: true, reason: "not confirmed" };
            console.log(source_default.gray("Skipped Docker build cache prune."));
          }
        }
      }
      if (confirmed) {
        try {
          const pruned = await pruneDockerBuildCache({ until: cacheUntil });
          cachePruneResult = { until: cacheUntil, reclaimed: pruned.reclaimed };
          if (!options.json) {
            console.log(source_default.gray(`Pruned Docker build cache: ${pruned.reclaimed} reclaimed (filter: until=${cacheUntil}).`));
          }
          try {
            const trimmed = await trimColimaAndMeasure();
            if (trimmed) {
              const returned = formatBytes(trimmed.returnedBytes);
              cachePruneResult = { ...cachePruneResult, hostReturned: returned };
              if (!options.json) {
                console.log(source_default.gray(`Trimmed the Colima VM: ${returned} returned to the Mac.`));
              }
            }
          } catch (err) {
            if (!options.json) {
              console.log(source_default.yellow(`Could not trim the Colima VM: ${err instanceof Error ? err.message : String(err)}. The Mac keeps the freed space until you run: colima ssh -- sudo fstrim -av`));
            }
          }
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          cachePruneResult = { until: cacheUntil, skipped: true, reason };
          if (!options.json) {
            console.log(source_default.yellow(`Could not prune Docker build cache: ${reason}`));
          }
        }
      }
    }
    let tiltImages;
    if (!options.dryRun) {
      tiltImages = await pruneSupersededTiltImages(1);
      if (tiltImages.removed.length > 0 && !options.json) {
        console.log(source_default.gray(`Removed ${tiltImages.removed.length} superseded tilt-* image(s) (up to ${(tiltImages.removedBytes / 1e9).toFixed(1)} GB).`));
      }
    }
    let retained;
    try {
      const projectInfo = options.purge ? void 0 : projectArtifacts(projectRoot);
      if (projectInfo) {
        retained = await collectLeftovers(projectInfo.artifacts?.images ?? []) ?? void 0;
        if (retained && !options.json) {
          for (const line of formatLeftovers(retained, projectInfo.name)) {
            console.log(source_default.yellow(line));
          }
        }
      }
    } catch {
    }
    emit?.({
      ok: true,
      stoppedTilt,
      ...retained ? { retained } : {},
      ...tiltImages && tiltImages.removed.length > 0 ? { prunedTiltImages: tiltImages.removed } : {},
      ...composeFallback ? {
        composeFallback: {
          tiltDownExitCode: composeFallback.tiltDownExitCode,
          stopped: composeFallback.stopped
        }
      } : {},
      ...networks ? { removedNetworks: networks.removed, keptNetworks: networks.kept } : {},
      ...purged ? { purged: purged.removed, keptAfterPurge: purged.kept } : {},
      ...cachePruneResult ? { prunedCache: cachePruneResult } : {}
    });
  });
});

export {
  downCommand
};
