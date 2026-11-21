// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckResult, DiscoveredResource } from "../types/index.js";
import { dependsOnOf } from "./dependency-graph.js";
import { formatCount } from "./formatting.js";
import { isDockerRunning, isNativeContainerService } from "./native-container.js";
import {
  findMissingPrograms,
  isPortListening,
  isProcessAlive,
  localUrl,
  planNativeRun,
  readNativeRunState,
} from "./native-runtime.js";
import { findOnPath } from "./which.js";

/**
 * Doctor checks for a project whose services all declare `command` (#2231). Such a project runs as local processes, so doctor
 * checks what those processes need (their programs, their dependsOn, their ports) instead of Docker, Compose and Tilt.
 */

/** Says which runtime doctor checked, so a missing Docker check reads as intended and not as forgotten. */
export function checkNativeRuntime(
  resources: readonly DiscoveredResource[],
  dockerRunning: () => boolean = isDockerRunning,
): CheckResult {
  const containers = resources.filter(isNativeContainerService).map((resource) => resource.name);
  if (containers.length > 0) {
    const running = dockerRunning();
    return {
      name: "Runtime",
      didPass: running,
      message: running
        ? `Local processes, plus ${formatCount(containers.length, "container")} (${containers.join(", ")}) started with docker run; Compose and Tilt are not needed`
        : `${containers.join(", ")} run from an image, which needs Docker, and Docker is not running`,
      ...(running
        ? {}
        : { fix: "Start Docker Desktop, OrbStack, Colima or Kiri, then run flisk up" }),
    };
  }
  return {
    name: "Runtime",
    didPass: true,
    message: `Local processes: ${formatCount(resources.length, "service")} declare a command, so Docker, Compose and Tilt are not needed`,
  };
}

/** Each service's command starts a program that is installed. */
export function checkNativeCommands(
  resources: readonly DiscoveredResource[],
  find: (program: string) => string | null = findOnPath,
): CheckResult {
  const missing = findMissingPrograms(planNativeRun(resources).services, find);
  if (missing.length === 0) {
    return {
      name: "Service commands",
      didPass: true,
      message: "Every service command starts a program that is installed",
    };
  }
  return {
    name: "Service commands",
    didPass: false,
    message: `${formatCount(missing.length, "service")} run a program that is not on PATH:\n    ${missing.map(({ name, program }) => `${name}: ${program}`).join("\n    ")}`,
    fix: 'Install the program, or change "command" in the service.json',
  };
}

/** A dependsOn name must be another service of the project: local processes cannot start a database or gateway for it. */
export function checkNativeDependsOn(resources: readonly DiscoveredResource[]): CheckResult {
  const names = new Set(resources.map((resource) => resource.name));
  const problems = resources.flatMap((resource) => {
    return dependsOnOf(resource.config)
      .filter((dep) => !names.has(dep))
      .map((dep) => `${resource.name} dependsOn "${dep}", which is not a service of this project`);
  });
  if (problems.length === 0) {
    return {
      name: "Service dependencies",
      didPass: true,
      message: "Every dependsOn names a service of this project",
    };
  }
  return {
    name: "Service dependencies",
    didPass: false,
    message: problems.join("\n    "),
    fix: 'Add the missing service with a command, or with an "image" to run it as a container (a database, a cache), or remove it from dependsOn.',
  };
}

const BUN_BUILTINS = new Set([
  "run",
  "test",
  "x",
  "exec",
  "install",
  "i",
  "add",
  "a",
  "remove",
  "rm",
  "update",
  "outdated",
  "link",
  "unlink",
  "pm",
  "build",
  "init",
  "create",
  "c",
  "upgrade",
  "publish",
  "patch",
  "patch-commit",
  "repl",
  "completions",
  "help",
  "discord",
  "feedback",
  "pm-cache",
  "why",
]);

const YARN_BUILTINS = new Set([
  "add",
  "audit",
  "autoclean",
  "bin",
  "cache",
  "check",
  "config",
  "create",
  "dedupe",
  "dlx",
  "exec",
  "explain",
  "generate-lock-entry",
  "global",
  "help",
  "import",
  "info",
  "init",
  "install",
  "licenses",
  "link",
  "list",
  "login",
  "logout",
  "node",
  "outdated",
  "owner",
  "pack",
  "patch",
  "patch-commit",
  "plugin",
  "policies",
  "publish",
  "rebuild",
  "remove",
  "run",
  "set",
  "tag",
  "team",
  "unlink",
  "unplug",
  "up",
  "upgrade",
  "upgrade-interactive",
  "version",
  "versions",
  "why",
  "workspace",
  "workspaces",
]);

function scriptReference(command: string): string | null {
  const words = command.trim().split(/\s+/);
  let i = 0;
  while (i < words.length) {
    const word = words[i] as string;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) {
      i++;
      continue;
    }
    if (word === "exec" || word === "env") {
      i++;
      continue;
    }
    break;
  }
  if (i >= words.length) return null;
  const program = words[i] as string;
  const rest = words.slice(i + 1);
  const firstNonFlag = (args: string[]): string | undefined =>
    args.find((arg) => !arg.startsWith("-"));

  if (["npm", "pnpm"].includes(program) && rest[0] === "run") {
    return firstNonFlag(rest.slice(1)) ?? null;
  }
  if (program === "yarn") {
    if (rest[0] === "run") return firstNonFlag(rest.slice(1)) ?? null;
    const name = firstNonFlag(rest);
    if (!name) return null;
    if (YARN_BUILTINS.has(name)) return null;
    if (/[\\/]/.test(name) || name.startsWith(".")) return null;
    if (/\.(?:[cm]?[jt]sx?|json|wasm)$/i.test(name)) return null;
    return name;
  }
  if (program === "bun" && rest[0] === "run") {
    return firstNonFlag(rest.slice(1)) ?? null;
  }
  if (program === "bun") {
    const name = firstNonFlag(rest);
    if (!name) return null;
    if (BUN_BUILTINS.has(name)) return null;
    if (/[\\/]/.test(name) || name.startsWith(".")) return null;
    if (/\.(?:[cm]?[jt]sx?|json|wasm)$/i.test(name)) return null;
    return name;
  }
  return null;
}

function readPackageScripts(dir: string): Record<string, string> | null {
  const packageJsonPath = join(dir, "package.json");
  if (!existsSync(packageJsonPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as { scripts?: unknown };
    const scripts = parsed.scripts;
    if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) return {};
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(scripts as Record<string, unknown>)) {
      if (typeof value === "string") result[key] = value;
    }
    return result;
  } catch {
    return null;
  }
}

/** Each service command/dev command that invokes a package.json script must refer to a script that exists. */
export function checkNativeServiceScripts(resources: readonly DiscoveredResource[]): CheckResult {
  const problems: string[] = [];
  for (const resource of resources) {
    const config = resource.config;
    if (!config || config.appType === "bring-your-own") continue;
    const scripts = readPackageScripts(resource.path);
    if (scripts === null) continue;

    const commands: Array<{ command: string; field: "command" | "dev.command" }> = [];
    if (typeof config.command === "string" && config.command.trim() !== "") {
      commands.push({ command: config.command, field: "command" });
    }
    const dev = config.dev;
    if (dev && typeof dev === "object" && !Array.isArray(dev)) {
      const devCommand = (dev as Record<string, unknown>).command;
      if (typeof devCommand === "string" && devCommand.trim() !== "") {
        commands.push({ command: devCommand, field: "dev.command" });
      }
    }

    const available = Object.keys(scripts);
    const availableLabel = available.length > 0 ? available.join(", ") : "(none)";
    for (const { command, field } of commands) {
      const script = scriptReference(command);
      if (!script) continue;
      if (Object.hasOwn(scripts, script)) continue;
      problems.push(
        `${resource.name}: "${command}" in ${field === "command" ? "service.json" : "service.json dev.command"}, but package.json has no "${script}" script (scripts: ${availableLabel})`,
      );
    }
  }

  if (problems.length === 0) {
    return {
      name: "Service scripts",
      didPass: true,
      message: "Every service command script exists in package.json",
    };
  }

  return {
    name: "Service scripts",
    didPass: false,
    message: problems.join("\n    "),
    fix: 'Add the missing script to package.json, or change "command" or "dev.command" in service.json',
  };
}

/**
 * When a native run is up, each service answers on its health URL (or accepts connections on its port). Skipped when nothing
 * runs: doctor is also used before the first `flisk up`.
 */
export async function checkNativeServiceHealth(
  projectRoot: string,
  resources: readonly DiscoveredResource[],
  timeoutMs: number,
): Promise<CheckResult> {
  const state = readNativeRunState(projectRoot);
  if (!state || !isProcessAlive(state.pid)) {
    return {
      name: "Service Health",
      didPass: true,
      isSkipped: true,
      message: "Not running - start it with flisk up",
    };
  }
  const failing: string[] = [];
  for (const plan of planNativeRun(resources).services) {
    if (plan.port === undefined) continue;
    const answered = plan.healthUrl
      ? await fetch(plan.healthUrl, { signal: AbortSignal.timeout(timeoutMs) })
          .then((response) => response.status < 400)
          .catch(() => false)
      : await isPortListening(plan.port, timeoutMs);
    if (!answered)
      failing.push(`${plan.name}: no answer from ${plan.healthUrl ?? localUrl(plan.port)}`);
  }
  if (failing.length === 0) {
    return {
      name: "Service Health",
      didPass: true,
      message: "Every running service answers",
    };
  }
  return {
    name: "Service Health",
    didPass: false,
    message: failing.join("\n    "),
    fix: "Read the service output in .flisk/native/logs/<service>.log, or the flisk up terminal",
  };
}
