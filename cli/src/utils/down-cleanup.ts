// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { join, relative as relativePath, resolve as resolvePath, sep } from "node:path";
import { toComposeProjectName } from "./compose-project-name.js";

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
  const prefix = toComposeProjectName(projectName);
  return PROJECT_NETWORK_SUFFIXES.map((suffix) => `${prefix}_${suffix}`);
}

/**
 * Prefixes of Flisk projects among `networkNames`, from the networks the engine creates. Generic suffixes such as
 * `backend` also occur in non-Flisk compose projects, so a prefix counts only if it has a Traefik network, which
 * only Flisk creates.
 */
export function fliskNetworkPrefixes(networkNames: string[]): Set<string> {
  const prefixes = new Set<string>();
  for (const name of networkNames) {
    for (const marker of ["traefik-public", "traefik-private"]) {
      if (name.endsWith(`_${marker}`)) prefixes.add(name.slice(0, -(marker.length + 1)));
    }
  }
  return prefixes;
}

/** The Flisk project prefix a network belongs to (`umami` for `umami_backend`), or null. */
export function fliskNetworkOwner(name: string, prefixes: Set<string>): string | null {
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

export interface PruneNetworksPlan {
  /** Networks `--prune-networks` would remove: they exist and no container outside the stopped stacks is attached. */
  remove: string[];
  /** Networks it would leave in place, with the reason (another container is attached, or Docker could not list them). */
  keep: { name: string; reason: string }[];
}

/**
 * What {@link pruneProjectNetworks} would do, without removing anything: the same exact project network names, each
 * checked with `docker ps --filter network=<name>` for running attached containers (the reason `docker network rm`
 * refuses one). `down` stops before it prunes, so containers of the compose projects in `stoppedByDown` (this project's
 * stacks, from {@link projectComposeProjects}) do not count: they will be gone by the time the network is removed.
 */
export function planProjectNetworkPrune(
  projectName: string,
  commandRunner: CommandRunner = run,
  stoppedByDown: readonly string[] = [],
): PruneNetworksPlan {
  const existing = new Set(
    commandRunner("docker", ["network", "ls", "--format", "{{.Name}}"])
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const stopped = new Set(stoppedByDown);
  const plan: PruneNetworksPlan = { remove: [], keep: [] };
  for (const name of projectNetworkNames(projectName)) {
    if (!existing.has(name)) continue;
    let composeProjects: string[];
    try {
      composeProjects = commandRunner("docker", [
        "ps",
        "--filter",
        `network=${name}`,
        "--format",
        // The `c:` prefix keeps a line for a container without a compose label (an empty label is not "no container").
        'c:{{.Label "com.docker.compose.project"}}',
      ])
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("c:"))
        .map((line) => line.slice(2));
    } catch (err) {
      const stderr = String((err as { stderr?: Buffer | string }).stderr ?? err).trim();
      plan.keep.push({ name, reason: stderr.split(/\r?\n/)[0] ?? "" });
      continue;
    }
    const remaining = composeProjects.filter((project) => !project || !stopped.has(project)).length;
    if (remaining > 0) {
      plan.keep.push({
        name,
        reason: `${remaining} container${remaining === 1 ? " is" : "s are"} attached`,
      });
    } else {
      plan.remove.push(name);
    }
  }
  return plan;
}

/**
 * The win32 counterpart of `ps -axo pid=,command=`: Tilt processes as `pid<TAB>commandLine`, following the PowerShell
 * pattern of `tilt-process.ts`. Reading the command line here (rather than filtering in PowerShell) keeps the Tiltfile
 * matching identical on every platform, including paths with spaces.
 */
const WINDOWS_TILT_PROCESS_SCRIPT =
  "Get-CimInstance Win32_Process -Filter \"Name = 'tilt.exe'\" -ErrorAction SilentlyContinue | " +
  'ForEach-Object { "$($_.ProcessId)`t$($_.CommandLine)" }';

interface WindowsTiltProcess {
  pid: number;
  commandLine: string;
}

/** Null means the process list could not be read, as opposed to an empty list meaning nothing is running. */
function windowsTiltProcesses(commandRunner: CommandRunner): WindowsTiltProcess[] | null {
  let output: string;
  try {
    output = commandRunner("powershell.exe", [
      "-NoProfile",
      "-Command",
      WINDOWS_TILT_PROCESS_SCRIPT,
    ]);
  } catch {
    return null;
  }
  const processes: WindowsTiltProcess[] = [];
  // Windows PowerShell may write UTF-16 to a redirected stdout; dropping the NUL bytes keeps plain ASCII fields intact.
  for (const line of output.replace(/\0/g, "").split(/\r?\n/)) {
    const match = /^\s*(\d+)\t(.*)$/.exec(line);
    if (!match) continue;
    processes.push({ pid: Number(match[1]), commandLine: match[2] ?? "" });
  }
  return processes;
}

const TILT_UP = /(?:^|\s)up(?:\s|$)/i;
const FILE_FLAG_PATH = /(?:^|\s)(?:-f|--file)\s+(?:"([^"]+)"|(\S+))(?=\s|$)/i;

function normalizeWindowsPath(path: string): string {
  return path.replace(/\\/g, "/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The executable at the start of a Windows command line, quoted paths included. */
function windowsExe(commandLine: string): string {
  const trimmed = commandLine.trimStart();
  if (trimmed.startsWith('"')) return trimmed.slice(1, trimmed.indexOf('"', 1));
  return trimmed.split(/\s+/)[0] ?? "";
}

function isTiltUpCommandLine(commandLine: string): boolean {
  return /(?:^|[\\/])tilt(?:\.exe)?$/i.test(windowsExe(commandLine)) && TILT_UP.test(commandLine);
}

/** True for a `tilt up` whose `-f`/`--file` is exactly this Tiltfile (also when the path was quoted or used `/`). */
function matchesWindowsTiltUp(process: WindowsTiltProcess, tiltfilePath: string): boolean {
  if (!isTiltUpCommandLine(process.commandLine)) return false;
  const target = escapeRegExp(normalizeWindowsPath(tiltfilePath));
  return new RegExp(`(?:^|\\s)(?:-f|--file)\\s+"?${target}"?(?=\\s|$)`, "i").test(
    normalizeWindowsPath(process.commandLine),
  );
}

/** The Flisk Tiltfile a `tilt up` command line was started with, or null for any other command. */
function tiltfileFromWindowsCommandLine(commandLine: string): string | null {
  if (!isTiltUpCommandLine(commandLine)) return null;
  const match = FILE_FLAG_PATH.exec(normalizeWindowsPath(commandLine));
  const flagValue = match?.[1] ?? match?.[2];
  if (!flagValue) return null;
  const tiltfile = normalizeWindowsPath(flagValue);
  return tiltfile.endsWith(PROJECT_TILTFILE_SUFFIX) ? tiltfile : null;
}

/**
 * Like {@link findProjectTiltUpPids}, but null when the process list cannot be read (`ps` or PowerShell fails),
 * so a caller can tell "no tilt up" from "could not look".
 */
export function lookupProjectTiltUpPids(
  tiltfilePath: string,
  platform = process.platform,
  commandRunner: CommandRunner = run,
): number[] | null {
  if (platform === "win32") {
    const processes = windowsTiltProcesses(commandRunner);
    if (processes === null) return null;
    return processes
      .filter((process) => matchesWindowsTiltUp(process, tiltfilePath))
      .map((p) => p.pid);
  }
  let output: string;
  try {
    output = commandRunner("ps", ["-axo", "pid=,command="]);
  } catch {
    return null;
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

/**
 * PIDs of `tilt up` processes started for this project's Tiltfile. Matching on the Tiltfile path keeps another
 * project's Tilt (or a Tilt the user started by hand) untouched.
 */
export function findProjectTiltUpPids(
  tiltfilePath: string,
  platform = process.platform,
  commandRunner: CommandRunner = run,
): number[] {
  return lookupProjectTiltUpPids(tiltfilePath, platform, commandRunner) ?? [];
}

const PROJECT_TILTFILE_SUFFIX = "/.flisk/.flisk-out/Tiltfile";

/**
 * Roots of the Flisk projects that have a `tilt up` running, read from each process's `-f <root>/.flisk/.flisk-out/Tiltfile`
 * (the Tiltfile `flisk up` passes). Lets `flisk down` find the project when it runs outside one. A root counts only while
 * it still has `.flisk/project.json`.
 */
export function findRunningFliskProjects(
  platform = process.platform,
  commandRunner: CommandRunner = run,
  isProject: (root: string) => boolean = (root) => existsSync(join(root, ".flisk", "project.json")),
): string[] {
  if (platform === "win32") {
    const processes = windowsTiltProcesses(commandRunner);
    if (processes === null) return [];
    const roots = new Set<string>();
    for (const process of processes) {
      const tiltfile = tiltfileFromWindowsCommandLine(process.commandLine);
      if (!tiltfile) continue;
      const root = tiltfile.slice(0, -PROJECT_TILTFILE_SUFFIX.length).replace(/\//g, "\\");
      if (isProject(root)) roots.add(root);
    }
    return [...roots].sort();
  }
  let output: string;
  try {
    output = commandRunner("ps", ["-axo", "pid=,command="]);
  } catch {
    return [];
  }
  const roots = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    const command = /^\s*\d+\s+(.*)$/.exec(line)?.[1] ?? "";
    const exe = (command.split(/\s+/)[0] ?? "").split("/").at(-1);
    if (exe !== "tilt" || !/^\S+\s+up\s/.test(command)) continue;
    const tiltfile = / -f (\/.*?\/\.flisk\/\.flisk-out\/Tiltfile)(?= |$)/.exec(command)?.[1];
    if (!tiltfile) continue;
    const root = tiltfile.slice(0, -PROJECT_TILTFILE_SUFFIX.length);
    if (isProject(root)) roots.add(root);
  }
  return [...roots].sort();
}

export function stopProjectTiltUp(
  tiltfilePath: string,
  platform = process.platform,
  commandRunner: CommandRunner = run,
): number[] {
  const pids = findProjectTiltUpPids(tiltfilePath, platform, commandRunner);
  for (const pid of pids) {
    try {
      if (platform === "win32") commandRunner("taskkill.exe", ["/PID", String(pid), "/F"]);
      else commandRunner("kill", ["-TERM", String(pid)]);
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

function realPathOrSelf(dir: string): string {
  try {
    return realpathSync(dir);
  } catch {
    return resolvePath(dir);
  }
}

/**
 * True when `dir` holds Compose files Flisk generated for the project at `root`: `.flisk/.flisk-out` or a service's
 * `.autogenerated` folder. A hand-written Compose project in a subfolder, and anything inside a nested Flisk project (a worktree,
 * a project vendored below this one), lives elsewhere or under its own `.flisk`, so Flisk did not start it.
 */
function isFliskComposeDir(root: string, dir: string): boolean {
  if (!dir.startsWith(root + sep)) return false;
  const parts = relativePath(root, dir).split(sep);
  const generated = join(".flisk", ".flisk-out");
  // Before the rename (#2039) the output folder was `.tdk/.tdk-out`; containers from that layout still hold ports.
  const legacy = join(".tdk", ".tdk-out");
  const head = parts.slice(0, 2).join(sep);
  const inOutput = head === generated || head === legacy;
  if (!inOutput && parts[parts.length - 1] !== ".autogenerated") return false;
  const ancestors = inOutput ? [] : parts.slice(0, -1);
  return !ancestors.some((_, i) =>
    existsSync(join(root, ...ancestors.slice(0, i + 1), ".flisk", "project.json")),
  );
}

/**
 * The Compose projects Flisk generated for this project, read from the containers' `com.docker.compose.project.working_dir`
 * label (the folder of the first compose file). Matching the folder, not the project name, keeps a project named `shop`
 * from taking `shop-admin`'s containers.
 */
export function projectComposeProjects(
  projectRoot: string,
  commandRunner: CommandRunner = run,
): string[] {
  const root = realPathOrSelf(projectRoot);
  const output = commandRunner("docker", [
    "ps",
    "-a",
    "--format",
    '{{.Label "com.docker.compose.project"}}\t{{.Label "com.docker.compose.project.working_dir"}}',
  ]);
  const names = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    const [name, workingDir] = line.split("\t");
    if (!name || !workingDir) continue;
    const dir = realPathOrSelf(workingDir.trim());
    if (isFliskComposeDir(root, dir)) names.add(name.trim());
  }
  return [...names].sort();
}

/**
 * Every Compose project that has a container whose working folder is `folder` or inside it, whatever generated it. Used by
 * the demo reset, which deletes the folder: a container left running from an older layout (`flisk_demo_postgres`, from
 * `.tdk/` or `services/platform/...`) keeps its host port and the next run fails with "port is already allocated" (#4124).
 */
export function composeProjectsUnder(folder: string, commandRunner: CommandRunner = run): string[] {
  const root = realPathOrSelf(folder);
  const output = commandRunner("docker", [
    "ps",
    "-a",
    "--format",
    '{{.Label "com.docker.compose.project"}}\t{{.Label "com.docker.compose.project.working_dir"}}',
  ]);
  const names = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    const [name, workingDir] = line.split("\t");
    if (!name || !workingDir) continue;
    const dir = realPathOrSelf(workingDir.trim());
    if (dir === root || dir.startsWith(root + sep)) names.add(name.trim());
  }
  return [...names].sort();
}

/** Stops and removes the Compose projects of {@link composeProjectsUnder}. Volumes are kept. Never throws. */
export function stopComposeProjectsUnder(
  folder: string,
  commandRunner: CommandRunner = run,
): ComposeFallbackResult {
  const result: ComposeFallbackResult = { stopped: [], failed: [] };
  let names: string[];
  try {
    names = composeProjectsUnder(folder, commandRunner);
  } catch {
    return result; // Docker is not running: there is nothing to stop.
  }
  for (const name of names) {
    try {
      commandRunner("docker", ["compose", "-p", name, "down", "--remove-orphans"]);
      result.stopped.push(name);
    } catch (err) {
      const stderr = String((err as { stderr?: Buffer | string }).stderr ?? err).trim();
      result.failed.push({ name, reason: stderr.split(/\r?\n/)[0] ?? "" });
    }
  }
  return result;
}

export interface ComposeFallbackResult {
  stopped: string[];
  failed: { name: string; reason: string }[];
}

/**
 * Stops and removes this project's containers with `docker compose -p <name> down`, for when `tilt down` cannot (its Tiltfile
 * fails to evaluate, #2899). Volumes are kept, as `tilt down` keeps them.
 */
export function stopProjectComposeProjects(
  projectRoot: string,
  commandRunner: CommandRunner = run,
): ComposeFallbackResult {
  const result: ComposeFallbackResult = { stopped: [], failed: [] };
  for (const name of projectComposeProjects(projectRoot, commandRunner)) {
    try {
      commandRunner("docker", ["compose", "-p", name, "down", "--remove-orphans"]);
      result.stopped.push(name);
    } catch (err) {
      const stderr = String((err as { stderr?: Buffer | string }).stderr ?? err).trim();
      result.failed.push({ name, reason: stderr.split(/\r?\n/)[0] ?? "" });
    }
  }
  return result;
}
