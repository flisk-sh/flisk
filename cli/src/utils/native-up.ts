// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import type { DiscoveredResource } from "../types/index.js";
import { readEnvFileValues } from "./env-selection.js";
import { showError } from "./errors.js";
import { formatCount } from "./formatting.js";
import type { JsonEmitter } from "./json-output.js";
import { isDockerRunning } from "./native-container.js";
import {
  dependencyWaves,
  findMissingPrograms,
  formatPrefix,
  isPortListening,
  isProcessAlive,
  NATIVE_DIR,
  NativeSupervisor,
  nativeRunStatePath,
  planNativeRun,
  readNativeRunState,
  stopNativeRun,
} from "./native-runtime.js";
import { findPortOccupant } from "./port-occupant.js";
import { readProjectNameOrUndefined } from "./project-reader.js";
import { describeToolchainFinding, findToolchainMismatches } from "./toolchain.js";

export interface NativeUpInput {
  projectRoot: string;
  /** The services to start (the selection plus its dependsOn closure); every one declares `command`. */
  selected: DiscoveredResource[];
  /** Names in `selected` that are only there because a requested service depends on them. */
  dependencies: string[];
  stackName?: string;
  only?: string[];
  /** The env file of the run (`--env-file`), else the project .env when it exists. */
  envFilePath?: string;
  dryRun?: boolean;
  quiet?: boolean;
  force?: boolean;
  emit?: JsonEmitter;
  /** Overrides for tests. */
  readyTimeoutMs?: number;
  exit?: (code: number) => never;
}

/** Variables `${VAR}` in a service's env may reference: the env file of the run, overridden by the shell. */
/** What a local process starts with: the project .env (or --env-file), overridden by the shell. */
export function runVariables(projectRoot: string, envFilePath?: string): Record<string, string> {
  const path = envFilePath ?? join(projectRoot, ".env");
  const fromFile = existsSync(path) ? Object.fromEntries(readEnvFileValues(path)) : {};
  const fromShell = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  return { ...fromFile, ...fromShell };
}

/**
 * `flisk up` for a selection where every service declares `command`: no Docker, no Compose, no Tilt and no generated files.
 * Resolves only when the run ends (Ctrl+C, `flisk down`, or a failed start, which exits 1).
 */
export async function runNativeUp(input: NativeUpInput): Promise<void> {
  const { projectRoot, selected, emit } = input;
  const exit = input.exit ?? ((code: number) => process.exit(code));
  const quiet = Boolean(input.quiet);
  const fail = (code: string, message: string, data: Record<string, unknown> = {}): never => {
    emit?.({ ok: false, runtime: "native", ...data }, [{ code, message }]);
    showError(message);
    return exit(1);
  };

  const vars = runVariables(projectRoot, input.envFilePath);
  const plan = planNativeRun(selected, vars, projectRoot, readProjectNameOrUndefined(projectRoot));
  if (plan.errors.length > 0) fail("INVALID_SERVICE_CONFIG", plan.errors.join("\n"));
  // A "toolchain" in service.json is binding: a service on the wrong runtime fails later in ways that never name the version.
  const toolchainMismatches = findToolchainMismatches(selected).filter(
    (finding) => !finding.isHint,
  );
  if (toolchainMismatches.length > 0) {
    fail(
      "TOOLCHAIN_MISMATCH",
      `${toolchainMismatches.map(describeToolchainFinding).join("\n")}\nSwitch to that version with your version manager, or change "toolchain" in the service.json.`,
    );
  }
  if (plan.missingVars.length > 0 && !quiet) {
    console.warn(
      chalk.yellow(
        `Unset variables expanded to an empty value: ${plan.missingVars.join(", ")}. Set them in .env or the shell.`,
      ),
    );
  }
  const missing = findMissingPrograms(plan.services);
  if (missing.length > 0) {
    fail(
      "NATIVE_COMMAND_NOT_FOUND",
      missing
        .map(
          ({ name, program }) =>
            `service "${name}" runs ${program}, which is not installed (not found on PATH). Install it, or change "command" in its service.json.`,
        )
        .join("\n"),
    );
  }

  const containers = plan.services.filter((service) => service.container);
  const serviceNames = plan.services.map((service) => service.name);
  const startOrder = dependencyWaves(plan.services);
  const description = input.only
    ? `${formatCount(input.only.length, "requested service")}${input.dependencies.length > 0 ? ` plus ${input.dependencies.join(", ")}` : ""}`
    : input.stackName
      ? `stack "${input.stackName}"`
      : formatCount(serviceNames.length, "service");
  if (!quiet) {
    console.log(
      chalk.blue(
        `${input.dryRun ? "Would start" : "Starting"} ${description} as local processes${containers.length > 0 ? `, ${containers.map((service) => service.name).join(", ")} with docker run (no Tilt)` : " (no Docker, no Tilt)"}...`,
      ),
    );
    for (const service of plan.services) {
      const after = service.dependsOn.length > 0 ? ` (after ${service.dependsOn.join(", ")})` : "";
      const what = service.container
        ? `container ${String(selected.find((resource) => resource.name === service.name)?.config?.image)}`
        : service.command;
      console.log(chalk.gray(`  - ${service.name}: ${what}${after}`));
    }
  }
  if (input.dryRun) {
    emit?.({
      ok: true,
      dryRun: true,
      runtime: "native",
      stack: input.stackName ?? null,
      services: serviceNames,
      ...(input.only ? { requested: input.only, declaredDependencies: input.dependencies } : {}),
      startOrder,
      ...(containers.length > 0 ? { containers: containers.map((service) => service.name) } : {}),
    });
    if (!quiet) console.log(chalk.yellow("Dry run: not starting services"));
    return;
  }

  const running = readNativeRunState(projectRoot);
  if (running && running.pid !== process.pid && isProcessAlive(running.pid)) {
    if (!input.force) {
      const message = `This project is already running as local processes (flisk up, pid ${running.pid}).`;
      emit?.({ ok: true, alreadyRunning: true, runtime: "native", pid: running.pid });
      if (!quiet) {
        console.log(chalk.green(message));
        console.log(chalk.gray("Stop it with flisk down, or pass --force to restart it."));
      }
      return;
    }
  }
  if (running) {
    // A previous run that was replaced (--force) or killed without cleaning up: stop whatever it left behind.
    await stopNativeRun(projectRoot);
  }

  if (containers.length > 0 && !isDockerRunning()) {
    fail(
      "DOCKER_NOT_RUNNING",
      `${containers.map((service) => service.name).join(", ")} run from an image, which needs Docker, and Docker is not running. Start Docker Desktop, OrbStack or Colima, then run flisk up again.`,
    );
  }

  for (const service of plan.services) {
    if (service.port !== undefined && (await isPortListening(service.port))) {
      const occupant = findPortOccupant(service.port);
      fail(
        "PORT_IN_USE",
        `Port ${service.port} for service "${service.name}" is already in use${occupant ? ` by ${occupant.command} (pid ${occupant.pid})` : ""}. Stop it, or change "port" in the service.json.`,
      );
    }
  }

  const width = Math.max(...serviceNames.map((name) => name.length));
  const prefix = (name: string) => formatPrefix(name, serviceNames.indexOf(name), width);
  const supervisor = new NativeSupervisor(
    projectRoot,
    plan.services,
    {
      onLine: quiet ? undefined : (name, line) => console.log(`${prefix(name)}${line}`),
      onNote: quiet
        ? undefined
        : (name, message) => console.log(`${prefix(name)}${chalk.gray(`[flisk] ${message}`)}`),
    },
    { readyTimeoutMs: input.readyTimeoutMs, baseEnv: vars },
  );

  let stopping: Promise<void> | undefined;
  const stopAndExit = (code: number) => {
    stopping ??= (async () => {
      if (!quiet) console.log(chalk.gray("\nStopping local processes..."));
      await supervisor.stop();
      exit(code);
    })();
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => stopAndExit(0));
  }
  // If every service exits for good, nothing keeps `flisk up` alive; it ends and must not leave a run.json behind.
  process.once("exit", () => {
    if (readNativeRunState(projectRoot)?.pid === process.pid) {
      rmSync(nativeRunStatePath(projectRoot), { force: true });
    }
  });

  const failures = await supervisor.start();
  if (stopping) return;
  if (failures.length > 0) {
    const message = [
      "Local processes did not start:",
      ...failures.map((failure) => `  ✗ ${failure.name}: ${failure.reason}`),
      `Output of every service: ${join(NATIVE_DIR, "logs")}/<service>.log`,
    ].join("\n");
    emit?.({ ok: false, runtime: "native", failures }, [{ code: "UP_RESOURCE_FAILED", message }]);
    showError(message);
    await supervisor.stop();
    exit(1);
    return;
  }

  emit?.({
    ok: true,
    runtime: "native",
    stack: input.stackName ?? null,
    services: serviceNames,
    ...(input.only ? { requested: input.only, dependencies: input.dependencies } : {}),
    urls: Object.fromEntries(
      plan.services.flatMap((service) => (service.url ? [[service.name, service.url]] : [])),
    ),
  });
  if (!quiet) {
    const lines = [
      containers.length > 0
        ? `Flisk is up (local processes, ${formatCount(containers.length, "container")} with docker run).`
        : "Flisk is up (local processes, no Docker).",
      "Services:",
    ];
    for (const service of plan.services) {
      const health = service.healthUrl ? ` (health: ${service.healthUrl})` : "";
      lines.push(`  ✓ ${service.name}${service.url ? ` → ${service.url}` : ""}${health}`);
    }
    lines.push("Stop: Ctrl+C here, or flisk down from another terminal");
    lines.push(`Logs: flisk logs --service <name>, or ${join(NATIVE_DIR, "logs")}/<service>.log`);
    for (const line of lines) console.log(chalk.blue(line));
  }
  // The services keep the process alive; `flisk up` ends when it is stopped.
  await new Promise<void>(() => {});
}
