// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { Command } from "commander";
import { STANDARD_PORTS } from "../utils/constants.js";
import { errorFactories, runCommand, showErrorAndExit, TdkError } from "../utils/errors.js";
import { createMachineEnvelope } from "../utils/machine-output.js";
import { findProjectRoot } from "../utils/paths.js";
import {
  EnvUnreadableError,
  envSecretValues,
  redactSecrets,
  redactValue,
} from "../utils/secret-redaction.js";
import { isTiltAvailable, runTilt } from "../utils/tilt.js";
import {
  DEFAULT_LOG_TAIL,
  isTiltConnectionFailure,
  isValidPort,
  isValidSince,
  isValidTail,
  MAX_LOG_TAIL,
  parseTiltLogLines,
} from "../utils/tilt-logs.js";
import { tiltUnreachableMessage } from "../utils/tilt-unreachable-message.js";

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

export const logsCommand = new Command("logs")
  .description("Print a bounded snapshot of recent logs from the running stack")
  .option("-s, --service <names...>", "Only these services (Tilt resource names)")
  .option("--tail <n>", "Number of most recent lines to return", String(DEFAULT_LOG_TAIL))
  .option("--since <duration>", "Only logs newer than this duration, for example 30s, 5m, 1h")
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
        return new TdkError(message, redactedSuggestions, exitCode).exit();
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

      if (!(await isTiltAvailable())) {
        fail("TILT_MISSING", "Tilt is not installed. Run: flisk doctor");
      }
      if (services.length > 0) {
        const known = await tiltResourceNames(portText);
        const unknown = services.filter((name) => known && !known.includes(name));
        if (unknown.length > 0) {
          const error = errorFactories.unknownServices(unknown, known ?? []);
          const suggestions = error.suggestions;
          fail("UNKNOWN_SERVICE", error.message, error.exitCode, suggestions);
        }
      }
      const args = ["--port", portText, "--tail", String(tail)];
      if (options.since !== undefined) args.push("--since", options.since);
      if (options.json) args.push("--json");
      // `--` so a service name that starts with "-" is never read as a Tilt flag.
      if (services.length > 0) args.push("--", ...services);

      const result = await runTilt("logs", args, { inheritStdio: false });
      if (result.exitCode !== 0) {
        const detail = result.stderr.trim();
        if (!detail || isTiltConnectionFailure(detail)) {
          fail("TILT_NOT_RUNNING", tiltUnreachableMessage(portText));
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
