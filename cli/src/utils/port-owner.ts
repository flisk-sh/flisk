// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import type { PortOwnerDetails } from "../types/index.js";
import { DEFAULT_HOST_PORT_RANGES } from "./host-port-plan.js";

export type { PortOwnerDetails };

export type CommandRunner = (command: string, args: string[]) => string;
export type DockerRunner = (args: string[]) => string;

const defaultProcessRunner: CommandRunner = (command, args) =>
  execFileSync(command, args, {
    encoding: "utf-8",
    stdio: "pipe",
    timeout: 5000,
    windowsHide: true,
  });

const defaultDockerRunner: DockerRunner = (args) =>
  execFileSync("docker", args, {
    encoding: "utf-8",
    stdio: "pipe",
    timeout: 5000,
    windowsHide: true,
  });

export interface PortOwnerOptions {
  platform?: NodeJS.Platform;
  processRunner?: CommandRunner;
  dockerRunner?: DockerRunner;
  env?: NodeJS.ProcessEnv;
}

/**
 * Return the relevant Flisk configuration setting for a given port, or undefined if no known setting controls it.
 */
export function getPortSetting(
  port: number,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  // Explicit overrides win: a user who sets FLISK_HTTPS_PORT=8080 owns that port
  // even though 8080 is not a default ingress port.
  if (env.FLISK_HTTP_PORT === String(port)) return "FLISK_HTTP_PORT";
  if (env.FLISK_HTTPS_PORT === String(port)) return "FLISK_HTTPS_PORT";
  if (env.FLISK_POSTGRES_PORT === String(port)) return "FLISK_POSTGRES_PORT";

  if (
    port === 80 ||
    (port >= DEFAULT_HOST_PORT_RANGES.ingressHttp.start &&
      port <= DEFAULT_HOST_PORT_RANGES.ingressHttp.end)
  ) {
    return "FLISK_HTTP_PORT";
  }

  if (
    port === 443 ||
    (port >= DEFAULT_HOST_PORT_RANGES.ingressHttps.start &&
      port <= DEFAULT_HOST_PORT_RANGES.ingressHttps.end)
  ) {
    return "FLISK_HTTPS_PORT";
  }

  if (
    port === 5432 ||
    (port >= DEFAULT_HOST_PORT_RANGES.postgres.start && port <= DEFAULT_HOST_PORT_RANGES.postgres.end)
  ) {
    return "FLISK_POSTGRES_PORT";
  }

  return undefined;
}

/**
 * Find whether a published Docker container owns the specified port.
 */
export function findDockerPortOwner(
  port: number,
  dockerRunner: DockerRunner = defaultDockerRunner,
  env: NodeJS.ProcessEnv = process.env,
): PortOwnerDetails | null {
  try {
    const output = dockerRunner(["ps", "--format", "{{.Names}}\t{{.Image}}\t{{.Ports}}"]);
    for (const line of output.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split("\t");
      const name = parts[0]?.trim() ?? "";
      const image = parts.length >= 3 ? parts[1]?.trim() || undefined : undefined;
      const portsField = parts.length >= 3 ? (parts[2]?.trim() ?? "") : (parts[1]?.trim() ?? "");

      const published = portsField
        .split(/[\s,]+/)
        .some((mapping) => mapping.startsWith(`${port}->`) || mapping.includes(`:${port}->`));

      if (published && name) {
        return {
          ownerType: "docker",
          type: "docker",
          kind: "docker",
          port,
          container: name,
          name,
          image,
          setting: getPortSetting(port, env),
        };
      }
    }
  } catch {
    // Docker unavailable or failed; treat as unknown
  }
  return null;
}

/**
 * Find whether a local host process owns the specified port using lsof and ps.
 */
export function findProcessPortOwner(
  port: number,
  platform: NodeJS.Platform = process.platform,
  commandRunner: CommandRunner = defaultProcessRunner,
  env: NodeJS.ProcessEnv = process.env,
): PortOwnerDetails | null {
  if (platform === "win32") return null;
  try {
    const lines = commandRunner("lsof", ["-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"])
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const first = lines[0];
    if (!first) return null;
    const pid = Number(first);
    if (!Number.isInteger(pid) || pid <= 0) return null;

    const commOutput = commandRunner("ps", ["-p", String(pid), "-o", "comm="]).trim();
    if (!commOutput) return null;
    const processName = basename(commOutput);
    if (!processName) return null;

    return {
      ownerType: "process",
      type: "process",
      kind: "process",
      port,
      process: processName,
      command: processName,
      name: processName,
      pid,
      setting: getPortSetting(port, env),
    };
  } catch {
    // lsof or ps unavailable or nothing listening
    return null;
  }
}

/**
 * Identify the process or container using a busy port.
 * Checks Docker published ports first, then falls back to host processes via lsof.
 */
export function findPortOwner(
  port: number,
  options: PortOwnerOptions = {},
): PortOwnerDetails | null {
  const env = options.env ?? process.env;
  const dockerOwner = findDockerPortOwner(port, options.dockerRunner, env);
  if (dockerOwner) return dockerOwner;

  const processOwner = findProcessPortOwner(
    port,
    options.platform ?? process.platform,
    options.processRunner,
    env,
  );
  if (processOwner) return processOwner;

  return null;
}

/**
 * Format human-readable diagnostics for a port conflict, matching Flisk doctor expectations.
 */
export function formatPortOwnerDiagnostic(
  port: number,
  owner: PortOwnerDetails | null,
  fallbackMessage?: string,
): { message: string; fix: string } {
  if (!owner) {
    const setting = getPortSetting(port);
    const message = fallbackMessage ?? `Port ${port} is already in use.`;
    const fix = setting
      ? `Change ${setting} to an available port, or stop the conflicting process.`
      : `Stop the process bound to port ${port}.`;
    return { message, fix };
  }

  const messageLines: string[] = [`Port ${port} is already in use.`, ""];
  let fix = "";

  if (owner.ownerType === "docker" && owner.container) {
    messageLines.push(`Owner: Docker container ${owner.container}`);
    if (owner.image) {
      messageLines.push(`Image: ${owner.image}`);
    }
    messageLines.push(`Port: ${port}`);
    messageLines.push("");
    messageLines.push("Suggested action:");
    if (owner.setting) {
      messageLines.push(`Change ${owner.setting} to an available port,`);
      messageLines.push("or manually stop the conflicting container.");
      fix = `Change ${owner.setting} to an available port, or manually stop the conflicting container (docker stop ${owner.container}).`;
    } else {
      messageLines.push("Manually stop the conflicting container.");
      fix = `Manually stop the conflicting container (docker stop ${owner.container}).`;
    }
  } else if (owner.ownerType === "process" && owner.process && owner.pid) {
    messageLines.push(`Owner: process ${owner.process} (PID ${owner.pid})`);
    messageLines.push(`Port: ${port}`);
    messageLines.push("");
    messageLines.push("Suggested action:");
    if (owner.setting) {
      messageLines.push(`Change ${owner.setting} to an available port,`);
      messageLines.push("or manually stop the conflicting process.");
      fix = `Change ${owner.setting} to an available port, or manually stop the conflicting process (PID ${owner.pid}).`;
    } else {
      messageLines.push("Manually stop the conflicting process.");
      fix = `Manually stop the conflicting process (PID ${owner.pid}).`;
    }
  }

  return {
    message: messageLines.join("\n"),
    fix,
  };
}
