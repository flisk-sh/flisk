// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import { Command } from "commander";
import { isTiltfileOrchestration } from "../generator/project-config.js";
import { STANDARD_PORTS } from "../utils/constants.js";
import { collectSidecarDependents, isGeneratedComposeContainer, parseEnabledTiltResourceNames, restartContainer, } from "../utils/container-restart.js";
import { createDiscoveryContext } from "../utils/discovery-context.js";
import { FliskError, ProcessExitError, runCommand, showErrorAndExit, UnknownResourceError, unknownResourceSuggestions, } from "../utils/errors.js";
import { resolveRuntimeTiltPort } from "../utils/host-port-config.js";
import { createMachineEnvelope, toMachineError, writeMachineError, } from "../utils/machine-output.js";
import { requestNativeRestart } from "../utils/native-runtime.js";
import { isNativeProject } from "../utils/native-service.js";
import { withFailureLogs } from "../utils/native-up.js";
import { resolveCommandProject } from "../utils/project-resolution.js";
import { isTiltAvailable, runTilt } from "../utils/tilt.js";
import { isTiltConnectionFailure } from "../utils/tilt-logs.js";
import { tiltUnreachableMessage } from "../utils/tilt-unreachable-message.js";
import { isValidPort } from "../utils/validation.js";
export const restartCommand = new Command("restart")
    .description("Restart a running resource in the stack")
    .argument("<resource>", "Name of the resource (service) to restart")
    .option("--port <n>", "Tilt UI port (default: TILT_PORT or 10350)")
    .option("--rebuild", "Rebuild the image through Tilt instead of restarting the container", false)
    .option("--project <path>", "Path to the Flisk project whose resource to restart (default: the current project)")
    .option("--wait <seconds>", "Local processes: how long to wait for the service to be ready again (0: return once the restart has begun)", "60")
    .option("--json", "Output one JSON object and exit", false)
    .addHelpText("after", "\nExamples:\n  flisk restart orders-api\n  flisk restart orders-api --json\n  flisk restart orders-api --rebuild" +
    "\n\nTilt resources require Tilt; local-process projects: use `flisk down && flisk up` for a full restart.")
    .showHelpAfterError("\nRun `flisk resources` to see the resource names you can restart.")
    .action(async (resourceName, options, command) => {
    const portText = options.port ?? process.env.TILT_PORT ?? String(STANDARD_PORTS.tiltUi);
    if (!isValidPort(portText)) {
        const portSource = options.port !== undefined ? "--port" : "TILT_PORT";
        const message = `${portSource} must be a valid port number`;
        if (options.json) {
            console.log(JSON.stringify(createMachineEnvelope(null, [{ code: "USAGE", message }])));
            console.error(message);
            process.exit(2);
        }
        showErrorAndExit(message, 2);
    }
    const action = async () => {
        const root = await resolveCommandProject({
            commandName: "restart",
            project: options.project ?? command.optsWithGlobals().project,
            json: options.json,
        });
        // Check the name against the project's resources before probing Tilt, so a
        // typo reports UNKNOWN_RESOURCE instead of a misleading "Could not reach Tilt".
        const discovery = createDiscoveryContext();
        const resource = discovery.resources.find((r) => r.name === resourceName);
        if (!resource) {
            const suggestions = unknownResourceSuggestions(resourceName, discovery.resources.map((candidate) => candidate.name));
            if (options.json) {
                const { error } = toMachineError(new UnknownResourceError(resourceName, suggestions));
                console.log(JSON.stringify(createMachineEnvelope(null, [error])));
                process.exit(1);
            }
            throw new UnknownResourceError(resourceName, suggestions);
        }
        // A project of `command` services runs as local processes under `flisk up`, with no Tilt to trigger: ask that run to
        // restart the one service and report what happened to it.
        if (isNativeProject(discovery.resources)) {
            const waitSeconds = Number(options.wait);
            if (!Number.isFinite(waitSeconds) || waitSeconds < 0) {
                throw new FliskError("--wait must be a number of seconds, 0 or more", [
                    "Pass --wait 60, or --wait 0 to return once the restart has begun",
                ]);
            }
            const outcome = await requestNativeRestart(root, resourceName, {
                waitMs: waitSeconds * 1000,
            });
            const fail = (code, message, logs = []) => {
                if (options.json) {
                    console.log(JSON.stringify(createMachineEnvelope({
                        ok: false,
                        resource: resourceName,
                        restarted: false,
                        state: outcome.state,
                        logs,
                    }, [{ code, message }])));
                    process.exit(1);
                }
                throw new FliskError(message, [
                    ...logs,
                    `Read the output with: flisk logs --service ${resourceName}`,
                ]);
            };
            if (outcome.state === "not-running") {
                // No supervising `flisk up` can restart this process. Point at the documented whole-project
                // workaround instead of telling the reader to start a stack that is already running.
                const message = "`flisk restart` requires Tilt and works on Tilt resources; this project runs as local processes (no Tilt).";
                const suggestions = ["Restart the project with: flisk down && flisk up"];
                if (options.json) {
                    console.log(JSON.stringify(createMachineEnvelope(null, [
                        { code: "NATIVE_RESTART_UNSUPPORTED", message, suggestions },
                    ])));
                    process.exit(1);
                }
                throw new FliskError(message, suggestions);
            }
            if (outcome.state === "failed" || outcome.state === "timeout") {
                const [withLogs] = withFailureLogs(root, [{ name: resourceName, reason: outcome.reason ?? outcome.state }], outcome.logsSince);
                return fail(outcome.state === "failed" ? "RESTART_FAILED" : "RESTART_NOT_READY", `${resourceName} ${outcome.state === "failed" ? "did not come back" : "is not ready yet"}: ${outcome.reason ?? outcome.state}`, withLogs?.logs ?? []);
            }
            if (options.json) {
                console.log(JSON.stringify(createMachineEnvelope({
                    resource: resourceName,
                    restarted: true,
                    state: outcome.state,
                    ready: outcome.state === "ready",
                    ...(outcome.pid ? { pid: outcome.pid } : {}),
                })));
                return;
            }
            console.log(chalk.green(outcome.state === "ready"
                ? `✓ Restarted ${resourceName} (ready)`
                : `✓ Restarting ${resourceName}`));
            return;
        }
        let tiltAvailable = false;
        try {
            tiltAvailable = await isTiltAvailable();
        }
        catch {
            tiltAvailable = false;
        }
        if (!tiltAvailable) {
            // isTiltAvailable collapses missing binary and nonzero version into false.
            // Report TILT_NOT_RUNNING for both; a missing binary is rare and still surfaces via doctor.
            const msg = tiltUnreachableMessage(portText);
            if (options.json) {
                console.log(JSON.stringify(createMachineEnvelope(null, [{ code: "TILT_NOT_RUNNING", message: msg }])));
                process.exit(1);
            }
            throw new FliskError(msg, ["Start the stack first with: flisk up"]);
        }
        const effectivePort = options.port !== undefined
            ? portText
            : resolveRuntimeTiltPort(root, { envPort: process.env.TILT_PORT });
        if (effectivePort === null) {
            const msg = tiltUnreachableMessage(portText);
            if (options.json) {
                console.log(JSON.stringify(createMachineEnvelope(null, [{ code: "TILT_NOT_RUNNING", message: msg }])));
                process.exit(1);
            }
            throw new FliskError(msg, ["Start the stack first with: flisk up"]);
        }
        const activePortText = String(effectivePort);
        // Generated Compose containers keep their image: `docker restart` of the labelled container stops and starts
        // the existing container, so no new tilt-<hash> image is built (#4192). Local-process (`command`) services,
        // logical/non-container resource types (`database`, `library`, `sdk`, `infra`), and --rebuild (which asks
        // for a full Tilt update and re-reads .env), plus imported Tiltfiles that own their orchestration and may not
        // use Flisk's Compose labels, all keep the original `tilt trigger` path.
        const isContainer = isGeneratedComposeContainer(resource);
        const rebuild = options.rebuild === true;
        let rebuilt = false;
        if (isContainer && !rebuild && !isTiltfileOrchestration(root)) {
            // `tilt version` only checks the binary. Confirm Tilt answers on the resolved port before
            // touching Docker, even if a container is still present after the stack has stopped.
            let tiltReachable = false;
            let enabledResources = null;
            try {
                const result = await runTilt("get", ["uiresources", "-o", "json", "--port", activePortText], {
                    inheritStdio: false,
                    timeoutMs: 5_000,
                });
                tiltReachable = result.exitCode === 0;
                if (tiltReachable) {
                    enabledResources = parseEnabledTiltResourceNames(result.stdout);
                }
            }
            catch {
                tiltReachable = false;
            }
            if (!tiltReachable) {
                const msg = tiltUnreachableMessage(activePortText);
                if (options.json) {
                    console.log(JSON.stringify(createMachineEnvelope(null, [{ code: "TILT_NOT_RUNNING", message: msg }])));
                    process.exit(1);
                }
                throw new FliskError(msg, ["Start the stack first with: flisk up"]);
            }
            try {
                const dependents = collectSidecarDependents(discovery.resources, resourceName).filter((dep) => enabledResources === null || enabledResources.has(dep.name));
                const targetsToRestart = [resource, ...dependents];
                for (const target of targetsToRestart) {
                    const stopGracePeriod = target.config?.container?.stopGracePeriod;
                    const targetStack = target.stack ?? resource.stack ?? target.name;
                    if (stopGracePeriod !== undefined) {
                        restartContainer(root, targetStack, target.name, undefined, {
                            stopGracePeriod,
                        });
                    }
                    else {
                        restartContainer(root, targetStack, target.name);
                    }
                }
            }
            catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                if (options.json) {
                    console.log(JSON.stringify(createMachineEnvelope(null, [{ code: "TILT_TRIGGER_FAILED", message: detail }])));
                    process.exit(1);
                }
                const suggestions = error instanceof FliskError
                    ? error.suggestions
                    : ["Check the container with: docker ps", "Read the logs with: flisk logs"];
                throw new FliskError(`Failed to restart ${resourceName}: ${detail}`, suggestions);
            }
        }
        else {
            const result = await runTilt("trigger", [resourceName, "--port", activePortText], {
                inheritStdio: false,
            });
            if (result.exitCode !== 0) {
                const detail = result.stderr.trim();
                if (!detail || isTiltConnectionFailure(detail)) {
                    const msg = tiltUnreachableMessage(activePortText);
                    if (options.json) {
                        console.log(JSON.stringify(createMachineEnvelope(null, [{ code: "TILT_NOT_RUNNING", message: msg }])));
                        process.exit(1);
                    }
                    throw new FliskError(msg, ["Start the stack first with: flisk up"]);
                }
                if (options.json) {
                    console.log(JSON.stringify(createMachineEnvelope(null, [{ code: "TILT_TRIGGER_FAILED", message: detail }])));
                    process.exit(1);
                }
                throw new FliskError(`Failed to restart ${resourceName}: ${detail}`, [
                    "Check that the stack is running with: flisk status",
                    `Read the resource logs with: flisk logs --service ${resourceName}`,
                ]);
            }
            rebuilt = true;
        }
        if (options.json) {
            console.log(JSON.stringify(createMachineEnvelope({ resource: resourceName, restarted: true })));
            return;
        }
        console.log(chalk.green(rebuilt ? `✓ Triggered restart for ${resourceName}` : `✓ Restarted ${resourceName}`));
    };
    if (options.json) {
        try {
            await action();
        }
        catch (err) {
            if (err instanceof ProcessExitError) {
                throw err;
            }
            writeMachineError(err);
        }
        return;
    }
    await runCommand(action);
});
