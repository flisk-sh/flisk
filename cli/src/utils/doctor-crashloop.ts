// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CheckResult } from "../types/index.js";
import { toComposeProjectPrefix } from "./doctor-runtime.js";
import { redactSecrets } from "./secret-redaction.js";

const execFilePromise = promisify(execFile);
const DOCKER_TIMEOUT_MS = 10_000;
/** Restarts that make a container a crash loop rather than a one-off. */
export const CRASH_LOOP_RESTARTS = 5;
/** A container that restarted this recently is still looping; an old count on a healthy container is history. */
const RECENT_START_MS = 10 * 60_000;
const LOG_LINES = 3;
const LOG_LINE_MAX = 200;

/** Runs `docker` with args; resolves with stdout and stderr joined (logs write to both). */
export type DockerRun = (args: string[]) => Promise<string>;

const runDocker: DockerRun = async (args) => {
  const { stdout, stderr } = await execFilePromise("docker", args, {
    encoding: "utf-8",
    timeout: DOCKER_TIMEOUT_MS,
    windowsHide: true,
  });
  return `${stdout}${stderr}`;
};

export interface ContainerState {
  name: string;
  restartCount: number;
  status: string;
  startedAt: string;
  finishedAt?: string;
  exitCode: number;
}

/** Whether this container's compose project belongs to the TDK project, however the engine spelled the separator. */
export function belongsToProject(composeProject: string, projectName: string): boolean {
  const prefix = toComposeProjectPrefix(projectName).toLowerCase();
  const label = composeProject.replace(/-/g, "_").toLowerCase();
  return label === prefix || label.startsWith(`${prefix}_`);
}

export function isCrashLooping(state: ContainerState, now = Date.now()): boolean {
  if (state.status === "restarting") return true;
  if (state.restartCount < CRASH_LOOP_RESTARTS) return false;
  if (state.status === "running") {
    const started = Date.parse(state.startedAt);
    return Number.isNaN(started) || now - started < RECENT_START_MS;
  }
  // Stopped: only a recent failure is a loop that gave up (restart policy exhausted). A container stopped by hand
  // keeps its old restart count, and that is history.
  const finished = Date.parse(state.finishedAt ?? "");
  return state.exitCode !== 0 && !Number.isNaN(finished) && now - finished < RECENT_START_MS;
}

/** A hint for a cause that the last log lines name. Null when they do not say. */
export function crashLoopHint(logs: string, state: ContainerState): string | null {
  const database = /database "([^"]+)" does not exist/i.exec(logs);
  if (database) {
    return `database "${database[1]}" does not exist: re-run the project's database provisioning (tdk up) or create it`;
  }
  if (/Cannot find module|MODULE_NOT_FOUND|module not found/i.test(logs)) {
    return "a module is missing from the image: rebuild it (tdk up --force) after checking the resource's dependencies";
  }
  if (/EADDRINUSE|address already in use/i.test(logs)) {
    return "the port inside the container is already in use: check for two processes started by the same command";
  }
  if (/ECONNREFUSED|connection refused|could not connect/i.test(logs)) {
    return "a dependency is not reachable: check that the service it connects to is running and healthy";
  }
  if (
    /(is not set|is required|missing required|undefined).*(env|environment|variable)|environment variable.*(missing|not set|required)/i.test(
      logs,
    )
  ) {
    return "a required environment variable is missing: check the project's .env";
  }
  if (state.exitCode === 137)
    return "killed (exit 137), usually out of memory: raise the container's memory limit";
  return null;
}

function parseStates(output: string): ContainerState[] {
  const states: ContainerState[] = [];
  for (const line of output.split(/\r?\n/)) {
    const [name, restarts, status, startedAt, exitCode, finishedAt] = line.split("\t");
    if (!name || restarts === undefined) continue;
    states.push({
      name: name.replace(/^\//, ""),
      restartCount: Number(restarts) || 0,
      status: status ?? "",
      startedAt: startedAt ?? "",
      exitCode: Number(exitCode) || 0,
      finishedAt: finishedAt ?? "",
    });
  }
  return states;
}

/** Containers of this project that keep restarting, with their last log lines and a cause hint when one is clear. */
export async function checkCrashLoopingContainers(
  projectName: string,
  secrets: readonly string[] = [],
  run: DockerRun = runDocker,
  now = Date.now(),
): Promise<CheckResult> {
  const name = "Crash-looping containers";
  let candidates: string[];
  try {
    const listing = await run([
      "ps",
      "-a",
      "--format",
      '{{.ID}}\t{{.Label "com.docker.compose.project"}}',
    ]);
    candidates = listing
      .split(/\r?\n/)
      .map((line) => line.split("\t"))
      .filter(([id, project]) => id && project && belongsToProject(project, projectName))
      .map(([id]) => id as string);
  } catch {
    return {
      name,
      didPass: true,
      isSkipped: true,
      message: "Docker not available - skipped crash-loop check",
    };
  }
  if (candidates.length === 0) {
    return { name, didPass: true, isSkipped: true, message: "No project containers to check" };
  }

  let states: ContainerState[];
  try {
    states = parseStates(
      await run([
        "inspect",
        "--format",
        "{{.Name}}\t{{.RestartCount}}\t{{.State.Status}}\t{{.State.StartedAt}}\t{{.State.ExitCode}}\t{{.State.FinishedAt}}",
        ...candidates,
      ]),
    );
  } catch {
    // A container removed between ps and inspect fails the whole batch; that is not a finding.
    return {
      name,
      didPass: true,
      isSkipped: true,
      message: "Containers changed while checking - skipped crash-loop check",
    };
  }

  const looping = states.filter((state) => isCrashLooping(state, now));
  if (looping.length === 0) {
    return { name, didPass: true, message: "No project container is crash-looping" };
  }

  const details: string[] = [];
  const hints = new Set<string>();
  for (const state of looping) {
    let logs = "";
    try {
      logs = await run(["logs", "--tail", String(LOG_LINES), state.name]);
    } catch {
      // The container may have just been removed; report it without logs.
    }
    const lines = redactSecrets(logs, secrets)
      .split(/\r?\n/)
      .map((line) => line.trim().slice(0, LOG_LINE_MAX))
      .filter(Boolean);
    const hint = crashLoopHint(logs, state);
    if (hint) hints.add(hint);
    details.push(
      [
        `${state.name}: ${state.status}, restarted ${state.restartCount} times`,
        ...lines.map((line) => `  | ${line}`),
      ].join("\n    "),
    );
  }
  return {
    name,
    didPass: false,
    message: `${looping.length} container${looping.length === 1 ? " is" : "s are"} crash-looping:\n    ${details.join("\n    ")}`,
    fix: [...hints, "Read the full log: docker logs <container>"].join("; "),
  };
}
