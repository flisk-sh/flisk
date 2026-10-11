// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_JSON } from "./constants.js";
import {
  createHostPortPlan,
  type HostPortPlan,
  isHostPortAvailable,
  PREFERRED_HOST_PORTS,
} from "./host-port-plan.js";

const CONFIG_PATH = join(".tdk", ".tdk-out", "host-ports.json");

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
  mkdirSync(join(projectRoot, ".tdk", ".tdk-out"), { recursive: true });
  writeFileSync(path, `${JSON.stringify(plan, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
}

export function exportHostPortPlan(plan: HostPortPlan): void {
  process.env.TDK_HTTP_PORT = String(plan.ingressHttp);
  process.env.TDK_HTTPS_PORT = String(plan.ingressHttps);
  process.env.TDK_POSTGRES_PORT = String(plan.postgres);
}

/** Reuse this project's last selection when its ports are still free or held by its own containers. */
export async function getHostPortPlan(
  projectRoot: string,
  options: { inspectDocker?: boolean; isPortFree?: (port: number) => Promise<boolean> } = {},
): Promise<HostPortPlan> {
  const saved = readSavedHostPortPlan(projectRoot);
  const hasOverride = ["TDK_HTTP_PORT", "TDK_HTTPS_PORT", "TDK_POSTGRES_PORT"].some(
    (key) => process.env[key],
  );
  // Dry-run must not call Docker. A saved plan is the best representation of
  // the current landscape in that mode; explicit overrides are still planned.
  if (options.inspectDocker === false && saved && !hasOverride) return saved;
  let prefix = "";
  try {
    const project = JSON.parse(readFileSync(join(projectRoot, ".tdk", PROJECT_JSON), "utf-8"));
    prefix = String(project?.project?.name ?? "tdk-project")
      .replace(/-/g, "_")
      .toLowerCase();
  } catch {
    prefix = "tdk_project";
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
  const isAvailable = async (port: number) => (await isPortFree(port)) || ownedByProject(port);
  if (saved && !hasOverride) {
    for (const port of [saved.ingressHttp, saved.ingressHttps, saved.postgres]) {
      if (!(await isAvailable(port))) return createHostPortPlan({ isAvailable });
    }
    // A plan saved on a fallback port (8080) moves back to the preferred one (80)
    // once that is free, so URLs lose the port without deleting host-ports.json.
    for (const [key, preferred] of Object.entries(PREFERRED_HOST_PORTS)) {
      const savedPort = saved[key as keyof typeof PREFERRED_HOST_PORTS];
      if (preferred !== undefined && savedPort !== preferred && (await isAvailable(preferred))) {
        return createHostPortPlan({ isAvailable });
      }
    }
    return saved;
  }
  return createHostPortPlan({ isAvailable });
}
