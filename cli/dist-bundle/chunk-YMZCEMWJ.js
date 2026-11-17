import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  DEFAULT_LOG_TAIL,
  LOG_SOURCES,
  MAX_LOG_TAIL,
  filterLogSource,
  isTiltConnectionFailure,
  isValidLogSource,
  isValidSince,
  isValidTail,
  parseTiltLogLines,
  sinceMilliseconds,
  tiltUnreachableMessage
} from "./chunk-NVLGOUJZ.js";
import {
  unhealthyServiceNames
} from "./chunk-Y2CU3YQP.js";
import {
  deriveServiceStates
} from "./chunk-7QB6HUN7.js";
import {
  resolveCommandProject
} from "./chunk-6NZBNZ32.js";
import {
  getDeferredResourceNames
} from "./chunk-KHTVPPO5.js";
import {
  nativeServiceStates,
  readNativeLogLines
} from "./chunk-4L23R74S.js";
import {
  resolveRuntimeTiltPort
} from "./chunk-SYTFMWWH.js";
import {
  attachNoPositionalHint
} from "./chunk-MJGDAK6E.js";
import {
  createMachineEnvelope
} from "./chunk-3SNMUNQF.js";
import {
  EnvUnreadableError,
  dependsOnOf,
  discoverResourcesFromRoot,
  envSecretValues,
  isNativeProject,
  redactLogLines,
  redactSecrets,
  redactValue
} from "./chunk-2BH5UW2N.js";
import {
  isValidPort
} from "./chunk-UPCGXTMS.js";
import {
  FliskError,
  STANDARD_PORTS,
  errorFactories,
  isTiltAvailable,
  runCommand,
  runTilt,
  showErrorAndExit,
  source_default
} from "./chunk-73W4Y4TI.js";

// dist/commands/logs.js
import { Command } from "commander";
async function tiltResourceNames(port) {
  try {
    const result = await runTilt("get", ["uiresources", "-o", "json", "--port", port], {
      inheritStdio: false
    });
    if (result.exitCode !== 0)
      return null;
    const items = JSON.parse(result.stdout).items;
    return (items ?? []).flatMap((item) => item.metadata?.name ? [item.metadata.name] : []);
  } catch {
    return null;
  }
}
async function tiltResourcesJson(port) {
  try {
    const result = await runTilt("get", ["uiresources", "-o", "json", "--port", port], {
      inheritStdio: false
    });
    return result.exitCode === 0 ? result.stdout : null;
  } catch {
    return null;
  }
}
async function tiltUnhealthyNames(projectRoot, port) {
  const text = await tiltResourcesJson(port);
  if (!text)
    return null;
  let resources = [];
  try {
    resources = discoverResourcesFromRoot(projectRoot);
  } catch {
  }
  try {
    const states = deriveServiceStates(text, Object.fromEntries(resources.map((r) => [r.name, dependsOnOf(r.config)])), getDeferredResourceNames(resources));
    return unhealthyServiceNames(Object.keys(states).map((name) => ({ name })), states);
  } catch {
    return null;
  }
}
function nativeResources(projectRoot) {
  try {
    const resources = discoverResourcesFromRoot(projectRoot);
    return isNativeProject(resources) ? resources : null;
  } catch {
    return null;
  }
}
var logsCommand = attachNoPositionalHint(new Command("logs")).description("Print a bounded snapshot of recent logs from the running stack").option("-s, --service <names...>", "Only these services (names as in flisk resources)").option("--tail <n>", "Number of most recent lines to return", String(DEFAULT_LOG_TAIL)).option("--since <duration>", "Only logs newer than this duration, for example 30s, 5m, 1h").option("--source <source>", "Only runtime output (what the service printed) or build output (image build steps); a crash cause is in runtime").option("--unhealthy", "Only services that are failing or still starting", false).option("--port <n>", "Tilt UI port for Docker runtime (default: TILT_PORT, then the project's saved port, then 10350)").option("--project <path>", "View logs for the Flisk project in this folder (default: the current project)").option("--json", "Output one JSON object and exit", false).addHelpText("after", "\nExamples:\n  flisk logs --tail 50\n  flisk logs --service orders-api --since 5m\n  flisk logs --unhealthy --json\n  flisk logs --service orders-api --source runtime --json").action(async (options, command) => {
  let secrets = [];
  const fail = (code, rawMessage, exitCode = 1, suggestions = []) => {
    const message = redactSecrets(rawMessage, secrets);
    const redactedSuggestions = redactValue(suggestions, secrets);
    if (options.json) {
      console.log(JSON.stringify(createMachineEnvelope(null, [
        {
          code,
          message,
          ...redactedSuggestions.length > 0 ? { suggestions: redactedSuggestions } : {}
        }
      ])));
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
  if (options.since !== void 0 && !isValidSince(options.since)) {
    fail("USAGE", "--since must be a duration such as 30s, 5m or 1h", 2);
  }
  if (options.source !== void 0 && !isValidLogSource(options.source)) {
    fail("USAGE", `--source must be one of: ${LOG_SOURCES.join(", ")}`, 2);
  }
  const source = options.source;
  const portText = options.port ?? process.env.TILT_PORT ?? String(STANDARD_PORTS.tiltUi);
  if (!isValidPort(portText))
    fail("USAGE", "--port must be a valid port number", 2);
  const tail = Number(options.tail);
  const services = options.service ?? [];
  const reportAllHealthy = () => {
    if (options.json) {
      console.log(JSON.stringify(createMachineEnvelope({
        services,
        tail,
        since: options.since ?? null,
        ...source ? { source } : {},
        lines: [],
        unhealthy: []
      })));
      return;
    }
    console.log("All services are healthy; nothing to show with --unhealthy.");
  };
  const action = async () => {
    const projectRoot = resolveCommandProject({
      commandName: "logs",
      project: options.project ?? command.optsWithGlobals().project,
      json: options.json,
      onFail: (error) => fail("COMMAND_FAILED", error.message, error.exitCode, error.suggestions)
    });
    try {
      secrets = envSecretValues(projectRoot);
    } catch (error) {
      if (!(error instanceof EnvUnreadableError))
        throw error;
      fail("ENV_UNREADABLE", error.message, 1, [
        "Fix the read permission on .env, or move it out of the project"
      ]);
    }
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
        if (selected.length === 0)
          return reportAllHealthy();
      }
      const read = readNativeLogLines(projectRoot, selected, {
        tail: source ? MAX_LOG_TAIL : tail,
        sinceMs: options.since === void 0 ? void 0 : sinceMilliseconds(options.since)
      });
      const lines2 = redactLogLines((source ? filterLogSource(read, source) : read).slice(-tail), secrets);
      if (options.json) {
        console.log(JSON.stringify(redactValue(createMachineEnvelope({
          services,
          tail,
          since: options.since ?? null,
          ...source ? { source } : {},
          lines: lines2
        }), secrets)));
        return;
      }
      if (lines2.length === 0) {
        const names = selected.join(", ");
        const window = options.since === void 0 ? "" : ` in the last ${options.since}`;
        console.log(source_default.gray(`No log lines yet for ${names}. It may not have started, or it printed nothing${window}.`));
        return;
      }
      const width = Math.max(0, ...lines2.map((line) => line.resource.length));
      for (const line of lines2) {
        console.log(redactSecrets(`${line.resource.padEnd(width)} | ${line.text}`, secrets));
      }
      return;
    }
    if (!await isTiltAvailable()) {
      fail("TILT_MISSING", "Tilt is not installed. Run: flisk doctor");
    }
    const effectivePort = options.port !== void 0 ? portText : resolveRuntimeTiltPort(projectRoot, { envPort: process.env.TILT_PORT });
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
      selectedServices = services.length > 0 ? services.filter((n) => bad?.includes(n)) : bad ?? [];
      if (selectedServices.length === 0)
        return reportAllHealthy();
    }
    const structured = Boolean(options.json) || source !== void 0;
    const args = ["--port", activePortText, "--tail", String(source ? MAX_LOG_TAIL : tail)];
    if (options.since !== void 0)
      args.push("--since", options.since);
    if (structured)
      args.push("--json");
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
    const lines = redactLogLines((source ? filterLogSource(parsed, source) : parsed).slice(-tail), secrets);
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
      ...source ? { source } : {},
      lines
    }), secrets)));
  };
  await runCommand(action);
});

export {
  logsCommand
};
