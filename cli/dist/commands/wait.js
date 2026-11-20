// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import { Command } from "commander";
import { cliInvocation } from "../utils/cli-invocation.js";
import { dependsOnOf } from "../utils/dependency-graph.js";
import { createDiscoveryContext } from "../utils/discovery-context.js";
import { getDeferredResourceNames } from "../utils/doctor-runtime.js";
import { errorFactories, FliskError, ProcessExitError, runCommand } from "../utils/errors.js";
import { resolveRuntimeTiltPort } from "../utils/host-port-config.js";
import { createMachineEnvelope, writeMachineError } from "../utils/machine-output.js";
import { nativeServiceStates } from "../utils/native-runtime.js";
import { isNativeProject } from "../utils/native-service.js";
import { resolveCommandProject } from "../utils/project-resolution.js";
import { deriveServiceStates } from "../utils/service-runtime-state.js";
import { waitForServices, } from "../utils/service-wait.js";
import { isStartupStalled } from "../utils/startup-report.js";
import { isTiltAvailable } from "../utils/tilt.js";
import { tiltAnswerIsForeign } from "../utils/tilt-answer-owner.js";
import { getTiltPollingPort } from "../utils/tilt-startup.js";
import { getDisabledHealthResourceNames, healthProbeCannotRun, tiltGetUiResources, waitForTiltResourcesReady, } from "../utils/up-readiness.js";
import { fetchUnhealthyLogLines, formatUnhealthyLogTails, parseTimeoutSeconds, unhealthyLogTails, } from "../utils/up-wait.js";
/** The code and stderr line a failed wait reports in JSON mode. */
function errorCode(state) {
    if (state === "timeout")
        return "WAIT_TIMEOUT";
    if (state === "failed")
        return "WAIT_RESOURCE_FAILED";
    if (state === "unknown-service")
        return "UNKNOWN_SERVICE";
    return "COMMAND_FAILED";
}
function printLogTails(result) {
    const tails = result.services.flatMap((service) => service.logs && service.logs.length > 0 ? [{ name: service.name, lines: service.logs }] : []);
    for (const line of formatUnhealthyLogTails(tails))
        console.error(line);
    const shown = new Set(tails.map((tail) => tail.name));
    for (const name of result.unhealthy) {
        if (!shown.has(name)) {
            console.error(`  ${name}: last logs unavailable. See: flisk logs --service ${name}`);
        }
    }
}
export const waitCommand = new Command("wait")
    .description("Wait until services are healthy")
    .argument("[services...]", "Only wait for these services (default: every service)")
    .option("--timeout <seconds>", "How long to wait before giving up (default: 1800)", "1800")
    .option("--json", "Output one JSON envelope with every service's state", false)
    .option("--project <path>", "Wait for the Flisk project in this folder (default: the current project)")
    .addHelpText("after", "\nExamples:\n  flisk wait\n  flisk wait orders-api\n  flisk wait orders-api orders-web --timeout 60\n  flisk wait --json")
    .action(async (services, options, command) => {
    const project = options.project ?? command.optsWithGlobals().project;
    const parsed = parseTimeoutSeconds(options.timeout, "--timeout");
    if (!parsed.ok) {
        if (options.json) {
            console.log(JSON.stringify(createMachineEnvelope(null, [{ code: "USAGE", message: parsed.message }])));
            console.error(parsed.message);
            process.exit(2);
        }
        throw new FliskError(parsed.message, [], 2);
    }
    const timeoutSeconds = parsed.seconds;
    const action = async () => {
        const projectRoot = resolveCommandProject({
            commandName: "wait",
            project,
            json: options.json,
        });
        const all = createDiscoveryContext();
        const resources = all.resources;
        const selected = services.length > 0 ? services : resources.map((resource) => resource.name);
        const native = isNativeProject(resources);
        const deferred = getDeferredResourceNames(resources);
        let lastTiltText = null;
        const snapshot = async () => {
            if (native && projectRoot) {
                const states = nativeServiceStates(projectRoot, selected);
                return { states };
            }
            let tiltAvailable = false;
            try {
                tiltAvailable = await isTiltAvailable();
            }
            catch {
                tiltAvailable = false;
            }
            if (!tiltAvailable) {
                throw new FliskError("Tilt CLI is not installed", [
                    "Install Tilt: https://docs.tilt.dev/install.html",
                    "Local-process projects do not need Tilt",
                ]);
            }
            const port = (projectRoot
                ? resolveRuntimeTiltPort(projectRoot, { envPort: process.env.TILT_PORT })
                : null) ?? getTiltPollingPort(process.env.TILT_PORT);
            const projectNames = new Set(resources.map((resource) => resource.name));
            let foreign = false;
            const fetchJson = async (tiltPort) => {
                const text = await tiltGetUiResources(tiltPort);
                if (!text)
                    return null;
                if (tiltAnswerIsForeign(JSON.parse(text), projectNames)) {
                    foreign = true;
                    return null;
                }
                lastTiltText = text;
                return text;
            };
            const readiness = await waitForTiltResourcesReady(port, {
                timeoutMs: timeoutSeconds * 1000,
                deferred,
                disabledHealth: getDisabledHealthResourceNames(resources),
                probeCannotRun: healthProbeCannotRun,
                expected: selected.filter((name) => !deferred.has(name)),
                isStalled: (text) => isStartupStalled(text, dependsOnMap(resources), deferred),
                fetchJson,
            });
            const states = lastTiltText
                ? deriveServiceStates(lastTiltText, dependsOnMap(resources), deferred)
                : {};
            if (foreign) {
                return {
                    states,
                    readiness: {
                        ...readiness,
                        ready: false,
                        failures: selected.map((name) => ({
                            name,
                            message: "another project's Tilt is answering",
                        })),
                    },
                    settled: true,
                };
            }
            // `waitForTiltResourcesReady` already did the bounded polling, so a second look cannot help.
            return { states, readiness, settled: true };
        };
        const result = await waitForServices(resources, services, timeoutSeconds, {
            snapshot,
            fetchLogTails: async (names) => {
                const lines = await fetchUnhealthyLogLines(cliInvocation, projectRoot ?? process.cwd());
                const wanted = new Set(names);
                return unhealthyLogTails((lines ?? []).filter((line) => line.resource && wanted.has(line.resource)));
            },
        });
        if (options.json) {
            const unknownError = result.state === "unknown-service"
                ? errorFactories.unknownServices(result.unknown ?? [], resources.map((r) => r.name))
                : null;
            const errors = result.state === "ready"
                ? []
                : [
                    {
                        code: errorCode(result.state),
                        message: unknownError ? unknownError.message : `flisk wait: ${result.message}`,
                        ...(unknownError ? { suggestions: unknownError.suggestions } : {}),
                    },
                ];
            console.log(JSON.stringify(createMachineEnvelope({
                ok: result.ready,
                state: result.state,
                ready: result.ready,
                timeoutSeconds,
                runtime: native ? "native" : "docker",
                services: result.services,
                unhealthy: result.unhealthy,
                ...(result.unknown ? { unknown: result.unknown } : {}),
            }, errors)));
            if (result.state === "unknown-service") {
                console.error(unknownError?.message ?? result.message);
                process.exit(2);
            }
            if (!result.ready) {
                console.error(`flisk wait: ${result.message}`);
                printLogTails(result);
                process.exit(1);
            }
            return result;
        }
        if (result.state === "unknown-service") {
            throw errorFactories.unknownServices(result.unknown ?? [], resources.map((resource) => resource.name));
        }
        if (!result.ready) {
            console.error(chalk.red(`flisk wait: ${result.message}`));
            printLogTails(result);
            throw new FliskError(result.message, result.services.map((service) => `See: flisk logs --service ${service.name}`));
        }
        console.log(chalk.green(`✓ ${result.message}`));
        for (const service of result.services) {
            console.log(`  ${service.status === "ready" ? "✓" : "…"} ${service.name}: ${service.status}`);
        }
        return result;
    };
    if (options.json) {
        try {
            await action();
        }
        catch (error) {
            // An intentional `process.exit` (a test double throws here) already printed the envelope.
            if (error instanceof ProcessExitError)
                throw error;
            writeMachineError(error);
        }
        return;
    }
    await runCommand(action);
});
/** The dependency map `deriveServiceStates` and `up --wait` both use to decide whether a service is really ready. */
function dependsOnMap(resources) {
    return Object.fromEntries(resources.map((resource) => [resource.name, dependsOnOf(resource.config)]));
}
