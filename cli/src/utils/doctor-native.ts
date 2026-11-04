// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import type { CheckResult, DiscoveredResource } from "../types/index.js";
import { dependsOnOf } from "./dependency-graph.js";
import { formatCount } from "./formatting.js";
import { isDockerRunning, isNativeContainerService } from "./native-container.js";
import {
  findMissingPrograms,
  isPortListening,
  isProcessAlive,
  localUrl,
  planNativeRun,
  readNativeRunState,
} from "./native-runtime.js";
import { findOnPath } from "./which.js";

/**
 * Doctor checks for a project whose services all declare `command` (#2231). Such a project runs as local processes, so doctor
 * checks what those processes need (their programs, their dependsOn, their ports) instead of Docker, Compose and Tilt.
 */

/** Says which runtime doctor checked, so a missing Docker check reads as intended and not as forgotten. */
export function checkNativeRuntime(
  resources: readonly DiscoveredResource[],
  dockerRunning: () => boolean = isDockerRunning,
): CheckResult {
  const containers = resources.filter(isNativeContainerService).map((resource) => resource.name);
  if (containers.length > 0) {
    const running = dockerRunning();
    return {
      name: "Runtime",
      didPass: running,
      message: running
        ? `Local processes, plus ${formatCount(containers.length, "container")} (${containers.join(", ")}) started with docker run; Compose and Tilt are not needed`
        : `${containers.join(", ")} run from an image, which needs Docker, and Docker is not running`,
      ...(running ? {} : { fix: "Start Docker Desktop, OrbStack or Colima, then run flisk up" }),
    };
  }
  return {
    name: "Runtime",
    didPass: true,
    message: `Local processes: ${formatCount(resources.length, "service")} declare a command, so Docker, Compose and Tilt are not needed`,
  };
}

/** Each service's command starts a program that is installed. */
export function checkNativeCommands(
  resources: readonly DiscoveredResource[],
  find: (program: string) => string | null = findOnPath,
): CheckResult {
  const missing = findMissingPrograms(planNativeRun(resources).services, find);
  if (missing.length === 0) {
    return {
      name: "Service commands",
      didPass: true,
      message: "Every service command starts a program that is installed",
    };
  }
  return {
    name: "Service commands",
    didPass: false,
    message: `${formatCount(missing.length, "service")} run a program that is not on PATH:\n    ${missing.map(({ name, program }) => `${name}: ${program}`).join("\n    ")}`,
    fix: 'Install the program, or change "command" in the service.json',
  };
}

/** A dependsOn name must be another service of the project: local processes cannot start a database or gateway for it. */
export function checkNativeDependsOn(resources: readonly DiscoveredResource[]): CheckResult {
  const names = new Set(resources.map((resource) => resource.name));
  const problems = resources.flatMap((resource) => {
    return dependsOnOf(resource.config)
      .filter((dep) => !names.has(dep))
      .map((dep) => `${resource.name} dependsOn "${dep}", which is not a service of this project`);
  });
  if (problems.length === 0) {
    return {
      name: "Service dependencies",
      didPass: true,
      message: "Every dependsOn names a service of this project",
    };
  }
  return {
    name: "Service dependencies",
    didPass: false,
    message: problems.join("\n    "),
    fix: 'Add the missing service with a command, or with an "image" to run it as a container (a database, a cache), or remove it from dependsOn.',
  };
}

/**
 * When a native run is up, each service answers on its health URL (or accepts connections on its port). Skipped when nothing
 * runs: doctor is also used before the first `flisk up`.
 */
export async function checkNativeServiceHealth(
  projectRoot: string,
  resources: readonly DiscoveredResource[],
  timeoutMs: number,
): Promise<CheckResult> {
  const state = readNativeRunState(projectRoot);
  if (!state || !isProcessAlive(state.pid)) {
    return {
      name: "Service Health",
      didPass: true,
      isSkipped: true,
      message: "Not running - start it with flisk up",
    };
  }
  const failing: string[] = [];
  for (const plan of planNativeRun(resources).services) {
    if (plan.port === undefined) continue;
    const answered = plan.healthUrl
      ? await fetch(plan.healthUrl, { signal: AbortSignal.timeout(timeoutMs) })
          .then((response) => response.status < 400)
          .catch(() => false)
      : await isPortListening(plan.port, timeoutMs);
    if (!answered)
      failing.push(`${plan.name}: no answer from ${plan.healthUrl ?? localUrl(plan.port)}`);
  }
  if (failing.length === 0) {
    return {
      name: "Service Health",
      didPass: true,
      message: "Every running service answers",
    };
  }
  return {
    name: "Service Health",
    didPass: false,
    message: failing.join("\n    "),
    fix: "Read the service output in .flisk/native/logs/<service>.log, or the flisk up terminal",
  };
}
