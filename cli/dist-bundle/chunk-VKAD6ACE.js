import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  isTiltConnectionFailure,
  tiltUnreachableMessage
} from "./chunk-NVLGOUJZ.js";
import {
  resolveCommandProject
} from "./chunk-6NZBNZ32.js";
import {
  collectSidecarDependents,
  isGeneratedComposeContainer,
  parseEnabledTiltResourceNames,
  restartContainer
} from "./chunk-XPKSQX6T.js";
import {
  withFailureLogs
} from "./chunk-AD3ZB2GJ.js";
import {
  requestNativeRestart
} from "./chunk-4L23R74S.js";
import {
  isTiltfileOrchestration
} from "./chunk-RYTYYP36.js";
import {
  resolveRuntimeTiltPort
} from "./chunk-SYTFMWWH.js";
import {
  createDiscoveryContext
} from "./chunk-4EDXFYDP.js";
import {
  createMachineEnvelope,
  toMachineError,
  writeMachineError
} from "./chunk-3SNMUNQF.js";
import {
  isNativeProject
} from "./chunk-2BH5UW2N.js";
import {
  isValidPort
} from "./chunk-UPCGXTMS.js";
import {
  FliskError,
  ProcessExitError,
  STANDARD_PORTS,
  UnknownResourceError,
  isTiltAvailable,
  runCommand,
  runTilt,
  showErrorAndExit,
  source_default,
  unknownResourceSuggestions
} from "./chunk-73W4Y4TI.js";

// dist/commands/restart.js
import { Command } from "commander";
var restartCommand = new Command("restart").description("Restart a running resource in the stack").argument("<resource>", "Name of the resource (service) to restart").option("--port <n>", "Tilt UI port (default: TILT_PORT or 10350)").option("--rebuild", "Rebuild the image through Tilt instead of restarting the container", false).option("--project <path>", "Restart resources for the Flisk project in this folder (default: the current project)").option("--wait <seconds>", "Local processes: how long to wait for the service to be ready again (0: return once the restart has begun)", "60").option("--json", "Output one JSON object and exit", false).addHelpText("after", "\nExamples:\n  flisk restart orders-api\n  flisk restart orders-api --json\n  flisk restart orders-api --rebuild").action(async (resourceName, options, command) => {
  const portText = options.port ?? process.env.TILT_PORT ?? String(STANDARD_PORTS.tiltUi);
  if (!isValidPort(portText)) {
    const portSource = options.port !== void 0 ? "--port" : "TILT_PORT";
    const message = `${portSource} must be a valid port number`;
    if (options.json) {
      console.log(JSON.stringify(createMachineEnvelope(null, [{ code: "USAGE", message }])));
      console.error(message);
      process.exit(2);
    }
    showErrorAndExit(message, 2);
  }
  const action = async () => {
    const root = resolveCommandProject({
      commandName: "restart",
      project: options.project ?? command.optsWithGlobals().project,
      json: options.json
    });
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
    if (isNativeProject(discovery.resources)) {
      const waitSeconds = Number(options.wait);
      if (!Number.isFinite(waitSeconds) || waitSeconds < 0) {
        throw new FliskError("--wait must be a number of seconds, 0 or more", [
          "Pass --wait 60, or --wait 0 to return once the restart has begun"
        ]);
      }
      const outcome = await requestNativeRestart(root, resourceName, {
        waitMs: waitSeconds * 1e3
      });
      const fail = (code, message, logs = []) => {
        if (options.json) {
          console.log(JSON.stringify(createMachineEnvelope({
            ok: false,
            resource: resourceName,
            restarted: false,
            state: outcome.state,
            logs
          }, [{ code, message }])));
          process.exit(1);
        }
        throw new FliskError(message, [
          ...logs,
          `Read the output with: flisk logs --service ${resourceName}`
        ]);
      };
      if (outcome.state === "not-running") {
        return fail("NATIVE_NOT_RUNNING", `Cannot restart ${resourceName}: ${outcome.reason}. Start it with: flisk up`);
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
          ...outcome.pid ? { pid: outcome.pid } : {}
        })));
        return;
      }
      console.log(source_default.green(outcome.state === "ready" ? `\u2713 Restarted ${resourceName} (ready)` : `\u2713 Restarting ${resourceName}`));
      return;
    }
    let tiltAvailable = false;
    try {
      tiltAvailable = await isTiltAvailable();
    } catch {
      tiltAvailable = false;
    }
    if (!tiltAvailable) {
      const msg = tiltUnreachableMessage(portText);
      if (options.json) {
        console.log(JSON.stringify(createMachineEnvelope(null, [{ code: "TILT_NOT_RUNNING", message: msg }])));
        process.exit(1);
      }
      throw new FliskError(msg, ["Start the stack first with: flisk up"]);
    }
    const effectivePort = options.port !== void 0 ? portText : resolveRuntimeTiltPort(root, { envPort: process.env.TILT_PORT });
    if (effectivePort === null) {
      const msg = tiltUnreachableMessage(portText);
      if (options.json) {
        console.log(JSON.stringify(createMachineEnvelope(null, [{ code: "TILT_NOT_RUNNING", message: msg }])));
        process.exit(1);
      }
      throw new FliskError(msg, ["Start the stack first with: flisk up"]);
    }
    const activePortText = String(effectivePort);
    const isContainer = isGeneratedComposeContainer(resource);
    const rebuild = options.rebuild === true;
    let rebuilt = false;
    if (isContainer && !rebuild && !isTiltfileOrchestration(root)) {
      let tiltReachable = false;
      let enabledResources = null;
      try {
        const result = await runTilt("get", ["uiresources", "-o", "json", "--port", activePortText], {
          inheritStdio: false,
          timeoutMs: 5e3
        });
        tiltReachable = result.exitCode === 0;
        if (tiltReachable) {
          enabledResources = parseEnabledTiltResourceNames(result.stdout);
        }
      } catch {
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
          if (stopGracePeriod !== void 0) {
            restartContainer(root, targetStack, target.name, void 0, {
              stopGracePeriod
            });
          } else {
            restartContainer(root, targetStack, target.name);
          }
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (options.json) {
          console.log(JSON.stringify(createMachineEnvelope(null, [{ code: "TILT_TRIGGER_FAILED", message: detail }])));
          process.exit(1);
        }
        const suggestions = error instanceof FliskError ? error.suggestions : ["Check the container with: docker ps", "Read the logs with: flisk logs"];
        throw new FliskError(`Failed to restart ${resourceName}: ${detail}`, suggestions);
      }
    } else {
      const result = await runTilt("trigger", [resourceName, "--port", activePortText], {
        inheritStdio: false
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
          `Read the resource logs with: flisk logs --service ${resourceName}`
        ]);
      }
      rebuilt = true;
    }
    if (options.json) {
      console.log(JSON.stringify(createMachineEnvelope({ resource: resourceName, restarted: true })));
      return;
    }
    console.log(source_default.green(rebuilt ? `\u2713 Triggered restart for ${resourceName}` : `\u2713 Restarted ${resourceName}`));
  };
  if (options.json) {
    try {
      await action();
    } catch (err) {
      if (err instanceof ProcessExitError) {
        throw err;
      }
      writeMachineError(err);
    }
    return;
  }
  await runCommand(action);
});

export {
  restartCommand
};
