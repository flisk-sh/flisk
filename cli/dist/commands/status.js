// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import { Command } from "commander";
import { getEnabledCapabilities, isGatewayEnabled } from "../utils/capabilities.js";
import { dependsOnOf } from "../utils/dependency-graph.js";
import { createDiscoveryContext } from "../utils/discovery-context.js";
import { findStaleDisabledResources, getDeferredResourceNames } from "../utils/doctor-runtime.js";
import { runCommand } from "../utils/errors.js";
import { formatCount, showDetail, showStep } from "../utils/formatting.js";
import { getHostPortPlan } from "../utils/host-port-config.js";
import { createMachineEnvelope, writeMachineError } from "../utils/machine-output.js";
import { nativeServiceStates } from "../utils/native-runtime.js";
import { isNativeProject } from "../utils/native-service.js";
import { findProjectRoot } from "../utils/paths.js";
import { deriveServiceStates } from "../utils/service-runtime-state.js";
import { groupSharedPostgres, readProjectName } from "../utils/shared-infra.js";
import { groupServicesByStack, unhealthyServiceNames } from "../utils/status-groups.js";
import { buildServicePorts, buildStackPorts } from "../utils/status-ports.js";
import { isTiltAvailable, runTilt } from "../utils/tilt.js";
import { getTiltPollingPort } from "../utils/tilt-startup.js";
import { evaluateTiltReadiness, tiltGetUiResources } from "../utils/up-readiness.js";
export const statusCommand = new Command("status")
    .description("Show status of resources and stacks")
    .option("--json", "Output a versioned JSON status report", false)
    .option("-v, --verbose", "Show detailed information", false)
    .option("--stacks", "Show stack information (default)", true)
    .option("--resources", "Show all discovered resources", false)
    .option("--tilt", "Show tilt resource status", false)
    .option("--no-gateway", "Disable gateway status reporting")
    .option("--unhealthy", "Show only services that are failing or still starting", false)
    .action(async (options) => {
    const action = async () => {
        // Discover first: outside a project this fails before any status line is printed.
        const discovery = createDiscoveryContext();
        const projectRoot = findProjectRoot();
        const projectName = projectRoot ? readProjectName(projectRoot) : null;
        const sharedInfraGroup = projectName
            ? groupSharedPostgres(projectName, discovery.stacks, {
                projectRoot: projectRoot ?? undefined,
            })
            : null;
        // A project of `command` services runs as local processes: its state comes from the run on record, not from Tilt.
        const nativeStates = projectRoot && isNativeProject(discovery.resources)
            ? nativeServiceStates(projectRoot, discovery.resources.map((resource) => resource.name))
            : null;
        const gatewayEnabled = isGatewayEnabled(projectRoot, options);
        let tiltAvailable = false;
        if (!nativeStates) {
            try {
                tiltAvailable = await isTiltAvailable();
            }
            catch {
                // Tilt not available (spawn error)
                tiltAvailable = false;
            }
        }
        if (!options.json) {
            showStep("Flisk Status\n");
            if (nativeStates) {
                console.log(chalk.bold("Runtime:"), "local processes (no Docker, no Tilt)");
            }
            else {
                console.log(chalk.bold("Tilt:"), tiltAvailable ? chalk.green("available") : chalk.red("not found"));
                if (!tiltAvailable) {
                    showDetail("Install Tilt: https://docs.tilt.dev/install.html");
                }
            }
            console.log();
        }
        let tiltResources = null;
        let queryError = null;
        // A single look at the running Tilt, so a caller that started `flisk up` detached can poll for readiness. Null when no
        // Tilt answers or its output cannot be read.
        let readiness = null;
        // The same look at Tilt feeds readiness and each service's state, so `flisk status` and `flisk ui` cannot disagree.
        let serviceStates = nativeStates;
        let staleDisabled = [];
        const tiltPort = getTiltPollingPort(process.env.TILT_PORT);
        // Port plan is best effort; service URLs are shown in both JSON and terminal output.
        let portPlan = null;
        try {
            const root = findProjectRoot();
            portPlan = root ? await getHostPortPlan(root, { inspectDocker: false }) : null;
        }
        catch {
            // Port planning failed; service URLs will be omitted from terminal output.
        }
        if (tiltAvailable) {
            const text = await tiltGetUiResources(tiltPort);
            // `tilt get` has no -f flag; resources come from the running Tilt's API on its port, the same source as readiness.
            if (options.json && options.tilt) {
                if (text) {
                    try {
                        tiltResources = JSON.parse(text);
                    }
                    catch (error) {
                        queryError = `Tilt returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`;
                    }
                }
                else {
                    queryError = `No Tilt is answering on port ${tiltPort}. Start it with: flisk up`;
                }
            }
            if (text) {
                const deferred = getDeferredResourceNames(discovery.resources);
                try {
                    readiness = evaluateTiltReadiness(text, deferred).result;
                }
                catch {
                    readiness = null;
                }
                try {
                    serviceStates = deriveServiceStates(text, Object.fromEntries(discovery.resources.map((r) => [r.name, dependsOnOf(r.config)])), deferred);
                }
                catch {
                    serviceStates = null;
                }
                try {
                    staleDisabled = findStaleDisabledResources(text, projectRoot);
                }
                catch {
                    staleDisabled = [];
                }
            }
        }
        const tiltfileError = readiness?.failures.find((failure) => failure.name === "(Tiltfile)")?.message ?? null;
        if (options.json) {
            const errors = queryError ? [{ code: "TILT_STATUS_UNAVAILABLE", message: queryError }] : [];
            // A native run answers the readiness question agents poll (data.tilt.readiness.ready) from its own run state.
            if (nativeStates) {
                const states = Object.entries(nativeStates);
                const isRunning = states.some(([, state]) => state.status !== "unknown");
                readiness = isRunning
                    ? {
                        ready: states.every(([, state]) => state.status === "ready"),
                        failures: [],
                        pending: states.filter(([, state]) => state.status !== "ready").length,
                        timedOut: false,
                        enabled: states.map(([name]) => name),
                    }
                    : null;
            }
            const data = {
                // Only a project of local processes says so; a container project's report keeps its shape.
                ...(nativeStates ? { runtime: "native" } : {}),
                tilt: {
                    available: tiltAvailable,
                    resourcesQueried: options.tilt && tiltAvailable,
                    resources: tiltResources,
                    readiness,
                    tiltfileError,
                    staleDisabled,
                },
                resourceCount: discovery.resources.length,
                resources: discovery.resources.map((resource) => ({
                    name: resource.name,
                    stack: resource.stack ?? null,
                    type: resource.type ?? "unknown",
                    port: resource.port ?? null,
                    ...buildServicePorts(resource, portPlan?.ingressHttp, { gateway: gatewayEnabled }),
                    status: serviceStates?.[resource.name]?.status ?? "unknown",
                    ...(serviceStates?.[resource.name]?.reason
                        ? { statusReason: serviceStates[resource.name]?.reason }
                        : {}),
                    ...(serviceStates?.[resource.name]?.blockedBy
                        ? { blockedBy: serviceStates[resource.name]?.blockedBy }
                        : {}),
                })),
                ports: buildStackPorts(portPlan, tiltPort, { gateway: gatewayEnabled }),
                stacks: discovery.stacks.map((stack) => ({
                    name: stack.name,
                    resourceCount: stack.resourceCount,
                    resources: stack.resources.map((resource) => resource.name),
                    healthyCount: stack.resources.filter((resource) => serviceStates?.[resource.name]?.status === "ready").length,
                })),
                unassignedResources: discovery.unassignedResources.map((resource) => resource.name),
                sharedInfra: sharedInfraGroup,
                capabilities: getEnabledCapabilities(projectRoot, options),
                // Names of the failing or pending services, so a caller need not filter `resources` itself.
                unhealthy: unhealthyServiceNames(discovery.resources, serviceStates),
            };
            console.log(JSON.stringify(createMachineEnvelope(data, errors)));
            if (errors.length > 0) {
                console.error(queryError);
                process.exit(1);
            }
            return;
        }
        console.log(chalk.bold("Resources:"), `${discovery.resources.length} discovered`);
        console.log(chalk.bold("Stacks:"), `${discovery.stacks.length} defined`);
        const hasStates = serviceStates !== null && Object.keys(serviceStates).length > 0;
        const unhealthyOnly = Boolean(options.unhealthy);
        // When the Tiltfile cannot be re-run (a cycle, a wrong-typed field in a service.json just edited), Tilt keeps the last good
        // graph and every service still reads as healthy. Without this line the edit seems to have had no effect. The cause varies
        // (a first load has no previous graph), so the guidance does not claim what the stack is running.
        if (tiltfileError && !unhealthyOnly) {
            console.log();
            console.log(chalk.red(`✗ Tilt could not reload the Tiltfile: ${tiltfileError}`));
            showDetail("Fix the cause shown above. If Tilt does not pick the fix up, restart with flisk down and flisk up.");
            console.log();
        }
        if (staleDisabled.length > 0 && !unhealthyOnly) {
            console.log();
            console.log(chalk.yellow(`⚠️  Tilt keeps ${formatCount(staleDisabled.length, "resource")} Disabled that the Tiltfile enables: ${staleDisabled.join(", ")}`));
            showDetail("restart needed: `flisk down && flisk up`");
            console.log();
        }
        // With service states the grouped "Services:" section below replaces the plain per-stack counts.
        if (!hasStates && !unhealthyOnly) {
            for (const stack of discovery.stacks) {
                showDetail(`${stack.name}: ${formatCount(stack.resources.length, "resource")}`);
                if (options.verbose) {
                    for (const resource of stack.resources) {
                        showDetail(`${resource.name}`, 6);
                    }
                }
            }
            if (discovery.unassignedResources.length > 0) {
                console.log();
                console.log(chalk.yellow(`${formatCount(discovery.unassignedResources.length, "resource")} not in any stack:`));
                if (options.verbose) {
                    for (const resource of discovery.unassignedResources) {
                        showDetail(`${resource.name}`);
                    }
                }
            }
        }
        if (sharedInfraGroup && !unhealthyOnly) {
            console.log();
            console.log(chalk.bold("Shared infrastructure:"));
            showDetail(`${sharedInfraGroup.name} (one instance, ${formatCount(sharedInfraGroup.databases.length, "database")})`);
            for (const database of sharedInfraGroup.databases) {
                showDetail(`  ${database.name} (stack ${database.stack}): ${database.services.join(", ")}`);
            }
        }
        if (hasStates && serviceStates) {
            const states = serviceStates;
            console.log();
            console.log(chalk.bold(unhealthyOnly ? "Unhealthy services:" : "Services:"));
            const unhealthy = new Set(unhealthyServiceNames(discovery.resources, states));
            if (unhealthyOnly && unhealthy.size === 0) {
                showDetail(chalk.green("All services are healthy."));
            }
            for (const group of groupServicesByStack(discovery.stacks, discovery.unassignedResources, states)) {
                const shown = group.resources.filter((resource) => states[resource.name] && (!unhealthyOnly || unhealthy.has(resource.name)));
                if (unhealthyOnly && shown.length === 0)
                    continue;
                const summary = `${group.healthy}/${group.total} healthy`;
                showDetail(`${chalk.bold(group.name)}: ${group.healthy === group.total ? chalk.green(summary) : chalk.yellow(summary)}`);
                for (const resource of shown) {
                    const state = states[resource.name];
                    if (!state)
                        continue;
                    let mark = chalk.yellow("…");
                    if (state.status === "ready") {
                        mark = chalk.green("✓");
                    }
                    else if (state.status === "error") {
                        mark = chalk.red("✗");
                    }
                    const ports = buildServicePorts(resource, portPlan?.ingressHttp, {
                        gateway: gatewayEnabled,
                    });
                    const urlPart = ports.url ? ` → ${ports.url}` : "";
                    showDetail(`${mark} ${resource.name}${urlPart}  ${state.status}${state.reason ? ` (${state.reason})` : ""}`, 6);
                }
            }
        }
        else if (discovery.resources.length > 0) {
            // Without a running Tilt, no service state can be read. Say so instead of printing nothing.
            console.log();
            console.log(chalk.bold("Services:"));
            showDetail(`unknown: no Tilt answers on port ${tiltPort}, so nothing is confirmed running. Start with: flisk up`);
        }
        if (options.tilt && tiltAvailable) {
            console.log();
            showStep("Tilt Resources:");
            const result = await runTilt("get", ["uiresources", "--port", String(tiltPort)], {
                inheritStdio: false,
            });
            if (result.exitCode === 0) {
                console.log(result.stdout || chalk.gray("  No active tilt resources"));
            }
            else {
                showDetail(`No Tilt is answering on port ${tiltPort}. Start it with: flisk up`);
            }
        }
        console.log();
        showDetail('Run "flisk stacks" to see all stacks.');
        showDetail('Run "flisk up <stack-name>" to start a stack.');
    };
    if (options.json) {
        try {
            await action();
        }
        catch (error) {
            writeMachineError(error);
        }
        return;
    }
    await runCommand(action);
});
