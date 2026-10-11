// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { createServer } from "node:net";
import { hasLocalListener } from "./port-listener-probe.js";

export interface HostPortPlan {
  ingressHttp: number;
  ingressHttps: number;
  postgres: number;
  requested: { ingressHttp: number; ingressHttps: number; postgres: number };
  explicit: {
    ingressHttp: boolean;
    ingressHttps: boolean;
    postgres: boolean;
  };
  reason: { ingressHttp: string; ingressHttps: string; postgres: string };
}

export interface HostPortPlanOptions {
  env?: NodeJS.ProcessEnv;
  isAvailable?: (port: number) => Promise<boolean>;
  ranges?: Partial<Record<keyof HostPortPlan["explicit"], { start: number; end: number }>>;
}

export const DEFAULT_HOST_PORT_RANGES = {
  ingressHttp: { start: 8080, end: 8180 },
  ingressHttps: { start: 8443, end: 8543 },
  postgres: { start: 15432, end: 15532 },
} as const;

const ENV_KEYS = {
  ingressHttp: "TDK_HTTP_PORT",
  ingressHttps: "TDK_HTTPS_PORT",
  postgres: "TDK_POSTGRES_PORT",
} as const;
const REQUESTED_PORTS = { ingressHttp: 80, ingressHttps: 443, postgres: 5432 } as const;
// Tried before the fallback range so routed URLs need no port. Postgres keeps
// its range: a local Postgres on 5432 is common, and no URL carries that port.
export const PREFERRED_HOST_PORTS: Partial<Record<keyof typeof REQUESTED_PORTS, number>> = {
  ingressHttp: REQUESTED_PORTS.ingressHttp,
  ingressHttps: REQUESTED_PORTS.ingressHttps,
};

/**
 * Whether a failed bind on 127.0.0.1 means the port is still free for Docker. Only macOS
 * refuses a non-root bind below 1024 while Docker Desktop publishes it through a privileged
 * helper. Callers check for a listener first, so a bind error here is never another process.
 */
export function isPrivilegedBindFree(
  errorCode: string | undefined,
  platform: NodeJS.Platform,
): boolean {
  return errorCode === "EACCES" && platform === "darwin";
}

export async function isHostPortAvailable(port: number): Promise<boolean> {
  if (await hasLocalListener(port)) return false;
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", (error: NodeJS.ErrnoException) => {
      resolve(isPrivilegedBindFree(error.code, process.platform));
    });
    // Docker Desktop and Windows publish these host ports through IPv4 loopback.
    // Match that target instead of probing wildcard binds that may differ by OS.
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

function parsePort(name: string, value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `${name} must be an integer between 1 and 65535 (received ${JSON.stringify(value)})`,
    );
  }
  return port;
}

export async function createHostPortPlan(options: HostPortPlanOptions = {}): Promise<HostPortPlan> {
  const env = options.env ?? process.env;
  const isAvailable = options.isAvailable ?? isHostPortAvailable;
  const explicitFlags = { ingressHttp: false, ingressHttps: false, postgres: false };
  const reasons = { ingressHttp: "", ingressHttps: "", postgres: "" };
  const selected: Partial<HostPortPlan> = { explicit: explicitFlags };
  const reserved = new Set<number>();

  for (const key of ["ingressHttp", "ingressHttps", "postgres"] as const) {
    const envValue = env[ENV_KEYS[key]];
    const explicit = envValue !== undefined && envValue.trim() !== "";
    const range = options.ranges?.[key] ?? DEFAULT_HOST_PORT_RANGES[key];
    const preferred = PREFERRED_HOST_PORTS[key];
    const candidates = explicit
      ? [parsePort(ENV_KEYS[key], envValue)]
      : [
          ...(preferred === undefined ? [] : [preferred]),
          ...Array.from({ length: range.end - range.start + 1 }, (_, index) => range.start + index),
        ];

    let chosen: number | undefined;
    for (const port of candidates) {
      if (reserved.has(port)) continue;
      if (await isAvailable(port)) {
        chosen = port;
        break;
      }
      if (explicit) {
        throw new Error(
          `${ENV_KEYS[key]}=${port} is already in use. Choose a free host port and retry.`,
        );
      }
    }
    if (chosen === undefined) {
      throw new Error(
        `No available host port in ${range.start}-${range.end} for ${key}. Set ${ENV_KEYS[key]} to a free port and retry.`,
      );
    }
    reserved.add(chosen);
    selected[key] = chosen;
    explicitFlags[key] = explicit;
    reasons[key] = explicit
      ? "explicit override"
      : chosen === preferred
        ? "requested port is free"
        : `selected from fallback range ${range.start}-${range.end}`;
  }

  return {
    ...selected,
    requested: { ...REQUESTED_PORTS },
    reason: reasons,
  } as HostPortPlan;
}

export function formatHostPortPlan(plan: HostPortPlan): string {
  return `Host ports: HTTP ${plan.ingressHttp}, HTTPS ${plan.ingressHttps}, Postgres ${plan.postgres}`;
}
