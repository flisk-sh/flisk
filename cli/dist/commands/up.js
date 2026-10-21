// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { ensureProjectRuntimeAssets, generateMasterConfigs, ProjectConfigNotFoundError, verifyMasterConfigs, } from "../generator/template-engine.js";
import { DEVCONTAINER_DOCKER_FIX, detectHost, isContainerHost, WEBCONTAINER_UP_MESSAGE, } from "../utils/agent-host.js";
import { handleDryRun } from "../utils/command-helpers.js";
import { STANDARD_PORTS } from "../utils/constants.js";
import { getDeferredResourceNames, summarizeTiltBuildError } from "../utils/doctor-runtime.js";
import { applyEnvFileSelection, assertEngineSupportsEnvFile, EnvFileError, envFileWarning, selectEnvFile, } from "../utils/env-selection.js";
import { completeEnvFile } from "../utils/env-validator.js";
import { errorFactories, getErrorMessage, handleTiltFailure, requireProjectRoot, runCommand, showError, showErrorAndExit, TdkError, withTiltCheck, } from "../utils/errors.js";
import { ensureSmokeRecordsIgnored } from "../utils/file-helpers.js";
import { formatCount } from "../utils/formatting.js";
import { exportHostPortPlan, getHostPortPlan, writeSavedHostPortPlan, } from "../utils/host-port-config.js";
import { formatHostPortPlan } from "../utils/host-port-plan.js";
import { createJsonEmitter } from "../utils/json-output.js";
import { toMachineError } from "../utils/machine-output.js";
import { findProjectRoot, getPackageVersion } from "../utils/paths.js";
import { findAvailablePort } from "../utils/port-assignment.js";
import { formatPortFallbackNotice } from "../utils/port-fallback-notice.js";
import { isApiServiceType } from "../utils/resource-kind.js";
import { enforceSchemaVersionGate } from "../utils/schema-version-gate.js";
import { enforceServiceConfigGate, warnSchemaVersions } from "../utils/service-config-checks.js";
import { appendHealthPath, resolveSubdomainBases } from "../utils/service-urls.js";
import { discoverResourcesStrict, discoverResourcesWithProblems, discoverStacks, getResourcesForStack, stackExists, warnAboutSkippedFiles, } from "../utils/services.js";
import { buildSmokePlans, formatSmokeFailure, runSmokePlans, safeSmokeDeps, } from "../utils/smoke.js";
import { buildStartupReport, formatStartupReport, isStartupStalled, } from "../utils/startup-report.js";
import { evaluateTdkVersionFloor } from "../utils/tdk-version.js";
import { buildTiltUpArgs, runTilt } from "../utils/tilt.js";
import { classifyTiltPorts } from "../utils/tilt-port-owner.js";
import { stopTiltOnPort } from "../utils/tilt-process.js";
import { parseTiltPort, resolveTiltPort, secondUpAction, stopTiltForUp, } from "../utils/tilt-startup.js";
import { findUnknownServices, resolveOnlySelection } from "../utils/up-only.js";
import { tiltGetUiResources, waitForTiltResourcesReady } from "../utils/up-readiness.js";
import { enableDiscoveredStacks } from "./project.js";
export function formatUpSuccess(port, appUrls = []) {
    return [
        "TDK is up.",
        `Tilt UI: http://localhost:${port}`,
        "App URLs:",
        ...(appUrls.length > 0
            ? appUrls.slice(0, 5).map((url) => `  ${url}`)
            : ["  run: tdk networks"]),
        "Stop: tdk down",
    ];
}
export function nativeWindowsUpRefusal(platform, allowNativeWindows) {
    if (platform !== "win32" || allowNativeWindows === "1")
        return null;
    return "Landscape startup needs Ubuntu on WSL2. Native Windows is inspect-only.";
}
/** Why `tdk up` cannot work on this host, or null when it may proceed. Docker reachability is only probed in container hosts. */
export async function hostUpRefusal(host = detectHost(), dockerReachable = defaultDockerReachable) {
    if (host.kind === "webcontainer")
        return WEBCONTAINER_UP_MESSAGE;
    if (isContainerHost(host.kind) && !(await dockerReachable()))
        return DEVCONTAINER_DOCKER_FIX;
    return null;
}
async function defaultDockerReachable() {
    const { execFile } = await import("node:child_process");
    return new Promise((resolve) => {
        execFile("docker", ["ps"], { timeout: 10_000 }, (error) => resolve(!error));
    });
}
/** Exit status for `tdk up` when generated files no longer match service.json / project.json. */
export const DRIFT_EXIT_CODE = 2;
/**
 * Generated service files edited by hand. Only these block `tdk up`: when service.json itself changed, `tdk up` regenerates
 * the outputs, so stale outputs are the normal edit-then-up loop and not drift.
 */
export function driftReport(projectRoot, resources) {
    let handEdited;
    try {
        ({ handEdited } = verifyMasterConfigs(projectRoot, resources
            ? {
                manifestPaths: resources.map((r) => r.configPath),
                skipManifestValidation: true,
            }
            : undefined));
    }
    catch (error) {
        // A project with no .tdk/project.json has no snapshots to compare. Anything else (a corrupt config) must not skip the gate.
        if (error instanceof ProjectConfigNotFoundError)
            return null;
        throw error;
    }
    if (handEdited.length === 0)
        return null;
    return [
        "Generated files were edited by hand and no longer match service.json:",
        ...handEdited.map((file) => `  ${file}`),
        "Run `tdk config regenerate` to discard the edits, or bypass with `tdk up --ignore-drift`.",
    ];
}
/**
 * Runs before Tilt is started: exits with DRIFT_EXIT_CODE on drift unless `ignoreDrift` is set. With `ignoreDrift` the
 * warning is printed every time, whether or not anything drifted, because the check is skipped and cannot tell.
 */
export function enforceDriftGate(projectRoot, options, exit = process.exit) {
    if (options.ignoreDrift) {
        console.warn(chalk.yellow("Warning: --ignore-drift set; generated files were not checked."));
        return;
    }
    const drift = driftReport(projectRoot, options.resources);
    if (!drift)
        return;
    options.onDrift?.(drift.join("\n"));
    showError(drift.join("\n"));
    exit(DRIFT_EXIT_CODE);
}
/**
 * Runs before anything starts (also under --dry-run, like the drift gate): a project's `minTdkVersion` in
 * .tdk/project.json that this CLI does not meet, or cannot read, exits with 1 and the same text as `tdk doctor`.
 * `ignoreVersion` skips the check and says so. No minTdkVersion means no check.
 */
export function enforceVersionFloor(projectRoot, options, currentVersion = getPackageVersion(), exit = process.exit) {
    if (options.ignoreVersion) {
        console.warn(chalk.yellow("Warning: --ignore-version set; minTdkVersion was not checked."));
        return;
    }
    const floor = evaluateTdkVersionFloor(projectRoot, currentVersion);
    if (floor.status === "none" || floor.status === "ok")
        return;
    options.onFail?.(`${floor.message}\n${floor.fix}`);
    showError(`${floor.message}\n${floor.fix}`);
    exit(1);
}
const STARTUP_FAILED = Symbol("startup-failed");
/**
 * Waits for Tilt to exit, unless startup has already failed. A readiness failure reports and exits 1 at once: Tilt keeps
 * running (`tdk down` stops it), so waiting for its exit would hang the command.
 */
export async function waitForTiltUnlessStartupFailed(tiltRun, startupFailure, exit = process.exit) {
    const outcome = await Promise.race([tiltRun, startupFailure.then(() => STARTUP_FAILED)]);
    if (outcome === STARTUP_FAILED)
        exit(1);
    return outcome;
}
function waitForTiltUi(port, timeoutMs = 30_000) {
    return new Promise((resolve) => {
        const deadline = Date.now() + timeoutMs;
        const attempt = () => {
            const socket = connect({ host: "127.0.0.1", port });
            let settled = false;
            const finish = (ready) => {
                if (settled)
                    return;
                settled = true;
                socket.destroy();
                if (ready || Date.now() >= deadline)
                    resolve(ready);
                else
                    setTimeout(attempt, 250);
            };
            socket.once("connect", () => finish(true));
            socket.once("error", () => finish(false));
        };
        attempt();
    });
}
/**
 * The env file of the run. `tdk up --env-file <path>` replaces the project `.env` for the run, so the
 * file is resolved, read and checked before anything is written or started. Without the option the
 * project `.env` stays the env file of the run, exactly as before.
 *
 * @throws TdkError when the file cannot be used; the run stops before it starts
 */
export function selectRunEnvFile(projectRoot, requested) {
    if (requested === undefined)
        return undefined;
    if (!projectRoot) {
        throw errorFactories.notInProject();
    }
    const selection = selectEnvFile(projectRoot, requested);
    // A project created before this option vendored an engine that ignores the selection, so the run
    // would silently use the project .env instead.
    assertEngineSupportsEnvFile(projectRoot);
    return selection;
}
/** The machine-readable failure of a refused `--env-file`, and the exit code it stops the run with. */
function envFileFailure(error) {
    const suggestions = error instanceof TdkError ? error.suggestions : [];
    return {
        failure: {
            code: error instanceof EnvFileError ? error.code : "ENV_FILE_INVALID",
            message: getErrorMessage(error),
            ...(suggestions.length > 0 ? { suggestions } : {}),
        },
        exitCode: error instanceof TdkError ? error.exitCode : 2,
    };
}
export const upCommand = new Command("up")
    .description("Start all services (optionally filtered by stack)")
    .alias("deploy")
    .argument("[stack-name]", "Name of the stack to start (optional - runs all if omitted)")
    .option("-v, --verbose", "Enable verbose output", false)
    .option("-q, --quiet", "Suppress non-essential output", false)
    .option("--dry-run", "Show what would be started without starting", false)
    .option("-f, --force", "Kill existing Tilt process before starting", false)
    .option("--ignore-drift", "Start even if generated files differ from service.json", false)
    .option("--ignore-version", "Start even if this tdk is older than minTdkVersion in .tdk/project.json", false)
    .option("--only <services...>", "Start only these services plus what the Tiltfile enables for them (their dependsOn services and shared infrastructure). With a stack, names must belong to that stack; dependencies may cross stacks")
    .option("--env-file <path>", "Use this project env file for the run instead of .env (for example: --env-file .env.integration)")
    .option("--json", "Print one JSON object on stdout when the stack is ready or the command fails; implies --quiet", false)
    .action(async (stackName, options) => {
    const emit = options.json ? createJsonEmitter("UP_FAILED", "tdk up") : undefined;
    if (options.json)
        options.quiet = true;
    const portSetting = parseTiltPort(process.env.TILT_PORT);
    if (!portSetting.ok) {
        emit?.({ ok: false }, [{ code: "INVALID_TILT_PORT", message: portSetting.message }]);
        showErrorAndExit(portSetting.message);
    }
    const configuredTiltPort = portSetting.port;
    // First, before the host/Docker checks below: an old CLI must stop with one clear line, not a half-working stack.
    const versionRoot = findProjectRoot();
    if (versionRoot) {
        enforceVersionFloor(versionRoot, {
            ignoreVersion: options.ignoreVersion,
            onFail: (message) => emit?.({ ok: false }, [{ code: "TDK_VERSION_TOO_OLD", message }]),
        });
    }
    // The env file of the run. `--env-file` replaces the project .env for this run, so the file is
    // resolved and read before any prerequisite check, any write and any service starts.
    const envFileRoot = versionRoot;
    let envFileSelection;
    if (options.envFile !== undefined) {
        try {
            envFileSelection = selectRunEnvFile(envFileRoot, options.envFile);
        }
        catch (error) {
            const { failure, exitCode } = envFileFailure(error);
            emit?.({ ok: false }, [failure]);
            showErrorAndExit(failure.message, exitCode, failure.suggestions);
        }
        if (envFileSelection && envFileRoot) {
            applyEnvFileSelection(envFileSelection);
            if (!options.quiet) {
                console.log(chalk.gray(`Using env file: ${envFileSelection.relativePath} (the project .env is not read in this run)`));
            }
            const warning = envFileWarning(envFileRoot, envFileSelection);
            // stderr, not stdout: in --json mode stdout carries the JSON envelope only.
            if (warning)
                console.warn(chalk.yellow(warning));
        }
    }
    const hostRefusal = options.dryRun ? null : await hostUpRefusal();
    if (hostRefusal) {
        emit?.({ ok: false }, [{ code: "HOST_UNSUPPORTED", message: hostRefusal }]);
        showErrorAndExit(hostRefusal);
    }
    const platformRefusal = nativeWindowsUpRefusal(process.platform, process.env.TDK_ALLOW_NATIVE_WINDOWS);
    if (platformRefusal)
        showErrorAndExit(platformRefusal);
    // An unknown schemaVersion is refused before the machine check, so --json can name the file even when Bun is missing.
    const schemaRoot = findProjectRoot();
    let initialDiscovery;
    if (schemaRoot) {
        try {
            initialDiscovery = discoverResourcesWithProblems(schemaRoot);
            warnAboutSkippedFiles(initialDiscovery.problems);
        }
        catch {
            // A root that cannot be read is reported by the checks that run next.
        }
        if (initialDiscovery) {
            enforceSchemaVersionGate(schemaRoot, {
                resources: initialDiscovery.resources,
                onInvalid: (message) => emit?.({ ok: false }, [{ code: "INVALID_SCHEMA_VERSION", message }]),
            });
        }
    }
    if (!options.dryRun) {
        const { assertMachineReadyOrExit } = await import("../utils/cold-preflight.js");
        await assertMachineReadyOrExit();
    }
    const action = async () => {
        const foundRoot = options.dryRun ? requireProjectRoot() : findProjectRoot();
        const projectRoot = foundRoot ?? process.cwd();
        const discoveredResources = discoverResourcesStrict(foundRoot && foundRoot === schemaRoot ? initialDiscovery : undefined);
        let discoveredStacks;
        let discoveredStackNames = [];
        if (!options.only || stackName) {
            discoveredStacks = discoverStacks(discoveredResources);
            discoveredStackNames = discoveredStacks.map((stack) => stack.name);
        }
        // Reject a bad request before anything below can write to the project (.env, runtime assets, .tdk/project.json).
        if (options.only) {
            if (stackName && !stackExists(stackName, discoveredResources)) {
                const error = errorFactories.stackNotFound(stackName, discoveredStackNames);
                emit?.({ ok: false }, [toMachineError(error).error]);
                error.exit();
            }
            const candidates = stackName
                ? getResourcesForStack(stackName, discoveredResources)
                : discoveredResources;
            const unknown = findUnknownServices(options.only, candidates);
            if (unknown.length > 0) {
                const validNames = candidates.map((service) => service.name);
                const error = errorFactories.unknownServices(unknown, validNames);
                emit?.({ ok: false }, [
                    {
                        code: "UNKNOWN_SERVICE",
                        message: error.message,
                        ...(error.suggestions.length > 0 ? { suggestions: error.suggestions } : {}),
                    },
                ]);
                error.exit();
            }
        }
        // Also under --dry-run: the check only reads, and a dry run should show what a real run would refuse.
        if (foundRoot) {
            enforceDriftGate(foundRoot, {
                ignoreDrift: options.ignoreDrift,
                resources: discoveredResources,
                onDrift: (message) => emit?.({ ok: false }, [{ code: "DRIFT_DETECTED", message }]),
            });
        }
        // Duplicate names, circular dependsOn and invalid ports are refused before anything starts, dry run included.
        if (foundRoot) {
            enforceServiceConfigGate(foundRoot, {
                resources: discoveredResources,
                onInvalid: (message) => emit?.({ ok: false }, [{ code: "INVALID_SERVICE_CONFIG", message }]),
            });
        }
        // A project without schemaVersion keeps working; say how to add it, but only where a person is reading.
        if (foundRoot && !emit && !options.quiet) {
            warnSchemaVersions(foundRoot, discoveredResources);
        }
        const hostPortPlan = await getHostPortPlan(projectRoot, {
            inspectDocker: !options.dryRun,
        });
        if (!options.dryRun) {
            // An older project's .env predates keys such as JWT_SECRET, which Compose now requires. Add what is missing (never
            // changing an existing value) before anything starts. Only inside a real project, so a stray run never writes a .env.
            // A selected env file replaces the project .env for this run: the run does not read it, so it is not completed either.
            if (foundRoot && !envFileSelection) {
                const addedEnvKeys = completeEnvFile(projectRoot);
                if (addedEnvKeys.length > 0 && !options.quiet) {
                    console.log(chalk.gray(`Added ${addedEnvKeys.join(", ")} to .env (generated; existing values unchanged)`));
                }
            }
            // A project made by `tdk import` has .tdk/project.json but no generated files yet. Generate them rather than letting
            // Tilt fail on a missing Tiltfile.
            if (foundRoot && !existsSync(join(projectRoot, ".tdk", ".tdk-out", "Tiltfile"))) {
                if (!options.quiet) {
                    console.log(chalk.gray("No generated Tiltfile yet; generating .tdk/.tdk-out/ ..."));
                }
                await generateMasterConfigs(projectRoot, { quiet: options.quiet });
            }
            const copiedAssets = ensureProjectRuntimeAssets(projectRoot);
            if (copiedAssets.length > 0 && options.verbose && !options.quiet) {
                console.log(chalk.gray(`Refreshed runtime assets: ${copiedAssets.join(", ")}`));
            }
            const newlyEnabledStacks = enableDiscoveredStacks(projectRoot, discoveredResources);
            if (newlyEnabledStacks.length > 0 && !options.quiet) {
                console.log(chalk.gray(`Added ${newlyEnabledStacks.join(", ")} to the pre_alpha phase in .tdk/project.json`));
            }
        }
        let servicesToStart;
        let stackDescription;
        let focusServiceNames = [];
        if (stackName) {
            servicesToStart = getResourcesForStack(stackName, discoveredResources);
            if (servicesToStart.length === 0) {
                const error = errorFactories.stackNotFound(stackName, discoveredStackNames);
                emit?.({ ok: false }, [toMachineError(error).error]);
                error.exit();
            }
            focusServiceNames = servicesToStart.map((s) => s.name);
            stackDescription = `stack "${stackName}"`;
        }
        else {
            servicesToStart = discoveredResources;
            const allStacks = discoveredStacks ?? discoverStacks(discoveredResources);
            stackDescription = `all stacks (${formatCount(allStacks.length, "stack")}, ${formatCount(servicesToStart.length, "service")})`;
        }
        let dependencyNames = [];
        if (options.only) {
            // Dependencies come from the whole project, not just the named stack: dependsOn may cross stacks.
            const selection = resolveOnlySelection(options.only, discoveredResources);
            servicesToStart = selection.selected;
            dependencyNames = selection.dependencies;
            focusServiceNames = servicesToStart.map((s) => s.name);
            stackDescription = `${formatCount(options.only.length, "requested service")}${dependencyNames.length > 0 ? ` plus ${dependencyNames.join(", ")}` : ""}`;
        }
        if (options.verbose && !options.quiet) {
            console.log(chalk.gray(`Found ${formatCount(servicesToStart.length, "service")} in ${stackDescription}`));
        }
        const serviceNames = servicesToStart.map((s) => s.name);
        if (!options.quiet) {
            console.log(chalk.blue(`${options.dryRun ? "Would start" : "Starting"} ${formatCount(serviceNames.length, "service")} from ${stackDescription}...`));
            for (const name of serviceNames) {
                console.log(chalk.gray(`  - ${name}`));
            }
            const { appBase, apiBase } = resolveSubdomainBases(hostPortPlan.ingressHttp);
            const frontends = servicesToStart.filter((s) => s.config?.appType === "frontend");
            const backends = servicesToStart.filter((s) => isApiServiceType(s.config?.appType));
            if (frontends.length > 0) {
                console.log(chalk.blue("\n🌍 Frontend URLs:"));
                for (const svc of frontends) {
                    const basePath = svc.config?.basePath ?? `/${svc.name}`;
                    console.log(chalk.gray(`  - ${svc.name}: ${appBase}${chalk.cyan(appendHealthPath(basePath))}`));
                }
            }
            if (backends.length > 0) {
                console.log(chalk.blue("\n🔧 Backend API URLs:"));
                for (const svc of backends) {
                    const servicePathName = svc.name.replace(/-api$/, "");
                    const apiPath = svc.config?.apiPath ?? `/api/${servicePathName}`;
                    const sablier = svc.config?.sablier;
                    const deferredTag = sablier?.enable && sablier?.deferStart
                        ? chalk.dim(" (deferred — starts on first request)")
                        : "";
                    console.log(chalk.gray(`  - ${svc.name}: ${apiBase}${chalk.cyan(appendHealthPath(apiPath))}${deferredTag}`));
                }
            }
        }
        const focusTargets = options.only ?? (stackName ? [stackName] : undefined);
        const tiltArgs = buildTiltUpArgs(focusServiceNames, {
            verbose: options.verbose,
            quiet: options.quiet,
            force: options.force,
            focusTargets,
        });
        const dryRunCommand = focusTargets ? `tilt up ${tiltArgs.join(" ")}` : "tilt up";
        if (!options.quiet) {
            console.log(chalk.blue(formatHostPortPlan(hostPortPlan)));
            for (const line of formatPortFallbackNotice(hostPortPlan))
                console.log(chalk.yellow(line));
            console.log(chalk.gray("Override with TDK_HTTP_PORT, TDK_HTTPS_PORT, or TDK_POSTGRES_PORT."));
        }
        if (emit && options.dryRun) {
            emit({
                ok: true,
                dryRun: true,
                stack: stackName ?? null,
                services: serviceNames,
                ...(options.only
                    ? { requested: options.only, declaredDependencies: dependencyNames }
                    : {}),
                command: dryRunCommand,
            });
            return;
        }
        if (handleDryRun(options, "not starting services", dryRunCommand)) {
            return;
        }
        exportHostPortPlan(hostPortPlan);
        writeSavedHostPortPlan(projectRoot, hostPortPlan);
        const basePort = STANDARD_PORTS.tiltUi;
        const watchedPort = configuredTiltPort ?? basePort;
        const candidatePorts = options.only ? [...new Set([basePort, watchedPort])] : [watchedPort];
        const { running, foreign } = await classifyTiltPorts(candidatePorts, projectRoot, async (candidate) => (await tiltGetUiResources(candidate)) !== null);
        if (foreign.length > 0 && configuredTiltPort !== undefined) {
            const other = foreign[0];
            const message = `TILT_PORT=${other?.port} is used by another project's Tilt (${other?.root}). Choose a free port, or run tdk down in that project.`;
            emit?.({ ok: false }, [{ code: "TILT_PORT_IN_USE", message }]);
            showErrorAndExit(message);
        }
        if (!options.quiet) {
            for (const other of foreign) {
                console.log(chalk.yellow(`⚠️  Tilt on port ${other.port} belongs to another project (${other.root}); this project will use another port.`));
            }
        }
        // --force replaces this project's Tilt; it must never stop another project's.
        const force = options.force && foreign.length === 0;
        const decision = secondUpAction({
            runningPorts: running,
            force,
            only: Boolean(options.only),
        });
        if (decision.action === "already-running") {
            // The env file of the run belongs to the Tilt process this run starts. A stack that is
            // already running keeps the env file it started with, so the selection would be ignored
            // silently - say so instead of reporting a run that never happened.
            if (envFileSelection) {
                const message = `A Tilt is already running on port ${decision.ports.join(", ")}. --env-file applies to a new run only: run \`tdk down\` first, or pass --force to replace the running stack.`;
                emit?.({ ok: false }, [{ code: "ENV_FILE_ALREADY_RUNNING", message }]);
                showErrorAndExit(message);
            }
            const message = `Environment is already running on port ${decision.ports.join(", ")}.`;
            emit?.({
                ok: true,
                alreadyRunning: true,
                tiltUrl: `http://localhost:${decision.ports[0]}`,
            });
            if (!options.quiet)
                console.log(chalk.green(message));
            return;
        }
        if (decision.action === "only-blocked") {
            const message = `A Tilt is already running on port ${decision.ports.join(", ")}. --only cannot change a running stack's services: run \`tdk down\` first, or pass --force to replace it.`;
            emit?.({ ok: false }, [{ code: "TILT_ALREADY_RUNNING", message }]);
            showErrorAndExit(message);
        }
        if (options.only) {
            for (const runningPort of running)
                stopTiltOnPort(runningPort);
        }
        const resolution = await resolveTiltPort({
            configuredPort: configuredTiltPort,
            force,
            basePort,
            findAvailablePort,
        });
        const port = resolution.port;
        if (resolution.autoSwitched && !options.quiet) {
            console.log(chalk.yellow(`⚠️  Port ${basePort} is already in use`));
            console.log(chalk.blue(`🔄 Auto-switching to port ${port}\n`));
        }
        process.env.TILT_PORT = port.toString();
        await stopTiltForUp({ force, quiet: options.quiet, port }, {
            stop: stopTiltOnPort,
            log: (message) => console.log(chalk.yellow(message)),
            wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
        });
        if (!options.quiet) {
            console.log(chalk.gray("\nRunning tilt up..."));
            console.log(chalk.gray(`Using Tiltfile: .tdk/.tdk-out/Tiltfile`));
        }
        const tiltRun = runTilt("up", tiltArgs, {
            verbose: options.verbose && !options.json,
            quiet: options.quiet,
            inheritStdio: !options.quiet, // Suppress tilt output in quiet mode
        });
        // Services that declare `smoke` are checked through the public URL once Tilt is up. A miss stops Tilt (containers stay for
        // inspection; `tdk down` removes them) and fails the command.
        const smokePlans = buildSmokePlans(servicesToStart, hostPortPlan.ingressHttp);
        let smokeFailed = false;
        let printedSuccess = false;
        let startupFailed = false;
        let signalStartupFailed = () => { };
        const startupFailure = new Promise((resolve) => {
            signalStartupFailed = resolve;
        });
        const successOutput = (async () => {
            const uiReady = await waitForTiltUi(port);
            // JSON consumers get success only after every non-deferred resource is built and running, not when the UI port opens.
            let jsonReady = false;
            let startedServices = serviceNames;
            let startedDependencies = dependencyNames;
            if (uiReady && emit) {
                const deferred = getDeferredResourceNames(discoveredResources);
                const readiness = await waitForTiltResourcesReady(port, {
                    deferred,
                    // Only what the caller named must be enabled. Dependencies are the Tiltfile's call (it skips some on purpose).
                    expected: options.only
                        ? options.only.filter((name) => !deferred.has(name))
                        : undefined,
                });
                if (readiness.ready) {
                    jsonReady = true;
                    if (options.only) {
                        // Report what Tilt actually enabled, not the service.json closure, which can differ from the Tiltfile's expansion.
                        const enabled = new Set(readiness.enabled);
                        const allNames = discoveredResources.map((r) => r.name);
                        startedServices = allNames.filter((name) => enabled.has(name));
                        startedDependencies = startedServices.filter((name) => !options.only.includes(name));
                    }
                }
                else {
                    startupFailed = true;
                    const detail = readiness.failures.map((f) => `${f.name}: ${f.message}`).join("; ");
                    emit({ ok: false, tiltUrl: `http://localhost:${port}`, failures: readiness.failures }, [
                        {
                            code: readiness.timedOut ? "UP_TIMEOUT" : "UP_RESOURCE_FAILED",
                            message: `${readiness.timedOut ? "Timed out waiting for resources" : "Resources failed"}${detail ? ` (${detail})` : ""}. Tilt is still running; inspect it or run: tdk down`,
                        },
                    ]);
                }
            }
            // The UI port opening only means Tilt started. Say "up" once every resource is built and running, and otherwise name
            // what failed and what it blocks.
            if (uiReady && !emit) {
                const deferred = getDeferredResourceNames(discoveredResources);
                const dependsOn = Object.fromEntries(discoveredResources.map((r) => [r.name, r.config?.dependsOn ?? []]));
                const readiness = await waitForTiltResourcesReady(port, {
                    deferred,
                    isStalled: (text) => isStartupStalled(text, dependsOn, deferred),
                });
                if (!readiness.ready) {
                    startupFailed = true;
                    const resourcesJson = await tiltGetUiResources(port);
                    const report = resourcesJson
                        ? buildStartupReport(resourcesJson, dependsOn, deferred)
                        : {
                            failed: readiness.failures.map((failure) => ({
                                name: failure.name,
                                message: summarizeTiltBuildError(failure.message),
                            })),
                            blocked: [],
                            starting: [],
                        };
                    const reportLines = formatStartupReport(report, readiness.timedOut);
                    if (reportLines.length > 0) {
                        showError(reportLines.join("\n"));
                    }
                }
            }
            if (uiReady && !options.quiet && !startupFailed) {
                for (const line of formatUpSuccess(port))
                    console.log(chalk.blue(line));
                printedSuccess = true;
            }
            if (uiReady && smokePlans.length > 0 && (emit ? jsonReady : !startupFailed)) {
                if (!options.quiet) {
                    console.log(chalk.gray(`Smoke check: ${smokePlans.map((p) => p.name).join(", ")}`));
                }
                // The records hold response bodies, so they must not be committable. Warn before writing them when the ignore
                // entry could not be added.
                const ignoreWarning = ensureSmokeRecordsIgnored(projectRoot);
                if (ignoreWarning)
                    console.warn(chalk.yellow(ignoreWarning));
                const results = await runSmokePlans(smokePlans, {
                    recordDir: join(projectRoot, ".tdk", "smoke"),
                    ...safeSmokeDeps(projectRoot, (message) => console.warn(chalk.yellow(message)), {
                        // The selected env file holds secrets as much as the project .env.
                        envFiles: envFileSelection ? [envFileSelection.path] : [],
                    }),
                });
                for (const smokeResult of results) {
                    if (smokeResult.ok) {
                        if (!options.quiet)
                            console.log(chalk.green(`Smoke check passed: ${smokeResult.name}`));
                    }
                    else {
                        smokeFailed = true;
                        showError(formatSmokeFailure(smokeResult));
                    }
                }
                if (smokeFailed) {
                    stopTiltOnPort(port);
                    emit?.({ ok: false }, [
                        { code: "UP_SMOKE_FAILED", message: "A smoke check failed; Tilt was stopped" },
                    ]);
                }
            }
            if (uiReady && jsonReady && !smokeFailed) {
                emit?.({
                    ok: true,
                    stack: stackName ?? null,
                    services: startedServices,
                    ...(options.only ? { requested: options.only, dependencies: startedDependencies } : {}),
                    tiltUrl: `http://localhost:${port}`,
                });
            }
            if (startupFailed)
                signalStartupFailed();
        })();
        const result = await waitForTiltUnlessStartupFailed(tiltRun, startupFailure);
        await successOutput;
        if (smokeFailed) {
            process.exit(1);
        }
        if (result.exitCode !== 0) {
            handleTiltFailure("up", result.exitCode);
        }
        if (startupFailed && result.exitCode === 0) {
            process.exit(1);
        }
        if (!options.quiet && result.exitCode === 0 && !printedSuccess) {
            for (const line of formatUpSuccess(port))
                console.log(chalk.blue(line));
        }
    };
    if (options.dryRun) {
        await runCommand(action);
    }
    else {
        await withTiltCheck(action);
    }
});
