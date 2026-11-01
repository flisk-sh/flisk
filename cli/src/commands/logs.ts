// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { Command } from "commander";
import type { DiscoveredResource } from "../types/index.js";
import { STANDARD_PORTS } from "../utils/constants.js";
import { dependsOnOf } from "../utils/dependency-graph.js";
import { getDeferredResourceNames } from "../utils/doctor-runtime.js";
import { runCommand, showErrorAndExit, errorFactories, FliskError } from "../utils/errors.js";
import { resolveRuntimeTiltPort } from "../utils/host-port-config.js";
import { createMachineEnvelope } from "../utils/machine-output.js";
import { nativeServiceStates, readNativeLogLines } from "../utils/native-runtime.js";
import { isNativeProject } from "../utils/native-service.js";
import { findProjectRoot } from "../utils/paths.js";
import {
  EnvUnreadableError,
  envSecretValues,
  redactSecrets,
  redactValue,
} from "../utils/secret-redaction.js";
import { deriveServiceStates } from "../utils/service-runtime-state.js";
import { discoverResourcesFromRoot } from "../utils/services.js";
import { unhealthyServiceNames } from "../utils/status-groups.js";
import { isTiltAvailable, runTilt } from "../utils/tilt.js";
import {
  DEFAULT_LOG_TAIL,
  isTiltConnectionFailure,
  isValidSince,
  isValidTail,
  MAX_LOG_TAIL,
  parseTiltLogLines,
  sinceMilliseconds,
} from "../utils/tilt-logs.js";
import { tiltUnreachableMessage } from "../utils/tilt-unreachable-message.js";
import { isValidPort } from "../utils/validation.js";

/** Resource names Tilt knows about, or null when they cannot be listed (the logs call then reports the real error). */
async function tiltResourceNames(port: string): Promise<string[] | null> {
  try {
    const result = await runTilt("get", ["uiresources", "-o", "json", "--port", port], {
      inheritStdio: false,
    });
    if (result.exitCode !== 0) return null;
    const items = (JSON.parse(result.stdout) as { items?: Array<{ metadata?: { name?: string } }> })
      .items;
    return (items ?? []).flatMap((item) => (item.metadata?.name ? [item.metadata.name] : []));
  } catch {
    return null;
  }
}

/** Raw `tilt get uiresources` JSON, or null when Tilt cannot be read. */
async function tiltResourcesJson(port: string): Promise<string | null> {
  try {
    const result = await runTilt("get", ["uiresources", "-o", "json", "--port", port], {
      inheritStdio: false,
    });
    return result.exitCode === 0 ? result.stdout : null;
  } catch {
    return null;
  }
}

/** Failing or pending services among the project's, from the running Tilt; null when Tilt cannot be read. */
async function tiltUnhealthyNames(projectRoot: string, port: string): Promise<string[] | null> {
  const text = await tiltResourcesJson(port);
  if (!text) return null;
  let resources: DiscoveredResource[] = [];
  try {
    resources = discoverResourcesFromRoot(projectRoot);
  } catch {
    // Without discovery there are no dependsOn edges; Tilt's own states still decide.
  }
  try {
    const states = deriveServiceStates(
      text,
      Object.fromEntries(resources.map((r) => [r.name, dependsOnOf(r.config)])),
      getDeferredResourceNames(resources),
    );
    return unhealthyServiceNames(
      Object.keys(states).map((name) => ({ name })),
      states,
    );
  } catch {
    return null;
  }
}

/** The project's services when every one declares `command` (they run as local processes), else null. */
function nativeResources(projectRoot: string): DiscoveredResource[] | null {
  try {
    const resources = discoverResourcesFromRoot(projectRoot);
    return isNativeProject(resources) ? resources : null;
  } catch {
    // Discovery problems are reported by the commands that start the stack; logs still asks Tilt.
    return null;
  }
}

export const logsCommand = new Command("logs")
  .description("Print a bounded snapshot of recent logs from the running stack")
  .showHelpAfterError("\nService names are not positional. Use: flisk logs --service <name>")
  .option("-s, --service <names...>", "Only these services (Tilt resource names)")
  .option("--tail <n>", "Number of most recent lines to return", String(DEFAULT_LOG_TAIL))
  .option("--since <duration>", "Only logs newer than this duration, for example 30s, 5m, 1h")
  .option("--unhealthy", "Only services that are failing or still starting", false)
  .option("--port <n>", "Tilt UI port (default: TILT_PORT or 10350)")
  .option("--json", "Output one JSON object and exit", false)
  .action(async (options) => {
    let secrets: string[] = [];
    const fail = (
      code: string,
      rawMessage: string,
      exitCode = 1,
      suggestions: string[] = [],
    ): never => {
      const message = redactSecrets(rawMessage, secrets);
      const redactedSuggestions = redactValue(suggestions, secrets);
      if (options.json) {
        console.log(
          JSON.stringify(
            createMachineEnvelope(null, [
              {
                code,
                message,
                ...(redactedSuggestions.length > 0 ? { suggestions: redactedSuggestions } : {}),
              },
            ]),
          ),
        );
        console.error(message);
        process.exit(exitCode);
      }
      if (redactedSuggestions.length > 0) {
        return new FliskError(message, redactedSuggestions, exitCode).exit();
      }
      return showErrorAndExit(message, exitCode);
    };

    if (!isValidTail(options.tail))
      fail("USAGE", `--tail must be an integer from 1 to ${MAX_LOG_TAIL}`, 2);
    if (options.since !== undefined && !isValidSince(options.since)) {
      fail("USAGE", "--since must be a duration such as 30s, 5m or 1h", 2);
    }
    const portText = options.port ?? process.env.TILT_PORT ?? String(STANDARD_PORTS.tiltUi);
    if (!isValidPort(portText)) fail("USAGE", "--port must be a valid port number", 2);
    const tail = Number(options.tail);
    const services: string[] = options.service ?? [];

    const reportAllHealthy = (): void => {
      if (options.json) {
        console.log(
          JSON.stringify(
            createMachineEnvelope({
              services,
              tail,
              since: options.since ?? null,
              lines: [],
              unhealthy: [],
            }),
          ),
        );
        return;
      }
      console.log("All services are healthy; nothing to show with --unhealthy.");
    };

    const action = async (): Promise<void> => {
      const projectRoot = findProjectRoot();
      if (!projectRoot) {
        // Same code `writeMachineError` gives this error in `down`, `stacks` and `resources`.
        const error = errorFactories.notInProject();
        return fail("COMMAND_FAILED", error.message, error.exitCode, error.suggestions);
      }

      try {
        secrets = envSecretValues(projectRoot);
      } catch (error) {
        if (!(error instanceof EnvUnreadableError)) throw error;
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
        let selected = services.length > 0 ? services : known;
        if (options.unhealthy) {
          const states = nativeServiceStates(projectRoot, known);
          const bad = new Set(unhealthyServiceNames(resources, states));
          selected = selected.filter((name) => bad.has(name));
          if (selected.length === 0) return reportAllHealthy();
        }
        const lines = readNativeLogLines(projectRoot, selected, {
          tail,
          sinceMs: options.since === undefined ? undefined : sinceMilliseconds(options.since),
        });
        if (options.json) {
          console.log(
            JSON.stringify(
              redactValue(
                createMachineEnvelope({ services, tail, since: options.since ?? null, lines }),
                secrets,
              ),
            ),
          );
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

      const effectivePort =
        options.port !== undefined
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
        if (bad === null) fail("TILT_NOT_RUNNING", tiltUnreachableMessage(activePortText));
        selectedServices =
          services.length > 0 ? services.filter((n) => bad?.includes(n)) : (bad ?? []);
        if (selectedServices.length === 0) return reportAllHealthy();
      }
      const args = ["--port", activePortText, "--tail", String(tail)];
      if (options.since !== undefined) args.push("--since", options.since);
      if (options.json) args.push("--json");
      // `--` so a service name that starts with "-" is never read as a Tilt flag.
      if (selectedServices.length > 0) args.push("--", ...selectedServices);

      const result = await runTilt("logs", args, { inheritStdio: false });
      if (result.exitCode !== 0) {
        const detail = result.stderr.trim();
        if (!detail || isTiltConnectionFailure(detail)) {
          fail("TILT_NOT_RUNNING", tiltUnreachableMessage(activePortText));
        }
        fail("TILT_LOGS_FAILED", `tilt logs failed: ${detail}`);
      }

      if (!options.json) {
        process.stdout.write(redactSecrets(result.stdout, secrets));
        return;
      }
      const lines = parseTiltLogLines(result.stdout, tail);
      console.log(
        JSON.stringify(
          redactValue(
            createMachineEnvelope({ services, tail, since: options.since ?? null, lines }),
            secrets,
          ),
        ),
      );
    };

    await runCommand(action);
  });
