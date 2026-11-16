// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import type { CheckResult } from "../types/index.js";
import { isGatewayEnabled } from "./capabilities.js";
import { checkDockerBuildCache } from "./docker-build-cache.js";
import { checkDockerFileSharing } from "./docker-file-sharing.js";
import { belongsToProject, type DockerRun, runDocker } from "./doctor-crashloop.js";
import type { DoctorCheckFn } from "./doctor-runner.js";
import {
  summarizeAdvertisedProbes,
  summarizeServiceProbes,
  summarizeSmokeResults,
} from "./doctor-runtime.js";
import { checkStarlarkLoadExports } from "./doctor-starlark.js";
import { isExecTimeout } from "./exec-async.js";
import { formatCount } from "./formatting.js";
import { findProjectRoot } from "./paths.js";
import { checkPublicEnvSecrets } from "./public-env-secrets.js";
import {
  buildAdvertisedTargets,
  buildHealthTargets,
  getProjectName,
  pingHealthTargets,
} from "./service-urls.js";
import { discoverResourcesFromRoot } from "./services.js";
import { buildSmokePlans, readOnlySmokePlans, runSmokePlans, safeSmokeDeps } from "./smoke.js";

export {
  checkIngressPorts,
  checkPrivateNpmRegistry,
  checkTiltResourceHealth,
  summarizeServiceProbes,
  summarizeTiltBuildError,
} from "./doctor-runtime.js";
export {
  checkDockerBuildCache,
  checkDockerFileSharing,
  checkPublicEnvSecrets,
  checkStarlarkLoadExports,
};

const MEM_NEAR_LIMIT_PCT = 90;
const CPU_HANGING_PCT = 80;

interface ContainerStat {
  name: string;
  memPct: number;
  cpuPct: number;
}

function parseDockerStats(raw: string): ContainerStat[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, memPctRaw, cpuPctRaw] = line.split(",");
      return {
        name: name ?? "unknown",
        memPct: Number.parseFloat((memPctRaw ?? "").replace(/%/g, "")),
        cpuPct: Number.parseFloat((cpuPctRaw ?? "").replace(/%/g, "")),
      };
    })
    .filter((stat) => Number.isFinite(stat.memPct) && Number.isFinite(stat.cpuPct));
}

/**
 * Flags containers pinned near their memory limit while also burning CPU --
 * the signature of a boot-time process stuck in a retry/fetch loop, not a
 * genuine crash (which would just exit, not sit at ~100% resource usage).
 *
 * Caught in this workspace: a backend runtime image missing the local Prisma
 * CLI fell back to `bunx prisma`, which re-fetched prisma@latest from npm on
 * every container start. That pinned a 512MB container at ~100% memory and
 * 100%+ CPU indefinitely, and it never became healthy. Neither `docker ps`
 * (just shows "unhealthy") nor the healthcheck's own retry loop surfaces
 * *why* -- only live resource stats catch this pattern before it's mistaken
 * for a slow migration or a flaky healthcheck.
 */
export async function checkContainerResourceHealthFor(
  projectName: string,
  run: DockerRun = runDocker,
): Promise<CheckResult> {
  let raw: string;
  try {
    // `docker stats` samples CPU twice (~2 s) and covers every container on the machine, so
    // list this project's running containers first (fast) and only sample those.
    const listing = await run([
      "ps",
      "--format",
      '{{.ID}}\t{{.Label "com.docker.compose.project"}}',
    ]);
    const ids = listing
      .split(/\r?\n/)
      .map((line) => line.split("\t"))
      .filter(([id, project]) => id && project && belongsToProject(project, projectName))
      .map(([id]) => id as string);
    if (ids.length === 0) {
      return {
        name: "Container Resource Health",
        didPass: true,
        isSkipped: true,
        message: "No running containers to check",
      };
    }
    raw = await run([
      "stats",
      "--no-stream",
      "--format",
      "{{.Name}},{{.MemPerc}},{{.CPUPerc}}",
      ...ids,
    ]);
  } catch (err) {
    return {
      name: "Container Resource Health",
      didPass: true,
      isSkipped: true,
      message: isExecTimeout(err)
        ? "Docker not responding - skipped container resource check"
        : "Docker not running - skipped container resource check",
    };
  }

  const stats = parseDockerStats(raw);
  if (stats.length === 0) {
    return {
      name: "Container Resource Health",
      didPass: true,
      isSkipped: true,
      message: "No running containers to check",
    };
  }

  const hangers = stats.filter(
    (stat) => stat.memPct >= MEM_NEAR_LIMIT_PCT && stat.cpuPct >= CPU_HANGING_PCT,
  );

  if (hangers.length === 0) {
    return {
      name: "Container Resource Health",
      didPass: true,
      message: `${formatCount(stats.length, "container")} within normal resource usage`,
    };
  }

  const details = hangers
    .map((stat) => `${stat.name} (mem ${stat.memPct.toFixed(0)}%, cpu ${stat.cpuPct.toFixed(0)}%)`)
    .join("\n    ");

  return {
    name: "Container Resource Health",
    didPass: false,
    message: `${formatCount(hangers.length, "container")} pinned near its memory limit while burning CPU -- likely stuck in a boot-time retry/fetch loop, not a normal crash:\n    ${details}`,
    fix: "Check the container's boot logs for a network fetch loop (e.g. `bunx <pkg>` re-downloading a CLI on every start instead of using one already installed): docker logs <container>. If a Prisma auto-migration is the cause, set AUTO_MIGRATE=false in the project's .env as a temporary unblock.",
  };
}

export const checkContainerResourceHealth: DoctorCheckFn = Object.assign(
  function checkContainerResourceHealth(): Promise<CheckResult> {
    return checkContainerResourceHealthFor(getProjectName());
  },
  {
    requiresContainerRuntime: true,
    checkName: "Container Resource Health",
  },
);

export const DEFAULT_PING_TIMEOUT_MS = 5000;

/**
 * Pings every routable service on the same /health URLs `flisk up` advertises.
 *
 * This is a runtime check, not an environment one: before `flisk up` there is
 * nothing to ping, so a stopped stack is reported as skipped and doctor still
 * passes. Once services are up, an unreachable endpoint is a real failure --
 * it catches the case where a container is running but Traefik never routed
 * to it, which `docker ps` alone will not show.
 */
export async function checkServiceHealth(
  timeoutMs: number,
  ingressPort?: number,
): Promise<CheckResult> {
  const projectRoot = findProjectRoot() ?? process.cwd();
  const targets = buildHealthTargets(discoverResourcesFromRoot(projectRoot), ingressPort);

  if (targets.length === 0) {
    return {
      name: "Service Health",
      didPass: true,
      isSkipped: true,
      message: "No routable services to ping",
    };
  }

  return summarizeServiceProbes(await pingHealthTargets(targets, timeoutMs));
}

/**
 * Runs the GET steps of each service's "smoke" block through its public URL. These are the checks `flisk up` already runs, minus the
 * writes, so a service with an empty /health but a missing list route is caught before anyone clicks a dead link.
 *
 * Like the health ping, this only runs once services answer. A stopped stack is skipped, not failed.
 */
export async function checkServiceSmoke(
  timeoutMs: number,
  ingressPort?: number,
  options: { gateway?: boolean } = {},
): Promise<CheckResult> {
  const projectRoot = findProjectRoot() ?? process.cwd();
  const resources = discoverResourcesFromRoot(projectRoot);
  const gateway = options.gateway ?? isGatewayEnabled(projectRoot);
  const plans = readOnlySmokePlans(buildSmokePlans(resources, ingressPort, { gateway }), {
    timeoutSeconds: Math.ceil(timeoutMs / 1000),
  });
  if (plans.length === 0) {
    return summarizeSmokeResults([]);
  }

  const probes = await pingHealthTargets(buildHealthTargets(resources, ingressPort), timeoutMs);
  if (!probes.some((probe) => probe.status !== undefined)) {
    return {
      name: "Service Smoke",
      didPass: true,
      isSkipped: true,
      message: "No services responded - skipped smoke checks",
    };
  }

  // Doctor shows the failure line too, so the body snippet is masked the same way `flisk up` masks it.
  return summarizeSmokeResults(await runSmokePlans(plans, safeSmokeDeps(projectRoot)));
}

/**
 * Requests the URL each routable service advertises, the same one `flisk networks` and the Flisk App show, and warns on a 404.
 * Like the other runtime checks, it only runs once services answer. A stopped stack is skipped, not reported.
 */
export async function checkAdvertisedEndpoints(
  timeoutMs: number,
  ingressPort?: number,
): Promise<CheckResult> {
  const projectRoot = findProjectRoot() ?? process.cwd();
  const resources = discoverResourcesFromRoot(projectRoot);
  const targets = buildAdvertisedTargets(resources, ingressPort);
  if (targets.length === 0) {
    return {
      name: "Advertised Endpoints",
      didPass: true,
      isSkipped: true,
      message: "No routable services to check",
    };
  }
  return summarizeAdvertisedProbes(await pingHealthTargets(targets, timeoutMs));
}
