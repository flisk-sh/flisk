// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

/**
 * Warning for Flisk projects that have been up for days. Each one keeps its own Traefik, Postgres and apps running, so
 * forgetting a few projects fills the host disk and memory long before anyone runs `flisk down` (#4296).
 */

import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { execFileSync } from "node:child_process";
import { readProjectConfig } from "../generator/template-engine.js";
import type { CheckResult } from "../types/index.js";
import { formatBytes } from "./formatting.js";
import { shellQuote } from "./native-container.js";
import { parseSizeToBytes } from "./stale-projects.js";

export type CommandRunner = (command: string, args: string[]) => string;

const defaultRun: CommandRunner = (command, args) =>
  execFileSync(command, args, { encoding: "utf-8", stdio: "pipe", windowsHide: true });

export const DEFAULT_IDLE_HOURS = 48;
const TILTFILE_SUFFIX = "/.flisk/.flisk-out/Tiltfile";

export interface RunningProject {
  root: string;
  uptimeSeconds: number;
}

/** `ps` etime is `[[DD-]HH:]MM:SS`; anything unrecognised counts as fresh rather than producing a false warning. */
export function parseEtime(etime: string): number {
  const fields = etime.trim().split(/[-:]/);
  if (fields.length < 1 || fields.length > 4 || fields.some((f) => !/^\d+$/.test(f))) return 0;
  const numbers = fields.map(Number);
  const [seconds, minutes, hours, days] = [...numbers].reverse();
  return (days ?? 0) * 86400 + (hours ?? 0) * 3600 + (minutes ?? 0) * 60 + (seconds ?? 0);
}

/** Roots of projects whose `tilt up` is still running, with how long that process has been alive. */
export function parseRunningProjects(
  psOutput: string,
  isProject: (root: string) => boolean = (root) => existsSync(join(root, ".flisk", "project.json")),
): RunningProject[] {
  const projects = new Map<string, number>();
  for (const line of psOutput.split(/\r?\n/)) {
    const match = /^\s*\d+\s+(\S+)\s+(.*)$/.exec(line);
    if (!match) continue;
    const [, etime, command] = match;
    if ((command.split(/\s+/)[0] ?? "").split("/").at(-1) !== "tilt") continue;
    if (!/^\S+\s+up\s/.test(command)) continue;
    const tiltfile = / -f (\/.*?\/Tiltfile)(?= |$)/.exec(command)?.[1];
    if (!tiltfile?.endsWith(TILTFILE_SUFFIX)) continue;
    const root = tiltfile.slice(0, -TILTFILE_SUFFIX.length);
    if (!isProject(root)) continue;
    projects.set(root, Math.max(projects.get(root) ?? 0, parseEtime(etime)));
  }
  return [...projects]
    .map(([root, uptimeSeconds]) => ({ root, uptimeSeconds }))
    .sort((a, b) => a.root.localeCompare(b.root));
}

export function formatUptime(uptimeSeconds: number): string {
  const hours = Math.floor(uptimeSeconds / 3600);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function safeRun(runner: CommandRunner, command: string, args: string[]): string {
  try {
    return runner(command, args);
  } catch {
    return "";
  }
}

export interface IdleProjectOptions {
  commandRunner?: CommandRunner;
  /** Pre-captured `ps -axo pid=,etime=,command=` output, for tests. */
  psOutput?: string;
  /** Pre-captured `docker ps --format` output, for tests. */
  dockerOutput?: string;
  /** Pre-captured `docker volume ls --format` output, for tests. */
  volumeOutput?: string;
  idleHours?: number;
  isProject?: (root: string) => boolean;
}

/** A non-failing doctor check that names every long-running project and how to stop it. */
export function checkIdleProjects(options: IdleProjectOptions = {}): CheckResult {
  const runner = options.commandRunner ?? defaultRun;
  const idleHours = options.idleHours ?? DEFAULT_IDLE_HOURS;
  const psOutput =
    options.psOutput ?? safeRun(runner, "ps", ["-axo", "pid=,etime=,command="]);
  const running = parseRunningProjects(psOutput, options.isProject).filter(
    (p) => p.uptimeSeconds >= idleHours * 3600,
  );
  if (running.length === 0) {
    return {
      name: "Idle Projects",
      didPass: true,
      message: `No Flisk project has been up for ${idleHours}h or longer`,
    };
  }

  const projects = running.map((project) => {
    let name = basename(project.root);
    try {
      name = readProjectConfig(project.root).project.name;
    } catch {
      // An unreadable config still has a path the user can stop.
    }
    return {
      ...project,
      name,
      key: name.toLowerCase(),
      containers: { count: 0, bytes: 0 },
      volumes: 0,
    };
  });

  const dockerOutput =
    options.dockerOutput ??
    safeRun(runner, "docker", ["ps", "--format", '{{.Names}}\t{{.Size}}']);
  for (const line of dockerOutput.split(/\r?\n/)) {
    const [name, size] = line.trim().split(/\s+/);
    if (!name) continue;
    const lower = name.toLowerCase();
    for (const project of projects) {
      if (lower.startsWith(`${project.key}-`) || lower.startsWith(`${project.key}_`)) {
        project.containers.count += 1;
        project.containers.bytes += parseSizeToBytes(size ?? "");
      }
    }
  }
  const volumeOutput =
    options.volumeOutput ??
    safeRun(runner, "docker", [
      "volume",
      "ls",
      "--format",
      '{{.Name}}\t{{.Label "com.docker.compose.project"}}',
    ]);
  for (const line of volumeOutput.split(/\r?\n/)) {
    const [name, projectLabel] = line.trim().split(/\s+/);
    if (!name) continue;
    for (const project of projects) {
      if (projectLabel?.toLowerCase() === project.key || name.toLowerCase().startsWith(project.key)) {
        project.volumes += 1;
      }
    }
  }

  const details = projects.map((project) => {
    const parts = [
      `${formatUptime(project.uptimeSeconds)} up`,
      `${project.containers.count} containers`,
    ];
    if (project.containers.bytes > 0) {
      parts.push(`${formatBytes(project.containers.bytes)} of container data`);
    }
    if (project.volumes > 0) parts.push(`${project.volumes} volumes`);
    return `  ${project.root} (${project.name}): ${parts.join(", ")}\n    flisk down --project ${shellQuote(project.root)}`;
  });

  return {
    name: "Idle Projects",
    didPass: false,
    isWarning: true,
    message: `${running.length} Flisk project${running.length === 1 ? " has" : "s have"} been up for ${idleHours}h or longer:\n${details.join("\n")}`,
    fix:
      "Stop any you no longer need with the `flisk down --project <path>` line above; " +
      "delete leftovers with `flisk projects --stale --prune` and trim the VM with `flisk doctor --fix --scope machine --yes`",
    observed: running,
  };
}
