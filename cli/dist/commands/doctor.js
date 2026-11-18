// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execSync } from "node:child_process";
import chalk from "chalk";
import { Command } from "commander";
import { hasVerdaccioLicense } from "../generator/extension-fetch.js";
import { readProjectConfig } from "../generator/template-engine.js";
import { DEVCONTAINER_DOCKER_FIX, detectHost, isContainerHost, WEBCONTAINER_DOCS, WEBCONTAINER_UP_MESSAGE, } from "../utils/agent-host.js";
import { getEnabledCapabilities, isDatabaseCapabilityEnabled, isGatewayEnabled, } from "../utils/capabilities.js";
import { checkColimaDisk } from "../utils/colima-disk.js";
import { CONTAINER_RUNTIME_CHECK } from "../utils/constants.js";
import { checkDockerBuildCache } from "../utils/docker-build-cache.js";
import { checkDockerFileSharing } from "../utils/docker-file-sharing.js";
import { checkColima, checkContainerEngine, checkDockerCompose, checkDockerOperatingSystem, checkDockerRuntime, } from "../utils/doctor-container.js";
import { checkCrashLoopingContainers } from "../utils/doctor-crashloop.js";
import { applyDoctorFixes, checkDuplicateFliskInstalls, hasFailedActions, planDoctorFixes, projectTiltPids, } from "../utils/doctor-fix.js";
import { checkDiskSpace } from "../utils/doctor-host.js";
import { checkEnvironmentVariables, checkFliskVersion, checkLatestFliskVersion, checkMasterConfigs, checkPublishedBindAddress, checkWslProjectLocation, WSL2_DOCTOR_MESSAGE, } from "../utils/doctor-machine.js";
import { checkNativeCommands, checkNativeDependsOn, checkNativeRuntime, checkNativeServiceHealth, } from "../utils/doctor-native.js";
import { checkFrontendDockerPreflight, checkGeneratedFiles, checkGeneratedProjectRuntimeAssets, checkResourceDiscovery, checkStartupScripts, checkTypeScriptTypeDependencies, } from "../utils/doctor-project.js";
import { printDoctorResults, printFixActions, renderDoctorOutput } from "../utils/doctor-render.js";
import { collectDoctorChecks, createDoctorReport, createDoctorUsageReport, getDoctorExitCode, summarizeDoctorFix, } from "../utils/doctor-report.js";
import { CONTAINER_CHECK_NAMES_MAP, CONTAINER_DEPENDENT_CHECK_NAMES, formatDoctorSummary, getDoctorOutcomeMessage, isContainerDependentCheck, orderDoctorResults, requiresContainerRuntime, runChecks, } from "../utils/doctor-runner.js";
import { checkHealthRoutes, checkIngressPorts, checkPrivateNpmRegistry, checkTiltResourceHealth, projectConfigEnablesVerdaccio, } from "../utils/doctor-runtime.js";
import { checkAdvertisedEndpoints, checkContainerResourceHealth, checkContainerResourceHealthFor, checkServiceHealth, checkServiceSmoke, DEFAULT_PING_TIMEOUT_MS, } from "../utils/doctor-services.js";
import { checkStarlarkLoadExports } from "../utils/doctor-starlark.js";
import { checkBun, checkDockerVersions, checkTilt } from "../utils/doctor-tools.js";
import { checkDockerNetworkCapacity, checkDuplicateResourceNames, checkDuplicateResourcePorts, checkFrontendBackendUrls, checkInfraFrameworks, checkMigrationsInApi, checkNatsBroker, checkPostgresCredentials, checkPrismaConsistency, checkResourcePackageJson, checkServiceUrlPorts, checkSharedPlatformPostgres, checkSharedStackRoutes, checkTiltInstances, } from "../utils/doctor-wiring.js";
import { execAsync } from "../utils/exec-async.js";
import { cacheExecAsync, createAsyncCommandCache, createHostCommandCache, } from "../utils/host-command-cache.js";
import { describeHostPortPlan, getHostPortPlan, hostPortPlanFix, resolveRuntimeIngressPort, } from "../utils/host-port-config.js";
import { createHostPortPlan } from "../utils/host-port-plan.js";
import { findNativeProject } from "../utils/native-project.js";
import { NATIVE_WINDOWS_NEXT_STEP } from "../utils/native-windows.js";
import { findProjectRoot, getBuildCommit } from "../utils/paths.js";
import { findPortOwner, formatPortOwnerDiagnostic } from "../utils/port-owner.js";
import { checkProjectRepos } from "../utils/project-repos.js";
import { promptConfirm } from "../utils/prompt.js";
import { checkPublicEnvSecrets } from "../utils/public-env-secrets.js";
import { checkRemoteEnvHosts } from "../utils/remote-env-hosts.js";
import { EnvUnreadableError, envSecretValues, OUTPUT_WITHHELD, projectSecretValues, redactSecrets, redactValue, } from "../utils/secret-redaction.js";
import { checkCircularDependencies, checkDependsOnShape, checkGpuRuntime, checkModelRunner, checkNetworkPorts, checkPostgresVolumes, checkSchemaVersions, checkServicePorts, checkSidecars, checkVolumes, } from "../utils/service-config-checks.js";
import { getProjectName } from "../utils/service-urls.js";
import { MIN_BUN_VERSION, MIN_TILT_VERSION, versionMeetsMinimum } from "../utils/tool-versions.js";
import { checkToolchains } from "../utils/toolchain.js";
import { checkWindowsDockerMode, checkWindowsHostConfiguration, checkWindowsRuntimeTools, } from "../utils/windows-doctor.js";
import { checkDockerWslIntegration } from "../utils/wsl-integration.js";
export { checkIngressPorts, checkPrivateNpmRegistry, checkTiltResourceHealth, summarizeServiceProbes, summarizeTiltBuildError, } from "../utils/doctor-runtime.js";
export { checkDockerBuildCache, checkDockerFileSharing, checkPublicEnvSecrets, checkStarlarkLoadExports, };
export const DOCTOR_FIXES = {
    dockerMissing: "See https://docs.docker.com/get-docker/",
    dockerDaemonDown: "Start Docker Desktop, OrbStack, Colima, or Kiri, then retry: flisk doctor",
    tiltMissing: "curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh | bash",
    bunMissing: "curl -fsSL https://bun.sh/install | bash",
    port80: "Stop the process bound to port 80, or stop local nginx/caddy. Then: flisk doctor",
    port5432: "Stop local Postgres or change the host port. Then: flisk doctor",
    notProject: "flisk project --yes",
};
export const NATIVE_WINDOWS_DOCTOR_MESSAGE = `Native Windows cannot boot a Docker stack; services that declare a command run as local processes. For a Docker stack use WSL2 Ubuntu with Docker Desktop integration. Guide: docs/start-here-on-windows.md (reference: docs/wsl2.md)`;
// Machine checks live in utils/doctor-machine.ts; re-exported for existing importers.
// Re-exported for existing importers; the definitions live in utils/tool-versions.ts.
// The check runner lives in utils/doctor-runner.ts; re-exported for existing importers.
// Container runtime checks live in utils/doctor-container.ts; re-exported for existing importers.
// Generated-project checks live in utils/doctor-project.ts; re-exported for existing importers.
// Running-service checks live in utils/doctor-services.ts; re-exported for existing importers.
export { CONTAINER_CHECK_NAMES_MAP, CONTAINER_DEPENDENT_CHECK_NAMES, checkBun, checkColima, checkContainerEngine, checkContainerResourceHealth, checkContainerResourceHealthFor, checkDockerCompose, checkDockerOperatingSystem, checkDockerRuntime, checkDockerVersions, checkFliskVersion, checkFrontendDockerPreflight, checkGeneratedFiles, checkGeneratedProjectRuntimeAssets, checkLatestFliskVersion, checkPublishedBindAddress, checkResourceDiscovery, checkServiceHealth, checkServiceSmoke, checkTilt, checkTypeScriptTypeDependencies, checkWslProjectLocation, formatDoctorSummary, getDoctorOutcomeMessage, isContainerDependentCheck, MIN_BUN_VERSION, MIN_TILT_VERSION, orderDoctorResults, renderDoctorOutput, requiresContainerRuntime, runChecks, versionMeetsMinimum, WSL2_DOCTOR_MESSAGE, };
export const doctorCommand = new Command("doctor")
    .description("Check environment readiness for Flisk")
    .option("--all", "Run every check and show Machine and Project sections with a summary", false)
    .option("--json", "Output a versioned JSON readiness report", false)
    .exitOverride((error) => {
    if (error.exitCode === 0)
        process.exit(0);
    if (doctorCommand.opts().json) {
        console.log(JSON.stringify(createDoctorUsageReport([{ code: "USAGE", message: error.message }])));
    }
    process.exit(2);
})
    .option("--no-ping", "Skip pinging running services' /health endpoints")
    .option("--no-gateway", "Skip gateway checks (ports 80/443)")
    .option("--no-database", "Skip database capability checks")
    .option("--strict", "Fail warnings such as a WSL project under /mnt/c")
    .option("--fix", "Repair this project's unused Docker networks and leftover doctor probes", false)
    .option("--dry-run", "With --fix: list the repairs without changing anything", false)
    .option("--scope <scope>", "With --fix: project (default) or machine, which also removes unused networks of other Flisk projects", "project")
    .option("-y, --yes", "With --fix: apply every repair without asking", false)
    .option("--ping-timeout <ms>", "Per-service ping timeout in milliseconds", String(DEFAULT_PING_TIMEOUT_MS))
    .addHelpText("after", "\nExamples:\n  flisk doctor\n  flisk doctor --all\n  flisk doctor --fix --dry-run\n  flisk doctor --json")
    .action(async (options) => {
    // Validate before running any probe; parseInt would silently accept "100ms" or "1.5".
    const pingTimeout = Number(options.pingTimeout);
    if (!/^\d+$/.test(options.pingTimeout) ||
        !Number.isSafeInteger(pingTimeout) ||
        pingTimeout <= 0) {
        const message = "--ping-timeout must be a positive integer number of milliseconds";
        if (options.json)
            console.log(JSON.stringify(createDoctorUsageReport([{ code: "USAGE", message }])));
        console.error(message);
        process.exit(2);
        return;
    }
    const scopeInvalid = !["project", "machine"].includes(options.scope);
    const scopeWithoutFix = options.scope !== "project" && !options.fix;
    if (scopeInvalid || scopeWithoutFix || ((options.dryRun || options.yes) && !options.fix)) {
        let message;
        if (scopeInvalid) {
            message = `--scope must be project or machine, got "${options.scope}"`;
        }
        else if (scopeWithoutFix) {
            message = "--scope only applies with --fix";
        }
        else {
            message = `${options.dryRun ? "--dry-run" : "--yes"} only applies with --fix`;
        }
        if (options.json)
            console.log(JSON.stringify(createDoctorUsageReport([{ code: "USAGE", message }])));
        console.error(message);
        process.exit(2);
        return;
    }
    // A project whose services all declare `command` runs as local processes: doctor checks only what they need (#2231).
    const nativeProject = findNativeProject();
    const nativeResources = nativeProject?.resources ?? null;
    if (!options.json) {
        console.log(nativeResources
            ? "Flisk doctor checks what this project's local processes need; its services declare commands (and image containers, if any), so Compose and Tilt are not checked."
            : "Flisk doctor checks your local Docker + Tilt development environment; it does not check cluster deployments.");
    }
    const host = detectHost();
    if (process.platform === "win32") {
        const nativeWindowsFinding = {
            name: "Native Windows support",
            didPass: false,
            message: NATIVE_WINDOWS_DOCTOR_MESSAGE,
            fix: NATIVE_WINDOWS_NEXT_STEP,
        };
        // Keep Windows diagnostics behind the win32 platform check (Linux/macOS unchanged).
        const windowsChecks = [
            nativeWindowsFinding,
            checkWindowsRuntimeTools(),
            checkWindowsDockerMode(),
            await checkWindowsHostConfiguration(),
        ];
        let windowsPortPlan = null;
        try {
            windowsPortPlan = await createHostPortPlan();
        }
        catch {
            /* The native-Windows platform finding remains the primary failure. */
        }
        if (options.json) {
            console.log(JSON.stringify(createDoctorReport(windowsChecks, Boolean(findProjectRoot()), [], windowsPortPlan, {
                ...host,
                canUp: false,
            }, undefined, undefined, getBuildCommit())));
        }
        else {
            printDoctorResults(windowsChecks);
            console.log("");
        }
        console.error(NATIVE_WINDOWS_DOCTOR_MESSAGE);
        process.exit(1);
        return;
    }
    if (host.kind === "webcontainer") {
        const report = createDoctorReport([
            {
                name: "Host",
                didPass: false,
                message: WEBCONTAINER_UP_MESSAGE,
                fix: `Use a machine with Docker. Guide: ${WEBCONTAINER_DOCS}`,
            },
        ], Boolean(findProjectRoot()), [], undefined, host, undefined, undefined, getBuildCommit());
        if (options.json)
            console.log(JSON.stringify(report));
        console.error(WEBCONTAINER_UP_MESSAGE);
        process.exit(1);
        return;
    }
    if (!options.json) {
        console.log(`\n${chalk.bold("🔍 Flisk Doctor")}\n`);
        console.log("Checking environment...\n");
    }
    // A directory of command services is a project for doctor even before `flisk up` writes its .flisk/project.json.
    const projectRoot = findProjectRoot() ?? nativeProject?.projectRoot ?? null;
    // Repairs run before the checks so the checks report the state after the fix.
    let fixActions;
    if (options.fix && nativeResources) {
        // The repairs are for Docker networks and Tilt probes, which a project of local processes does not have.
        fixActions = [];
    }
    else if (options.fix) {
        try {
            let projectName;
            if (projectRoot) {
                try {
                    projectName = readProjectConfig(projectRoot).project.name;
                }
                catch {
                    // An unreadable config is reported by the project checks below.
                }
            }
            const tiltPids = projectRoot ? projectTiltPids(projectRoot) : [];
            const planned = await planDoctorFixes(projectName, undefined, {
                tiltPids,
                machine: options.scope === "machine",
            });
            fixActions = await applyDoctorFixes(planned, {
                dryRun: options.dryRun,
                confirm: options.yes || (!options.json && process.stdin.isTTY)
                    ? async (action) => options.yes ||
                        (await promptConfirm({
                            message: `Run \`${action.command}\` (${action.check}, ${action.reason})?`,
                        }))
                    : undefined,
            });
        }
        catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            fixActions = [
                {
                    id: "plan-fixes",
                    check: "Docker networks",
                    scope: "project",
                    command: "docker network ls",
                    status: "failed",
                    reason: `could not list Docker networks: ${reason.split(/\r?\n/)[0]}`,
                },
            ];
        }
        if (!options.json && fixActions && fixActions.length > 0) {
            printFixActions(fixActions, options.dryRun);
        }
    }
    // `.flisk/project.json` and the --no-gateway / --no-database flags decide which shared containers are checked.
    const dbEnabled = isDatabaseCapabilityEnabled(projectRoot, options);
    const gatewayEnabled = isGatewayEnabled(projectRoot, options);
    const enabledCapabilities = getEnabledCapabilities(projectRoot, options);
    const portCaps = { gateway: gatewayEnabled, database: dbEnabled };
    // One cache per doctor run, so checks that ask Docker the same question share one answer.
    const hostCommandCache = createHostCommandCache();
    // The Compose and Versions checks both read the compose version; this runs it once for the run.
    const cachedExec = cacheExecAsync(execAsync, createAsyncCommandCache());
    // The host port plan places the gateway and Postgres containers; a project of local processes has neither.
    let hostPortPlan;
    let portPlanError;
    if (!nativeResources) {
        try {
            hostPortPlan = await getHostPortPlan(projectRoot ?? process.cwd(), {
                database: dbEnabled,
                gateway: gatewayEnabled,
                commandCache: hostCommandCache,
            });
        }
        catch (error) {
            hostPortPlan = null;
            portPlanError = error instanceof Error ? error.message : String(error);
        }
    }
    const containerMachineChecks = [
        () => {
            if (hostPortPlan) {
                return {
                    name: "Host Ports",
                    didPass: true,
                    message: describeHostPortPlan(hostPortPlan, portCaps),
                };
            }
            const match = portPlanError?.match(/(?:FLISK_\w+=|port )(\d+)/i);
            const conflictingPort = match ? Number(match[1]) : undefined;
            const owner = conflictingPort ? findPortOwner(conflictingPort) : null;
            if (owner && conflictingPort) {
                const diag = formatPortOwnerDiagnostic(conflictingPort, owner, portPlanError);
                return {
                    name: "Host Ports",
                    didPass: false,
                    message: diag.message,
                    fix: diag.fix,
                    observed: owner,
                };
            }
            return {
                name: "Host Ports",
                didPass: false,
                message: portPlanError ?? "Could not select host ports",
                fix: hostPortPlanFix(portCaps),
            };
        },
        ...(gatewayEnabled
            ? [
                () => hostPortPlan
                    ? checkIngressPorts(execSync, undefined, [hostPortPlan.ingressHttp, hostPortPlan.ingressHttps], { commandCache: hostCommandCache })
                    : {
                        name: "Ingress Ports",
                        didPass: false,
                        message: "Ingress port plan is unavailable",
                    },
            ]
            : []),
        checkColima,
        checkContainerEngine,
        () => checkDockerRuntime(hostCommandCache),
        () => checkDiskSpace(),
        requiresContainerRuntime("Docker Build Cache", () => checkDockerBuildCache()),
        requiresContainerRuntime("Colima Disk", () => checkColimaDisk()),
        requiresContainerRuntime("Docker OS", checkDockerOperatingSystem),
        checkTilt,
        requiresContainerRuntime("Docker Compose", () => checkDockerCompose(cachedExec)),
        requiresContainerRuntime("Docker Versions", () => checkDockerVersions(cachedExec)),
        checkBun,
        () => checkWslProjectLocation(findProjectRoot() ?? process.cwd(), options.strict),
        () => checkPublishedBindAddress(process.env, options.strict),
        // Each project needs several networks; a full address pool fails `flisk up` late.
        requiresContainerRuntime("Docker Network Pool", () => checkDockerNetworkCapacity()),
        requiresContainerRuntime("Docker File Sharing", () => checkDockerFileSharing()),
        () => checkDockerWslIntegration(),
        () => checkDuplicateFliskInstalls(),
        () => checkLatestFliskVersion(),
    ];
    // Project checks both the container list and the local-process list run, in the same order in each.
    const checkDir = projectRoot ?? process.cwd();
    const versionAndRepoChecks = [
        () => checkFliskVersion(),
        () => checkProjectRepos(checkDir, undefined, undefined, { strict: options.strict }),
    ];
    const declarationChecks = [
        () => checkDuplicateResourceNames(),
        () => checkDependsOnShape(),
    ];
    const graphChecks = [
        () => checkCircularDependencies(),
        () => checkServicePorts(),
    ];
    const schemaAndPortChecks = [
        () => checkSchemaVersions(undefined, options.strict),
        () => checkDuplicateResourcePorts(),
    ];
    const envHygieneChecks = [
        () => checkPublicEnvSecrets(checkDir, options.strict),
        () => checkRemoteEnvHosts(checkDir, options.strict),
    ];
    const containerProjectChecks = [
        ...versionAndRepoChecks,
        checkMasterConfigs,
        checkGeneratedProjectRuntimeAssets,
        () => checkGeneratedFiles(options.strict),
        checkStarlarkLoadExports,
        checkStartupScripts,
        // A backend without its health route never turns healthy; Traefik 404s it.
        () => checkHealthRoutes(),
        checkTypeScriptTypeDependencies,
        checkFrontendDockerPreflight,
        checkResourceDiscovery,
        // Wiring mistakes that otherwise surface minutes into `flisk up`.
        () => checkResourcePackageJson(),
        ...declarationChecks,
        ...graphChecks,
        () => checkSidecars(),
        () => checkNetworkPorts(),
        () => checkGpuRuntime(),
        () => checkModelRunner(),
        () => checkVolumes(),
        () => checkPostgresVolumes(undefined, undefined, options.strict),
        ...schemaAndPortChecks,
        () => checkInfraFrameworks(),
        () => checkServiceUrlPorts(),
        () => checkFrontendBackendUrls(),
        () => checkSharedStackRoutes(),
        () => checkNatsBroker(),
        () => checkPrismaConsistency(undefined, undefined, options),
        // Shared platform Postgres: will-start report + unknown dependsOn names stay errors.
        () => checkSharedPlatformPostgres(undefined, options),
        requiresContainerRuntime("Postgres credentials", () => checkPostgresCredentials(undefined, undefined, options)),
        () => checkMigrationsInApi(),
        () => checkTiltInstances(),
        checkEnvironmentVariables,
        ...envHygieneChecks,
        // Preflight: Verdaccio down causes ImageBuild bun install ConnectionRefused.
        async () => {
            const root = findProjectRoot() ?? process.cwd();
            const licensed = projectConfigEnablesVerdaccio(root)
                ? await hasVerdaccioLicense(root)
                : true;
            return checkPrivateNpmRegistry(execSync, root, undefined, licensed, hostCommandCache);
        },
        // Runtime checks: skip gracefully if the stack isn't started yet.
        requiresContainerRuntime("Container Resource Health", checkContainerResourceHealth),
        // A container restarted thousands of times is invisible in `docker ps` until someone looks.
        requiresContainerRuntime("Crash-looping containers", () => {
            const root = findProjectRoot() ?? process.cwd();
            let secrets = [];
            try {
                secrets = envSecretValues(root);
            }
            catch {
                // Without the secret values, log lines cannot be shown safely.
                return {
                    name: "Crash-looping containers",
                    didPass: true,
                    isSkipped: true,
                    message: "Could not read .env - skipped crash-loop check",
                };
            }
            return checkCrashLoopingContainers(getProjectName(), secrets);
        }),
        // When Tilt is up, surface red resources (Traefik/apps never started).
        requiresContainerRuntime("Tilt Resources", checkTiltResourceHealth),
    ];
    const machineChecks = nativeResources
        ? [
            () => checkNativeRuntime(nativeResources),
            () => checkNativeCommands(nativeResources),
            () => checkToolchains(nativeResources),
            () => checkWslProjectLocation(findProjectRoot() ?? process.cwd(), options.strict),
            () => checkDuplicateFliskInstalls(),
        ]
        : containerMachineChecks;
    const projectChecks = nativeResources
        ? [
            ...versionAndRepoChecks,
            ...declarationChecks,
            () => checkNativeDependsOn(nativeResources),
            () => checkPostgresVolumes(checkDir, nativeResources, options.strict),
            ...graphChecks,
            ...schemaAndPortChecks,
            ...envHygieneChecks,
        ]
        : containerProjectChecks;
    if (options.ping && nativeResources && projectRoot) {
        projectChecks.push(() => checkNativeServiceHealth(projectRoot, nativeResources, pingTimeout));
    }
    // Runs last: needs routable services (and working Traefik) to mean anything.
    if (options.ping && !nativeResources) {
        // Probe the port a running stack is actually on, not the one the next `flisk up` would pick.
        const pingPort = projectRoot
            ? resolveRuntimeIngressPort(projectRoot, hostPortPlan?.ingressHttp)
            : hostPortPlan?.ingressHttp;
        projectChecks.push(requiresContainerRuntime("Service Health", () => checkServiceHealth(pingTimeout, pingPort)));
        projectChecks.push(requiresContainerRuntime("Service Smoke", () => checkServiceSmoke(pingTimeout, pingPort, { gateway: gatewayEnabled })));
        projectChecks.push(requiresContainerRuntime("Advertised Endpoints", () => checkAdvertisedEndpoints(pingTimeout, pingPort)));
    }
    // Right after installing, people run `flisk doctor` before they have a
    // project. Only the machine checks mean anything there; the project checks
    // would all fail with "run flisk project".
    const inProject = Boolean(projectRoot);
    let machineResults = [];
    let projectResults = [];
    let results;
    let errors = [];
    if (options.json || !options.all) {
        const collected = await collectDoctorChecks(machineChecks, inProject ? projectChecks : []);
        results = collected.checks;
        errors = collected.errors;
    }
    else {
        const runSection = async (sectionChecks, runtimeFailed = false) => {
            const wrapped = sectionChecks.map((check) => {
                const fn = async () => {
                    try {
                        return await check();
                    }
                    catch (err) {
                        errors.push({
                            code: "INTERNAL",
                            message: err instanceof Error ? err.message : String(err),
                        });
                        return {
                            name: check.checkName ?? "Doctor check",
                            didPass: false,
                            isSkipped: false,
                            message: "Check failed with an internal error",
                        };
                    }
                };
                fn.requiresContainerRuntime = check.requiresContainerRuntime;
                fn.checkName = check.checkName;
                return fn;
            });
            return runChecks(wrapped, {
                all: Boolean(options.all),
                containerRuntimeFailed: runtimeFailed,
            });
        };
        machineResults = await runSection(machineChecks);
        const machineFailed = machineResults.some((result) => !result.didPass && !result.isSkipped && !result.isWarning);
        const runtimeFailed = machineResults.some((result) => result.name === CONTAINER_RUNTIME_CHECK && !result.didPass);
        if (inProject && (options.all || !machineFailed)) {
            projectResults = await runSection(projectChecks, runtimeFailed);
        }
        results = [...machineResults, ...projectResults];
    }
    if (isContainerHost(host.kind)) {
        for (const result of results) {
            if (result.name === CONTAINER_RUNTIME_CHECK && !result.didPass) {
                result.fix = DEVCONTAINER_DOCKER_FIX;
            }
        }
    }
    const buildCommit = getBuildCommit();
    const report = createDoctorReport(orderDoctorResults(results), inProject, errors, hostPortPlan, host, enabledCapabilities, undefined, buildCommit);
    if (fixActions)
        report.data.actions = fixActions;
    if (fixActions) {
        const { repairableCount, needsActionCount } = summarizeDoctorFix(results, fixActions);
        report.data.repairableCount = repairableCount;
        report.data.needsActionCount = needsActionCount;
        report.data.repairable = repairableCount;
        report.data.needsAction = needsActionCount;
    }
    const fixFailed = fixActions ? hasFailedActions(fixActions) : false;
    if (fixFailed)
        report.data.ready = false;
    const exitCode = getDoctorExitCode(report);
    const allPassed = report.data.ready;
    if (options.json) {
        let secrets;
        try {
            secrets = envSecretValues(findProjectRoot() ?? process.cwd());
        }
        catch (error) {
            if (!(error instanceof EnvUnreadableError))
                throw error;
            // Without the values the report cannot be published safely, so it is replaced by a structured error.
            console.log(JSON.stringify(createDoctorReport([], inProject, [...errors, { code: "ENV_UNREADABLE", message: error.message }], undefined, undefined, undefined, undefined, buildCommit)));
            console.error(error.message);
            process.exit(1);
        }
        console.log(JSON.stringify(redactValue(report, secrets)));
        for (const error of errors)
            console.error(redactSecrets(error.message, secrets));
        if (exitCode !== 0)
            process.exit(exitCode);
        return;
    }
    // The JSON report is masked above; the text report and the check errors quote the same application output, so they are
    // masked too. Without the secret values nothing can be masked, so the report is withheld, as in the JSON branch.
    const textSecrets = projectSecretValues(findProjectRoot() ?? process.cwd());
    if (textSecrets === null) {
        console.error(`${chalk.red("✗")} ${OUTPUT_WITHHELD}`);
        console.error("  Check that the project's .env and --env-file files are readable files.");
        process.exit(1);
    }
    for (const error of errors)
        console.error(`${chalk.red("✗")} Doctor check failed: ${redactSecrets(error.message, textSecrets)}`);
    renderDoctorOutput(redactValue(machineResults, textSecrets), redactValue(projectResults, textSecrets), inProject, options, redactValue(results, textSecrets));
    if (fixActions && fixActions.length === 0) {
        const failedCount = results.filter((check) => !check.didPass && !check.isSkipped && !check.isWarning).length;
        if (!options.json)
            printFixActions(fixActions, options.dryRun, failedCount);
    }
    const outcome = getDoctorOutcomeMessage(inProject, allPassed);
    console.log(`${allPassed ? chalk.green(chalk.bold("✓")) : chalk.red(chalk.bold("✗"))} ${outcome}`);
    if (exitCode !== 0)
        process.exit(exitCode);
});
