import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  tiltAnswerIsForeign
} from "./chunk-IGNCJRWD.js";
import {
  groupSharedPostgres,
  readProjectName
} from "./chunk-LBE4PCHL.js";
import {
  groupServicesByStack,
  hasNoOwnProcess,
  healthCountedResources,
  unhealthyServiceNames
} from "./chunk-Y2CU3YQP.js";
import {
  deriveServiceStates
} from "./chunk-7QB6HUN7.js";
import {
  resolveCommandProject
} from "./chunk-6NZBNZ32.js";
import {
  evaluateTiltReadiness,
  tiltGetUiResources
} from "./chunk-RD63MOSC.js";
import {
  findStaleDisabledResources,
  getDeferredResourceNames,
  getTiltPollingPort
} from "./chunk-KHTVPPO5.js";
import {
  inferNodeProject,
  inferredStateRoot
} from "./chunk-YJYXSQUB.js";
import {
  nativeServiceStates,
  readNativeRunState
} from "./chunk-4L23R74S.js";
import {
  getHostPortPlan,
  resolveRuntimeTiltPort
} from "./chunk-SYTFMWWH.js";
import {
  buildServicePorts,
  buildStackPorts
} from "./chunk-ZI7AIJRM.js";
import {
  findTiltPortOwner
} from "./chunk-KT6PYS2C.js";
import {
  describePlatformServices,
  getEnabledCapabilities,
  isGatewayEnabled
} from "./chunk-BH5IJ6AV.js";
import {
  createDiscoveryContext
} from "./chunk-4EDXFYDP.js";
import {
  attachNoPositionalHint
} from "./chunk-MJGDAK6E.js";
import {
  createMachineEnvelope,
  writeMachineError
} from "./chunk-3SNMUNQF.js";
import {
  dependsOnOf,
  isNativeProject,
  projectEnvLookup,
  skippedServiceFiles
} from "./chunk-2BH5UW2N.js";
import {
  formatCount,
  showDetail,
  showStep
} from "./chunk-ARPSTQFE.js";
import {
  FliskError,
  findProjectRoot,
  isTiltAvailable,
  runCommand,
  runTilt,
  source_default
} from "./chunk-73W4Y4TI.js";

// dist/commands/status.js
import { Command } from "commander";
function strictNotReady(resources, states) {
  const counted = healthCountedResources(resources, states);
  if (counted.length === 0)
    return [];
  if (!counted.some((resource) => (states?.[resource.name]?.status ?? "unknown") !== "unknown")) {
    return null;
  }
  return unhealthyServiceNames(resources, states);
}
function failStrictStatus(notReady) {
  if (notReady === null) {
    console.error("flisk status --strict: nothing is running. Start it with: flisk up");
    process.exitCode = 1;
  } else if (notReady.length > 0) {
    console.error(`flisk status --strict: ${formatCount(notReady.length, "service")} not ready: ${notReady.join(", ")}`);
    process.exitCode = 1;
  }
}
var statusCommand = attachNoPositionalHint(new Command("status")).description("Show status of resources and stacks").option("--json", "Output a versioned JSON status report", false).option("-v, --verbose", "Show detailed information", false).option("--stacks", "Show stack information (default)", true).option("--stack <name>", "Only report services in this stack").option("--resources", "Show all discovered resources", false).option("--tilt", "Show Tilt resource status (Docker/Tilt stacks only)", false).option("--no-gateway", "Disable gateway status reporting").option("--unhealthy", "Show only services that are failing or still starting", false).option("--strict", "Exit 1 when any service is not ready or nothing is running", false).option("--project <path>", "Show status for the Flisk project in this folder (default: the current project)").addHelpText("after", "\nExamples:\n  flisk status\n  flisk status --resources\n  flisk status --unhealthy\n  flisk status --json\n  flisk status --strict").action(async (options, command) => {
  const project = options.project ?? command.optsWithGlobals().project;
  const action = async () => {
    if (!project) {
      const inferredProject = inferNodeProject(process.cwd());
      if (inferredProject) {
        const stateRoot = inferredStateRoot(process.cwd());
        const runState = readNativeRunState(stateRoot);
        if (!options.json) {
          showStep("Flisk Status\n");
          console.log(source_default.bold("Runtime:"), "local processes (no Docker, no Tilt)");
          console.log(`  ${runState ? "\u2713" : "\u2026"} ${inferredProject.service.name} ${runState ? "ready" : "unknown"}
`);
        }
        if (options.json) {
          console.log(JSON.stringify(createMachineEnvelope({
            runtime: "native",
            inferred: true,
            tilt: {
              available: false,
              resourcesQueried: false,
              resources: null,
              readiness: null,
              tiltfileError: null,
              staleDisabled: []
            },
            resourceCount: 1,
            resources: [
              {
                name: inferredProject.service.name,
                stack: null,
                type: "backend",
                port: inferredProject.service.config?.port ?? null,
                status: runState ? "ready" : "unknown"
              }
            ]
          })));
        }
        if (options.strict) {
          failStrictStatus(runState ? [] : null);
        }
        return;
      }
    }
    const projectRoot = resolveCommandProject({
      commandName: "status",
      project,
      json: options.json
    });
    const all = createDiscoveryContext();
    const stack = options.stack;
    const stacks = stack ? all.stacks.filter((entry) => entry.name === stack) : all.stacks;
    if (stack && !stacks.length) {
      throw new FliskError(`Unknown stack "${stack}".`, [
        "Use flisk stacks to list the available stacks."
      ]);
    }
    const discovery = stack ? {
      ...all,
      stacks,
      resources: all.resources.filter((resource) => resource.stack === stack)
    } : all;
    const projectName = projectRoot ? readProjectName(projectRoot) : null;
    const sharedInfraGroup = projectName ? groupSharedPostgres(projectName, discovery.stacks, {
      projectRoot: projectRoot ?? void 0
    }) : null;
    const nativeProject = isNativeProject(all.resources);
    const nativeStates = projectRoot && nativeProject ? nativeServiceStates(projectRoot, discovery.resources.map((resource) => resource.name)) : null;
    const gatewayEnabled = isGatewayEnabled(projectRoot, options);
    const platformServices = describePlatformServices(projectRoot, discovery.resources, options);
    const envLookup = projectEnvLookup(projectRoot ?? void 0);
    let tiltAvailable = false;
    if (!nativeStates) {
      try {
        tiltAvailable = await isTiltAvailable();
      } catch {
        tiltAvailable = false;
      }
    }
    if (!options.json) {
      showStep("Flisk Status\n");
      if (nativeStates) {
        console.log(source_default.bold("Runtime:"), "local processes (no Docker, no Tilt)");
      } else {
        console.log(source_default.bold("Tilt:"), tiltAvailable ? source_default.green("available") : source_default.red("not found"));
        if (!tiltAvailable) {
          showDetail("Install Tilt: https://docs.tilt.dev/install.html");
        }
      }
      console.log();
    }
    let tiltResources = null;
    let queryError = null;
    let readiness = null;
    let serviceStates = nativeStates;
    let staleDisabled = [];
    const tiltPort = (projectRoot ? resolveRuntimeTiltPort(projectRoot, { envPort: process.env.TILT_PORT }) : null) ?? getTiltPollingPort(process.env.TILT_PORT);
    let foreignTilt = false;
    let foreignTiltRoot = null;
    if (tiltAvailable && projectRoot) {
      const portOwner = findTiltPortOwner(tiltPort);
      if (portOwner && portOwner.root !== projectRoot) {
        foreignTilt = true;
        foreignTiltRoot = portOwner.root;
      }
    }
    let portPlan = null;
    try {
      const root = findProjectRoot();
      portPlan = root ? await getHostPortPlan(root, { inspectDocker: false }) : null;
    } catch {
    }
    if (foreignTilt && options.json && options.tilt) {
      queryError = `the Tilt on port ${tiltPort}${foreignTiltRoot ? ` belongs to ${foreignTiltRoot}` : " runs another project"}, so this project is not running. Start it with: flisk up`;
    }
    if (tiltAvailable && !foreignTilt) {
      const text = await tiltGetUiResources(tiltPort);
      if (text) {
        const projectResourceNames = new Set(discovery.resources.map((r) => r.name));
        try {
          const parsed = JSON.parse(text);
          if (tiltAnswerIsForeign(parsed, projectResourceNames)) {
            foreignTilt = true;
            if (!projectRoot) {
              foreignTiltRoot = null;
            }
            if (options.json && options.tilt) {
              queryError = `another project's Tilt is running on port ${tiltPort}, so this project is not running. Start it with: flisk up`;
            }
          } else if (options.json && options.tilt) {
            tiltResources = parsed;
          }
        } catch (error) {
          if (options.json && options.tilt) {
            queryError = `Tilt returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`;
          }
        }
      } else if (options.json && options.tilt) {
        queryError = `No Tilt is answering on port ${tiltPort}. Start it with: flisk up`;
      }
      if (text && !foreignTilt) {
        const deferred = getDeferredResourceNames(discovery.resources);
        try {
          readiness = evaluateTiltReadiness(text, deferred).result;
        } catch {
          readiness = null;
        }
        try {
          serviceStates = deriveServiceStates(text, Object.fromEntries(discovery.resources.map((r) => [r.name, dependsOnOf(r.config)])), deferred);
        } catch {
          serviceStates = null;
        }
        try {
          staleDisabled = findStaleDisabledResources(text, projectRoot);
        } catch {
          staleDisabled = [];
        }
      }
    }
    const tiltfileError = readiness?.failures.find((failure) => failure.name === "(Tiltfile)")?.message ?? null;
    if (options.json) {
      const foreignCode = foreignTilt ? "TILT_FOREIGN_PROJECT" : "TILT_STATUS_UNAVAILABLE";
      const errors = queryError ? [{ code: foreignCode, message: queryError }] : [];
      if (nativeStates) {
        const states = Object.entries(nativeStates);
        const isRunning = states.some(([, state]) => state.status !== "unknown");
        readiness = isRunning ? {
          ready: states.every(([, state]) => state.status === "ready"),
          failures: [],
          pending: states.filter(([, state]) => state.status !== "ready").length,
          timedOut: false,
          enabled: states.map(([name]) => name)
        } : null;
      }
      const readinessOut = readiness ? {
        ...readiness,
        failures: readiness.failures.map((failure) => failure.name === "(Tiltfile)" ? failure : { ...failure, next: `logs services=["${failure.name}"] source="runtime"` })
      } : readiness;
      const data = {
        // Only a project of local processes says so; a container project's report keeps its shape.
        ...nativeStates ? { runtime: "native" } : {},
        tilt: {
          available: tiltAvailable,
          // The project the Tilt data belongs to: this one, or null when no Tilt of ours answered.
          project: foreignTilt || !readiness ? null : projectRoot ?? null,
          // Set when another project's Tilt holds the port, so a client can discard the port instead of this project.
          foreignProject: foreignTilt ? foreignTiltRoot : null,
          resourcesQueried: options.tilt && tiltAvailable && !foreignTilt,
          resources: tiltResources,
          readiness: readinessOut,
          tiltfileError,
          staleDisabled
        },
        resourceCount: discovery.resources.length,
        resources: discovery.resources.map((resource) => ({
          name: resource.name,
          stack: resource.stack ?? null,
          type: resource.type ?? "unknown",
          port: resource.port ?? null,
          ...buildServicePorts(resource, portPlan?.ingressHttp, { gateway: gatewayEnabled, native: nativeProject }, envLookup),
          status: serviceStates?.[resource.name]?.status ?? "unknown",
          ...serviceStates?.[resource.name]?.reason ? { statusReason: serviceStates[resource.name]?.reason } : {},
          ...serviceStates?.[resource.name]?.blockedBy ? { blockedBy: serviceStates[resource.name]?.blockedBy } : {}
        })),
        ports: buildStackPorts(portPlan, tiltPort, { gateway: gatewayEnabled }),
        stacks: discovery.stacks.map((stack2) => ({
          name: stack2.name,
          resourceCount: stack2.resourceCount,
          resources: stack2.resources.map((resource) => resource.name),
          healthyCount: stack2.resources.filter((resource) => serviceStates?.[resource.name]?.status === "ready").length,
          // What healthyCount is out of: resourceCount less any database with no process of its own.
          healthTotal: healthCountedResources(stack2.resources, serviceStates).length
        })),
        unassignedResources: discovery.unassignedResources.map((resource) => resource.name),
        // The service.json files discovery skipped (invalid JSON or fields), so `resources` is not silently short.
        ...skippedServiceFiles(discovery.problems, projectRoot),
        sharedInfra: sharedInfraGroup,
        platformServices,
        capabilities: getEnabledCapabilities(projectRoot, options),
        // Names of the failing or pending services, so a caller need not filter `resources` itself.
        unhealthy: unhealthyServiceNames(discovery.resources, serviceStates)
      };
      console.log(JSON.stringify(createMachineEnvelope(data, errors)));
      if (errors.length > 0) {
        console.error(queryError);
        process.exit(1);
      }
      if (options.strict) {
        failStrictStatus(strictNotReady(discovery.resources, serviceStates));
      }
      return;
    }
    console.log(source_default.bold("Resources:"), `${discovery.resources.length} discovered`);
    console.log(source_default.bold("Stacks:"), `${discovery.stacks.length} defined`);
    const hasStates = serviceStates !== null && Object.keys(serviceStates).length > 0;
    const unhealthyOnly = Boolean(options.unhealthy);
    if (tiltfileError && !unhealthyOnly) {
      console.log();
      console.log(source_default.red(`\u2717 Tilt could not reload the Tiltfile: ${tiltfileError}`));
      showDetail("Fix the cause shown above. If Tilt does not pick the fix up, restart with flisk down and flisk up.");
      console.log();
    }
    if (staleDisabled.length > 0 && !unhealthyOnly) {
      console.log();
      console.log(source_default.yellow(`\u26A0\uFE0F  Tilt keeps ${formatCount(staleDisabled.length, "resource")} Disabled that the Tiltfile enables: ${staleDisabled.join(", ")}`));
      showDetail("restart needed: `flisk down && flisk up`");
      console.log();
    }
    if (!hasStates && !unhealthyOnly) {
      for (const stack2 of discovery.stacks) {
        showDetail(`${stack2.name}: ${formatCount(stack2.resources.length, "resource")}`);
        if (options.verbose) {
          for (const resource of stack2.resources) {
            showDetail(`${resource.name}`, 6);
          }
        }
      }
      if (discovery.unassignedResources.length > 0) {
        console.log();
        console.log(source_default.yellow(`${formatCount(discovery.unassignedResources.length, "resource")} not in any stack:`));
        if (options.verbose) {
          for (const resource of discovery.unassignedResources) {
            showDetail(`${resource.name}`);
          }
        }
      }
    }
    if (!unhealthyOnly) {
      console.log();
      console.log(source_default.bold("Platform services:"));
      for (const service of platformServices) {
        showDetail(`${service.name}: ${service.reason}`);
      }
    }
    if (sharedInfraGroup && !unhealthyOnly) {
      console.log();
      console.log(source_default.bold("Shared infrastructure:"));
      showDetail(`${sharedInfraGroup.name} (one instance, ${formatCount(sharedInfraGroup.databases.length, "database")})`);
      for (const database of sharedInfraGroup.databases) {
        showDetail(`  ${database.name} (stack ${database.stack}): ${database.services.join(", ")}`);
      }
    }
    if (hasStates && serviceStates) {
      const states = serviceStates;
      console.log();
      console.log(source_default.bold(unhealthyOnly ? "Unhealthy services:" : "Services:"));
      const unhealthy = new Set(unhealthyServiceNames(discovery.resources, states));
      if (unhealthyOnly && unhealthy.size === 0) {
        showDetail(source_default.green("All services are healthy."));
      }
      for (const group of groupServicesByStack(discovery.stacks, discovery.unassignedResources, states)) {
        const shown = group.resources.filter((resource) => states[resource.name] && (!unhealthyOnly || unhealthy.has(resource.name)));
        if (unhealthyOnly && shown.length === 0)
          continue;
        const summary = `${group.healthy}/${group.total} healthy`;
        showDetail(`${source_default.bold(group.name)}: ${group.healthy === group.total ? source_default.green(summary) : source_default.yellow(summary)}`);
        for (const resource of shown) {
          const state = states[resource.name];
          if (!state)
            continue;
          const noOwnProcess = hasNoOwnProcess(resource, state);
          let mark = source_default.yellow("\u2026");
          if (noOwnProcess) {
            mark = source_default.dim("-");
          } else if (state.status === "ready") {
            mark = source_default.green("\u2713");
          } else if (state.status === "error") {
            mark = source_default.red("\u2717");
          }
          const ports = buildServicePorts(resource, portPlan?.ingressHttp, { gateway: gatewayEnabled, native: nativeProject }, envLookup);
          const urlPart = ports.url ? ` \u2192 ${ports.url}` : "";
          const extraPart = ports.extraPorts.length ? `  ${source_default.dim(ports.extraPorts.map((p) => p.address).join(", "))}` : "";
          showDetail(`${mark} ${resource.name}${urlPart}${extraPart}  ${noOwnProcess ? source_default.dim("no process of its own") : state.status}${state.reason ? ` (${state.reason})` : ""}`, 6);
        }
      }
    } else if (discovery.resources.length > 0) {
      console.log();
      console.log(source_default.bold("Services:"));
      showDetail(foreignTilt ? `unknown: the Tilt on port ${tiltPort}${foreignTiltRoot ? ` belongs to ${foreignTiltRoot}` : " runs another project"}, so this project is not running. Start it with: flisk up` : `unknown: no Tilt answers on port ${tiltPort}, so nothing is confirmed running. Start with: flisk up`);
    }
    if (options.tilt && tiltAvailable && !foreignTilt) {
      console.log();
      showStep("Tilt Resources:");
      const result = await runTilt("get", ["uiresources", "--port", String(tiltPort)], {
        inheritStdio: false
      });
      if (result.exitCode === 0) {
        console.log(result.stdout || source_default.gray("  No active tilt resources"));
      } else {
        showDetail(`No Tilt is answering on port ${tiltPort}. Start it with: flisk up`);
      }
    } else if (options.tilt && foreignTilt) {
      console.log();
      showStep("Tilt Resources:");
      showDetail(`none for this project. The Tilt on port ${tiltPort}${foreignTiltRoot ? ` belongs to ${foreignTiltRoot}` : " runs another project"}.`);
    } else if (options.tilt) {
      console.log();
      showStep("Tilt Resources:");
      showDetail("none. Tilt is not running, and projects that run as local processes do not use it. Start the stack with: flisk up");
    }
    console.log();
    showDetail('Run "flisk stacks" to see all stacks.');
    showDetail('Run "flisk up <stack-name>" to start a stack.');
    if (options.strict) {
      failStrictStatus(strictNotReady(discovery.resources, serviceStates));
    }
  };
  if (options.json) {
    try {
      await action();
    } catch (error) {
      writeMachineError(error);
    }
    return;
  }
  await runCommand(action);
});

export {
  strictNotReady,
  statusCommand
};
