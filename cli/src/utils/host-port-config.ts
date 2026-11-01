// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { HostPortPlan, ProjectCapabilities } from "../types/index.js";
import { isDatabaseCapabilityEnabled, isGatewayEnabled } from "./capabilities.js";
import { toComposeProjectName } from "./compose-project-name.js";
import { PROJECT_JSON } from "./constants.js";
import { projectEnvLookup } from "./extra-port-publish.js";
import {
  createHostPortPlan,
  GATEWAY_DISABLED_REASON,
  isHostPortAvailable,
  PREFERRED_HOST_PORTS,
  withoutGatewayPorts,
} from "./host-port-plan.js";
import { discoverResourcesFromRoot } from "./services.js";
import { extraPortsOf } from "./status-ports.js";

const CONFIG_PATH = join(".flisk", ".flisk-out", "host-ports.json");

export function isDockerPortOwnedByProject(
  dockerPs: string,
  projectPrefix: string,
  port: number,
): boolean {
  return dockerPs.split("\n").some((line) => {
    const [name = "", ports = ""] = line.split("|");
    const containerName = name.toLowerCase();
    const prefix = projectPrefix.toLowerCase();
    return (
      (containerName.startsWith(`${prefix}_`) || containerName.startsWith(`${prefix}-`)) &&
      ports.includes(`:${port}->`)
    );
  });
}

export function readSavedHostPortPlan(projectRoot: string): HostPortPlan | null {
  const path = join(projectRoot, CONFIG_PATH);
  if (!existsSync(path)) return null;
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf-8"));
    if (!value || typeof value !== "object") return null;
    const plan = value as Partial<HostPortPlan>;
    if (
      !Number.isInteger(plan.ingressHttp) ||
      !Number.isInteger(plan.ingressHttps) ||
      !Number.isInteger(plan.postgres) ||
      !plan.requested ||
      !plan.explicit ||
      !plan.reason
    )
      return null;
    return plan as HostPortPlan;
  } catch {
    return null;
  }
}

export function writeSavedHostPortPlan(projectRoot: string, plan: HostPortPlan): void {
  const path = join(projectRoot, CONFIG_PATH);
  mkdirSync(join(projectRoot, ".flisk", ".flisk-out"), { recursive: true });
  writeFileSync(path, `${JSON.stringify(plan, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
}

export function exportHostPortPlan(plan: HostPortPlan): void {
  process.env.FLISK_HTTP_PORT = String(plan.ingressHttp);
  process.env.FLISK_HTTPS_PORT = String(plan.ingressHttps);
  process.env.FLISK_POSTGRES_PORT = String(plan.postgres);
}

const COMPOSE_WORKING_DIR_LABEL = "com.docker.compose.project.working_dir";

/**
 * True when a container whose Compose working directory is inside this project publishes the port. A container-name prefix is not
 * enough: flisk_shop_ also matches the containers of a different project called flisk-shop-extra. Compose records the directory each
 * project was started from, so that identifies the project exactly. Containers without the label never count.
 */
export function isPortHeldByProjectContainers(
  dockerPs: string,
  projectRoot: string,
  port: number,
): boolean {
  const roots = new Set([resolve(projectRoot)]);
  try {
    roots.add(realpathSync(projectRoot));
  } catch {
    // The project root is already known to exist; keep the unresolved path.
  }
  return dockerPs.split("\n").some((line) => {
    const [, ports = "", workingDir = ""] = line.split("|");
    if (!workingDir || !ports.includes(`:${port}->`)) return false;
    return [...roots].some((root) => workingDir === root || workingDir.startsWith(`${root}${sep}`));
  });
}

/**
 * The HTTP ingress port to probe while a stack is running. getHostPortPlan moves a saved fallback port (8080) back to the
 * preferred one (80) as soon as that is free, which is right for the next `flisk up` but wrong for a running stack: Traefik is still
 * bound to the saved port, so probing the planned one finds nothing and every runtime check is skipped. When this project's own
 * containers hold the saved port, probe that one.
 */
export function resolveRuntimeIngressPort(
  projectRoot: string,
  plannedPort: number | undefined,
  readDockerPs: () => string = () =>
    execFileSync(
      "docker",
      ["ps", "--format", `{{.Names}}|{{.Ports}}|{{.Label "${COMPOSE_WORKING_DIR_LABEL}"}}`],
      { encoding: "utf-8", timeout: 5000 },
    ),
): number | undefined {
  const saved = readSavedHostPortPlan(projectRoot);
  if (!saved || saved.ingressHttp === plannedPort) return plannedPort;
  try {
    if (isPortHeldByProjectContainers(readDockerPs(), projectRoot, saved.ingressHttp)) {
      return saved.ingressHttp;
    }
  } catch {
    // Docker unavailable: keep the planned port.
  }
  return plannedPort;
}

/** Host ports the project's bring-your-own services publish through `extraPorts`. Empty when discovery fails. */
function reservedExtraPorts(projectRoot: string): Set<number> {
  const lookup = projectEnvLookup(projectRoot);
  try {
    return new Set(
      discoverResourcesFromRoot(projectRoot).flatMap((resource) =>
        extraPortsOf(resource, lookup).map((port) => port.hostPort),
      ),
    );
  } catch {
    return new Set();
  }
}

/**
 * Reuse this project's last selection when its ports are still free or held by its own containers. Only the ports of the
 * capabilities that are on are planned: with the gateway off, HTTP and HTTPS are never probed (no Traefik binds them).
 */
export async function getHostPortPlan(
  projectRoot: string,
  options: {
    inspectDocker?: boolean;
    isPortFree?: (port: number) => Promise<boolean>;
    database?: boolean;
    gateway?: boolean;
    capabilities?: ProjectCapabilities;
  } = {},
): Promise<HostPortPlan> {
  const dbEnabled = isDatabaseCapabilityEnabled(projectRoot, options);
  const gatewayEnabled = isGatewayEnabled(projectRoot, options);
  const plan = await planHostPorts(projectRoot, { ...options, dbEnabled, gatewayEnabled });
  return gatewayEnabled ? plan : withoutGatewayPorts(plan);
}

async function planHostPorts(
  projectRoot: string,
  options: {
    inspectDocker?: boolean;
    isPortFree?: (port: number) => Promise<boolean>;
    capabilities?: ProjectCapabilities;
    dbEnabled: boolean;
    gatewayEnabled: boolean;
  },
): Promise<HostPortPlan> {
  const { dbEnabled, gatewayEnabled } = options;
  const savedPlan = readSavedHostPortPlan(projectRoot);
  // A plan saved while the gateway was off holds no real HTTP/HTTPS choice: plan again once the gateway is back on.
  const saved =
    gatewayEnabled && savedPlan?.reason.ingressHttp === GATEWAY_DISABLED_REASON ? null : savedPlan;
  const overrideKeys = [
    ...(gatewayEnabled ? ["FLISK_HTTP_PORT", "FLISK_HTTPS_PORT"] : []),
    ...(dbEnabled ? ["FLISK_POSTGRES_PORT"] : []),
  ];
  const hasOverride = overrideKeys.some((key) => process.env[key]);
  // Dry-run must not call Docker. A saved plan is the best representation of
  // the current landscape in that mode; explicit overrides are still planned.
  if (options.inspectDocker === false && saved && !hasOverride) return saved;
  let prefix = "";
  try {
    const project = JSON.parse(readFileSync(join(projectRoot, ".flisk", PROJECT_JSON), "utf-8"));
    prefix = toComposeProjectName(String(project?.project?.name ?? "flisk-project")).toLowerCase();
  } catch {
    prefix = "flisk_project";
  }
  let dockerPs = "";
  if (options.inspectDocker !== false) {
    try {
      dockerPs = execFileSync("docker", ["ps", "--format", "{{.Names}}|{{.Ports}}"], {
        encoding: "utf-8",
        timeout: 5000,
      });
    } catch {
      // If Docker is down, reuse only when host binds are still available.
    }
  }
  const ownedByProject = (port: number) => isDockerPortOwnedByProject(dockerPs, prefix, port);
  const isPortFree = options.isPortFree ?? isHostPortAvailable;
  // A bring-your-own service's `extraPorts` claim their host ports for its own container (a proxy on 80 and 443), so Traefik
  // must not take them, even while that container holds them and they read as this project's own.
  const reserved = reservedExtraPorts(projectRoot);
  const isAvailable = async (port: number) =>
    !reserved.has(port) && ((await isPortFree(port)) || ownedByProject(port));
  const replan = () =>
    createHostPortPlan({
      isAvailable,
      database: dbEnabled,
      gateway: gatewayEnabled,
      capabilities: options.capabilities,
    });
  if (saved && !hasOverride) {
    const checkedPorts = [
      ...(gatewayEnabled ? [saved.ingressHttp, saved.ingressHttps] : []),
      ...(dbEnabled ? [saved.postgres] : []),
    ];
    for (const port of checkedPorts) {
      if (!(await isAvailable(port))) return replan();
    }
    // A plan saved on a fallback port (8080) moves back to the preferred one (80)
    // once that is free, so URLs lose the port without deleting host-ports.json.
    for (const [key, preferred] of Object.entries(PREFERRED_HOST_PORTS)) {
      if (!dbEnabled && key === "postgres") continue;
      if (!gatewayEnabled && (key === "ingressHttp" || key === "ingressHttps")) continue;
      const savedPort = saved[key as keyof typeof PREFERRED_HOST_PORTS];
      if (preferred !== undefined && savedPort !== preferred && (await isAvailable(preferred))) {
        return replan();
      }
    }
    return saved;
  }
  return replan();
}

/** Which shared containers need a host port: the gateway takes HTTP/HTTPS, the database takes Postgres. */
export interface HostPortCapabilities {
  gateway: boolean;
  database: boolean;
}

/** The host ports a plan places for the capabilities that are on, as `HTTP 80, HTTPS 443, Postgres 5432`. */
export function describeHostPortPlan(plan: HostPortPlan, caps: HostPortCapabilities): string {
  const parts = [
    ...(caps.gateway ? [`HTTP ${plan.ingressHttp}`, `HTTPS ${plan.ingressHttps}`] : []),
    ...(caps.database ? [`Postgres ${plan.postgres}`] : []),
  ];
  return parts.length > 0 ? parts.join(", ") : "No gateway or database host ports needed";
}

/** What to set when the host ports for the capabilities that are on cannot be placed. */
export function hostPortPlanFix(caps: HostPortCapabilities): string {
  if (caps.gateway && !caps.database) {
    return "Set FLISK_HTTP_PORT or FLISK_HTTPS_PORT to available host ports.";
  }
  if (caps.database && !caps.gateway) return "Set FLISK_POSTGRES_PORT to an available host port.";
  return "Set FLISK_HTTP_PORT, FLISK_HTTPS_PORT, or FLISK_POSTGRES_PORT to available host ports.";
}
