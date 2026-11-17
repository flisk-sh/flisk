import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  describeToolchainFinding,
  findToolchainMismatches
} from "./chunk-4UXITHOF.js";
import {
  NATIVE_DIR,
  NativeSupervisor,
  dependencyWaves,
  findMissingPrograms,
  formatPrefix,
  isPortListening,
  isProcessAlive,
  nativeRunStatePath,
  planNativeRun,
  readNativeLogLines,
  readNativeRunState,
  stopNativeRun
} from "./chunk-4L23R74S.js";
import {
  databaseResourceNames,
  namesSharedPlatformPostgres
} from "./chunk-LJHNJFBB.js";
import {
  ensureGeneratedSecrets,
  isDockerRunning,
  readEnvFileValues,
  readProjectNameOrUndefined
} from "./chunk-2BH5UW2N.js";
import {
  formatCount
} from "./chunk-ARPSTQFE.js";
import {
  showError,
  source_default
} from "./chunk-73W4Y4TI.js";

// dist/utils/port-occupant.js
import { execFileSync } from "node:child_process";
import { basename } from "node:path";
var run = (command, args) => execFileSync(command, args, {
  encoding: "utf-8",
  stdio: "pipe",
  timeout: 5e3,
  windowsHide: true
});
function findPortOccupant(port, platform = process.platform, commandRunner = run) {
  if (platform === "win32") {
    const script = `$port=${port}; $c=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $p=Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; if ($p) { "$($p.Id)"; $p.ProcessName } }`;
    try {
      const [pidRaw, name] = commandRunner("powershell.exe", ["-NoProfile", "-Command", script]).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const pid = Number(pidRaw);
      if (!Number.isInteger(pid) || pid <= 0 || !name)
        return null;
      return { pid, command: name };
    } catch {
      return null;
    }
  }
  try {
    const [first] = commandRunner("lsof", ["-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"]).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!first)
      return null;
    const pid = Number(first);
    const name = commandRunner("ps", ["-p", first, "-o", "comm="]).trim();
    if (!Number.isInteger(pid) || !name)
      return null;
    return { pid, command: basename(name) };
  } catch {
    return null;
  }
}
function findPortContainer(port, commandRunner = run) {
  try {
    const [name] = commandRunner("docker", [
      "ps",
      "--filter",
      `publish=${port}`,
      "--format",
      "{{.Names}}"
    ]).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return name ? { pid: 0, command: "docker", container: name } : null;
  } catch {
    return null;
  }
}

// dist/utils/up-hints.js
var DOCS = "https://github.com/flisk-sh/flisk/blob/main/docs";
var UP_HINT_DOCS = {
  coldStart: `${DOCS}/troubleshooting.md#cold-start-blocked-docker-or-tilt-missing`,
  unhealthy: `${DOCS}/troubleshooting.md#services-never-turn-healthy-or-are-left-behind`,
  smoke: `${DOCS}/smoke.md`
};
function attachedUpInCiWarning(env) {
  if (!env.CI || env.CI === "false" || env.CI === "0")
    return null;
  return "This command stays attached and never exits on its own, so a CI job hangs here. Use `flisk up --wait`: it returns once the stack is healthy and leaves it running.";
}
function upFailureHints(failure) {
  switch (failure.kind) {
    case "machine":
      return [
        "Fix the checks above, then run: flisk doctor",
        `No Docker? Services that each declare a command run as local processes: ${DOCS}/run-without-docker.md`,
        `Troubleshooting: ${UP_HINT_DOCS.coldStart}`
      ];
    case "invalid-tilt-port":
      return ["Unset it to use the default port: unset TILT_PORT"];
    case "tilt-exited":
      return [
        "Check Docker, Tilt and the project: flisk doctor",
        "Rerun with Tilt's own output: flisk up --verbose"
      ];
    case "services":
    case "smoke": {
      const logs = failure.failed.length > 0 ? [`See why ${failure.failed[0]} failed: flisk logs -s ${failure.failed[0]}`] : [];
      if (failure.kind === "smoke") {
        return [...logs, `Smoke checks: ${UP_HINT_DOCS.smoke}`];
      }
      if (failure.timedOut) {
        const timeoutHints = [];
        if (failure.stillBuilding && failure.stillBuilding.length > 0) {
          timeoutHints.push("Run flisk up again to resume with cached image layers: flisk up");
        }
        timeoutHints.push("Increase the timeout with: flisk up --wait-timeout <seconds>");
        return [
          ...logs,
          ...timeoutHints,
          "Check the whole stack: flisk doctor",
          `Troubleshooting: ${UP_HINT_DOCS.unhealthy}`
        ];
      }
      return [
        ...logs,
        "Check the whole stack: flisk doctor",
        `Troubleshooting: ${UP_HINT_DOCS.unhealthy}`
      ];
    }
  }
}

// dist/utils/native-up.js
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
var FAILURE_LOG_LINES = 5;
var FAILURE_LOG_LINE_CHARS = 400;
var FAILURE_LOG_SCAN_LINES = 200;
function collapseRepeats(lines) {
  const out = [];
  let count = 0;
  for (const [i, line] of lines.entries()) {
    count += 1;
    if (line !== lines[i + 1]) {
      out.push(count > 1 ? `${line} (x${count})` : line);
      count = 0;
    }
  }
  return out;
}
function nativeUrlChecks(services, statuses) {
  return services.flatMap((service) => service.url ? [
    {
      service: service.name,
      url: service.url,
      didAnswer: true,
      status: statuses?.get(service.name) ?? 200
    }
  ] : []);
}
function withFailureLogs(projectRoot, failures, sinceEpochMs) {
  return failures.map((failure) => {
    const lines = readNativeLogLines(projectRoot, [failure.name], {
      tail: FAILURE_LOG_SCAN_LINES,
      ...sinceEpochMs === void 0 ? {} : { sinceMs: Date.now() - sinceEpochMs }
    }).map((line) => line.text.trimEnd()).filter((text) => text.trim());
    const logs = collapseRepeats(lines).slice(-FAILURE_LOG_LINES).map((text) => text.length > FAILURE_LOG_LINE_CHARS ? `${text.slice(0, FAILURE_LOG_LINE_CHARS - 1)}\u2026` : text);
    return logs.length > 0 ? { ...failure, logs } : failure;
  });
}
function runVariables(projectRoot, envFilePath) {
  const path = envFilePath ?? join(projectRoot, ".env");
  const fromFile = existsSync(path) ? Object.fromEntries(readEnvFileValues(path)) : {};
  const fromShell = Object.fromEntries(Object.entries(process.env).filter((entry) => entry[1] !== void 0));
  return { ...fromFile, ...fromShell };
}
function shadowedEnvKeys(projectRoot, envFilePath, shell = process.env) {
  const path = envFilePath ?? join(projectRoot, ".env");
  if (!existsSync(path))
    return [];
  return [...readEnvFileValues(path)].filter(([key, value]) => shell[key] !== void 0 && shell[key] !== value).map(([key]) => key).sort();
}
function localDatabaseEnv(dependsOn, databaseNames = [], declaredEnv = {}) {
  if (declaredEnv.DATABASE_URL !== void 0 && declaredEnv.DATABASE_URL !== "")
    return {};
  return dependsOn.some((name) => namesSharedPlatformPostgres(name, databaseNames)) ? {} : { DATABASE_URL: "" };
}
async function runNativeUp(input) {
  const { projectRoot, selected, emit } = input;
  const exit = input.exit ?? ((code) => process.exit(code));
  const quiet = Boolean(input.quiet);
  const fail = (code, message, data = {}) => {
    emit?.({ ok: false, runtime: "native", ...data }, [{ code, message }]);
    showError(message);
    return exit(1);
  };
  const generatedNames = ensureGeneratedSecrets(projectRoot, selected, {
    envFilePath: input.envFilePath,
    dryRun: input.dryRun
  });
  if (generatedNames.length > 0 && !quiet && !input.dryRun) {
    console.log(source_default.gray(`Generated ${generatedNames.join(", ")} into the env file (once; existing values unchanged)`));
  }
  const vars = runVariables(projectRoot, input.envFilePath);
  const plan = planNativeRun(selected, vars, projectRoot, readProjectNameOrUndefined(projectRoot));
  if (plan.errors.length > 0)
    fail("INVALID_SERVICE_CONFIG", plan.errors.join("\n"));
  const databaseNames = databaseResourceNames(selected);
  for (const service of plan.services) {
    if (!service.container) {
      Object.assign(service.env, localDatabaseEnv(service.dependsOn, databaseNames, service.env));
    }
  }
  const toolchainMismatches = findToolchainMismatches(selected).filter((finding) => !finding.isHint);
  if (toolchainMismatches.length > 0) {
    fail("TOOLCHAIN_MISMATCH", `${toolchainMismatches.map(describeToolchainFinding).join("\n")}
Switch to that version with your version manager, or change "toolchain" in the service.json.`);
  }
  if (plan.missingVars.length > 0 && !quiet) {
    console.warn(source_default.yellow(`Unset variables expanded to an empty value: ${plan.missingVars.join(", ")}. Set them in .env or the shell.`));
  }
  const missing = findMissingPrograms(plan.services);
  if (missing.length > 0) {
    fail("NATIVE_COMMAND_NOT_FOUND", missing.map(({ name, program }) => `service "${name}" runs ${program}, which is not installed (not found on PATH). Install it, or change "command" in its service.json.`).join("\n"));
  }
  const containers = plan.services.filter((service) => service.container);
  const serviceNames = plan.services.map((service) => service.name);
  const startOrder = dependencyWaves(plan.services);
  const description = input.only ? `${formatCount(input.only.length, "requested service")}${input.dependencies.length > 0 ? ` plus ${input.dependencies.join(", ")}` : ""}` : input.stackName ? `stack "${input.stackName}"` : formatCount(serviceNames.length, "service");
  if (!quiet) {
    console.log(source_default.blue(`${input.dryRun ? "Would start" : "Starting"} ${description} as local processes${containers.length > 0 ? `, ${containers.map((service) => service.name).join(", ")} with docker run (no Tilt)` : " (no Docker, no Tilt)"}...`));
    for (const service of plan.services) {
      const after = service.dependsOn.length > 0 ? ` (after ${service.dependsOn.join(", ")})` : "";
      const what = service.container ? `container ${String(selected.find((resource) => resource.name === service.name)?.config?.image)}` : service.command;
      console.log(source_default.gray(`  - ${service.name}: ${what}${after}`));
    }
  }
  if (input.dryRun) {
    emit?.({
      ok: true,
      dryRun: true,
      runtime: "native",
      ...input.inferred ? { inferred: input.inferred } : {},
      stack: input.stackName ?? null,
      services: serviceNames,
      ...input.only ? { requested: input.only, declaredDependencies: input.dependencies } : {},
      startOrder,
      ...containers.length > 0 ? { containers: containers.map((service) => service.name) } : {}
    });
    if (!quiet)
      console.log(source_default.yellow("Dry run: not starting services"));
    return;
  }
  const running = readNativeRunState(projectRoot);
  if (running && running.pid !== process.pid && isProcessAlive(running.pid)) {
    if (!input.force) {
      const message = `This project is already running as local processes (flisk up, pid ${running.pid}).`;
      emit?.({ ok: true, alreadyRunning: true, runtime: "native", pid: running.pid });
      if (!quiet) {
        console.log(source_default.green(message));
        console.log(source_default.gray("Stop it with flisk down, or pass --force to restart it."));
      }
      return;
    }
  }
  if (running) {
    await stopNativeRun(projectRoot);
  }
  if (containers.length > 0 && !isDockerRunning()) {
    fail("DOCKER_NOT_RUNNING", `${containers.map((service) => service.name).join(", ")} run from an image, which needs Docker, and Docker is not running. Start Docker Desktop, OrbStack, Colima or Kiri, then run flisk up again.`);
  }
  for (const service of plan.services) {
    if (service.port !== void 0 && await isPortListening(service.port)) {
      const occupant = findPortOccupant(service.port);
      fail("PORT_IN_USE", `Port ${service.port} for service "${service.name}" is already in use${occupant ? ` by ${occupant.command} (pid ${occupant.pid})` : ""}. Stop it, or change "port" in the service.json.`);
    }
  }
  const width = Math.max(...serviceNames.map((name) => name.length));
  const prefix = (name) => formatPrefix(name, serviceNames.indexOf(name), width);
  const supervisor = new NativeSupervisor(projectRoot, plan.services, {
    onLine: quiet ? void 0 : (name, line) => console.log(`${prefix(name)}${line}`),
    onNote: quiet ? void 0 : (name, message) => console.log(`${prefix(name)}${source_default.gray(`[flisk] ${message}`)}`)
  }, {
    readyTimeoutMs: input.readyTimeoutMs,
    baseEnv: vars,
    extraEnvPaths: input.envFilePath ? [input.envFilePath] : [],
    // A restart (`flisk restart`, the MCP resource_restart) re-reads the .env, so a repaired value takes effect.
    reload: () => {
      const fresh = runVariables(projectRoot, input.envFilePath);
      const shadowed = shadowedEnvKeys(projectRoot, input.envFilePath);
      if (shadowed.length > 0 && !quiet) {
        console.log(source_default.yellow(`[flisk] ${shadowed.join(", ")} set in .env but overridden by the shell that started \`flisk up\`; a restart keeps the shell value. Unset it and run \`flisk down\` then \`flisk up\`.`));
      }
      const replanned = planNativeRun(selected, fresh, projectRoot, readProjectNameOrUndefined(projectRoot));
      if (replanned.errors.length > 0)
        throw new Error(replanned.errors.join("\n"));
      for (const service of replanned.services) {
        if (!service.container) {
          Object.assign(service.env, localDatabaseEnv(service.dependsOn, databaseNames, service.env));
        }
      }
      return { plans: replanned.services, baseEnv: fresh };
    }
  });
  let stopping;
  const stopAndExit = (code) => {
    stopping ??= (async () => {
      if (!quiet)
        console.log(source_default.gray("\nStopping local processes..."));
      await supervisor.stop();
      exit(code);
    })();
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => stopAndExit(0));
  }
  process.once("exit", () => {
    if (readNativeRunState(projectRoot)?.pid === process.pid) {
      rmSync(nativeRunStatePath(projectRoot), { force: true });
    }
  });
  const startedAt = Date.now() - 1e3;
  const started = await supervisor.start();
  if (stopping)
    return;
  if (started.length > 0) {
    const failures = withFailureLogs(projectRoot, started, startedAt);
    const message = [
      "Local processes did not start:",
      // Quiet (--json, MCP): nothing was printed above, so each failure carries its service's last lines.
      ...failures.flatMap((failure) => [
        `  \u2717 ${failure.name}: ${failure.reason}`,
        ...quiet ? (failure.logs ?? []).map((line) => `      ${line}`) : []
      ]),
      `Output of every service: ${join(NATIVE_DIR, "logs")}/<service>.log`
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
    ...input.inferred ? { inferred: true } : {},
    stack: input.stackName ?? null,
    services: serviceNames,
    ...input.only ? { requested: input.only, dependencies: input.dependencies } : {},
    urls: nativeUrlChecks(plan.services, "readyStatuses" in supervisor && typeof supervisor.readyStatuses === "function" ? supervisor.readyStatuses() : void 0)
  });
  if (!quiet) {
    const lines = [
      containers.length > 0 ? `Flisk is up (local processes, ${formatCount(containers.length, "container")} with docker run).` : "Flisk is up (local processes, no Docker).",
      "Services:"
    ];
    for (const service of plan.services) {
      const health = service.healthUrl ? ` (health: ${service.healthUrl})` : "";
      lines.push(`  \u2713 ${service.name}${service.url ? ` \u2192 ${service.url}` : ""}${health}`);
    }
    lines.push("Stop: Ctrl+C here, or flisk down from another terminal");
    lines.push(`Logs: flisk logs --service <name>, or ${join(NATIVE_DIR, "logs")}/<service>.log`);
    for (const line of lines)
      console.log(source_default.blue(line));
    const ciWarning = attachedUpInCiWarning(process.env);
    if (ciWarning)
      console.log(source_default.yellow(ciWarning));
  }
  await new Promise(() => {
  });
}

export {
  findPortOccupant,
  findPortContainer,
  attachedUpInCiWarning,
  upFailureHints,
  withFailureLogs,
  runVariables,
  runNativeUp
};
