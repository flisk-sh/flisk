// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { STANDARD_PORTS } from "./constants.js";
import { isValidPort } from "./validation.js";

export type TiltPortParseResult =
  | { ok: true; port: number | undefined }
  | { ok: false; message: string };

export function parseTiltPort(value: string | undefined): TiltPortParseResult {
  if (value === undefined || value === "") return { ok: true, port: undefined };

  const port = Number(value);
  if (/[^0-9]/.test(value) || !isValidPort(port)) {
    return {
      ok: false,
      message: `Invalid TILT_PORT "${value}": expected an integer from 1 to 65535.`,
    };
  }

  return { ok: true, port };
}

/** Resolve the port for read-only polling, falling back when TILT_PORT is absent or invalid. */
export function getTiltPollingPort(value: string | undefined): number {
  const result = parseTiltPort(value);
  return result.ok ? (result.port ?? STANDARD_PORTS.tiltUi) : STANDARD_PORTS.tiltUi;
}

export function secondUpAction(input: {
  runningPorts: number[];
  force: boolean;
  only: boolean;
}): { action: "start" } | { action: "already-running" | "only-blocked"; ports: number[] } {
  if (input.runningPorts.length === 0 || input.force) return { action: "start" };
  if (input.only) return { action: "only-blocked", ports: input.runningPorts };
  return { action: "already-running", ports: input.runningPorts };
}

/**
 * What a second `flisk up` says about the Tilt it found running. A failed `flisk up` leaves its Tilt running, so
 * "a Tilt answers on the port" is not "the stack is healthy": report what that Tilt is running.
 */
export function alreadyRunningReport(
  port: number,
  readiness: {
    ready: boolean;
    failures: Array<{ name: string; message: string }>;
    timedOut: boolean;
    stillBuilding?: string[];
  },
):
  | { ok: true; message: string }
  | {
      ok: false;
      code: "UP_RESOURCE_FAILED" | "UP_TIMEOUT";
      message: string;
      suggestions: string[];
    } {
  if (readiness.ready) {
    return { ok: true, message: `Environment is already running on port ${port}.` };
  }
  const detail = readiness.failures.map((f) => `${f.name}: ${f.message}`).join("; ");
  const building =
    readiness.stillBuilding && readiness.stillBuilding.length > 0
      ? ` (${readiness.stillBuilding.join(", ")} still building)`
      : "";
  const state =
    readiness.failures.length > 0
      ? `is not healthy${detail ? ` (${detail})` : ""}`
      : `is still starting${building}`;
  return {
    ok: false,
    code: readiness.failures.length > 0 ? "UP_RESOURCE_FAILED" : "UP_TIMEOUT",
    message: `The stack already running on port ${port} ${state}. An earlier flisk up left it running.`,
    suggestions: [
      "See what failed: flisk status",
      "Fix the cause, then replace the running stack: flisk down && flisk up",
    ],
  };
}

export async function resolveTiltPort(options: {
  configuredPort: number | undefined;
  force: boolean;
  basePort: number;
  findAvailablePort: (basePort: number, attempts: number) => Promise<number | null | undefined>;
}): Promise<{ port: number; autoSwitched: boolean }> {
  if (options.configuredPort !== undefined) {
    return { port: options.configuredPort, autoSwitched: false };
  }
  if (options.force) return { port: options.basePort, autoSwitched: false };

  const availablePort = await options.findAvailablePort(options.basePort, 10);
  if (availablePort && availablePort !== options.basePort) {
    return { port: availablePort, autoSwitched: true };
  }
  return { port: options.basePort, autoSwitched: false };
}

export async function stopTiltForUp(
  options: { force: boolean; quiet: boolean; port: number },
  dependencies: {
    stop: (port: number) => void;
    log: (message: string) => void;
    wait: (milliseconds: number) => Promise<void>;
  },
): Promise<void> {
  if (!options.force) return;

  if (!options.quiet) {
    dependencies.log(`Force flag set - stopping Tilt on port ${options.port} if running...`);
  }
  dependencies.stop(options.port);
  await dependencies.wait(2000);
}
