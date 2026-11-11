// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { areMasterFilesStale, ensureProjectRuntimeAssets, generateMasterConfigs, isTiltfileOrchestration, isVendoredEngineStale, isWrappedTiltfileStale, ProjectConfigNotFoundError, readProjectConfig, verifyMasterConfigs, } from "../generator/template-engine.js";
import { DEVCONTAINER_DOCKER_FIX, detectHost, isContainerHost, WEBCONTAINER_UP_MESSAGE, } from "../utils/agent-host.js";
import { assertGatewayOptOutIsConfigured, disableDatabaseCapability, isDatabaseCapabilityEnabled, isGatewayEnabled, projectNeedsDatabaseKeys, } from "../utils/capabilities.js";
import { cliInvocation } from "../utils/cli-invocation.js";
import { coldStartNotice } from "../utils/cold-start.js";
import { handleDryRun } from "../utils/command-helpers.js";
import { STANDARD_PORTS } from "../utils/constants.js";
import { dependsOnOf, unknownBackendNames } from "../utils/dependency-graph.js";
import { diskWarningField, enforceDiskGuard, readDockerVmFreeGib } from "../utils/disk-guard.js";
import { enforceBuildCacheCeiling } from "../utils/docker-build-cache.js";
import { getDeferredResourceNames, summarizeTiltBuildError } from "../utils/doctor-runtime.js";
import { applyEnvFileSelection, assertEngineSupportsEnvFile, EnvFileError, envFileWarning, PROJECT_ENV_FILE_VAR, selectEnvFile, } from "../utils/env-selection.js";
import { completeEnvFile } from "../utils/env-validator.js";
import { errorFactories, FliskError, getErrorMessage, requireProjectRoot, runCommand, showError, showErrorAndExit, withTiltCheck, } from "../utils/errors.js";
import { ensureSmokeRecordsIgnored } from "../utils/file-helpers.js";
import { enforceFliskVersionGate } from "../utils/flisk-version-gate.js";
import { formatCount } from "../utils/formatting.js";
import { ensureGeneratedSecrets } from "../utils/generated-secrets.js";
import { ensureGeneratedRootIgnored } from "../utils/gitignore-generated.js";
import { exportHostPortPlan, getHostPortPlan, writeSavedHostPortPlan, } from "../utils/host-port-config.js";
import { formatHostPortPlan, isHostPortAvailable } from "../utils/host-port-plan.js";
import { inferNodeProject, inferredStateRoot } from "../utils/inferred-node-project.js";
import { createJsonEmitter } from "../utils/json-output.js";
import { toMachineError } from "../utils/machine-output.js";
import { collectRequiredModels, runModelPreflight } from "../utils/model-preflight.js";
import { findFreePort } from "../utils/native-demo.js";
import { hasNearbyServiceJson } from "../utils/native-project.js";
import { formatMixedRuntimeRefusal, isNativeProject, isNativeService, resolveRuntimeMode, } from "../utils/native-service.js";
import { runNativeUp } from "../utils/native-up.js";
import { nativeWindowsStackRefusal } from "../utils/native-windows.js";
import { findProjectRoot, getPackageVersion } from "../utils/paths.js";
import { findAvailablePort } from "../utils/port-assignment.js";
import { createPortClaimer } from "../utils/port-claims.js";
import { formatPortFallbackNotice } from "../utils/port-fallback-notice.js";
import { findPortOccupant } from "../utils/port-occupant.js";
import { applyProfiles, declaredProfiles, describeSkipped, } from "../utils/profiles.js";
import { recordProjectRoot } from "../utils/project-registry.js";
import { cloneMissingRepos } from "../utils/project-repos.js";
import { enforceSchemaVersionGate } from "../utils/schema-version-gate.js";
import { enforceServiceConfigGate, warnModelRunner, warnSchemaVersions, warnSecretConflicts, } from "../utils/service-config-checks.js";
import { appendHealthPath, isRoutableService, isRoutedBringYourOwn, isWebUiBringYourOwn, resolveServiceUrl, resolveSubdomainBases, routesAsApi, } from "../utils/service-urls.js";
import { discoverResourcesStrict, discoverResourcesWithProblems, discoverStacks, getResourcesForStack, stackExists, warnAboutSkippedFiles, } from "../utils/services.js";
import { databaseResourceNames, evaluateSharedPlatformPostgres, namesSharedPlatformPostgres, } from "../utils/shared-platform-postgres.js";
import { buildSmokePlans, formatSmokeFailure, runSmokePlans, safeSmokeDeps, } from "../utils/smoke.js";
import { buildStartupReport, explainFailures, formatStartupReport, formatWaitFailures, isStartupStalled, machineProblemFixes, withLoggedReasons, } from "../utils/startup-report.js";
import { buildTiltUpArgs, runTilt } from "../utils/tilt.js";
import { classifyTiltPorts } from "../utils/tilt-port-owner.js";
import { stopTiltOnPort } from "../utils/tilt-process.js";
import { alreadyRunningReport, parseTiltPort, resolveTiltPort, secondUpAction, stopTiltForUp, } from "../utils/tilt-startup.js";
import { cloneForUp, isGitRepoArg } from "../utils/up-from-git.js";
import { attachedUpInCiWarning, upFailureHints } from "../utils/up-hints.js";
import { findUnknownServices, resolveOnlySelection } from "../utils/up-only.js";
import { createUpProgressReporter, fetchWithProgress, shouldRedrawUpProgress, } from "../utils/up-progress.js";
import { evaluateTiltReadiness, getDisabledHealthResourceNames, healthProbeCannotRun, tiltGetUiResources, tiltResourceLogs, waitForTiltResourcesReady, } from "../utils/up-readiness.js";
import { defaultUpWaitDeps, fetchUnhealthyLogLines, formatUnhealthyLogTails, parseWaitTimeout, unhealthyLogTails, upAndWait, withUnhealthyLogs, } from "../utils/up-wait.js";
import { buildPrintedUrlTargets, checkPrintedUrls, formatUrlFailures, healthUrlOf, printedHealthUrl, tiltResourceHasExited, urlFailureSuggestions, } from "../utils/url-check.js";
import { enableDiscoveredStacks, writeDefaultProjectConfig } from "./project.js";
export function formatUpSuccess(port, options = {}) {
    const { appUrls = [], serviceHealth = [], showLogsHint = serviceHealth.length > 0 } = options;
    const lines = [];
    lines.push("Flisk is up.");
    lines.push(`Tilt UI: http://localhost:${port}`);
    if (serviceHealth.length > 0) {
        // Services with a URL come first. Tilt lists its own resources ((Tiltfile), golden-layers-build, init-networks, the
        // *-config-gen steps, ...) in no useful order, and cutting that mix at ten dropped a running service into "and N more"
        // as soon as one more internal resource existed. Array.prototype.sort is stable, so each group keeps Tilt's order.
        const services = [...serviceHealth].sort((a, b) => Number(Boolean(b.url)) - Number(Boolean(a.url)));
        lines.push("Services:");
        for (const svc of services.slice(0, 10)) {
            const icon = svc.status === "ready" ? "✓" : svc.status === "failed" ? "✗" : "⟳";
            const urlPart = svc.url ? ` → ${svc.url}` : "";
            lines.push(`  ${icon} ${svc.name}${urlPart}`);
        }
        if (services.length > 10) {
            lines.push(`  … and ${services.length - 10} more`);
        }
        // Health check URLs for test infrastructure and monitoring: only services that have one, so internals do not use up the ten.
        const withUrl = services.filter((svc) => svc.url && svc.healthUrl !== null);
        lines.push("Health checks:");
        for (const svc of withUrl.slice(0, 10)) {
            const icon = svc.status === "ready" ? "✓" : svc.status === "failed" ? "✗" : "⟳";
            const healthUrl = svc.healthUrl ?? (svc.url ? healthUrlOf(svc.url) : "");
            lines.push(`  ${icon} ${svc.name}: ${healthUrl}`);
        }
        if (withUrl.length > 10) {
            lines.push(`  … and ${withUrl.length - 10} more`);
        }
    }
    else if (appUrls.length > 0) {
        lines.push("App URLs:");
        for (const url of appUrls.slice(0, 5)) {
            lines.push(`  ${url}`);
        }
        if (appUrls.length > 5) {
            lines.push(`   … and ${appUrls.length - 5} more`);
        }
    }
    else {
        lines.push("App URLs:");
        lines.push("  run: flisk networks");
    }
    lines.push("Stop: flisk down");
    if (showLogsHint) {
        lines.push("Logs: flisk logs --service <name>");
    }
    lines.push("Next: flisk help  # or visit https://flisk.sh/docs");
    return lines;
}
/**
 * The native Windows boundary for a command that starts a stack.
 *
 * It lives here because `flisk up` is where the boundary has always been enforced; the
 * one-command demo flow refuses with the same message before it clones or installs anything.
 */
export const nativeWindowsUpRefusal = nativeWindowsStackRefusal;
/** Why `flisk up` cannot work on this host, or null when it may proceed. Docker reachability is only probed in container hosts. */
export async function hostUpRefusal(host = detectHost(), dockerReachable = defaultDockerReachable) {
    if (host.kind === "webcontainer")
        return WEBCONTAINER_UP_MESSAGE;
    if (isContainerHost(host.kind) && !(await dockerReachable()))
        return DEVCONTAINER_DOCKER_FIX;
    return null;
}
export async function defaultDockerReachable() {
    const { execFile } = await import("node:child_process");
    return new Promise((resolve) => {
        execFile("docker", ["ps"], { timeout: 10_000 }, (error) => resolve(!error));
    });
}
/** Exit status for `flisk up` when generated files no longer match service.json / project.json. */
export const DRIFT_EXIT_CODE = 2;
/**
 * Generated service files edited by hand. Only these block `flisk up`: when service.json itself changed, `flisk up` regenerates
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
        // A project with no .flisk/project.json has no snapshots to compare. Anything else (a corrupt config) must not skip the gate.
        if (error instanceof ProjectConfigNotFoundError)
            return null;
        throw error;
    }
    if (handEdited.length === 0)
        return null;
    return [
        "Generated files were edited by hand and no longer match service.json:",
        ...handEdited.map((file) => `  ${file}`),
        "Run `flisk config regenerate` to discard the edits, or bypass with `flisk up --ignore-drift`.",
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
 * Checks the project's CLI version requirements before anything starts.
 * Enforces both minFliskVersion and pinnedFliskVersion, including under --dry-run.
 * Kept as a compatibility wrapper for existing callers and tests.
 */
export function enforceVersionFloor(projectRoot, options, currentVersion = getPackageVersion(), exit = process.exit) {
    enforceFliskVersionGate(projectRoot, options, currentVersion, exit);
}
const STARTUP_FAILED = Symbol("startup-failed");
/**
 * Waits for Tilt to exit, unless startup has already failed. A readiness failure reports and exits 1 at once: Tilt keeps
 * running (`flisk down` stops it), so waiting for its exit would hang the command.
 */
export async function waitForTiltUnlessStartupFailed(tiltRun, startupFailure, exit = process.exit) {
    const outcome = await Promise.race([tiltRun, startupFailure.then(() => STARTUP_FAILED)]);
    if (outcome === STARTUP_FAILED)
        exit(1);
    return outcome;
}
export function waitForTiltUi(port, timeoutMs = 30_000) {
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
 * The env file of the run. `flisk up --env-file <path>` replaces the project `.env` for the run, so the
 * file is resolved, read and checked before anything is written or started. Without the option the
 * project `.env` stays the env file of the run, exactly as before.
 *
 * @throws FliskError when the file cannot be used; the run stops before it starts
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
    const suggestions = error instanceof FliskError ? error.suggestions : [];
    return {
        failure: {
            code: error instanceof EnvFileError ? error.code : "ENV_FILE_INVALID",
            message: getErrorMessage(error),
            ...(suggestions.length > 0 ? { suggestions } : {}),
        },
        exitCode: error instanceof FliskError ? error.exitCode : 2,
    };
}
/**
 * Decides whether `flisk up` runs the selection as local processes (#2229). Returns null for today's Docker + Tilt path, which
 * a project without any `command` service always takes. Outside a project, a directory whose services all declare `command`
 * becomes the project. A project whose .flisk/project.json selects its own Tiltfile (`flisk import tiltfile`) also returns null:
 * Tilt runs that Tiltfile through the generated wrapper, whatever its services declare. Refuses (through `fail`) an unknown
 * stack or service, an invalid service.json, and a run that would mix native and container services.
 */
export function selectNativeRun(stackName, only, fail, cwd = process.cwd()) {
    const foundRoot = findProjectRoot(cwd);
    if (!foundRoot && !hasNearbyServiceJson(cwd))
        return null;
    // The imported Tiltfile is the orchestration: the wrapper only include()s it and never reads `command`, so run Tilt.
    if (foundRoot && isTiltfileOrchestration(foundRoot))
        return null;
    const projectRoot = foundRoot ?? cwd;
    let discovered;
    try {
        discovered = discoverResourcesWithProblems(projectRoot);
    }
    catch {
        return null;
    }
    const all = discovered.resources;
    if (!all.some(isNativeService))
        return null;
    if (!foundRoot && !isNativeProject(all))
        return null;
    if (discovered.problems.length > 0) {
        fail("INVALID_SERVICE_CONFIG", discovered.problems
            .map((problem) => `Invalid service.json at ${problem.path}: ${problem.reason}`)
            .join("\n"));
    }
    let requested = all;
    if (stackName) {
        if (!stackExists(stackName, all)) {
            const error = errorFactories.stackNotFound(stackName, discoverStacks(all).map((s) => s.name));
            fail("STACK_NOT_FOUND", error.message, error.suggestions);
        }
        requested = getResourcesForStack(stackName, all);
    }
    if (only) {
        const unknown = findUnknownServices(only, requested);
        if (unknown.length > 0) {
            const error = errorFactories.unknownServices(unknown, requested.map((service) => service.name));
            fail("UNKNOWN_SERVICE", error.message, error.suggestions);
        }
    }
    // A process cannot start before what it depends on, so a stack or --only selection always brings its dependsOn closure.
    const names = only ?? requested.map((service) => service.name);
    const selection = resolveOnlySelection(names, all);
    const { mode, mixed } = resolveRuntimeMode(selection.selected, all);
    if (mode === "container") {
        const containerNames = (selection.selected.some(isNativeService) ? selection.selected : all)
            .filter((service) => !isNativeService(service))
            .map((service) => service.name);
        fail("MIXED_RUNTIME", formatMixedRuntimeRefusal(mixed, containerNames));
    }
    return {
        projectRoot,
        isNewProject: !foundRoot,
        all,
        selected: selection.selected,
        dependencies: only ? selection.dependencies : [],
    };
}
/**
 * `flisk up --wait`: runs `flisk up --json` detached and waits for its one result line, so a script gets an exit code
 * when the stack is healthy instead of an attached command that never returns.
 */
async function runUpWait(options) {
    const emit = options.json ? createJsonEmitter("UP_FAILED", "flisk up --wait") : undefined;
    const timeout = parseWaitTimeout(options.waitTimeout);
    if (!timeout.ok) {
        emit?.({ ok: false }, [
            { code: "INVALID_WAIT_TIMEOUT", message: timeout.message, suggestions: [] },
        ]);
        showErrorAndExit(timeout.message, 1, []);
    }
    const outcome = await upAndWait(process.argv.slice(2), timeout.seconds, defaultUpWaitDeps(cliInvocation), process.cwd());
    // A failed or timed-out wait names what was unhealthy with the last lines of its log, the reason (a traceback, a
    // missing variable) a person would otherwise look up with `flisk logs --unhealthy` (#3823).
    const unhealthy = outcome.kind === "failed" || outcome.kind === "timeout"
        ? unhealthyLogTails((await fetchUnhealthyLogLines(cliInvocation, process.cwd())) ?? [])
        : [];
    if (outcome.kind === "ready" || outcome.kind === "failed") {
        if (options.json) {
            console.log(outcome.kind === "failed" ? withLogsInResult(outcome.json, unhealthy) : outcome.json);
        }
        else {
            const parsed = JSON.parse(outcome.json);
            if (outcome.kind === "ready") {
                console.log(chalk.green("Stack is healthy."));
                if (parsed.data?.tiltUrl)
                    console.log(chalk.gray(`Tilt: ${parsed.data.tiltUrl}`));
                console.log(chalk.gray("It keeps running. `flisk status` shows it, `flisk down` stops it."));
            }
            else {
                // Each unhealthy service's lines go under its own failure, or under a "not healthy" line of their own.
                const failures = formatWaitFailures(withUnhealthyLogs(parsed.data?.failures ?? [], unhealthy));
                const messages = failures.length > 0 ? failures : (parsed.errors ?? []).map((e) => e.message ?? "");
                showError(`flisk up failed:\n  ${messages.filter(Boolean).join("\n  ")}`);
            }
        }
        process.exit(outcome.kind === "ready" ? 0 : 1);
    }
    const reason = outcome.kind === "timeout"
        ? `the stack was not healthy after ${timeout.seconds} seconds (the log is ${outcome.logFile})`
        : outcome.kind === "exited"
            ? `flisk up exited with code ${outcome.exitCode ?? "unknown"} before the stack was ready`
            : `could not start flisk up: ${outcome.message}`;
    const code = outcome.kind === "timeout" ? "UP_WAIT_TIMEOUT" : "UP_WAIT_FAILED";
    const suggestions = outcome.kind === "timeout"
        ? ["`flisk status` shows which services are not healthy", "`flisk down` stops the stack"]
        : [];
    const failures = withUnhealthyLogs([], unhealthy);
    emit?.(failures.length > 0 ? { ok: false, failures } : { ok: false }, [
        { code, message: reason, suggestions },
    ]);
    if (!options.json) {
        const logs = formatUnhealthyLogTails(unhealthy);
        // The services' own lines say more than the tail of `flisk up`'s output, so they replace it when there are any.
        const tail = logs.length > 0 ? logs.join("\n") : "logTail" in outcome ? outcome.logTail.trim() : "";
        showError(`${reason}${tail ? `\n${tail}` : ""}`, undefined, suggestions);
    }
    process.exit(1);
}
/** The `flisk up --json` result line with the unhealthy services' log lines added to its failures. */
function withLogsInResult(json, unhealthy) {
    if (unhealthy.length === 0)
        return json;
    try {
        const parsed = JSON.parse(json);
        if (!parsed.data)
            return json;
        parsed.data.failures = withUnhealthyLogs(parsed.data.failures ?? [], unhealthy);
        return JSON.stringify(parsed);
    }
    catch {
        return json;
    }
}
/** The first-start notice for this run, or null. A project.json that cannot be read only skips the notice. */
async function upColdStartNotice(projectRoot, services) {
    let projectName;
    try {
        projectName = readProjectConfig(projectRoot).project.name;
    }
    catch {
        return null;
    }
    return coldStartNotice(projectName, services);
}
/** Every stack of the project, for the record `flisk projects --stale` reads; empty when discovery fails. */
function recordableStacks(projectRoot) {
    try {
        return discoverStacks(discoverResourcesWithProblems(projectRoot).resources).map((s) => s.name);
    }
    catch {
        return [];
    }
}
/** Clones the repositories declared in .flisk/project.json that are missing. Returns true when one was cloned. */
async function cloneDeclaredRepos(projectRoot) {
    let repos;
    try {
        repos = readProjectConfig(projectRoot).repos;
    }
    catch {
        // A missing or invalid project.json is reported by the checks that run next.
    }
    if (!repos || repos.length === 0)
        return false;
    const results = await cloneMissingRepos(projectRoot, repos);
    return results.some((result) => result.cloned);
}
/** Directories of declared repositories that do not exist yet. */
function missingDeclaredRepoDirs(projectRoot) {
    if (!projectRoot)
        return [];
    let repos;
    try {
        repos = readProjectConfig(projectRoot).repos;
    }
    catch {
        return [];
    }
    return (repos ?? []).map((repo) => repo.dir).filter((dir) => !existsSync(join(projectRoot, dir)));
}
export const upCommand = new Command("up")
    .description("Start all services on this machine (optionally filtered by stack). Alias: deploy, which never deploys to a cluster")
    .alias("deploy")
    .argument("[stack-name]", "Name of the stack to start (optional - runs all if omitted), or a git repository URL to clone and start")
    .option("-v, --verbose", "Enable verbose output", false)
    .option("-q, --quiet", "Suppress non-essential output", false)
    .option("--dry-run", "Show what would be started without starting", false)
    .option("-f, --force", "Kill existing Tilt process before starting", false)
    .option("--ignore-drift", "Start even if generated files differ from service.json", false)
    .option("--ignore-version", "Start even if this flisk does not satisfy pinnedFliskVersion or minFliskVersion in .flisk/project.json", false)
    .option("--no-database", "Do not provision the bundled shared Postgres: saves capabilities.database=false in .flisk/project.json and regenerates .flisk/.flisk-out/ (set it to true to turn Postgres back on)")
    .option("--only <services...>", "Start only these services plus what the Tiltfile enables for them (their dependsOn services and shared infrastructure). With a stack, names must belong to that stack; dependencies may cross stacks")
    .option("--profile <names...>", 'Also start the services whose "profiles" in service.json include one of these names (without it they are left out)')
    .option("--env-file <path>", "Use this project env file for the run instead of .env (for example: --env-file .env.integration)")
    .option("--no-gateway", 'Run without gateway routing (no Traefik). Needs "capabilities": { "gateway": false } in .flisk/project.json; regenerates .flisk/.flisk-out/ from it')
    .option("--json", "Print one JSON object on stdout when the stack is ready or the command fails; implies --quiet", false)
    .option("--wait", "Start the stack in the background and return once every service is healthy (exit 0), or when it fails or --wait-timeout passes (exit 1). The stack keeps running; `flisk down` stops it", false)
    .option("--wait-timeout <seconds>", "With --wait: seconds to wait for a healthy stack, 1 to 21600 (default 1800)")
    .addHelpText("after", "\nFree disk space is checked first: under 5 GiB flisk up stops, under 15 GiB it warns (FLISK_DISK_MIN_GIB and FLISK_DISK_WARN_GIB change the limits). The shared Docker build cache is trimmed to 20 GiB (FLISK_BUILD_CACHE_MAX_GIB, 0 turns it off).\n\nExamples:\n  flisk up\n  flisk up shop\n  flisk up --dry-run\n  flisk up --ignore-drift")
    .action(async (stackName, options) => {
    const baseEmit = options.json ? createJsonEmitter("UP_FAILED", "flisk up") : undefined;
    // A low-disk warning (5 to 15 GiB free) rides along in every successful --json result.
    let diskWarning;
    const emit = baseEmit
        ? (data, errors) => baseEmit(diskWarning && data.ok === true ? { ...data, diskWarning } : data, errors)
        : undefined;
    // Before any build or process starts: fail below the hard threshold, warn below the soft one (#3708).
    const guardDisk = (isDockerRun) => {
        if (options.dryRun)
            return;
        const disk = enforceDiskGuard({
            vmFreeGib: isDockerRun ? readDockerVmFreeGib() : null,
            emit: baseEmit,
            quiet: options.quiet || options.json,
            warn: (line) => console.warn(chalk.yellow(line)),
        });
        diskWarning = diskWarningField(disk) ?? diskWarning;
    };
    // `flisk up <git-url>`: clone the repository into ./<name> and start it from there, as a plain `flisk up` would.
    if (isGitRepoArg(stackName)) {
        try {
            const dir = await cloneForUp(stackName, {
                log: options.json || options.quiet ? undefined : (line) => console.log(chalk.gray(line)),
            });
            process.chdir(dir);
        }
        catch (error) {
            if (error instanceof FliskError) {
                if (emit)
                    emit({ ok: false }, [toMachineError(error).error]);
                return error.exit();
            }
            throw error;
        }
        stackName = undefined;
    }
    if (options.wait) {
        await runUpWait(options);
        return;
    }
    if (options.json)
        options.quiet = true;
    const portSetting = parseTiltPort(process.env.TILT_PORT);
    if (!portSetting.ok) {
        const suggestions = upFailureHints({ kind: "invalid-tilt-port" });
        emit?.({ ok: false }, [
            { code: "INVALID_TILT_PORT", message: portSetting.message, suggestions },
        ]);
        showErrorAndExit(portSetting.message, 1, suggestions);
    }
    const configuredTiltPort = portSetting.port;
    // First, before the host/Docker checks below: an old CLI must stop with one clear line, not a half-working stack.
    const versionRoot = findProjectRoot();
    if (versionRoot) {
        enforceVersionFloor(versionRoot, {
            ignoreVersion: options.ignoreVersion,
            onFail: (message, status) => emit?.({ ok: false }, [
                {
                    code: status === "mismatch" ? "FLISK_VERSION_MISMATCH" : "FLISK_VERSION_TOO_OLD",
                    message,
                },
            ]),
        });
    }
    // Declared repositories are cloned before either path discovers services, so a native run and a container run both see
    // the services they hold. A dry run never clones: it reports what is missing instead.
    let hasClonedRepos = false;
    if (!options.dryRun) {
        const declaredRoot = findProjectRoot();
        if (declaredRoot) {
            try {
                hasClonedRepos = await cloneDeclaredRepos(declaredRoot);
            }
            catch (error) {
                if (error instanceof FliskError) {
                    if (emit)
                        emit({ ok: false }, [toMachineError(error).error]);
                    return error.exit();
                }
                throw error;
            }
        }
    }
    // A plain Node repo with no project root, service.json, Compose, or Tiltfile: infer one service from package.json.
    // Inference is skipped when a stack name, --only, --env-file or --profile is given.
    const inferredProject = inferNodeProject(process.cwd());
    if (inferredProject && !stackName && !options.only && !options.envFile && !options.profile) {
        const stateRoot = inferredStateRoot(process.cwd());
        // No --port/-p in the script: take the first free port from 3000; runNativeUp passes it to the process as PORT.
        const service = inferredProject.service;
        if (service.config && service.config.port === undefined) {
            service.config.port = await findFreePort(3000);
        }
        if (!options.quiet) {
            console.log(chalk.gray(`Inferred service from package.json: ${inferredProject.service.name}`));
        }
        guardDisk(false);
        await runNativeUp({
            projectRoot: stateRoot,
            selected: [service],
            dependencies: [],
            dryRun: options.dryRun,
            quiet: options.quiet,
            force: options.force,
            emit,
            inferred: { command: inferredProject.command, script: inferredProject.script },
        });
        return;
    }
    // Every selected service declares `command`: run them as local processes, with no Docker, Compose, Tilt or generated
    // files (#2229). Decided before any Docker or Tilt check; a project without `command` services never enters this branch.
    const nativeRun = selectNativeRun(stackName, options.only, (code, message, suggestions) => {
        emit?.({ ok: false }, [
            { code, message, ...(suggestions && suggestions.length > 0 ? { suggestions } : {}) },
        ]);
        return showErrorAndExit(message, 1, suggestions);
    });
    // Local processes need no Docker, Tilt or WSL2, so native Windows runs them; the WSL2 refusal below is for container runs.
    if (nativeRun) {
        const { projectRoot } = nativeRun;
        let envFilePath;
        if (options.envFile !== undefined) {
            try {
                envFilePath = selectEnvFile(projectRoot, options.envFile).path;
            }
            catch (error) {
                const { failure, exitCode } = envFileFailure(error);
                emit?.({ ok: false }, [failure]);
                showErrorAndExit(failure.message, exitCode, failure.suggestions);
            }
        }
        if (!nativeRun.isNewProject) {
            enforceSchemaVersionGate(projectRoot, {
                resources: nativeRun.all,
                onInvalid: (message) => emit?.({ ok: false }, [{ code: "INVALID_SCHEMA_VERSION", message }]),
            });
        }
        enforceServiceConfigGate(projectRoot, {
            resources: nativeRun.all,
            onInvalid: (message) => emit?.({ ok: false }, [{ code: "INVALID_SERVICE_CONFIG", message }]),
        });
        if (nativeRun.isNewProject && !options.dryRun) {
            writeDefaultProjectConfig(projectRoot);
            if (!options.quiet) {
                console.log(chalk.gray("Created .flisk/project.json (this directory is now a Flisk project)"));
            }
        }
        const nativeProfiles = applyProfiles(nativeRun.selected, options.profile ?? [], options.only ?? []);
        assertKnownProfiles(options.profile, nativeRun.all, emit);
        if (nativeProfiles.skipped.length > 0 && !options.quiet) {
            console.log(chalk.gray(skippedProfilesNote(nativeProfiles.skipped)));
        }
        guardDisk(false);
        await runNativeUp({
            projectRoot,
            selected: nativeProfiles.kept,
            dependencies: nativeRun.dependencies,
            stackName,
            only: options.only,
            envFilePath,
            dryRun: options.dryRun,
            quiet: options.quiet,
            force: options.force,
            emit,
        });
        return;
    }
    // The env file of the run. `--env-file` replaces the project .env for this run, so the file is
    // resolved and read before any prerequisite check, any write and any service starts.
    const envFileRoot = versionRoot;
    let envFileSelection;
    if (options.envFile === undefined) {
        // Without the option the project .env is the env file of the run, whatever the environment
        // carries: an inherited FLISK_ENV_FILE must not change the default.
        delete process.env[PROJECT_ENV_FILE_VAR];
    }
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
    // The shared build cache has a size ceiling (20 GiB; FLISK_BUILD_CACHE_MAX_GIB): trim it first, so the disk check sees the space.
    if (!options.dryRun) {
        const cache = await enforceBuildCacheCeiling();
        if (cache.pruned && !options.quiet) {
            console.log(chalk.gray(`Build cache was ${cache.sizeGib?.toFixed(1)} GiB; trimmed to ${cache.ceilingGib} GiB (FLISK_BUILD_CACHE_MAX_GIB changes the limit, 0 turns it off).`));
        }
    }
    guardDisk(true);
    const platformRefusal = nativeWindowsUpRefusal(process.platform, process.env.FLISK_ALLOW_NATIVE_WINDOWS);
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
        await assertMachineReadyOrExit({ hints: upFailureHints({ kind: "machine" }) });
    }
    const action = async () => {
        const foundRoot = options.dryRun ? requireProjectRoot() : findProjectRoot();
        const projectRoot = foundRoot ?? process.cwd();
        if (options.gateway === false)
            assertGatewayOptOutIsConfigured(foundRoot);
        // With the gateway off nothing publishes the routed URLs, so none is printed or smoke-checked.
        const gatewayEnabled = isGatewayEnabled(projectRoot, options);
        const discoveredResources = discoverResourcesStrict(foundRoot && foundRoot === schemaRoot && !hasClonedRepos ? initialDiscovery : undefined);
        // Services in a repository that was just cloned were not in the discovery the gate above checked.
        if (foundRoot && hasClonedRepos) {
            enforceSchemaVersionGate(foundRoot, {
                resources: discoveredResources,
                onInvalid: (message) => emit?.({ ok: false }, [{ code: "INVALID_SCHEMA_VERSION", message }]),
            });
        }
        let discoveredStacks;
        let discoveredStackNames = [];
        if (!options.only || stackName) {
            discoveredStacks = discoverStacks(discoveredResources);
            discoveredStackNames = discoveredStacks.map((stack) => stack.name);
        }
        // Reject a bad request before anything below can write to the project (.env, runtime assets, .flisk/project.json).
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
            // A dry run does not clone, so a service in a declared repository that is not cloned yet is pending, not unknown.
            const pendingClone = options.dryRun ? missingDeclaredRepoDirs(foundRoot) : [];
            if (unknown.length > 0 && pendingClone.length > 0) {
                if (!emit && !options.quiet) {
                    console.warn(chalk.yellow(`Pending clone: ${unknown.join(", ")} may be in a repository not cloned yet (${pendingClone.join(", ")}). A real run clones it first.`));
                }
            }
            else if (unknown.length > 0) {
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
        // A dependsOn name that is no service, stack or shared Postgres is dropped by the Tiltfile; say so instead of starting without it.
        const unknownDependsOn = foundRoot
            ? evaluateSharedPlatformPostgres(foundRoot, discoveredResources).unknownDependsOnNames
            : [];
        const unknownBackends = foundRoot ? unknownBackendNames(discoveredResources) : [];
        if (unknownBackends.length > 0 && !emit && !options.quiet) {
            for (const { resource, name } of unknownBackends) {
                console.warn(chalk.yellow(`⚠️  ${resource} has backendName "${name}", which is not a service of this project; it has no backend to wait for or call.`));
            }
        }
        if (unknownDependsOn.length > 0 && !emit && !options.quiet) {
            for (const { resource, name } of unknownDependsOn) {
                console.warn(chalk.yellow(`⚠️  ${resource} dependsOn "${name}", which is not a service or stack of this project; it is ignored. Fix the name, or remove it.`));
            }
        }
        // A project without schemaVersion keeps working; say how to add it, but only where a person is reading.
        if (foundRoot && !emit && !options.quiet) {
            warnSchemaVersions(foundRoot, discoveredResources);
            warnSecretConflicts(foundRoot, discoveredResources);
            // A dry run starts nothing, so it does not ask Docker about Model Runner.
            if (!options.dryRun)
                warnModelRunner(foundRoot, discoveredResources);
        }
        // A real start claims the host ports it picks, so a second project starting at the same moment moves to the next
        // port instead of choosing the same one. A dry run only reports and holds nothing.
        const claimPort = options.dryRun ? undefined : createPortClaimer(projectRoot);
        const hostPortPlan = await getHostPortPlan(projectRoot, {
            inspectDocker: !options.dryRun,
            database: options.database,
            gateway: gatewayEnabled,
            ...(claimPort
                ? {
                    isPortFree: async (port) => (await isHostPortAvailable(port)) && claimPort(port),
                }
                : {}),
        });
        if (!options.dryRun) {
            // An older project's .env predates keys such as JWT_SECRET, which Compose now requires. Add what is missing (never
            // changing an existing value) before anything starts. Only inside a real project, so a stray run never writes a .env.
            // A selected env file replaces the project .env for this run: the run does not read it, so it is not completed either.
            if (foundRoot && !envFileSelection) {
                // A project of only bring-your-own containers that do not use the shared PostgreSQL needs no DB_PASSWORD (#3200).
                const addedEnvKeys = completeEnvFile(projectRoot, {
                    databaseKeys: projectNeedsDatabaseKeys(projectRoot),
                });
                if (addedEnvKeys.length > 0 && !options.quiet) {
                    console.log(chalk.gray(`Added ${addedEnvKeys.join(", ")} to .env (generated; existing values unchanged)`));
                }
            }
            // Names in secrets.generate are appended to the .env once (#3140); the values are never printed.
            if (foundRoot && !envFileSelection) {
                const generatedNames = ensureGeneratedSecrets(projectRoot, discoveredResources);
                if (generatedNames.length > 0 && !options.quiet) {
                    console.log(chalk.gray(`Generated ${generatedNames.join(", ")} into .env (once; existing values unchanged)`));
                }
            }
            // `--no-database` is saved in project.json and the generated files are rebuilt from it, so the flag also takes effect on a
            // project generated with Postgres, and the next `flisk up` and `flisk config verify` agree with this run.
            const databaseTurnedOff = Boolean(foundRoot) &&
                options.database === false &&
                disableDatabaseCapability(projectRoot);
            // A project made by `flisk import` has .flisk/project.json but no generated files yet. Generate them rather than letting
            // Tilt fail on a missing Tiltfile. After `flisk import tiltfile` the generated Tiltfile must be the wrapper that
            // includes the project's own one, so an older generated Tiltfile is replaced too (the user's Tiltfile is never written),
            // and a wrapper is replaced by the full Tiltfile once project.json no longer selects one.
            if (foundRoot && !existsSync(join(projectRoot, ".flisk", ".flisk-out", "Tiltfile"))) {
                if (!options.quiet) {
                    console.log(chalk.gray("No generated Tiltfile yet; generating .flisk/.flisk-out/ ..."));
                }
                await generateMasterConfigs(projectRoot, { quiet: options.quiet });
            }
            else if (foundRoot && isWrappedTiltfileStale(projectRoot)) {
                // The capability opt-outs above are already saved, so this regeneration also honours them.
                if (!options.quiet) {
                    console.log(chalk.gray(isTiltfileOrchestration(projectRoot)
                        ? "Wrapping your Tiltfile; regenerating .flisk/.flisk-out/ ..."
                        : "project.json no longer wraps a Tiltfile; regenerating .flisk/.flisk-out/ ..."));
                }
                await generateMasterConfigs(projectRoot, { quiet: options.quiet });
            }
            else if (foundRoot && isVendoredEngineStale(projectRoot)) {
                // After an upgrade (or a checkout on another commit) the vendored engine and the Tiltfile are the old ones, and a
                // running Tilt keeps loading them. Regenerating replaces both; a running Tilt reloads them on its own (#2899).
                if (!options.quiet) {
                    console.log(chalk.gray("This Flisk ships a different engine or templates than .flisk/.flisk-out/ was generated with; regenerating ..."));
                }
                await generateMasterConfigs(projectRoot, { quiet: options.quiet });
            }
            else if (foundRoot && areMasterFilesStale(projectRoot)) {
                // The router and the shared Postgres follow the project's resources, so a resource added or removed since the last
                // run can change what spec.master starts (#2963).
                await generateMasterConfigs(projectRoot, { quiet: options.quiet });
            }
            else if (databaseTurnedOff || options.gateway === false) {
                // `--no-gateway` regenerates too: outputs generated before project.json turned the gateway off still start Traefik.
                await generateMasterConfigs(projectRoot, { quiet: options.quiet });
            }
            if (databaseTurnedOff && !options.quiet) {
                console.log(chalk.gray("Set capabilities.database to false in .flisk/project.json; regenerated .flisk/.flisk-out/ without the shared Postgres"));
            }
            if (foundRoot && !isDatabaseCapabilityEnabled(projectRoot)) {
                // The Tiltfile still force-starts the shared Postgres for a dependsOn on it (or for a database resource), so say so
                // rather than look ignored.
                const databaseNames = databaseResourceNames(discoveredResources);
                const postgresUsers = discoveredResources
                    .filter((r) => databaseNames.includes(r.name) ||
                    dependsOnOf(r.config).some((name) => namesSharedPlatformPostgres(name, databaseNames)))
                    .map((r) => r.name);
                if (postgresUsers.length > 0 && !options.quiet) {
                    console.warn(chalk.yellow(`Database capability is off, but ${postgresUsers.join(", ")} depend on postgres; the shared Postgres still starts for them.`));
                }
            }
            const copiedAssets = ensureProjectRuntimeAssets(projectRoot);
            const ignoredGenerated = foundRoot ? ensureGeneratedRootIgnored(projectRoot) : [];
            if (ignoredGenerated.length > 0 && !options.quiet) {
                console.log(chalk.gray(`Added to .gitignore (generated, not yours to commit): ${ignoredGenerated.join(", ")}`));
            }
            if (copiedAssets.length > 0 && options.verbose && !options.quiet) {
                console.log(chalk.gray(`Refreshed runtime assets: ${copiedAssets.join(", ")}`));
            }
            const newlyEnabledStacks = enableDiscoveredStacks(projectRoot, discoveredResources);
            if (newlyEnabledStacks.length > 0) {
                // project.json just changed, so the generated spec.master is now stale. Regenerate it here, or the next
                // `flisk config verify` reports it out of sync.
                await generateMasterConfigs(projectRoot, { quiet: options.quiet });
                if (!options.quiet) {
                    console.log(chalk.gray(`Added ${newlyEnabledStacks.join(", ")} to the pre_alpha phase in .flisk/project.json`));
                }
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
        // Services in a profile that was not asked for are left out (#2873); Tilt then gets the remaining names, not whole stacks.
        assertKnownProfiles(options.profile, discoveredResources, emit);
        const profileSelection = applyProfiles(servicesToStart, options.profile ?? [], options.only ?? []);
        if (profileSelection.skipped.length > 0) {
            servicesToStart = profileSelection.kept;
            focusServiceNames = servicesToStart.map((s) => s.name);
            if (!options.quiet)
                console.log(chalk.gray(skippedProfilesNote(profileSelection.skipped)));
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
            const routed = gatewayEnabled ? servicesToStart.filter(isRoutableService) : [];
            const frontends = routed.filter((s) => s.config?.appType === "frontend" || isWebUiBringYourOwn(s));
            const backends = routed.filter((s) => routesAsApi(s));
            if (frontends.length > 0) {
                console.log(chalk.blue("\n🌍 Frontend URLs:"));
                for (const svc of frontends) {
                    if (isWebUiBringYourOwn(svc)) {
                        const url = resolveServiceUrl(svc, hostPortPlan.ingressHttp);
                        console.log(chalk.gray(`  - ${svc.name}: ${chalk.cyan(url)}`));
                    }
                    else {
                        const basePath = svc.config?.basePath ?? `/${svc.name}`;
                        console.log(chalk.gray(`  - ${svc.name}: ${appBase}${chalk.cyan(basePath)}`));
                    }
                }
            }
            if (backends.length > 0) {
                console.log(chalk.blue("\n🔧 Backend API URLs:"));
                for (const svc of backends) {
                    const sablier = svc.config?.sablier;
                    const deferredTag = sablier?.enable && sablier?.deferStart
                        ? chalk.dim(" (deferred — starts on first request)")
                        : "";
                    if (isRoutedBringYourOwn(svc)) {
                        const url = resolveServiceUrl(svc, hostPortPlan.ingressHttp);
                        console.log(chalk.gray(`  - ${svc.name}: ${chalk.cyan(url)}${deferredTag}`));
                    }
                    else {
                        const servicePathName = svc.name.replace(/-api$/, "");
                        const apiPath = svc.config?.apiPath ?? `/api/${servicePathName}`;
                        console.log(chalk.gray(`  - ${svc.name}: ${apiBase}${chalk.cyan(appendHealthPath(apiPath))}${deferredTag}`));
                    }
                }
            }
        }
        const focusTargets = options.only ??
            (profileSelection.skipped.length > 0
                ? focusServiceNames
                : stackName
                    ? [stackName]
                    : undefined);
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
            console.log(chalk.gray("Override with FLISK_HTTP_PORT, FLISK_HTTPS_PORT, or FLISK_POSTGRES_PORT."));
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
                ...(unknownDependsOn.length > 0 ? { unknownDependsOn } : {}),
                ...(unknownBackends.length > 0 ? { unknownBackendNames: unknownBackends } : {}),
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
            const message = `TILT_PORT=${other?.port} is used by another project's Tilt (${other?.root}). Choose a free port, or run flisk down in that project.`;
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
                const message = `A Tilt is already running on port ${decision.ports.join(", ")}. --env-file applies to a new run only: run \`flisk down\` first, or pass --force to replace the running stack.`;
                emit?.({ ok: false }, [{ code: "ENV_FILE_ALREADY_RUNNING", message }]);
                showErrorAndExit(message);
            }
            const runningPort = decision.ports[0] ?? watchedPort;
            const tiltUrl = `http://localhost:${runningPort}`;
            const deferred = getDeferredResourceNames(discoveredResources);
            if (emit) {
                // `ok` means the stack is healthy (`flisk up --wait` prints "Stack is healthy" from it), so wait for the running
                // stack as a first run would. A Tilt left by a failed `flisk up` answers on its port with every service in error.
                const dependsOn = Object.fromEntries(discoveredResources.map((r) => [r.name, dependsOnOf(r.config)]));
                const parsedWaitTimeout = typeof options.waitTimeout !== "undefined"
                    ? parseWaitTimeout(options.waitTimeout)
                    : undefined;
                if (parsedWaitTimeout && !parsedWaitTimeout.ok) {
                    emit({ ok: false }, [
                        { code: "INVALID_WAIT_TIMEOUT", message: parsedWaitTimeout.message, suggestions: [] },
                    ]);
                    showErrorAndExit(parsedWaitTimeout.message, 1, []);
                }
                const readiness = await waitForTiltResourcesReady(runningPort, {
                    timeoutMs: parsedWaitTimeout?.ok ? parsedWaitTimeout.seconds * 1000 : undefined,
                    deferred,
                    isStalled: (text) => isStartupStalled(text, dependsOn, deferred),
                });
                const failures = readiness.ready
                    ? readiness.failures
                    : await explainFailures(readiness.failures, (name) => tiltResourceLogs(runningPort, name));
                const report = alreadyRunningReport(runningPort, { ...readiness, failures });
                if (report.ok) {
                    emit({ ok: true, alreadyRunning: true, tiltUrl });
                }
                else {
                    emit({ ok: false, alreadyRunning: true, tiltUrl, failures }, [
                        { code: report.code, message: report.message, suggestions: report.suggestions },
                    ]);
                    process.exitCode = 1;
                }
                return;
            }
            // Attached: one look is enough. A stack that is still building is running; one with a failed resource is not.
            const snapshot = await tiltGetUiResources(runningPort);
            // The same health filters as the --json wait, so a service with its health check disabled, or whose probe cannot run,
            // does not fail the attached run while --json calls the stack healthy.
            const current = snapshot
                ? evaluateTiltReadiness(snapshot, deferred, undefined, getDisabledHealthResourceNames(discoveredResources), healthProbeCannotRun).result
                : undefined;
            if (current && current.failures.length > 0) {
                const report = alreadyRunningReport(runningPort, current);
                if (!report.ok)
                    showErrorAndExit(report.message, 1, report.suggestions);
            }
            if (!options.quiet) {
                console.log(chalk.green(`Environment is already running on port ${decision.ports.join(", ")}.`));
            }
            return;
        }
        if (decision.action === "only-blocked") {
            const message = `A Tilt is already running on port ${decision.ports.join(", ")}. --only cannot change a running stack's services: run \`flisk down\` first, or pass --force to replace it.`;
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
            findAvailablePort: (base, attempts) => findAvailablePort(base, attempts, claimPort),
        });
        const port = resolution.port;
        if (resolution.autoSwitched && !options.quiet) {
            console.log(chalk.yellow(`⚠️  Port ${basePort} is already in use`));
            console.log(chalk.blue(`🔄 Auto-switching to port ${port}\n`));
        }
        process.env.TILT_PORT = port.toString();
        hostPortPlan.tiltUi = port;
        writeSavedHostPortPlan(projectRoot, hostPortPlan);
        await stopTiltForUp({ force, quiet: options.quiet, port }, {
            stop: stopTiltOnPort,
            log: (message) => console.log(chalk.yellow(message)),
            wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
        });
        // A cold start (no images yet, no build cache) can take minutes where a warm one takes seconds; say so once, so a
        // slow first run does not look stuck (#3201). Under --json it goes to stderr: stdout carries the envelope only.
        const coldNotice = await upColdStartNotice(projectRoot, servicesToStart);
        if (coldNotice) {
            if (options.json)
                console.warn(coldNotice);
            else if (!options.quiet)
                console.log(chalk.cyan(`\n${coldNotice}`));
        }
        if (!options.dryRun) {
            const requiredModels = collectRequiredModels(servicesToStart);
            if (requiredModels.length > 0) {
                if (!options.quiet) {
                    console.log(chalk.gray(`Checking required models with Docker Model Runner (${requiredModels.join(", ")})...`));
                }
                const preflightResult = await runModelPreflight(requiredModels, {
                    onRetry: options.quiet
                        ? undefined
                        : ({ model, attempt, maxAttempts, delayMs, error }) => {
                            console.log(chalk.yellow(`Retrying model pull for ${model} (attempt ${attempt}/${maxAttempts}) in ${delayMs / 1000}s: ${error}`));
                        },
                });
                if (!preflightResult.ok) {
                    const message = `Failed to pull required model "${preflightResult.failedModel}" after ${preflightResult.attempts} attempts: ${preflightResult.error}`;
                    const suggestions = [
                        `Docker Model Runner failed to pull: ${preflightResult.failedModel}`,
                        preflightResult.error,
                        "Verify Docker Model Runner is active and reachable, or pull the model manually.",
                    ];
                    emit?.({ ok: false }, [{ code: "MODEL_PULL_FAILED", message, suggestions }]);
                    showErrorAndExit(message, 1, suggestions);
                }
            }
        }
        if (!options.quiet) {
            console.log(chalk.gray("\nRunning tilt up..."));
            console.log(chalk.gray(`Using Tiltfile: .flisk/.flisk-out/Tiltfile`));
        }
        // Remember where this project lives, so `flisk projects --stale` can tell its Docker volumes apart from a stopped
        // project's once the folder is deleted (Docker records no folder on a volume).
        recordProjectRoot(projectRoot, { stacks: recordableStacks(projectRoot) });
        const tiltRun = runTilt("up", tiltArgs, {
            verbose: options.verbose && !options.json,
            quiet: options.quiet,
            inheritStdio: !options.quiet, // Suppress tilt output in quiet mode
        });
        // Services that declare `smoke` are checked through the public URL once Tilt is up. A miss stops Tilt (containers stay for
        // inspection; `flisk down` removes them) and fails the command.
        const smokePlans = buildSmokePlans(servicesToStart, hostPortPlan.ingressHttp, {
            gateway: gatewayEnabled,
        });
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
            let urlChecks;
            if (uiReady && emit) {
                const deferred = getDeferredResourceNames(discoveredResources);
                const dependsOn = Object.fromEntries(discoveredResources.map((r) => [r.name, dependsOnOf(r.config)]));
                const parsedWaitTimeout = typeof options.waitTimeout !== "undefined"
                    ? parseWaitTimeout(options.waitTimeout)
                    : undefined;
                const waitTimeoutMs = parsedWaitTimeout?.ok
                    ? parsedWaitTimeout.seconds * 1000
                    : undefined;
                const readiness = await waitForTiltResourcesReady(port, {
                    timeoutMs: waitTimeoutMs,
                    deferred,
                    // Only what the caller named must be enabled. Dependencies are the Tiltfile's call (it skips some on purpose).
                    expected: options.only
                        ? options.only.filter((name) => !deferred.has(name))
                        : undefined,
                    // As for the human output: stop as soon as everything left is blocked by a failure (for example init-networks),
                    // instead of waiting out the whole timeout.
                    isStalled: (text) => isStartupStalled(text, dependsOn, deferred),
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
                    if (gatewayEnabled) {
                        const started = new Set(startedServices);
                        urlChecks = await checkStackUrls(port, discoveredResources.filter((r) => started.has(r.name)), hostPortPlan.ingressHttp, deferred);
                        if (urlChecks.some((check) => !check.didAnswer)) {
                            jsonReady = false;
                            startupFailed = true;
                            emit({ ok: false, tiltUrl: `http://localhost:${port}`, urls: urlChecks }, [
                                {
                                    code: "UP_URL_UNREACHABLE",
                                    message: `${formatUrlFailures(urlChecks).join("\n")}\nTilt is still running; inspect it or run: flisk down`,
                                    suggestions: urlFailureSuggestions(urlChecks),
                                },
                            ]);
                        }
                    }
                }
                else {
                    startupFailed = true;
                    const failures = await explainFailures(readiness.failures, (name) => tiltResourceLogs(port, name));
                    const detail = failures
                        .map((f) => `${f.name}: ${f.message}${f.fix ? `. ${f.fix}` : ""}`)
                        .join("; ");
                    const stillBuildingMsg = readiness.stillBuilding && readiness.stillBuilding.length > 0
                        ? ` (${readiness.stillBuilding.join(", ")} still building)`
                        : "";
                    emit({ ok: false, tiltUrl: `http://localhost:${port}`, failures }, [
                        {
                            code: readiness.timedOut ? "UP_TIMEOUT" : "UP_RESOURCE_FAILED",
                            message: `${readiness.timedOut ? `Timed out waiting for resources${stillBuildingMsg}` : "Resources failed"}${detail ? ` (${detail})` : ""}. Tilt is still running; inspect it or run: flisk down`,
                            suggestions: upFailureHints({
                                kind: "services",
                                failed: readiness.failures.map((failure) => failure.name),
                                timedOut: readiness.timedOut,
                                stillBuilding: readiness.stillBuilding,
                            }),
                        },
                    ]);
                }
            }
            // The UI port opening only means Tilt started. Say "up" once every resource is built and running, and otherwise name
            // what failed and what it blocks.
            if (uiReady && !emit) {
                const deferred = getDeferredResourceNames(discoveredResources);
                const dependsOn = Object.fromEntries(discoveredResources.map((r) => [r.name, dependsOnOf(r.config)]));
                const progress = createUpProgressReporter({
                    write: (text) => process.stdout.write(text),
                    redraw: shouldRedrawUpProgress({
                        isTTY: process.stdout.isTTY,
                        quiet: Boolean(options.quiet),
                        env: process.env,
                    }),
                    deferred,
                    columns: process.stdout.columns,
                });
                const parsedWaitTimeout = typeof options.waitTimeout !== "undefined"
                    ? parseWaitTimeout(options.waitTimeout)
                    : undefined;
                const waitTimeoutMs = parsedWaitTimeout?.ok
                    ? parsedWaitTimeout.seconds * 1000
                    : undefined;
                const readiness = await waitForTiltResourcesReady(port, {
                    timeoutMs: waitTimeoutMs,
                    deferred,
                    isStalled: (text) => isStartupStalled(text, dependsOn, deferred),
                    fetchJson: fetchWithProgress(tiltGetUiResources, progress),
                });
                progress.finish();
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
                            stillBuilding: readiness.stillBuilding,
                        };
                    if (readiness.stillBuilding && readiness.stillBuilding.length > 0) {
                        report.stillBuilding = readiness.stillBuilding;
                    }
                    report.failed = await withLoggedReasons(report.failed, (name) => tiltResourceLogs(port, name));
                    const machineFixes = await machineProblemFixes(report.failed, (name) => tiltResourceLogs(port, name));
                    const reportLines = formatStartupReport(report, readiness.timedOut, (port) => findPortOccupant(port), machineFixes, readiness.lastLogs);
                    if (reportLines.length > 0) {
                        showError(reportLines.join("\n"), undefined, upFailureHints({
                            kind: "services",
                            failed: report.failed.map((failure) => failure.name),
                            timedOut: readiness.timedOut,
                            stillBuilding: readiness.stillBuilding,
                        }));
                    }
                }
                else if (gatewayEnabled) {
                    // Every resource is running; "ready" still waits until each URL printed below answers.
                    const checks = await checkStackUrls(port, servicesToStart, hostPortPlan.ingressHttp, deferred);
                    const failureLines = formatUrlFailures(checks);
                    if (failureLines.length > 0) {
                        startupFailed = true;
                        showError(failureLines.join("\n"), undefined, urlFailureSuggestions(checks));
                    }
                }
            }
            if (uiReady && !options.quiet && !startupFailed) {
                const deferred = getDeferredResourceNames(discoveredResources);
                const dependsOn = Object.fromEntries(discoveredResources.map((r) => [r.name, dependsOnOf(r.config)]));
                const readiness = await waitForTiltResourcesReady(port, {
                    deferred,
                    isStalled: (text) => isStartupStalled(text, dependsOn, deferred),
                });
                const serviceHealth = readiness.enabled.map((name) => {
                    const failed = readiness.failures.find((f) => f.name === name);
                    const svc = discoveredResources.find((r) => r.name === name);
                    const isReady = !failed && !readiness.failures.some((f) => f.name === name);
                    const isStarting = !isReady && !failed;
                    const url = svc && gatewayEnabled ? resolveServiceUrl(svc, hostPortPlan.ingressHttp) : undefined;
                    return {
                        name,
                        status: failed ? "failed" : isStarting ? "starting" : "ready",
                        url,
                        ...(svc && url ? { healthUrl: printedHealthUrl(svc, url) } : {}),
                    };
                });
                for (const line of formatUpSuccess(port, {
                    serviceHealth,
                    showLogsHint: true,
                }))
                    console.log(chalk.blue(line));
                printedSuccess = true;
                const ciWarning = attachedUpInCiWarning(process.env);
                if (ciWarning)
                    console.log(chalk.yellow(ciWarning));
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
                    recordDir: join(projectRoot, ".flisk", "smoke"),
                    ...safeSmokeDeps(projectRoot, (message) => console.warn(chalk.yellow(message)), {
                        // The selected env file holds secrets as much as the project .env.
                        envFiles: envFileSelection ? [envFileSelection.path] : [],
                    }),
                });
                const smokeFailures = [];
                for (const smokeResult of results) {
                    if (smokeResult.ok) {
                        if (!options.quiet)
                            console.log(chalk.green(`Smoke check passed: ${smokeResult.name}`));
                    }
                    else {
                        smokeFailed = true;
                        smokeFailures.push(smokeResult.name);
                        showError(formatSmokeFailure(smokeResult));
                    }
                }
                if (smokeFailed) {
                    stopTiltOnPort(port);
                    const suggestions = upFailureHints({ kind: "smoke", failed: smokeFailures });
                    showError("A smoke check failed; Tilt was stopped", undefined, suggestions);
                    emit?.({ ok: false }, [
                        {
                            code: "UP_SMOKE_FAILED",
                            message: "A smoke check failed; Tilt was stopped",
                            suggestions,
                        },
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
                    ...(urlChecks ? { urls: urlChecks } : {}),
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
            showErrorAndExit(`tilt up failed with exit code ${result.exitCode}`, result.exitCode, upFailureHints({ kind: "tilt-exited" }));
        }
        if (startupFailed && result.exitCode === 0) {
            process.exit(1);
        }
        if (!options.quiet && result.exitCode === 0 && !printedSuccess) {
            const deferred = getDeferredResourceNames(discoveredResources);
            const dependsOn = Object.fromEntries(discoveredResources.map((r) => [r.name, dependsOnOf(r.config)]));
            const readiness = await waitForTiltResourcesReady(port, {
                deferred,
                isStalled: (text) => isStartupStalled(text, dependsOn, deferred),
            });
            const serviceHealth = readiness.enabled.map((name) => {
                const failed = readiness.failures.find((f) => f.name === name);
                const svc = discoveredResources.find((r) => r.name === name);
                const isReady = !failed && !readiness.failures.some((f) => f.name === name);
                const isStarting = !isReady && !failed;
                const url = svc && gatewayEnabled ? resolveServiceUrl(svc, hostPortPlan.ingressHttp) : undefined;
                return {
                    name,
                    status: failed ? "failed" : isStarting ? "starting" : "ready",
                    url,
                    ...(svc && url ? { healthUrl: printedHealthUrl(svc, url) } : {}),
                };
            });
            for (const line of formatUpSuccess(port, {
                serviceHealth,
                showLogsHint: true,
            }))
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
/**
 * Probes every URL `flisk up` prints for the started services (#3211): "ready" means each one answers. A URL that does not is
 * diagnosed from the Tilt resource (exited) and its logs (a missing environment variable).
 */
export async function checkStackUrls(tiltPort, resources, ingressPort, deferred, deps = {}) {
    const targets = buildPrintedUrlTargets(resources, ingressPort, deferred);
    if (targets.length === 0)
        return [];
    let uiResources;
    return (deps.check ?? checkPrintedUrls)(targets, {
        diagnosis: {
            hasExited: async (name) => {
                uiResources ??= tiltGetUiResources(tiltPort);
                const json = await uiResources;
                return json ? tiltResourceHasExited(json, name) : null;
            },
            logs: (name) => tiltResourceLogs(tiltPort, name),
        },
    });
}
/** The note `flisk up` prints for services a profile kept out. */
function skippedProfilesNote(skipped) {
    return `Not starting ${describeSkipped(skipped)}: add --profile <name> to start them`;
}
/** Refuses a --profile name that no service declares, which is almost always a typo. */
function assertKnownProfiles(requested, resources, emit) {
    if (!requested || requested.length === 0)
        return;
    const known = declaredProfiles(resources);
    const unknown = requested.filter((name) => !known.includes(name));
    if (unknown.length === 0)
        return;
    const message = `No service declares the profile ${unknown.map((name) => `"${name}"`).join(", ")}.`;
    const suggestions = [
        known.length > 0
            ? `Profiles in this project: ${known.join(", ")}`
            : 'No service has "profiles" in its service.json yet',
    ];
    emit?.({ ok: false }, [{ code: "UNKNOWN_PROFILE", message, suggestions }]);
    showErrorAndExit(message, 1, suggestions);
}
