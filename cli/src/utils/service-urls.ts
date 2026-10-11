// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DiscoveredResource } from "../types/index.js";
import { PROJECT_JSON } from "./constants.js";
import { findProjectRoot } from "./paths.js";
import { isApiServiceType } from "./resource-kind.js";

export interface HealthTarget {
  name: string;
  appType: "frontend" | "backend" | "mcp";
  url: string;
}

export interface HealthProbe extends HealthTarget {
  ok: boolean;
  /** HTTP status code, or undefined when the request never completed. */
  status?: number;
  /** Failure reason when the request never completed (DNS, refused, timeout). */
  error?: string;
}

export function getProjectName(): string {
  const root = findProjectRoot();
  if (root) {
    try {
      const content = readFileSync(join(root, ".tdk", PROJECT_JSON), "utf-8");
      const parsed = JSON.parse(content);
      if (parsed?.project?.name) {
        return parsed.project.name;
      }
    } catch {}
  }
  return "tdk-project";
}

export function resolveSubdomainBases(ingressPort?: number): { appBase: string; apiBase: string } {
  const projectName = getProjectName();
  const raw =
    process.env.TDK_SERVICE_BASE_URL ??
    `http://${projectName}.localhost${ingressPort ? `:${ingressPort}` : ""}`;
  try {
    const u = new URL(raw.includes("://") ? raw : `http://${raw}`);
    const host = u.hostname;
    // URL drops a default port (80 for http, 443 for https), so u.port is empty
    // for http://x.localhost:80. Keep it empty instead of re-adding ingressPort.
    const defaultPort = u.protocol === "https:" ? "443" : "80";
    const explicitPort = u.port || (ingressPort ? String(ingressPort) : "");
    const port = explicitPort === defaultPort ? "" : explicitPort;
    if (host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      return {
        appBase: `${u.protocol}//${host}${port ? `:${port}` : ""}`,
        apiBase: `${u.protocol}//${host}${port ? `:${port}` : ""}`,
      };
    }
    const bare = host.replace(/^(app|api)\./, "");
    return {
      appBase: `${u.protocol}//app.${bare}${port ? `:${port}` : ""}`,
      apiBase: `${u.protocol}//api.${bare}${port ? `:${port}` : ""}`,
    };
  } catch {
    return {
      appBase: `http://app.${projectName}.localhost`,
      apiBase: `http://api.${projectName}.localhost`,
    };
  }
}

export function appendHealthPath(path: string): string {
  return `${path.replace(/\/+$/, "")}/health`;
}

/** The route `tdk up` advertises for a service, without the /health suffix. */
export function resolveServicePath(resource: DiscoveredResource): string {
  if (isApiServiceType(resource.config?.appType)) {
    const servicePathName = resource.name.replace(/-api$/, "");
    return resource.config?.apiPath ?? `/api/${servicePathName}`;
  }
  return resource.config?.basePath ?? `/${resource.name}`;
}

/**
 * Health URLs for every routable service, matching what `tdk up` prints.
 * Workers, libraries, SDKs and migrators have no Traefik route, so they are
 * skipped rather than reported as unreachable.
 */
export function buildHealthTargets(
  resources: DiscoveredResource[],
  ingressPort?: number,
): HealthTarget[] {
  return routableTargets(resources, ingressPort, (path) => appendHealthPath(path));
}

/**
 * The URL `tdk up` and `tdk networks` advertise for each routable service, with no suffix. A service can answer /health while
 * this URL is a 404 (nothing handles the bare path), which is the dead link users click.
 */
export function buildAdvertisedTargets(
  resources: DiscoveredResource[],
  ingressPort?: number,
): HealthTarget[] {
  return routableTargets(resources, ingressPort, (path) => path);
}

function routableTargets(
  resources: DiscoveredResource[],
  ingressPort: number | undefined,
  toPath: (path: string) => string,
): HealthTarget[] {
  const { appBase, apiBase } = resolveSubdomainBases(ingressPort);

  return resources
    .filter(
      (
        resource,
      ): resource is DiscoveredResource & { config: { appType: "frontend" | "backend" | "mcp" } } =>
        resource.config?.appType === "frontend" || isApiServiceType(resource.config?.appType),
    )
    .map((resource) => {
      const base = isApiServiceType(resource.config.appType) ? apiBase : appBase;
      return {
        name: resource.name,
        appType: resource.config.appType,
        url: `${base}${toPath(resolveServicePath(resource))}`,
      };
    });
}

export async function pingHealthTarget(
  target: HealthTarget,
  timeoutMs: number,
): Promise<HealthProbe> {
  try {
    const response = await fetch(target.url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { ...target, ok: response.ok, status: response.status };
  } catch (err: unknown) {
    const error =
      err instanceof Error && err.name === "TimeoutError"
        ? `no response within ${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : String(err);
    return { ...target, ok: false, error };
  }
}

export async function pingHealthTargets(
  targets: HealthTarget[],
  timeoutMs: number,
): Promise<HealthProbe[]> {
  return Promise.all(targets.map((target) => pingHealthTarget(target, timeoutMs)));
}
