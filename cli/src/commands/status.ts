// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import chalk from "chalk";
import { Command } from "commander";
import type { DiscoveredResource, HostPortPlan, ServiceRuntimeState } from "../types/index.js";
import {
  describePlatformServices,
  isGatewayEnabled,
  reportedCapabilities,
} from "../utils/capabilities.js";
import { attachNoPositionalHint } from "../utils/command-helpers.js";
import { dependsOnOf } from "../utils/dependency-graph.js";
import { createDiscoveryContext } from "../utils/discovery-context.js";
import { findStaleDisabledResources, getDeferredResourceNames } from "../utils/doctor-runtime.js";
import { FliskError, runCommand } from "../utils/errors.js";
import { projectEnvLookup } from "../utils/extra-port-publish.js";
import { formatBytes, formatCount, showDetail, showStep } from "../utils/formatting.js";
import { getHostPortPlan, resolveRuntimeTiltPort } from "../utils/host-port-config.js";
import { inferNodeProject, inferredStateRoot } from "../utils/inferred-node-project.js";
import { createMachineEnvelope, writeMachineError } from "../utils/machine-output.js";
import {
  isNativeRunSupervisorAlive,
  nativeServiceStates,
  readNativeRunState,
} from "../utils/native-runtime.js";
import { isNativeProject, isNativeService } from "../utils/native-service.js";
import { findProjectRoot } from "../utils/paths.js";
import { resolveCommandProject } from "../utils/project-resolution.js";
import { relativeResourceFolder } from "../utils/resource-relative-path.js";
import { deriveServiceStates } from "../utils/service-runtime-state.js";
import {
  type ServiceUsage,
  type ServiceUsageMap,
  type ServiceUsageTarget,
  sampleServiceUsage,
} from "../utils/service-usage.js";
import { skippedServiceFiles } from "../utils/services.js";
import { groupSharedPostgres, readProjectName } from "../utils/shared-infra.js";
import {
  groupServicesByStack,
  hasNoOwnProcess,
  healthCountedResources,
  unhealthyServiceNames,
} from "../utils/status-groups.js";
import { buildServicePorts, buildStackPorts } from "../utils/status-ports.js";
import { isTiltAvailable, runTilt } from "../utils/tilt.js";
import { tiltAnswerIsForeign } from "../utils/tilt-answer-owner.js";
import { findTiltPortOwner } from "../utils/tilt-port-owner.js";
import { getTiltPollingPort } from "../utils/tilt-startup.js";
import { evaluateTiltReadiness, tiltGetUiResources } from "../utils/up-readiness.js";

/**
 * The services `--strict` fails on: the failing or still starting ones. Null when nothing of the project is running (no state
 * at all, or every service with a process of its own is unknown), which `--strict` fails on too. A project with no services
 * has nothing to wait for.
 */
export function strictNotReady(
  resources: readonly Pick<DiscoveredResource, "name" | "type">[],
  states: Record<string, ServiceRuntimeState> | null,
): string[] | null {
  const counted = healthCountedResources(resources, states);
  if (counted.length === 0) return [];
  if (!counted.some((resource) => (states?.[resource.name]?.status ?? "unknown") !== "unknown")) {
    return null;
  }
  return unhealthyServiceNames(resources, states);
}

/** `--strict` turns the answer into the exit code (#3826): output is unchanged, one line on stderr says why it is 1. */
function failStrictStatus(notReady: string[] | null): void {
  if (notReady === null) {
    console.error("flisk status --strict: nothing is running. Start it with: flisk up");
    process.exitCode = 1;
  } else if (notReady.length > 0) {
    console.error(
      `flisk status --strict: ${formatCount(notReady.length, "service")} not ready: ${notReady.join(", ")}`,
    );
    process.exitCode = 1;
  }
}

/** One compact suffix on a service line. `null` covers stopped services, Windows and unreadable samples. */
function formatServiceUsage(usage: ServiceUsage | null, platform: NodeJS.Platform): string {
  if (platform === "win32") return "usage: null (not available on Windows)";
  if (!usage) return "usage: null (not running)";
  const processes =
    usage.processes === null
      ? "process count not reported"
      : `${usage.processes} ${usage.processes === 1 ? "process" : "processes"}`;
  return `usage: ${usage.cpuPercent.toFixed(1)}% CPU, ${formatBytes(usage.rssBytes)} RSS, ${processes}`;
}

/** The services a usage sample should look for: recorded pids here, container names for Docker services. */
function usageTargets(
  resources: readonly { name: string; stack?: string | null }[],
  nativeStates: Record<string, { status?: string }> | null,
  nativeRunServices: Record<string, { pid?: number; container?: string }> | null,
  projectName: string | null,
): ServiceUsageTarget[] {
  return resources.map((resource) => {
    const recorded = nativeRunServices?.[resource.name];
    if (recorded?.container) return { name: resource.name, container: recorded.container };
    // A stale run.json can name a pid that the OS has since reused: do not sample it when the run is down.
    if (
      nativeStates &&
      nativeStates[resource.name]?.status !== "unknown" &&
      recorded?.pid !== undefined
    ) {
      // `flisk up` spawns each local service detached, so its pid is also its process-group id.
      return { name: resource.name, pid: recorded.pid, pgid: recorded.pid };
    }
    if (!nativeStates) {
      return {
        name: resource.name,
        docker: true,
        service: resource.name,
        ...(resource.stack && projectName
          ? {
              composeProject: `${projectName}-${resource.stack}-autogenerated`.toLowerCase(),
            }
          : {}),
      };
    }
    return { name: resource.name };
  });
}

export const statusCommand = attachNoPositionalHint(new Command("status"))
  .description("Show status of resources and stacks")
  .option("--json", "Output a versioned JSON status report", false)
  .option("-v, --verbose", "Show detailed information", false)
  .option("--stacks", "Show stack information (default)", true)
  .option("--stack <name>", "Only report services in this stack")
  .option("--resources", "Show all discovered resources", false)
  .option("--tilt", "Show Tilt resource status (Docker/Tilt stacks only)", false)
  .option("--no-gateway", "Disable gateway status reporting")
  .option("--unhealthy", "Show only services that are failing or still starting", false)
  .option("--strict", "Exit 1 when any service is not ready or nothing is running", false)
  .option("--usage", "Show CPU, memory and process usage per service", false)
  .option(
    "--project <path>",
    "Path to the Flisk project to report on (default: the current project)",
  )
  .addHelpText(
    "after",
    "\nExamples:\n  flisk status\n  flisk status --resources\n  flisk status --unhealthy\n  flisk status --usage\n  flisk status --json\n  flisk status --strict",
  )
  .action(async (options, command: Command) => {
    const project: string | undefined = options.project ?? command.optsWithGlobals().project;
    const action = async (): Promise<void> => {
      // Check for inferred Node project first, only when not explicitly targeting a project
      if (!project) {
        const inferredProject = inferNodeProject(process.cwd());
        if (inferredProject) {
          // An inferred project has no stacks, so a requested stack cannot match.
          if (options.stack) {
            throw new FliskError(`Unknown stack "${options.stack}".`, [
              "This project has no stacks. Run flisk status without --stack.",
            ]);
          }
          const stateRoot = inferredStateRoot(process.cwd());
          const runState = readNativeRunState(stateRoot);
          const runIsAlive = await isNativeRunSupervisorAlive(runState);
          const inferredUsage: ServiceUsageMap | null = options.usage
            ? await sampleServiceUsage([
                {
                  name: inferredProject.service.name,
                  pid: runState?.services[inferredProject.service.name]?.pid,
                },
              ])
            : null;

          if (!options.json) {
            showStep("Flisk Status\n");
            console.log(chalk.bold("Runtime:"), "local processes (no Docker, no Tilt)");
            console.log(
              `  ${runIsAlive ? "✓" : "…"} ${inferredProject.service.name} ${runIsAlive ? "ready" : "unknown"}\n`,
            );
            if (options.usage && process.platform === "win32") {
              showDetail("Usage is not available on Windows; every service reports usage: null.");
            }
            if (options.usage) {
              showDetail(
                formatServiceUsage(
                  inferredUsage?.[inferredProject.service.name] ?? null,
                  process.platform,
                ),
              );
            }
          }
          if (options.json) {
            console.log(
              JSON.stringify(
                createMachineEnvelope({
                  runtime: "native",
                  inferred: true,
                  tilt: {
                    available: false,
                    resourcesQueried: false,
                    resources: null,
                    readiness: null,
                    tiltfileError: null,
                    staleDisabled: [],
                  },
                  resourceCount: 1,
                  resources: [
                    {
                      name: inferredProject.service.name,
                      stack: null,
                      type: "backend",
                      port: inferredProject.service.config?.port ?? null,
                      status: runIsAlive ? "ready" : "unknown",
                      ...(options.usage
                        ? {
                            usage: inferredUsage?.[inferredProject.service.name] ?? null,
                          }
                        : {}),
                    },
                  ],
                }),
              ),
            );
          }
          if (options.strict) {
            failStrictStatus(runIsAlive ? [] : null);
          }
          return;
        }
      }

      const projectRoot = await resolveCommandProject({
        commandName: "status",
        project,
        json: options.json,
      });

      // Discover first: outside a project this fails before any status line is printed.
      const all = createDiscoveryContext();
      const stack = options.stack;
      const stacks = stack ? all.stacks.filter((entry) => entry.name === stack) : all.stacks;
      if (stack && !stacks.length) {
        throw new FliskError(`Unknown stack "${stack}".`, [
          "Use flisk stacks to list the available stacks.",
        ]);
      }
      const discovery = stack
        ? {
            ...all,
            stacks,
            resources: all.resources.filter((resource) => resource.stack === stack),
          }
        : all;
      const projectName = projectRoot ? readProjectName(projectRoot) : null;
      const sharedInfraGroup = projectName
        ? groupSharedPostgres(projectName, discovery.stacks, {
            projectRoot: projectRoot ?? undefined,
          })
        : null;
      // A project of `command` services runs as local processes: its state comes from the run on record, not from Tilt.
      // No Traefik runs then, so every service answers on localhost instead of an ingress route.
      const nativeProject = isNativeProject(all.resources);
      const nativeStates =
        projectRoot && nativeProject
          ? nativeServiceStates(
              projectRoot,
              discovery.resources.map((resource) => resource.name),
            )
          : null;
      const nativeRun = nativeStates && projectRoot ? readNativeRunState(projectRoot) : null;
      const gatewayEnabled = isGatewayEnabled(projectRoot, options);
      // A project of local processes runs no router and no database container, so its resources use neither.
      const platformServices = nativeProject
        ? []
        : describePlatformServices(projectRoot, discovery.resources, options);
      // `extraPorts` published through ${VAR:-default} resolve from the shell and the project .env, like Compose.
      const envLookup = projectEnvLookup(projectRoot ?? undefined);
      let tiltAvailable = false;
      if (!nativeStates) {
        try {
          tiltAvailable = await isTiltAvailable();
        } catch {
          // Tilt not available (spawn error)
          tiltAvailable = false;
        }
      }

      if (!options.json) {
        showStep("Flisk Status\n");
        if (nativeStates) {
          console.log(chalk.bold("Runtime:"), "local processes (no Docker, no Tilt)");
        } else {
          console.log(
            chalk.bold("Tilt:"),
            tiltAvailable ? chalk.green("available") : chalk.red("not found"),
          );

          if (!tiltAvailable) {
            showDetail("Install Tilt: https://docs.tilt.dev/install.html");
          }
        }

        if (options.usage && process.platform === "win32") {
          showDetail("Usage is not available on Windows; every service reports usage: null.");
        }

        console.log();
      }

      let tiltResources: unknown = null;
      let queryError: string | null = null;

      // A single look at the running Tilt, so a caller that started `flisk up` detached can poll for readiness. Null when no
      // Tilt answers or its output cannot be read.
      let readiness: ReturnType<typeof evaluateTiltReadiness>["result"] | null = null;
      // The same look at Tilt feeds readiness and each service's state, so `flisk status` and `flisk ui` cannot disagree.
      let serviceStates: Record<string, ServiceRuntimeState> | null = nativeStates;
      let staleDisabled: string[] = [];
      const tiltPort =
        (projectRoot
          ? resolveRuntimeTiltPort(projectRoot, { envPort: process.env.TILT_PORT })
          : null) ?? getTiltPollingPort(process.env.TILT_PORT);

      // Detect if another project's Tilt is on this port.
      let foreignTilt = false;
      let foreignTiltRoot: string | null = null;
      if (tiltAvailable && projectRoot) {
        const portOwner = findTiltPortOwner(tiltPort);
        if (portOwner && portOwner.root !== projectRoot) {
          foreignTilt = true;
          foreignTiltRoot = portOwner.root;
        }
      }

      // Port plan is best effort; service URLs are shown in both JSON and terminal output.
      let portPlan: HostPortPlan | null = null;
      try {
        const root = findProjectRoot();
        portPlan = root ? await getHostPortPlan(root, { inspectDocker: false }) : null;
      } catch {
        // Port planning failed; service URLs will be omitted from terminal output.
      }

      if (foreignTilt && options.json && options.tilt) {
        queryError = `the Tilt on port ${tiltPort}${foreignTiltRoot ? ` belongs to ${foreignTiltRoot}` : " runs another project"}, so this project is not running. Start it with: flisk up`;
      }

      if (tiltAvailable && !foreignTilt) {
        const text = await tiltGetUiResources(tiltPort);
        // `tilt get` has no -f flag; resources come from the running Tilt's API on its port, the same source as readiness.
        if (text) {
          // Check if this Tilt answer is from another project (has no resources of ours).
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
              // Only parse resources if we determined it's not foreign
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
            serviceStates = deriveServiceStates(
              text,
              Object.fromEntries(discovery.resources.map((r) => [r.name, dependsOnOf(r.config)])),
              deferred,
            );
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

      const tiltfileError: string | null =
        readiness?.failures.find((failure) => failure.name === "(Tiltfile)")?.message ?? null;

      // --usage is the only path that samples processes or containers; without it neither command runs.
      const usage: ServiceUsageMap | null = options.usage
        ? await sampleServiceUsage(
            usageTargets(
              discovery.resources,
              nativeStates,
              nativeRun?.services ?? null,
              projectName,
            ),
          )
        : null;

      if (options.json) {
        const foreignCode = foreignTilt ? "TILT_FOREIGN_PROJECT" : "TILT_STATUS_UNAVAILABLE";
        const errors = queryError ? [{ code: foreignCode, message: queryError }] : [];
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
        // Name the follow-up so an agent reads the cause (runtime output, not build steps) instead of guessing.
        const readinessOut = readiness
          ? {
              ...readiness,
              failures: readiness.failures.map((failure) =>
                failure.name === "(Tiltfile)"
                  ? failure
                  : { ...failure, next: `logs services=["${failure.name}"] source="runtime"` },
              ),
            }
          : readiness;
        const data = {
          // Only a project of local processes says so; a container project's report keeps its shape.
          ...(nativeStates ? { runtime: "native" } : {}),
          tilt: {
            available: tiltAvailable,
            // The project the Tilt data belongs to: this one, or null when no Tilt of ours answered.
            project: foreignTilt || !readiness ? null : (projectRoot ?? null),
            // Set when another project's Tilt holds the port, so a client can discard the port instead of this project.
            foreignProject: foreignTilt ? foreignTiltRoot : null,
            resourcesQueried: options.tilt && tiltAvailable && !foreignTilt,
            resources: tiltResources,
            readiness: readinessOut,
            tiltfileError,
            staleDisabled,
          },
          resourceCount: discovery.resources.length,
          resources: discovery.resources.map((resource) => ({
            name: resource.name,
            stack: resource.stack ?? null,
            type: resource.type ?? "unknown",
            port: resource.port ?? null,
            ...(projectRoot
              ? { path: relativeResourceFolder(projectRoot, resource.configPath) }
              : {}),
            ...buildServicePorts(
              resource,
              portPlan?.ingressHttp,
              { gateway: gatewayEnabled, native: nativeProject },
              envLookup,
            ),
            status: serviceStates?.[resource.name]?.status ?? "unknown",
            ...(serviceStates?.[resource.name]?.reason
              ? { statusReason: serviceStates[resource.name]?.reason }
              : {}),
            ...(serviceStates?.[resource.name]?.blockedBy
              ? { blockedBy: serviceStates[resource.name]?.blockedBy }
              : {}),
            ...(options.usage ? { usage: usage?.[resource.name] ?? null } : {}),
          })),
          ports: buildStackPorts(portPlan, tiltPort, {
            gateway: gatewayEnabled,
            native: nativeProject,
          }),
          stacks: discovery.stacks.map((stack) => ({
            name: stack.name,
            resourceCount: stack.resourceCount,
            resources: stack.resources.map((resource) => resource.name),
            healthyCount: stack.resources.filter(
              (resource) => serviceStates?.[resource.name]?.status === "ready",
            ).length,
            // What healthyCount is out of: resourceCount less any database with no process of its own.
            healthTotal: healthCountedResources(stack.resources, serviceStates).length,
          })),
          unassignedResources: discovery.unassignedResources.map((resource) => resource.name),
          // The service.json files discovery skipped (invalid JSON or fields), so `resources` is not silently short.
          ...skippedServiceFiles(discovery.problems, projectRoot),
          sharedInfra: sharedInfraGroup,
          platformServices,
          // A project of local processes starts neither shared container, so it reports no capability (#3873). Classify it from
          // every resource, not the --stack slice, so a filtered view reports what the whole project does.
          capabilities: reportedCapabilities(projectRoot, all.resources, options),
          // Names of the failing or pending services, so a caller need not filter `resources` itself.
          unhealthy: unhealthyServiceNames(discovery.resources, serviceStates),
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
        showDetail(
          "Fix the cause shown above. If Tilt does not pick the fix up, restart with flisk down and flisk up.",
        );
        console.log();
      }

      if (staleDisabled.length > 0 && !unhealthyOnly) {
        console.log();
        console.log(
          chalk.yellow(
            `⚠️  Tilt keeps ${formatCount(staleDisabled.length, "resource")} Disabled that the Tiltfile enables: ${staleDisabled.join(", ")}`,
          ),
        );
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
          console.log(
            chalk.yellow(
              `${formatCount(discovery.unassignedResources.length, "resource")} not in any stack:`,
            ),
          );
          if (options.verbose) {
            for (const resource of discovery.unassignedResources) {
              showDetail(`${resource.name}`);
            }
          }
        }
      }

      if (!unhealthyOnly) {
        console.log();
        console.log(chalk.bold("Platform services:"));
        if (nativeProject) {
          // Say what runs instead of naming a router and a database the runtime does not start.
          // A mixed run still starts its declared `image` containers with Docker, so do not deny those.
          const mixedRun = all.resources.some((resource) => !isNativeService(resource));
          showDetail(
            mixedRun
              ? "none: no platform-managed router or database; command services run as local processes on localhost, declared image services run as containers"
              : "none: services run as local processes on localhost (no router, no database container)",
          );
        } else {
          for (const service of platformServices) {
            showDetail(`${service.name}: ${service.reason}`);
          }
        }
      }

      if (sharedInfraGroup && !unhealthyOnly) {
        console.log();
        console.log(chalk.bold("Shared infrastructure:"));
        showDetail(
          `${sharedInfraGroup.name} (one instance, ${formatCount(sharedInfraGroup.databases.length, "database")})`,
        );
        for (const database of sharedInfraGroup.databases) {
          showDetail(
            `  ${database.name} (stack ${database.stack}): ${database.services.join(", ")}`,
          );
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
        for (const group of groupServicesByStack(
          discovery.stacks,
          discovery.unassignedResources,
          states,
        )) {
          const shown = group.resources.filter(
            (resource) => states[resource.name] && (!unhealthyOnly || unhealthy.has(resource.name)),
          );
          if (unhealthyOnly && shown.length === 0) continue;
          const summary = `${group.healthy}/${group.total} healthy`;
          showDetail(
            `${chalk.bold(group.name)}: ${group.healthy === group.total ? chalk.green(summary) : chalk.yellow(summary)}`,
          );
          for (const resource of shown) {
            const state = states[resource.name];
            if (!state) continue;
            const noOwnProcess = hasNoOwnProcess(resource, state);
            let mark = chalk.yellow("…");
            if (noOwnProcess) {
              mark = chalk.dim("-");
            } else if (state.status === "ready") {
              mark = chalk.green("✓");
            } else if (state.status === "error") {
              mark = chalk.red("✗");
            }
            const ports = buildServicePorts(
              resource,
              portPlan?.ingressHttp,
              { gateway: gatewayEnabled, native: nativeProject },
              envLookup,
            );
            const urlPart = ports.url ? ` → ${ports.url}` : "";
            const extraPart = ports.extraPorts.length
              ? `  ${chalk.dim(ports.extraPorts.map((p) => p.address).join(", "))}`
              : "";
            const usagePart = options.usage
              ? `  ${chalk.dim(formatServiceUsage(usage?.[resource.name] ?? null, process.platform))}`
              : "";
            showDetail(
              `${mark} ${resource.name}${urlPart}${extraPart}  ${noOwnProcess ? chalk.dim("no process of its own") : state.status}${state.reason ? ` (${state.reason})` : ""}${usagePart}`,
              6,
            );
          }
        }
      } else if (discovery.resources.length > 0) {
        // Without a running Tilt, no service state can be read. Say so instead of printing nothing.
        console.log();
        console.log(chalk.bold("Services:"));
        showDetail(
          foreignTilt
            ? `unknown: the Tilt on port ${tiltPort}${foreignTiltRoot ? ` belongs to ${foreignTiltRoot}` : " runs another project"}, so this project is not running. Start it with: flisk up`
            : `unknown: no Tilt answers on port ${tiltPort}, so nothing is confirmed running. Start with: flisk up`,
        );
        if (options.usage) {
          for (const resource of discovery.resources) {
            showDetail(
              `${resource.name}: ${formatServiceUsage(usage?.[resource.name] ?? null, process.platform)}`,
              6,
            );
          }
        }
      }

      if (options.tilt && tiltAvailable && !foreignTilt) {
        console.log();
        showStep("Tilt Resources:");

        const result = await runTilt("get", ["uiresources", "--port", String(tiltPort)], {
          inheritStdio: false,
        });

        if (result.exitCode === 0) {
          console.log(result.stdout || chalk.gray("  No active tilt resources"));
        } else {
          showDetail(`No Tilt is answering on port ${tiltPort}. Start it with: flisk up`);
        }
      } else if (options.tilt && foreignTilt) {
        console.log();
        showStep("Tilt Resources:");
        showDetail(
          `none for this project. The Tilt on port ${tiltPort}${foreignTiltRoot ? ` belongs to ${foreignTiltRoot}` : " runs another project"}.`,
        );
      } else if (options.tilt) {
        // No Tilt answers at all (always the case for projects that run as local processes), so
        // --tilt would otherwise print nothing extra. Give the reason instead of staying silent.
        console.log();
        showStep("Tilt Resources:");
        showDetail(
          "none. Tilt is not running, and projects that run as local processes do not use it. Start the stack with: flisk up",
        );
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
