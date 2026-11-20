// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { createServer } from "node:net";
import type { HostPortPlan } from "../types/index.js";
import { FliskError } from "./errors.js";
import type { NativeServicePlan } from "./native-runtime.js";
import { hasLocalListener } from "./port-listener-probe.js";
import { readProjectJson } from "./project-reader.js";

export interface HostPortPlanOptions {
  env?: NodeJS.ProcessEnv;
  isAvailable?: (port: number) => Promise<boolean>;
  ranges?: Partial<Record<keyof HostPortPlan["explicit"], { start: number; end: number }>>;
  database?: boolean;
  /** False when the gateway capability is off: no Traefik, so HTTP and HTTPS are neither planned nor probed. */
  gateway?: boolean;
  capabilities?: { database?: boolean; gateway?: boolean; [key: string]: boolean | undefined };
}

/** The `reason` a plan gives for the HTTP and HTTPS ports when the gateway capability is off. */
export const GATEWAY_DISABLED_REASON = "gateway capability disabled";

export const DEFAULT_HOST_PORT_RANGES = {
  ingressHttp: { start: 8080, end: 8180 },
  ingressHttps: { start: 8443, end: 8543 },
  postgres: { start: 15432, end: 15532 },
} as const;

const ENV_KEYS = {
  ingressHttp: "FLISK_HTTP_PORT",
  ingressHttps: "FLISK_HTTPS_PORT",
  postgres: "FLISK_POSTGRES_PORT",
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
 * helper, and Colima and Lima through their pseudoloopback forwarder. Callers check for a
 * listener first, so a bind error here is never another process.
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
    throw new FliskError(
      `${name} must be an integer between 1 and 65535 (received ${JSON.stringify(value)})`,
      ["Provide a valid port number between 1 and 65535"],
      1,
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

  const dbEnabled = options.database !== false && options.capabilities?.database !== false;
  const gatewayEnabled = options.gateway !== false && options.capabilities?.gateway !== false;
  const keys = [
    ...(gatewayEnabled ? (["ingressHttp", "ingressHttps"] as const) : []),
    ...(dbEnabled ? (["postgres"] as const) : []),
  ];

  if (!dbEnabled) {
    selected.postgres = 5432;
    explicitFlags.postgres = false;
    reasons.postgres = "database capability disabled";
  }
  if (!gatewayEnabled) {
    selected.ingressHttp = REQUESTED_PORTS.ingressHttp;
    selected.ingressHttps = REQUESTED_PORTS.ingressHttps;
    reasons.ingressHttp = GATEWAY_DISABLED_REASON;
    reasons.ingressHttps = GATEWAY_DISABLED_REASON;
  }

  for (const key of keys) {
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
        throw new FliskError(
          `${ENV_KEYS[key]}=${port} is already in use. Choose a free host port and retry.`,
          [
            "Choose a different free host port or unset the environment variable to use fallback ranges",
          ],
          1,
        );
      }
    }
    if (chosen === undefined) {
      throw new FliskError(
        `No available host port in ${range.start}-${range.end} for ${key}. Set ${ENV_KEYS[key]} to a free port and retry.`,
        [
          `Free up port range ${range.start}-${range.end} or set ${ENV_KEYS[key]} to an available port`,
        ],
        1,
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
  const parts = [
    ...(plan.reason?.ingressHttp === GATEWAY_DISABLED_REASON
      ? []
      : [`HTTP ${plan.ingressHttp}`, `HTTPS ${plan.ingressHttps}`]),
    ...(plan.reason?.postgres === "database capability disabled"
      ? []
      : [`Postgres ${plan.postgres}`]),
  ];
  return parts.length > 0 ? `Host ports: ${parts.join(", ")}` : "Host ports: none needed";
}

/** The plan with HTTP and HTTPS marked as not needed, for a project whose gateway capability is off. */
export function withoutGatewayPorts(plan: HostPortPlan): HostPortPlan {
  return {
    ...plan,
    ingressHttp: REQUESTED_PORTS.ingressHttp,
    ingressHttps: REQUESTED_PORTS.ingressHttps,
    explicit: { ...plan.explicit, ingressHttp: false, ingressHttps: false },
    reason: {
      ...plan.reason,
      ingressHttp: GATEWAY_DISABLED_REASON,
      ingressHttps: GATEWAY_DISABLED_REASON,
    },
  };
}

/**
 * The name a checkout was started under, when one was given. A plain project has none: its services keep the fixed ports
 * in service.json and a busy port is still an error. A worktree (or an orchestrator) supplies the name either as
 * `FLISK_CHECKOUT_NAME` in the run environment or as `worktree.name` / `checkout.name` in `.flisk/project.json` (#3117).
 * Names are normalised the same way as checkout folder names: lowercase, `[a-z0-9-]`.
 */
export function perCheckoutName(
  projectRoot: string,
  vars: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  const json = readProjectJson(projectRoot);
  const worktree = json?.worktree as Record<string, unknown> | undefined;
  const checkout = json?.checkout as Record<string, unknown> | undefined;
  const candidates = [vars.FLISK_CHECKOUT_NAME, worktree?.name, checkout?.name];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const name = candidate
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (name) return name;
  }
  return undefined;
}

/** How far past a service's declared port to look for a free one when the checkout's port is taken. */
export const CHECKOUT_PORT_MAX_OFFSET = 100;

export interface LocalPortRemapOptions {
  /** Port probe; defaults to a local listener check plus a bind on 127.0.0.1. */
  isAvailable?: (port: number) => Promise<boolean>;
  /** Ports already chosen earlier in this run (a restart reuses them instead of probing). */
  chosenPorts?: ReadonlyMap<string, number>;
  maxOffset?: number;
}

export interface LocalPortRemap {
  /** Service name to the port chosen for it, only for services whose declared port was busy. */
  ports: Map<string, number>;
}

/** Replace a port in a loopback URL, including a hostname such as `api.shop.localhost:4100`. */
function rewriteLoopbackPort(
  text: string | undefined,
  oldPort: number,
  newPort: number,
): string | undefined {
  if (text === undefined || oldPort === newPort) return text;
  return text.replace(
    new RegExp(`((?:localhost|127\\.0\\.0\\.1):)${oldPort}(?![0-9])`, "g"),
    `$1${newPort}`,
  );
}

/**
 * Apply previously chosen ports to a fresh plan (a `flisk restart` re-plans from service.json). Synchronous on purpose:
 * `NativeSupervisor`'s reload hook cannot await. No port is probed here; the ports were claimed when the run started.
 */
export function applyChosenNativePorts(
  plans: NativeServicePlan[],
  chosenPorts: ReadonlyMap<string, number>,
  declaredPorts: ReadonlyMap<string, number>,
): void {
  const byOldPort = new Map<number, number>();
  for (const plan of plans) {
    const chosen = chosenPorts.get(plan.name);
    const declaredPort = declaredPorts.get(plan.name) ?? plan.port;
    if (chosen === undefined || declaredPort === undefined || chosen === plan.port) continue;
    byOldPort.set(declaredPort, chosen);
    plan.port = chosen;
    plan.env.PORT = String(chosen);
    plan.url = rewriteLoopbackPort(plan.url, declaredPort, chosen);
    plan.healthUrl = rewriteLoopbackPort(plan.healthUrl, declaredPort, chosen);
  }
  for (const plan of plans) {
    for (const [key, value] of Object.entries(plan.env)) {
      if (key === "PORT") continue;
      let rewritten = value;
      for (const [oldPort, newPort] of byOldPort) {
        rewritten = rewriteLoopbackPort(rewritten, oldPort, newPort) ?? rewritten;
      }
      plan.env[key] = rewritten;
    }
  }
}

/**
 * Remap a local process's declared port at run time when this checkout is running under its own name. The declared port
 * is left alone when it is free; only a busy one moves. Nothing is written to service.json: the new port lives in the
 * plan (and then in `.flisk/native/run.json`), `PORT` is injected into the service, and loopback URLs in its own and its
 * dependents' env are rewritten to the real address. Without a checkout name the plan is untouched, so a single checkout
 * still fails loudly in `runNativeUp`.
 */
export async function remapNativeServicePorts(
  plans: NativeServicePlan[],
  checkoutName: string | undefined,
  options: LocalPortRemapOptions = {},
): Promise<LocalPortRemap> {
  const ports = new Map<string, number>();
  if (!checkoutName) return { ports };

  const isAvailable = options.isAvailable ?? isHostPortAvailable;
  const maxOffset = options.maxOffset ?? CHECKOUT_PORT_MAX_OFFSET;
  const declaredByName = new Map(
    plans.flatMap((plan) => (plan.port === undefined ? [] : [[plan.name, plan.port] as const])),
  );
  const declaredPorts = new Set(
    plans.flatMap((plan) => (plan.port === undefined ? [] : [plan.port])),
  );
  const reserved = new Set([...declaredPorts, ...(options.chosenPorts?.values() ?? [])]);

  for (const plan of plans) {
    if (plan.port === undefined || plan.container) continue;
    const declaredPort = plan.port;
    let chosen = options.chosenPorts?.get(plan.name);
    if (chosen === undefined && (await isAvailable(declaredPort))) continue;
    if (chosen === undefined) {
      for (let offset = 1; offset <= maxOffset; offset++) {
        const candidate = declaredPort + offset;
        if (candidate > 65535) break;
        if (reserved.has(candidate)) continue;
        if (await isAvailable(candidate)) {
          chosen = candidate;
          break;
        }
      }
    }
    if (chosen === undefined) {
      throw new FliskError(
        `No free port for service "${plan.name}" near ${declaredPort} in checkout "${checkoutName}".`,
        [
          `Free a port between ${declaredPort + 1} and ${Math.min(65535, declaredPort + maxOffset)}`,
          "Stop the other checkout, or give this service a different fixed port in service.json",
        ],
      );
    }
    reserved.add(chosen);
    ports.set(plan.name, chosen);
  }

  applyChosenNativePorts(plans, ports, declaredByName);
  return { ports };
}
