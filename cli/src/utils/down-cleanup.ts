// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";

type CommandRunner = (command: string, args: string[]) => string;

const run: CommandRunner = (command, args) =>
  execFileSync(command, args, { encoding: "utf-8", stdio: "pipe", windowsHide: true });

/** Network names the engine creates per project (see engine/.../docker/constants.star and init-networks). */
const PROJECT_NETWORK_SUFFIXES = [
  "traefik-public",
  "traefik-private",
  "backend",
  "database",
  "infisical-network",
  "verdaccio-network",
  "proxy",
];

/** The engine prefixes networks with the project name, hyphens turned into underscores. */
export function projectNetworkNames(projectName: string): string[] {
  const prefix = projectName.replace(/-/g, "_");
  return PROJECT_NETWORK_SUFFIXES.map((suffix) => `${prefix}_${suffix}`);
}

/**
 * Prefixes of Flisk projects among `networkNames`, from the networks the engine creates. Generic suffixes such as
 * `backend` also occur in non-Flisk compose projects, so a prefix counts only if it has a Traefik network, which
 * only Flisk creates.
 */
export function tdkNetworkPrefixes(networkNames: string[]): Set<string> {
  const prefixes = new Set<string>();
  for (const name of networkNames) {
    for (const marker of ["traefik-public", "traefik-private"]) {
      if (name.endsWith(`_${marker}`)) prefixes.add(name.slice(0, -(marker.length + 1)));
    }
  }
  return prefixes;
}

/** The Flisk project prefix a network belongs to (`umami` for `umami_backend`), or null. */
export function tdkNetworkOwner(name: string, prefixes: Set<string>): string | null {
  for (const suffix of PROJECT_NETWORK_SUFFIXES) {
    if (name.endsWith(`_${suffix}`)) {
      const prefix = name.slice(0, -(suffix.length + 1));
      if (prefixes.has(prefix)) return prefix;
    }
  }
  return null;
}

export interface PruneNetworksResult {
  removed: string[];
  /** Networks that exist but Docker refused to remove, usually because a container is still attached. */
  kept: { name: string; reason: string }[];
}

/**
 * Remove this project's own networks. Only the exact names the engine creates are touched, and `docker network rm`
 * itself refuses a network that still has containers attached, so another project's networks and in-use networks
 * are never removed.
 */
export function pruneProjectNetworks(
  projectName: string,
  commandRunner: CommandRunner = run,
): PruneNetworksResult {
  const existing = new Set(
    commandRunner("docker", ["network", "ls", "--format", "{{.Name}}"])
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const result: PruneNetworksResult = { removed: [], kept: [] };
  for (const name of projectNetworkNames(projectName)) {
    if (!existing.has(name)) continue;
    try {
      commandRunner("docker", ["network", "rm", name]);
      result.removed.push(name);
    } catch (err) {
      const stderr = String((err as { stderr?: Buffer | string }).stderr ?? err).trim();
      result.kept.push({ name, reason: stderr.split(/\r?\n/)[0] ?? "" });
    }
  }
  return result;
}

/**
 * PIDs of `tilt up` processes started for this project's Tiltfile. Matching on the Tiltfile path keeps another
 * project's Tilt (or a Tilt the user started by hand) untouched.
 */
export function findProjectTiltUpPids(
  tiltfilePath: string,
  platform = process.platform,
  commandRunner: CommandRunner = run,
): number[] {
  if (platform === "win32") return [];
  let output: string;
  try {
    output = commandRunner("ps", ["-axo", "pid=,command="]);
  } catch {
    return [];
  }
  const pids: number[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (!match) continue;
    const command = match[2] ?? "";
    const exe = (command.split(/\s+/)[0] ?? "").split("/").at(-1);
    const target = ` -f ${tiltfilePath}`;
    const at = command.indexOf(target);
    const boundary = command[at + target.length];
    if (
      exe === "tilt" &&
      /^\S+\s+up\s/.test(command) &&
      at > 0 &&
      (boundary === undefined || boundary === " ")
    ) {
      pids.push(Number(match[1]));
    }
  }
  return pids;
}

export function stopProjectTiltUp(
  tiltfilePath: string,
  platform = process.platform,
  commandRunner: CommandRunner = run,
): number[] {
  const pids = findProjectTiltUpPids(tiltfilePath, platform, commandRunner);
  for (const pid of pids) {
    try {
      commandRunner("kill", ["-TERM", String(pid)]);
    } catch {
      // Already gone.
    }
  }
  return pids;
}

/** Wait (up to `timeoutMs`) for the `tilt up` processes to exit after TERM, so `tilt down` does not race a live Tilt. */
export async function waitForTiltUpExit(
  tiltfilePath: string,
  timeoutMs = 8000,
  findPids: (tiltfilePath: string) => number[] = findProjectTiltUpPids,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (findPids(tiltfilePath).length > 0) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return true;
}
