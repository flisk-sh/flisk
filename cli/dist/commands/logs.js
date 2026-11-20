// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import { Command } from "commander";
import { attachNoPositionalHint } from "../utils/command-helpers.js";
import { STANDARD_PORTS } from "../utils/constants.js";
import { dependsOnOf } from "../utils/dependency-graph.js";
import { getDeferredResourceNames } from "../utils/doctor-runtime.js";
import { errorFactories, FliskError, runCommand, showErrorAndExit } from "../utils/errors.js";
import { resolveRuntimeTiltPort } from "../utils/host-port-config.js";
import { applyLogCursor, isValidCursor } from "../utils/log-cursors.js";
import { createMachineEnvelope } from "../utils/machine-output.js";
import { nativeServiceStates, readNativeLogLines } from "../utils/native-runtime.js";
import { isNativeProject } from "../utils/native-service.js";
import { resolveCommandProject } from "../utils/project-resolution.js";
import { EnvUnreadableError, envSecretValues, redactLogLines, redactSecrets, redactValue, } from "../utils/secret-redaction.js";
import { deriveServiceStates } from "../utils/service-runtime-state.js";
import { discoverResourcesFromRoot } from "../utils/services.js";
import { unhealthyServiceNames } from "../utils/status-groups.js";
import { isTiltAvailable, runTilt } from "../utils/tilt.js";
import { DEFAULT_LOG_TAIL, filterLogSource, isTiltConnectionFailure, isValidLogSource, isValidSince, isValidTail, LOG_SOURCES, MAX_LOG_TAIL, parseTiltLogLines, sinceMilliseconds, } from "../utils/tilt-logs.js";
import { tiltUnreachableMessage } from "../utils/tilt-unreachable-message.js";
import { isValidPort } from "../utils/validation.js";
/** Resource names Tilt knows about, or null when they cannot be listed (the logs call then reports the real error). */
async function tiltResourceNames(port) {
    try {
        const result = await runTilt("get", ["uiresources", "-o", "json", "--port", port], {
            inheritStdio: false,
        });
        if (result.exitCode !== 0)
            return null;
        const items = JSON.parse(result.stdout)
            .items;
        return (items ?? []).flatMap((item) => (item.metadata?.name ? [item.metadata.name] : []));
    }
    catch {
        return null;
    }
}
/** Raw `tilt get uiresources` JSON, or null when Tilt cannot be read. */
async function tiltResourcesJson(port) {
    try {
        const result = await runTilt("get", ["uiresources", "-o", "json", "--port", port], {
            inheritStdio: false,
        });
        return result.exitCode === 0 ? result.stdout : null;
    }
    catch {
        return null;
    }
}
/** Failing or pending services among the project's, from the running Tilt; null when Tilt cannot be read. */
async function tiltUnhealthyNames(projectRoot, port) {
    const text = await tiltResourcesJson(port);
    if (!text)
        return null;
    let resources = [];
    try {
        resources = discoverResourcesFromRoot(projectRoot);
    }
    catch {
        // Without discovery there are no dependsOn edges; Tilt's own states still decide.
    }
    try {
        const states = deriveServiceStates(text, Object.fromEntries(resources.map((r) => [r.name, dependsOnOf(r.config)])), getDeferredResourceNames(resources));
        return unhealthyServiceNames(Object.keys(states).map((name) => ({ name })), states);
    }
    catch {
        return null;
    }
}
/** The project's services when every one declares `command` (they run as local processes), else null. */
function nativeResources(projectRoot) {
    try {
        const resources = discoverResourcesFromRoot(projectRoot);
        return isNativeProject(resources) ? resources : null;
    }
    catch {
        // Discovery problems are reported by the commands that start the stack; logs still asks Tilt.
        return null;
    }
}
export const logsCommand = attachNoPositionalHint(new Command("logs"))
    .description("Print a bounded snapshot of recent logs from the running stack")
    .option("-s, --service <names...>", "Only these services (names as in flisk resources)")
    .option("-f, --follow", "Live follow is unavailable; use flisk ui or repeat with --since")
    .option("--tail <n>", "Number of most recent lines to return", String(DEFAULT_LOG_TAIL))
    .option("--since <duration>", "Only logs newer than this duration, for example 30s, 5m, 1h")
    .option("--after <cursor>", "Only lines with a sequence number greater than this cursor, returned as data.nextCursor by a previous --json read")
    .option("--source <source>", "Only runtime output (what the service printed) or build output (image build steps); a crash cause is in runtime")
    .option("--unhealthy", "Only services that are failing or still starting", false)
    .option("--port <n>", "Tilt UI port for Docker runtime (default: TILT_PORT, then the project's saved port, then 10350)")
    .option("--project <path>", "View logs for the Flisk project in this folder (default: the current project)")
    .option("--json", "Output one JSON object and exit", false)
    .addHelpText("after", "\nExamples:\n  flisk logs --tail 50\n  flisk logs --service orders-api --since 5m\n  flisk logs --unhealthy --json\n  flisk logs --service orders-api --source runtime --json\n  flisk logs --json --after 42")
    .action(async (options, command) => {
    let secrets = [];
    const fail = (code, rawMessage, exitCode = 1, suggestions = []) => {
        const message = redactSecrets(rawMessage, secrets);
        const redactedSuggestions = redactValue(suggestions, secrets);
        if (options.json) {
            console.log(JSON.stringify(createMachineEnvelope(null, [
                {
                    code,
                    message,
                    ...(redactedSuggestions.length > 0 ? { suggestions: redactedSuggestions } : {}),
                },
            ])));
            console.error(message);
            process.exit(exitCode);
        }
        if (redactedSuggestions.length > 0) {
            return new FliskError(message, redactedSuggestions, exitCode).exit();
        }
        return showErrorAndExit(message, exitCode);
    };
    if (options.follow) {
        fail("FOLLOW_NOT_SUPPORTED", "flisk logs prints a snapshot; live follow is not supported. Use flisk ui or repeat with --since 10s.");
    }
    if (!isValidTail(options.tail))
        fail("USAGE", `--tail must be an integer from 1 to ${MAX_LOG_TAIL}`, 2);
    if (options.since !== undefined && !isValidSince(options.since)) {
        fail("USAGE", "--since must be a duration such as 30s, 5m or 1h", 2);
    }
    if (options.after !== undefined && !isValidCursor(String(options.after))) {
        fail("USAGE", "--after must be a non-negative integer cursor from a previous logs read", 2);
    }
    if (options.source !== undefined && !isValidLogSource(options.source)) {
        fail("USAGE", `--source must be one of: ${LOG_SOURCES.join(", ")}`, 2);
    }
    const source = options.source;
    const portText = options.port ?? process.env.TILT_PORT ?? String(STANDARD_PORTS.tiltUi);
    if (!isValidPort(portText))
        fail("USAGE", "--port must be a valid port number", 2);
    const tail = Number(options.tail);
    const after = options.after === undefined ? undefined : Number(options.after);
    const services = options.service ?? [];
    const reportAllHealthy = () => {
        if (options.json) {
            console.log(JSON.stringify(createMachineEnvelope({
                services,
                tail,
                since: options.since ?? null,
                ...(source ? { source } : {}),
                lines: [],
                unhealthy: [],
                nextCursor: after ?? 0,
                truncated: false,
            })));
            return;
        }
        console.log("All services are healthy; nothing to show with --unhealthy.");
    };
    const action = async () => {
        const projectRoot = await resolveCommandProject({
            commandName: "logs",
            project: options.project ?? command.optsWithGlobals().project,
            json: options.json,
            onFail: (error) => fail("COMMAND_FAILED", error.message, error.exitCode, error.suggestions),
        });
        try {
            secrets = envSecretValues(projectRoot);
        }
        catch (error) {
            if (!(error instanceof EnvUnreadableError))
                throw error;
            fail("ENV_UNREADABLE", error.message, 1, [
                "Fix the read permission on .env, or move it out of the project",
            ]);
        }
        // A project of `command` services keeps its output in .flisk/native/logs, so no Tilt is involved.
        const resources = nativeResources(projectRoot);
        if (resources) {
            const known = resources.map((resource) => resource.name);
            const unknown = services.filter((name) => !known.includes(name));
            if (unknown.length > 0) {
                const error = errorFactories.unknownServices(unknown, known);
                fail("UNKNOWN_SERVICE", error.message, error.exitCode, error.suggestions);
            }
            // A local-process project has no Tilt to reach, so an idle run is not a "Tilt not running" error.
            // Report the actual state instead, with a runtime-neutral code and command to start the stack.
            const states = nativeServiceStates(projectRoot, known);
            const reported = states ? Object.values(states) : [];
            if (reported.length > 0 && reported.every((state) => state.status === "unknown")) {
                fail("SERVICES_NOT_RUNNING", "No services of this project are running. Start them with: flisk up");
            }
            let selected = services.length > 0 ? services : known;
            if (options.unhealthy) {
                const bad = new Set(unhealthyServiceNames(resources, states));
                selected = selected.filter((name) => bad.has(name));
                if (selected.length === 0)
                    return reportAllHealthy();
            }
            // Lines were masked when written; masking again covers a log from before a secret was added, and the guard masks a
            // private key that spans lines.
            const read = readNativeLogLines(projectRoot, selected, {
                tail: source ? MAX_LOG_TAIL : tail,
                sinceMs: options.since === undefined ? undefined : sinceMilliseconds(options.since),
            });
            // Number before redaction: a secret added later must not move a line's seq.
            const page = applyLogCursor((source ? filterLogSource(read, source) : read).slice(-tail), after);
            const lines = redactLogLines(page.lines, secrets);
            if (options.json) {
                console.log(JSON.stringify(redactValue(createMachineEnvelope({
                    services,
                    tail,
                    since: options.since ?? null,
                    ...(source ? { source } : {}),
                    lines,
                    nextCursor: page.nextCursor,
                    truncated: page.truncated,
                }), secrets)));
                return;
            }
            if (lines.length === 0) {
                const names = selected.join(", ");
                const window = options.since === undefined ? "" : ` in the last ${options.since}`;
                console.log(chalk.gray(`No log lines yet for ${names}. It may not have started, or it printed nothing${window}.`));
                return;
            }
            const width = Math.max(0, ...lines.map((line) => line.resource.length));
            for (const line of lines) {
                console.log(redactSecrets(`${line.resource.padEnd(width)} | ${line.text}`, secrets));
            }
            return;
        }
        if (!(await isTiltAvailable())) {
            fail("TILT_MISSING", "Tilt is not installed. Run: flisk doctor");
        }
        const effectivePort = options.port !== undefined
            ? portText
            : resolveRuntimeTiltPort(projectRoot, { envPort: process.env.TILT_PORT });
        if (effectivePort === null) {
            fail("TILT_NOT_RUNNING", tiltUnreachableMessage(portText));
        }
        const activePortText = String(effectivePort);
        if (services.length > 0) {
            const known = await tiltResourceNames(activePortText);
            const unknown = services.filter((name) => known && !known.includes(name));
            if (unknown.length > 0) {
                const error = errorFactories.unknownServices(unknown, known ?? []);
                const suggestions = error.suggestions;
                fail("UNKNOWN_SERVICE", error.message, error.exitCode, suggestions);
            }
        }
        let selectedServices = services;
        if (options.unhealthy) {
            const bad = await tiltUnhealthyNames(projectRoot, activePortText);
            if (bad === null)
                fail("TILT_NOT_RUNNING", tiltUnreachableMessage(activePortText));
            selectedServices =
                services.length > 0 ? services.filter((n) => bad?.includes(n)) : (bad ?? []);
            if (selectedServices.length === 0)
                return reportAllHealthy();
        }
        // A source filter needs structured lines, and the tail must count the lines kept, not the build output before them.
        const structured = Boolean(options.json) || source !== undefined;
        const args = ["--port", activePortText, "--tail", String(source ? MAX_LOG_TAIL : tail)];
        if (options.since !== undefined)
            args.push("--since", options.since);
        if (structured)
            args.push("--json");
        // `--` so a service name that starts with "-" is never read as a Tilt flag.
        if (selectedServices.length > 0)
            args.push("--", ...selectedServices);
        const result = await runTilt("logs", args, { inheritStdio: false });
        if (result.exitCode !== 0) {
            const detail = result.stderr.trim();
            if (!detail || isTiltConnectionFailure(detail)) {
                fail("TILT_NOT_RUNNING", tiltUnreachableMessage(activePortText));
            }
            fail("TILT_LOGS_FAILED", `tilt logs failed: ${detail}`);
        }
        if (!structured) {
            process.stdout.write(redactSecrets(result.stdout, secrets));
            return;
        }
        const parsed = parseTiltLogLines(result.stdout, source ? MAX_LOG_TAIL : tail);
        const page = applyLogCursor((source ? filterLogSource(parsed, source) : parsed).slice(-tail), after);
        const lines = redactLogLines(page.lines, secrets);
        if (!options.json) {
            const width = Math.max(0, ...lines.map((line) => line.resource?.length ?? 0));
            for (const line of lines) {
                console.log(redactSecrets(`${(line.resource ?? "").padEnd(width)} | ${line.text}`, secrets));
            }
            return;
        }
        console.log(JSON.stringify(redactValue(createMachineEnvelope({
            services,
            tail,
            since: options.since ?? null,
            ...(source ? { source } : {}),
            lines,
            nextCursor: page.nextCursor,
            truncated: page.truncated,
        }), secrets)));
    };
    await runCommand(action);
});
