// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import type { DiscoveredResource, DiscoveredResourceConfig } from "../types/index.js";
import { PORT_RANGES } from "./constants.js";
import { FliskError } from "./errors.js";
import { createPortClaimer } from "./port-claims.js";

/**
 * `"port": "auto"` and `flisk up --auto-port` are run-time choices (#4683). The manifest keeps the word `auto`, and the
 * chosen number lives only in this machine-local state file, never in service.json or generated output. A worktree has its
 * own `.flisk`, so two checkouts can hold two different ports for the same service.
 */

export type DeclaredPort = number | "auto";

export const AUTO_PORT = "auto" as const;

export function isAutoPort(value: unknown): value is "auto" {
  return value === AUTO_PORT;
}

/** The resolved value of `port` in a discovered manifest, before any run-time overlay. */
export function declaredPortOf(resource: DiscoveredResource): DeclaredPort | undefined {
  // declaredPort keeps the original "auto" even after a numeric overlay, so dependency URL rewrites know what changed.
  const value = resource.declaredPort ?? resource.config?.port;
  return typeof value === "number" || isAutoPort(value) ? value : undefined;
}

interface SavedPort {
  port: number;
  appType: string | undefined;
}

interface AutoPortState {
  version: 1;
  ports: Record<string, SavedPort>;
}

const STATE_DIR = join(".flisk", "local");
const STATE_FILE = "auto-ports.json";

export function autoPortStatePath(projectRoot: string): string {
  return join(projectRoot, STATE_DIR, STATE_FILE);
}

function writeState(projectRoot: string, state: AutoPortState): void {
  const dir = join(projectRoot, STATE_DIR);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  // The state is this checkout's, not the project's: keep it out of git without editing the user's .gitignore.
  const ignore = join(dir, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "*\n", { mode: 0o600 });
  writeFileSync(autoPortStatePath(projectRoot), `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
}

export function readAutoPortState(projectRoot: string): Map<string, SavedPort> {
  try {
    const parsed = JSON.parse(
      readFileSync(autoPortStatePath(projectRoot), "utf-8"),
    ) as Partial<AutoPortState>;
    if (parsed.version !== 1 || !parsed.ports || typeof parsed.ports !== "object") return new Map();
    const result = new Map<string, SavedPort>();
    for (const [name, entry] of Object.entries(parsed.ports)) {
      if (
        entry &&
        typeof entry === "object" &&
        typeof (entry as SavedPort).port === "number" &&
        Number.isInteger((entry as SavedPort).port)
      ) {
        result.set(name, entry as SavedPort);
      }
    }
    return result;
  } catch {
    return new Map();
  }
}

/** The port range a service uses when its port is `auto`. Unknown types use the backend-compatible range. */
export function autoPortRange(resource: DiscoveredResource): {
  base: number;
  min: number;
  max: number;
  range: string;
} {
  const appType = resource.config?.appType ?? resource.type;
  const key = (appType && appType in PORT_RANGES ? appType : "backend") as keyof typeof PORT_RANGES;
  const entry = PORT_RANGES[key];
  return { base: entry.base, min: entry.min, max: entry.max, range: entry.range };
}

/** The Compose/Tilt environment variable that carries a service's resolved port into generated `${...}` placeholders. */
export function autoPortEnvName(resource: DiscoveredResource): string {
  const name = resource.name.replace(/[^A-Za-z0-9]/g, "_").toUpperCase();
  return `FLISK_SERVICE_${name}_PORT`;
}

export function overlayResolvedPorts(
  resources: readonly DiscoveredResource[],
  resolved: ReadonlyMap<string, number>,
  previous: ReadonlyMap<string, number> = new Map(),
): DiscoveredResource[] {
  return resources.map((resource) => {
    const declared = declaredPortOf(resource);
    const port =
      resolved.get(resource.name) ?? (typeof declared === "number" ? declared : undefined);
    const autoPort = resolved.has(resource.name) || isAutoPort(declared);
    const config: DiscoveredResourceConfig | undefined = resource.config
      ? {
          ...resource.config,
          ...(port !== undefined ? { port } : {}),
        }
      : undefined;
    return {
      ...resource,
      ...(config ? { config } : {}),
      ...(port !== undefined ? { port } : {}),
      ...(declared !== undefined ? { declaredPort: declared } : {}),
      ...(previous.has(resource.name) ? { portBeforeAuto: previous.get(resource.name) } : {}),
      ...(autoPort ? { autoPort: true } : {}),
    };
  });
}

/**
 * Overlay the ports remembered from an earlier `flisk up` so status/open/resources report the same addresses. A service
 * that received its port from `--auto-port` keeps that choice on a later plain `flisk up`, even though its manifest
 * declares a number: the saved assignment is this checkout's, while the manifest port is only the fallback when the
 * saved one left the range.
 */
export function applySavedAutoPorts(
  resources: readonly DiscoveredResource[],
  projectRoot: string | null | undefined,
): DiscoveredResource[] {
  if (!projectRoot) return [...resources];
  const saved = readAutoPortState(projectRoot);
  const resolved = new Map<string, number>();
  const previous = new Map<string, number>();
  for (const resource of resources) {
    const declared = declaredPortOf(resource);
    if (declared === undefined) continue;
    const entry = saved.get(resource.name);
    if (!entry) continue;
    // The same replay rule as the resolver: the saved choice of an earlier --auto-port outranks the manifest
    // number only while it still fits the service (appType and range); otherwise the manifest port is the answer.
    if (entry.appType !== (resource.config?.appType ?? resource.type)) continue;
    const range = autoPortRange(resource);
    if (entry.port >= range.min && entry.port <= range.max) {
      resolved.set(resource.name, entry.port);
      // Dependency URLs were written against the declared number, or the appType's base for "auto".
      previous.set(resource.name, typeof declared === "number" ? declared : range.base);
    }
  }
  return resolved.size > 0 ? overlayResolvedPorts(resources, resolved, previous) : [...resources];
}

type BindProbeResult = "free" | "occupied" | "unsupported-address";

/**
 * Whether one listen address can still accept a new server for `port`. A bind, not a connect: a connect to
 * 127.0.0.1 called a port free that another process held only on `::1`, and the service then failed to bind. The probe
 * closes itself before answering, so two probes never hold the port against each other.
 */
function bindProbe(host: string, port: number): Promise<BindProbeResult> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT") {
        // The host cannot express this address (no IPv6 stack): that is not an occupied port.
        resolve("unsupported-address");
        return;
      }
      resolve("occupied");
    });
    server.listen(port, host, () => {
      server.close(() => resolve("free"));
    });
  });
}

/**
 * Whether a new listener can bind `port` on the addresses a Flisk service listens on: the wildcard IPv4 address and
 * the dual-stack IPv6 one (a plain `server.listen(port)` binds `::`, Vite's generated config binds `0.0.0.0`), plus
 * both loopback addresses — a port another process holds on `::1` or `127.0.0.1` only is unusable to this project,
 * and whether a wildcard bind conflicts with a specific-address bind varies by OS (`SO_REUSEADDR` semantics), so the
 * specific addresses are probed directly instead of relying on the wildcard probes to catch them. Every bind failure
 * means the port is unusable; an address the host cannot express is skipped, not treated as occupied.
 */
async function portIsFree(port: number): Promise<boolean> {
  for (const host of ["127.0.0.1", "::1", "0.0.0.0", "::"]) {
    if ((await bindProbe(host, port)) === "occupied") return false;
  }
  return true;
}

export interface ResolveAutoPortsOptions {
  /** `--auto-port`: apply to every service in this run, even manifests that declare a fixed number. */
  force?: boolean;
  /** Every resource in the project, including ones not selected, so a fixed port elsewhere is still reserved. */
  all?: readonly DiscoveredResource[];
  /** A claimer from port-claims.ts. A dry run passes one that always succeeds and does not write state. */
  claim?: (port: number) => boolean;
  /** Port probe override for tests. */
  isFree?: (port: number) => Promise<boolean>;
  dryRun?: boolean;
}

export interface AutoPortReport {
  autoPorts: Array<{
    name: string;
    port: number;
    appType: string | undefined;
    range: string;
    source: "manifest" | "flag";
  }>;
  portsBeforeAuto: Array<{ name: string; port: number }>;
}

export function autoPortReportFromResources(
  resources: readonly DiscoveredResource[],
): AutoPortReport {
  const report: AutoPortReport = { autoPorts: [], portsBeforeAuto: [] };
  for (const resource of resources) {
    if (!resource.autoPort || typeof resource.port !== "number") continue;
    const declared = declaredPortOf(resource);
    const previous =
      resource.portBeforeAuto ??
      (typeof declared === "number" ? declared : autoPortRange(resource).base);
    report.autoPorts.push({
      name: resource.name,
      port: resource.port,
      appType: resource.config?.appType ?? resource.type,
      range: autoPortRange(resource).range,
      source: isAutoPort(declared) ? "manifest" : "flag",
    });
    report.portsBeforeAuto.push({ name: resource.name, port: previous });
  }
  return report;
}

export interface AutoPortResolution {
  /** Resource name to chosen port, for every service treated as auto in this run. */
  ports: Map<string, number>;
  /** The original declared port for each auto service; used to rewrite dependency URLs. */
  previousPorts: Map<string, number>;
  /** Services with a resolved port, overlaid without touching service.json. */
  resources: DiscoveredResource[];
  /** Machine-readable details for `flisk up --json`. */
  report: AutoPortReport;
  /** Environment variables to pass to Docker/Tilt for `${...}` placeholders in generated files. */
  env: Record<string, string>;
}

/**
 * Choose a free port for every `auto` service (and every service under `--auto-port`), reusing this checkout's saved port
 * while it is still free. Fixed ports and their conflict errors are untouched when `force` is false, except a service
 * that already holds a saved assignment from an earlier `--auto-port`: its manifest number is the fallback, not the
 * port this checkout runs on.
 */
export async function resolveAutoPorts(
  resources: readonly DiscoveredResource[],
  projectRoot: string,
  options: ResolveAutoPortsOptions = {},
): Promise<AutoPortResolution> {
  const force = options.force === true;
  const claim = options.claim ?? createPortClaimer(projectRoot);
  const isFree = options.isFree ?? ((port: number) => portIsFree(port));
  const selectedNames = new Set(resources.map((resource) => resource.name));
  const saved = options.dryRun ? new Map<string, SavedPort>() : readAutoPortState(projectRoot);
  /**
   * The saved entry when it can still be replayed for this service (same appType, port still in the range), else
   * undefined: a `--auto-port` choice survives later runs only while it still fits the service that made it.
   */
  const replayableSavedPort = (resource: DiscoveredResource): SavedPort | undefined => {
    const remembered = saved.get(resource.name);
    if (!remembered) return undefined;
    if (remembered.appType !== (resource.config?.appType ?? resource.type)) return undefined;
    const range = autoPortRange(resource);
    return remembered.port >= range.min && remembered.port <= range.max ? remembered : undefined;
  };
  // A service is treated as auto in this run when the manifest says so, when --auto-port selected it, or when this
  // checkout already moved it with an earlier --auto-port and that assignment is still usable: the saved port then
  // outranks the manifest number, which stays the fallback for the services around it.
  const isAuto = (resource: DiscoveredResource): boolean => {
    const declared = declaredPortOf(resource);
    if (declared === undefined) return false;
    if (isAutoPort(declared)) return true;
    if (typeof declared !== "number") return false;
    return (
      (force && selectedNames.has(resource.name)) || replayableSavedPort(resource) !== undefined
    );
  };
  const fixedPorts = new Set<number>();
  for (const resource of options.all ?? resources) {
    const declared = declaredPortOf(resource);
    if (isAuto(resource)) continue;
    if (typeof declared === "number") fixedPorts.add(declared);
  }

  const previousPorts = new Map<string, number>();
  const chosen = new Map<string, number>();
  const autoResources = resources.filter(isAuto).sort((a, b) => a.name.localeCompare(b.name));

  for (const resource of autoResources) {
    const declared = declaredPortOf(resource);
    const range = autoPortRange(resource);
    // A manifest "auto" was generated against the appType's base port; --auto-port rewrites the declared number.
    previousPorts.set(resource.name, typeof declared === "number" ? declared : range.base);
  }

  // First pass: validate and reserve every eligible saved assignment before any new allocation, so a service that
  // sorts after a new one does not lose a still-valid remembered port to it.
  const reservedPorts = new Set(fixedPorts);
  for (const resource of autoResources) {
    const remembered = replayableSavedPort(resource);
    if (!remembered) continue;
    if (reservedPorts.has(remembered.port)) continue;
    if (!(await isFree(remembered.port))) continue;
    if (!claim(remembered.port)) continue;
    chosen.set(resource.name, remembered.port);
    reservedPorts.add(remembered.port);
  }

  // Second pass: allocate the services whose saved assignment was missing, invalid or occupied.
  for (const resource of autoResources) {
    if (chosen.has(resource.name)) continue;
    const range = autoPortRange(resource);
    let picked: number | null = null;
    for (let port = range.base; port <= range.max; port++) {
      if (reservedPorts.has(port)) continue;
      if (!(await isFree(port))) continue;
      if (!claim(port)) continue;
      picked = port;
      break;
    }
    if (picked === null) {
      throw new FliskError(`No free port for service "${resource.name}" in range ${range.range}.`, [
        "Stop a service that holds a port in that range, or give the service a fixed port in service.json",
        "See the ports in use with: flisk resources",
      ]);
    }
    chosen.set(resource.name, picked);
    reservedPorts.add(picked);
  }

  if (!options.dryRun && chosen.size > 0) {
    const next: AutoPortState = { version: 1, ports: {} };
    for (const [name, port] of chosen) {
      const resource = resources.find((entry) => entry.name === name);
      next.ports[name] = { port, appType: resource?.config?.appType ?? resource?.type };
    }
    // Keep choices made for services outside this selection: a later `flisk up --only` must not lose them.
    for (const [name, entry] of saved) if (!(name in next.ports)) next.ports[name] = entry;
    writeState(projectRoot, next);
  }

  const env: Record<string, string> = {};
  for (const resource of autoResources) {
    const port = chosen.get(resource.name);
    if (port !== undefined) env[autoPortEnvName(resource)] = String(port);
  }
  const overlaid = overlayResolvedPorts(resources, chosen, previousPorts);
  return {
    ports: chosen,
    previousPorts,
    resources: overlaid,
    report: autoPortReportFromResources(overlaid),
    env,
  };
}
