import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  commandProgram,
  createEnvRedactor,
  createPrivateKeyLineGuard,
  dependsOnOf,
  dockerRunArgs,
  dockerRunLine,
  expandEnvValue,
  healthCheckPathOf,
  isHealthCheckDisabled,
  isNativeContainerService,
  nativeContainerName,
  parseEnv,
  readinessProbeOf,
  removeNativeContainers
} from "./chunk-2BH5UW2N.js";
import {
  FliskError,
  findOnPath,
  findProjectRoot,
  source_default
} from "./chunk-73W4Y4TI.js";

// dist/utils/native-runtime.js
import { execFileSync, spawn } from "node:child_process";
import { chmodSync as chmodSync3, existsSync as existsSync2, mkdirSync as mkdirSync2, readdirSync, readFileSync as readFileSync2, rmSync as rmSync2, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { basename as basename2, join as join2 } from "node:path";

// dist/utils/migrator-output.js
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, statSync, unlinkSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
var MIGRATOR_OUTPUTS_DIR_NAME = "outputs";
var MAX_MIGRATOR_OUTPUT_BYTES = 64 * 1024;
var VALID_MIGRATOR_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
var VALID_ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
var MIGRATOR_OUTPUT_REF_REGEX = /\$\{([a-zA-Z0-9_-]+):([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;
function migratorOutputsDir(projectRoot) {
  return join(projectRoot, ".flisk", MIGRATOR_OUTPUTS_DIR_NAME);
}
function getMigratorOutputPath(projectRoot, migratorName) {
  if (!migratorName || !VALID_MIGRATOR_NAME_REGEX.test(migratorName)) {
    throw new FliskError(`Invalid migrator name "${migratorName}" for output path`, [
      "Use alphanumeric characters, dashes, and underscores in service names"
    ]);
  }
  const dir = migratorOutputsDir(projectRoot);
  const target = resolve(dir, `${migratorName}.env`);
  const rel = relative(dir, target);
  if (rel.startsWith("..") || isAbsolute(rel) || rel.includes("/")) {
    throw new FliskError(`Illegal migrator output path traversal: "${migratorName}"`);
  }
  return target;
}
function prepareMigratorOutputFile(projectRoot, migratorName) {
  const dir = migratorOutputsDir(projectRoot);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 448 });
  } else {
    try {
      chmodSync(dir, 448);
    } catch {
    }
  }
  const outputPath = getMigratorOutputPath(projectRoot, migratorName);
  if (existsSync(outputPath)) {
    try {
      unlinkSync(outputPath);
    } catch {
    }
  }
  return outputPath;
}
function clearMigratorOutputs(projectRoot, migratorName) {
  const dir = migratorOutputsDir(projectRoot);
  if (!existsSync(dir))
    return;
  if (migratorName) {
    try {
      const p = getMigratorOutputPath(projectRoot, migratorName);
      if (existsSync(p))
        unlinkSync(p);
    } catch {
    }
  } else {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
    }
  }
}
function parseMigratorOutputFile(filePath) {
  if (!existsSync(filePath))
    return {};
  const lstat = lstatSync(filePath);
  if (lstat.isSymbolicLink()) {
    throw new FliskError(`Migrator output file "${basename(filePath)}" must not be a symbolic link`, ["Ensure the migrator writes directly to a regular file"]);
  }
  const stat = statSync(filePath);
  if (stat.size > MAX_MIGRATOR_OUTPUT_BYTES) {
    throw new FliskError(`Migrator output file exceeds maximum allowed size of ${MAX_MIGRATOR_OUTPUT_BYTES} bytes (${stat.size} bytes)`, ["Limit migrator outputs to essential tokens and connection parameters"]);
  }
  try {
    chmodSync(filePath, 384);
  } catch {
  }
  const content = readFileSync(filePath, "utf-8");
  const outputs = {};
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (rawLine === void 0)
      continue;
    const trimmed = rawLine.trim();
    if (trimmed === "" || trimmed.startsWith("#"))
      continue;
    const eqIdx = rawLine.indexOf("=");
    if (eqIdx === -1) {
      throw new FliskError(`Malformed line ${i + 1} in migrator output "${basename(filePath)}": missing '=' separator`, ["Output must follow the KEY=value format, one per line"]);
    }
    const key = rawLine.slice(0, eqIdx).trim();
    if (!VALID_ENV_KEY_REGEX.test(key)) {
      throw new FliskError(`Invalid key name "${key}" on line ${i + 1} of migrator output "${basename(filePath)}"`, ["Environment variable names must match ^[A-Za-z_][A-Za-z0-9_]*$"]);
    }
    const value = rawLine.slice(eqIdx + 1);
    outputs[key] = value;
  }
  return outputs;
}
function validateMigratorOutputReferences(serviceName, rawEnv, dependsOn) {
  if (!rawEnv)
    return;
  const authorized = new Set(dependsOn);
  for (const [envKey, rawVal] of Object.entries(rawEnv)) {
    if (typeof rawVal !== "string")
      continue;
    const matches = rawVal.matchAll(MIGRATOR_OUTPUT_REF_REGEX);
    for (const match of matches) {
      const migratorName = match[1];
      if (migratorName && !authorized.has(migratorName)) {
        throw new FliskError(`Service "${serviceName}" references unauthorized output from "${migratorName}" in ${envKey} (not in dependsOn)`, [
          `Add "${migratorName}" to dependsOn in ${serviceName}'s service.json to authorize output consumption`
        ]);
      }
    }
  }
}
function resolveMigratorOutputsInEnv(serviceName, rawEnv, dependsOn, outputsByMigrator) {
  const result = {};
  if (!rawEnv)
    return result;
  const authorized = new Set(dependsOn);
  for (const [envKey, rawVal] of Object.entries(rawEnv)) {
    if (rawVal === void 0)
      continue;
    const strVal = String(rawVal);
    result[envKey] = strVal.replace(MIGRATOR_OUTPUT_REF_REGEX, (_fullMatch, migratorName, keyName, fallback) => {
      if (!authorized.has(migratorName)) {
        throw new FliskError(`Service "${serviceName}" references unauthorized output from "${migratorName}" in ${envKey} (not in dependsOn)`, [`Add "${migratorName}" to dependsOn in ${serviceName}'s service.json`]);
      }
      const migratorOutputs = outputsByMigrator[migratorName];
      const val = migratorOutputs?.[keyName];
      if (val !== void 0) {
        return val;
      }
      if (fallback !== void 0) {
        return fallback;
      }
      throw new FliskError(`Migrator "${migratorName}" did not produce expected output "${keyName}" for service "${serviceName}"`, [`Ensure ${migratorName} writes "${keyName}=..." to $FLISK_OUTPUT`]);
    });
  }
  return result;
}

// dist/utils/native-log.js
import { appendFileSync, chmodSync as chmodSync2, closeSync, openSync, readSync, renameSync, statSync as statSync2 } from "node:fs";
var NATIVE_LOG_MAX_BYTES = 10 * 1024 * 1024;
var TAIL_BLOCK_BYTES = 64 * 1024;
var TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z) /;
function readLogTail(path, tail, cutoffMs = null) {
  const limit = tail > 0 ? tail : Number.POSITIVE_INFINITY;
  const found = [];
  const fd = openSync(path, "r");
  try {
    let position = statSync2(path).size;
    let carry = Buffer.alloc(0);
    while (found.length < limit) {
      const atStart = position === 0;
      let pieces;
      if (atStart) {
        pieces = [carry];
        carry = Buffer.alloc(0);
      } else {
        const size = Math.min(TAIL_BLOCK_BYTES, position);
        position -= size;
        const block = Buffer.alloc(size);
        readSync(fd, block, 0, size, position);
        const joined = carry.length > 0 ? Buffer.concat([block, carry]) : block;
        pieces = splitLines(joined);
        carry = pieces.shift() ?? Buffer.alloc(0);
      }
      for (let index = pieces.length - 1; index >= 0 && found.length < limit; index -= 1) {
        let line = pieces[index]?.toString("utf-8") ?? "";
        if (line.endsWith("\r"))
          line = line.slice(0, -1);
        if (!line)
          continue;
        if (cutoffMs !== null) {
          const time = TIMESTAMP.exec(line)?.[1];
          if (!time)
            continue;
          if (Date.parse(time) < cutoffMs)
            return found.reverse();
        }
        found.push(line);
      }
      if (atStart)
        break;
    }
  } finally {
    closeSync(fd);
  }
  return found.reverse();
}
function splitLines(buffer) {
  const pieces = [];
  let start = 0;
  for (let index = buffer.indexOf(10); index !== -1; index = buffer.indexOf(10, start)) {
    pieces.push(buffer.subarray(start, index));
    start = index + 1;
  }
  pieces.push(buffer.subarray(start));
  return pieces;
}
function appendNativeLogLine(path, text, sizes, maxBytes = NATIVE_LOG_MAX_BYTES) {
  let size = sizes.get(path);
  if (size === void 0) {
    try {
      size = statSync2(path).size;
    } catch {
      size = 0;
    }
    if (size >= maxBytes)
      size = rotate(path);
  }
  appendFileSync(path, text, { mode: 384 });
  chmodSync2(path, 384);
  size += Buffer.byteLength(text);
  if (size >= maxBytes)
    size = rotate(path);
  sizes.set(path, size);
}
function rotate(path) {
  try {
    renameSync(path, `${path}.1`);
    return 0;
  } catch {
    try {
      return statSync2(path).size;
    } catch {
      return 0;
    }
  }
}

// dist/utils/process-identity.js
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { uptime } from "node:os";
import { win32 } from "node:path";
function runQuiet(file, args) {
  return new Promise((resolve2, reject) => {
    execFile(file, args, {
      windowsHide: true,
      timeout: 15e3,
      // `ps -o lstart=` prints local time in the locale's words; fix both so the same process always reads the same.
      env: { ...process.env, LC_ALL: "C", TZ: "UTC" }
    }, (error, stdout) => error ? reject(error) : resolve2(String(stdout)));
  });
}
function linuxStatStartTime(stat) {
  const end = stat.lastIndexOf(")");
  if (end === -1)
    return void 0;
  const fields = stat.slice(end + 1).trim().split(/\s+/);
  const value = fields[19];
  return value !== void 0 && /^\d+$/.test(value) ? value : void 0;
}
async function processStartTime(pid, deps = {}) {
  if (!Number.isInteger(pid) || pid <= 0)
    return void 0;
  const platform = deps.platform ?? process.platform;
  const run = deps.run ?? runQuiet;
  try {
    if (platform === "win32") {
      const powershell = win32.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
      const out2 = await run(powershell, [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`
      ]);
      return out2.trim() || void 0;
    }
    if (platform === "linux") {
      const read = deps.readFile ?? ((path) => readFile(path, "utf8"));
      try {
        const fromProc = linuxStatStartTime(await read(`/proc/${pid}/stat`));
        if (fromProc)
          return fromProc;
      } catch {
      }
    }
    const out = await run("/bin/ps", ["-o", "lstart=", "-p", String(pid)]);
    return out.trim() || void 0;
  } catch {
    return void 0;
  }
}
function bootTimeMs() {
  return Date.now() - uptime() * 1e3;
}

// dist/utils/native-runtime.js
function isOneShotJob(config) {
  if (!config)
    return false;
  if (config.appType === "migrator")
    return true;
  return config.appType === "bring-your-own" && config.restart === "no";
}
var NATIVE_DIR = join2(".flisk", "native");
var RUN_FILE = "run.json";
var DEFAULT_READY_TIMEOUT_MS = 6e4;
var ALIVE_GRACE_MS = 1e3;
var STOP_TIMEOUT_MS = 5e3;
var MAX_QUICK_CRASHES = 5;
var QUICK_CRASH_MS = 1e4;
function localUrl(port, path = "") {
  return `http://localhost:${port}${path}`;
}
function dependencyWaves(services) {
  const names = new Set(services.map((service) => service.name));
  const remaining = new Map(services.map((service) => [service.name, service.dependsOn.filter((dep) => names.has(dep))]));
  const done = /* @__PURE__ */ new Set();
  const waves = [];
  while (remaining.size > 0) {
    const wave = [...remaining.entries()].filter(([, deps]) => deps.every((dep) => done.has(dep))).map(([name]) => name).sort();
    if (wave.length === 0) {
      throw new FliskError(`circular dependsOn between ${[...remaining.keys()].sort().join(", ")}`, ["Remove one dependsOn entry from the cycle in those services' service.json"]);
    }
    for (const name of wave) {
      remaining.delete(name);
      done.add(name);
    }
    waves.push(wave);
  }
  return waves;
}
function readServiceDotenv(dir) {
  if (!dir)
    return {};
  try {
    return Object.fromEntries(parseEnv(readFileSync2(join2(dir, ".env"), "utf-8")));
  } catch {
    return {};
  }
}
function planNativeRun(selected, vars = process.env, projectRoot, projectName) {
  const root = projectRoot ?? findProjectRoot(selected[0]?.path ?? process.cwd()) ?? process.cwd();
  const containerProject = projectName ?? basename2(root);
  const errors = [];
  const missingVars = [];
  const names = new Set(selected.map((resource) => resource.name));
  const byStack = /* @__PURE__ */ new Map();
  for (const resource of selected) {
    if (resource.stack)
      byStack.set(resource.stack, [...byStack.get(resource.stack) ?? [], resource.name]);
  }
  const portOwners = /* @__PURE__ */ new Map();
  const services = selected.map((resource) => {
    const config = resource.config ?? {};
    const dependsOn = [];
    for (const dep of dependsOnOf(config)) {
      if (names.has(dep)) {
        dependsOn.push(dep);
      } else if (byStack.has(dep)) {
        for (const member of byStack.get(dep) ?? [])
          if (member !== resource.name)
            dependsOn.push(member);
      } else {
        errors.push(`service "${resource.name}" dependsOn "${dep}", which is not a service in this project. Add a "${dep}" service with a command, or with an "image" to run it as a container (a database, a cache), or remove it from dependsOn.`);
      }
    }
    const port = typeof config.port === "number" ? config.port : void 0;
    if (port !== void 0) {
      const owner = portOwners.get(port);
      if (owner)
        errors.push(`services "${owner}" and "${resource.name}" both use port ${port}`);
      else
        portOwners.set(port, resource.name);
    }
    const rawEnv = {};
    for (const [key, value] of Object.entries(config.env ?? {})) {
      rawEnv[key] = String(value);
    }
    try {
      validateMigratorOutputReferences(resource.name, rawEnv, dependsOn);
    } catch (err) {
      if (err instanceof FliskError)
        errors.push(err.message);
      else
        throw err;
    }
    const env = {};
    const serviceDotenv = readServiceDotenv(resource.path);
    for (const [key, value] of Object.entries(config.env ?? {})) {
      env[key] = expandEnvValue(String(value), { ...serviceDotenv, ...vars, ...env }, (name) => missingVars.push(`${resource.name}: ${name}`));
    }
    const containerName = isNativeContainerService(resource) ? nativeContainerName(containerProject, resource.name) : void 0;
    let command = String(config.command);
    if (containerName) {
      const run = dockerRunArgs(resource, {
        projectName: containerProject,
        projectRoot: root,
        envKeys: Object.keys(env)
      });
      errors.push(...run.errors);
      command = dockerRunLine(run.args, containerName);
    }
    const job = isOneShotJob(config) && port === void 0;
    if (job) {
      env.FLISK_OUTPUT = getMigratorOutputPath(root, resource.name);
    }
    if (port !== void 0 && !containerName)
      env.PORT = String(port);
    const healthDisabled = isHealthCheckDisabled(config);
    const healthPath = healthDisabled ? void 0 : healthCheckPathOf(config);
    const probe = readinessProbeOf(config);
    const readiness = containerName && probe?.kind === "command" ? { kind: "command", command: ["docker", "exec", containerName, ...probe.command] } : probe;
    return {
      name: resource.name,
      command,
      cwd: resource.path,
      port,
      env,
      ...Object.keys(rawEnv).length > 0 ? { rawEnv } : {},
      dependsOn: [...new Set(dependsOn)],
      healthUrl: port !== void 0 && healthPath ? localUrl(port, healthPath) : void 0,
      // A container with no HTTP health path is a database or a cache: print its address, not a web link.
      url: port === void 0 ? void 0 : containerName && !healthPath ? `localhost:${port}` : localUrl(port),
      restart: config.restart !== "no" && !job,
      ...healthDisabled ? { healthCheckDisabled: true } : {},
      ...readiness ? { readiness } : {},
      ...job ? { job: true } : {},
      ...containerName ? { container: containerName } : {}
    };
  });
  try {
    dependencyWaves(services);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return { services, errors, missingVars };
}
function findMissingPrograms(plans, find = findOnPath, exists = existsSync2) {
  const missing = [];
  for (const plan of plans) {
    const program = commandProgram(plan.command);
    if (!program || ["cd", ".", "source", "true", ":"].includes(program))
      continue;
    const found = program.includes("/") ? exists(join2(plan.cwd, program)) : Boolean(find(program));
    if (!found)
      missing.push({ name: plan.name, program });
  }
  return missing;
}
function isPortListening(port, timeoutMs = 1e3) {
  return new Promise((resolve2) => {
    const socket = connect({ host: "localhost", port });
    const finish = (listening) => {
      socket.destroy();
      resolve2(listening);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}
async function healthCheckStatus(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2e3), redirect: "manual" });
    await response.body?.cancel();
    return response.status < 400 ? response.status : null;
  } catch {
    return null;
  }
}
async function waitForServiceReady(plan, options) {
  const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_READY_TIMEOUT_MS);
  const interval = options.intervalMs ?? 250;
  const readiness = plan.healthCheckDisabled ? void 0 : plan.readiness;
  if (!readiness && (plan.healthCheckDisabled || !plan.healthUrl && plan.port === void 0)) {
    await sleep(ALIVE_GRACE_MS);
    return options.isAlive();
  }
  while (Date.now() < deadline) {
    if (!options.isAlive())
      return false;
    const ready = readiness?.kind === "port" ? await isPortListening(readiness.port) : readiness?.kind === "command" ? await readinessCommandPasses(readiness.command, plan) : plan.healthUrl ? await healthCheckStatus(plan.healthUrl).then((status) => {
      if (status !== null)
        options.onStatus?.(status);
      return status !== null;
    }) : await isPortListening(plan.port);
    if (ready)
      return true;
    await sleep(interval);
  }
  return false;
}
function notReadyReason(plan) {
  if (plan.readiness?.kind === "port")
    return `nothing listening on port ${plan.readiness.port}`;
  if (plan.readiness?.kind === "command") {
    return `healthCheck.command never exited 0: ${plan.readiness.command.join(" ")}`;
  }
  return plan.healthUrl ? `no answer from ${plan.healthUrl}` : `nothing listening on port ${plan.port}`;
}
var READINESS_COMMAND_TIMEOUT_MS = 1e4;
function readinessCommandPasses(command, plan) {
  const [file, ...args] = command;
  if (!file)
    return Promise.resolve(false);
  return new Promise((resolve2) => {
    const child = spawn(file, args, {
      cwd: plan.cwd,
      env: { ...process.env, ...plan.env ?? {} },
      stdio: "ignore"
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), READINESS_COMMAND_TIMEOUT_MS);
    child.once("error", () => {
      clearTimeout(timer);
      resolve2(false);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve2(code === 0);
    });
  });
}
function sleep(milliseconds) {
  return new Promise((resolve2) => setTimeout(resolve2, milliseconds));
}
function nativeRunStatePath(projectRoot) {
  return join2(projectRoot, NATIVE_DIR, RUN_FILE);
}
function nativeLogPath(projectRoot, service) {
  return join2(projectRoot, NATIVE_DIR, "logs", `${service}.log`);
}
function readNativeRunState(projectRoot) {
  try {
    const state = JSON.parse(readFileSync2(nativeRunStatePath(projectRoot), "utf-8"));
    return state && typeof state.pid === "number" && state.services ? state : null;
  } catch {
    return null;
  }
}
function writeNativeRunState(projectRoot, state) {
  const dir = join2(projectRoot, NATIVE_DIR);
  const logsDir = join2(dir, "logs");
  mkdirSync2(logsDir, { recursive: true, mode: 448 });
  chmodSync3(logsDir, 448);
  const ignore = join2(dir, ".gitignore");
  if (!existsSync2(ignore))
    writeFileSync(ignore, "*\n");
  writeFileSync(nativeRunStatePath(projectRoot), `${JSON.stringify(state, null, 2)}
`);
}
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}
function killWindowsTree(pid) {
  try {
    execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
  } catch {
  }
}
function signalGroup(pid, signal, platform = process.platform, killTree = killWindowsTree) {
  if (platform === "win32") {
    killTree(pid);
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
    }
  }
}
async function waitForExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid))
      return true;
    await sleep(100);
  }
  return !isProcessAlive(pid);
}
async function stopProcessGroup(pid, timeoutMs = STOP_TIMEOUT_MS, canSignal = async () => true) {
  if (!await canSignal())
    return;
  signalGroup(pid, "SIGTERM");
  if (!await waitForExit(pid, timeoutMs) && await canSignal())
    signalGroup(pid, "SIGKILL");
}
var defaultStopDeps = {
  isAlive: isProcessAlive,
  startTimeOf: (pid) => processStartTime(pid),
  bootTimeMs,
  terminateSupervisor: async (pid, timeoutMs) => {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
    }
    await waitForExit(pid, timeoutMs);
  },
  stopGroup: (pid, startTime) => stopProcessGroup(pid, STOP_TIMEOUT_MS, async () => await processStartTime(pid) === startTime)
};
async function stopNativeRun(projectRoot, options = {}) {
  const state = readNativeRunState(projectRoot);
  if (!state)
    return { wasRunning: false, services: [] };
  const deps = { ...defaultStopDeps, ...options.deps };
  const timeoutMs = options.timeoutMs ?? STOP_TIMEOUT_MS * 2;
  const forget = () => {
    if (Object.values(state.services).some((service) => service.container)) {
      removeNativeContainers(projectRoot);
    }
    rmSync2(nativeRunStatePath(projectRoot), { force: true });
    clearMigratorOutputs(projectRoot);
  };
  const startedAt = Date.parse(state.startedAt);
  if (Number.isFinite(startedAt) && startedAt < deps.bootTimeMs()) {
    forget();
    return { wasRunning: false, stale: true, services: [] };
  }
  const unverified = [];
  let ours = 0;
  let reused = 0;
  const isOurs = async (name, pid, recorded) => {
    if (!deps.isAlive(pid))
      return false;
    if (recorded === void 0) {
      unverified.push({ name, pid });
      return false;
    }
    const current = await deps.startTimeOf(pid);
    if (current === void 0) {
      unverified.push({ name, pid });
      return false;
    }
    if (current !== void 0 && current === recorded) {
      ours += 1;
      return true;
    }
    reused += 1;
    return false;
  };
  const checks = await Promise.all(Object.entries(state.services).map(async ([name, service]) => service.pid !== void 0 && await isOurs(name, service.pid, service.startTime) ? { name, pid: service.pid, startTime: service.startTime } : void 0));
  if (state.pid !== process.pid && await isOurs("flisk up", state.pid, state.pidStartTime)) {
    await deps.terminateSupervisor(state.pid, timeoutMs);
  }
  await Promise.all(checks.map(async (service) => {
    if (service && deps.isAlive(service.pid) && await deps.startTimeOf(service.pid) === service.startTime) {
      await deps.stopGroup(service.pid, service.startTime);
    }
  }));
  forget();
  if (ours === 0 && reused > 0 && unverified.length === 0) {
    return { wasRunning: false, stale: true, services: [] };
  }
  return {
    wasRunning: ours > 0,
    services: checks.filter((service) => service !== void 0).map((service) => service.name),
    supervisorPid: state.pid,
    ...unverified.length > 0 ? { unverified } : {}
  };
}
function nativeServiceStates(projectRoot, services) {
  const state = readNativeRunState(projectRoot);
  const isUp = state !== null && isProcessAlive(state.pid);
  return Object.fromEntries(services.map((name) => {
    const service = state?.services[name];
    if (!isUp || !service)
      return [name, { status: "unknown", reason: "not running" }];
    if (service.failed) {
      return [name, { status: "error", reason: "exited repeatedly; the supervisor gave up" }];
    }
    if (!service.pid || !isProcessAlive(service.pid)) {
      if (service.job) {
        return service.ready ? [name, { status: "ready", reason: "finished" }] : [name, { status: "pending", reason: "the job did not exit 0" }];
      }
      if (service.waitingFor?.length) {
        return [
          name,
          { status: "pending", reason: `waiting for ${service.waitingFor.join(", ")}` }
        ];
      }
      return [name, { status: "pending", reason: "restarting" }];
    }
    return service.ready ? [name, { status: "ready" }] : [name, { status: "pending", reason: "starting" }];
  }));
}
function readNativeLogLines(projectRoot, services, options) {
  const cutoff = options.sinceMs === void 0 ? null : (options.now ?? Date.now()) - options.sinceMs;
  const lines = [];
  for (const resource of services) {
    let raws;
    try {
      raws = readLogTail(nativeLogPath(projectRoot, resource), options.tail, cutoff);
    } catch {
      continue;
    }
    for (const raw of raws) {
      const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z) (.*)$/.exec(raw);
      const time = match?.[1] ?? null;
      lines.push({ time, resource, level: null, source: null, text: match?.[2] ?? raw });
    }
  }
  lines.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  return lines.slice(-options.tail);
}
var PREFIX_COLORS = [source_default.cyan, source_default.magenta, source_default.green, source_default.yellow, source_default.blue, source_default.red];
function nativeControlDir(projectRoot) {
  return join2(projectRoot, NATIVE_DIR, "control");
}
var CONTROL_POLL_MS = 250;
async function requestNativeRestart(projectRoot, service, options) {
  const run = readNativeRunState(projectRoot);
  if (!run || !isProcessAlive(run.pid)) {
    return { state: "not-running", reason: "no local processes of this project are running" };
  }
  const id = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = nativeControlDir(projectRoot);
  mkdirSync2(dir, { recursive: true, mode: 448 });
  writeFileSync(join2(dir, `${id}.req.json`), JSON.stringify({ id, service }));
  const resultPath = join2(dir, `${id}.res.json`);
  const deadline = Date.now() + Math.max(options.waitMs, 0) + 5e3;
  let last;
  try {
    while (Date.now() < deadline) {
      try {
        last = JSON.parse(readFileSync2(resultPath, "utf-8"));
      } catch {
        last = void 0;
      }
      if (last && (last.state !== "restarting" || options.waitMs === 0))
        return last;
      if (last && Date.now() >= deadline - 5e3) {
        return { state: "timeout", reason: "still starting when the wait ended" };
      }
      await sleep(100);
    }
    if (last)
      return { state: "timeout", reason: "still starting when the wait ended" };
    return {
      state: "failed",
      reason: "the supervisor did not answer; it may be busy or not a version that supports restart"
    };
  } finally {
    rmSync2(join2(dir, `${id}.req.json`), { force: true });
    rmSync2(resultPath, { force: true });
  }
}
function shellInvocation(command, platform = process.platform, comSpec = process.env.ComSpec) {
  if (platform === "win32") {
    return {
      file: comSpec || "cmd.exe",
      args: ["/d", "/s", "/c", `"${command}"`],
      windowsVerbatimArguments: true
    };
  }
  return { file: "/bin/sh", args: ["-c", command], windowsVerbatimArguments: false };
}
function isChildRunning(child) {
  return child !== void 0 && child.exitCode === null && child.signalCode === null;
}
var NativeSupervisor = class {
  projectRoot;
  events;
  options;
  services = /* @__PURE__ */ new Map();
  /** Known size of each service log, shared by its stdout and stderr writers, for rotation (#3720). */
  logSizes = /* @__PURE__ */ new Map();
  migratorOutputs = /* @__PURE__ */ new Map();
  redactLine;
  startedAt = (/* @__PURE__ */ new Date()).toISOString();
  pidStartTime;
  stopping = false;
  baseEnv;
  controlTimer;
  constructor(projectRoot, plans, events = {}, options = {}) {
    this.projectRoot = projectRoot;
    this.events = events;
    this.options = options;
    this.baseEnv = options.baseEnv;
    this.redactLine = createEnvRedactor(projectRoot, options.extraEnvPaths);
    for (const plan of plans) {
      this.services.set(plan.name, {
        plan,
        startedAt: 0,
        quickCrashes: 0,
        gaveUp: false,
        isReady: false
      });
    }
  }
  /** The width service names are padded to in prefixed output. */
  get prefixWidth() {
    return Math.max(...[...this.services.keys()].map((name) => name.length));
  }
  /**
   * Starts every service once its dependencies are ready. Resolves with the services that never became ready (empty when the
   * whole selection is up); a service whose dependency failed is reported as blocked and never started.
   */
  async start() {
    this.saveState();
    this.pidStartTime = await this.readStartTime(process.pid);
    if (this.stopping)
      return [];
    this.saveState();
    this.startControlLoop();
    const plans = [...this.services.values()].map((service) => service.plan);
    const ready = /* @__PURE__ */ new Map();
    const failures = [];
    for (const name of dependencyWaves(plans).flat()) {
      const service = this.services.get(name);
      ready.set(name, (async () => {
        const deps = await Promise.all(service.plan.dependsOn.map((dep) => ready.get(dep)));
        if (!deps.every(Boolean)) {
          const blockedBy = service.plan.dependsOn.filter((_dep, index) => !deps[index]);
          failures.push({ name, reason: `not started: ${blockedBy.join(", ")} did not start` });
          return false;
        }
        if (this.stopping)
          return false;
        try {
          this.resolveServiceEnv(service);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          failures.push({ name, reason });
          return false;
        }
        this.spawn(service);
        const isReady = service.plan.job ? await service.exited === 0 && !this.stopping : await waitForServiceReady(service.plan, {
          isAlive: () => !this.stopping && !service.gaveUp,
          timeoutMs: this.options.readyTimeoutMs,
          onStatus: (status) => {
            service.readyStatus = status;
          }
        });
        await service.identityReady;
        if (isReady) {
          service.isReady = true;
          this.saveState();
          this.events.onNote?.(name, "ready");
          this.resumeDependents(name);
        } else if (!this.stopping) {
          failures.push({
            name,
            reason: service.plan.job ? "the job did not exit 0; see its output above" : service.gaveUp ? "kept exiting; see its output above" : `not ready after ${Math.round((this.options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS) / 1e3)}s (${notReadyReason(service.plan)})`
          });
        }
        return isReady;
      })());
    }
    await Promise.all(ready.values());
    return failures;
  }
  /**
   * Stops every service, dependents before what they depend on, and removes the run state. Services of one wave do not depend
   * on each other, so they get their SIGTERM grace period at the same time (#3811).
   */
  async stop() {
    if (this.stopping)
      return;
    this.stopping = true;
    if (this.controlTimer)
      clearInterval(this.controlTimer);
    rmSync2(nativeControlDir(this.projectRoot), { recursive: true, force: true });
    const waves = dependencyWaves([...this.services.values()].map((s) => s.plan)).reverse();
    for (const wave of waves) {
      await Promise.all(wave.map(async (name) => {
        const service = this.services.get(name);
        if (service.restartTimer)
          clearTimeout(service.restartTimer);
        const pid = service.child?.pid;
        if (pid && service.child?.exitCode === null && service.child.signalCode === null) {
          await stopProcessGroup(pid, this.options.stopTimeoutMs);
        }
      }));
    }
    if ([...this.services.values()].some((service) => service.plan.container)) {
      removeNativeContainers(this.projectRoot);
    }
    rmSync2(nativeRunStatePath(this.projectRoot), { force: true });
    clearMigratorOutputs(this.projectRoot);
  }
  /** The current process id of a service, for tests and diagnostics. */
  pidOf(name) {
    return this.services.get(name)?.child?.pid;
  }
  /** HTTP readiness status codes recorded per service during startup. */
  readyStatuses() {
    const statuses = /* @__PURE__ */ new Map();
    for (const [name, service] of this.services) {
      if (service.readyStatus !== void 0) {
        statuses.set(name, service.readyStatus);
      }
    }
    return statuses;
  }
  /** Parsed outputs produced by finished migrators (for inspection and tests). */
  outputsOf(migratorName) {
    return this.migratorOutputs.get(migratorName);
  }
  resolveServiceEnv(service) {
    if (!service.plan.rawEnv)
      return;
    const outputsRecord = {};
    for (const [k, v] of this.migratorOutputs) {
      outputsRecord[k] = v;
    }
    const resolved = resolveMigratorOutputsInEnv(service.plan.name, service.plan.rawEnv, service.plan.dependsOn, outputsRecord);
    for (const [k, v] of Object.entries(resolved)) {
      if (v === service.plan.rawEnv[k])
        continue;
      service.plan.env[k] = expandEnvValue(v, { ...process.env, ...service.plan.env });
    }
  }
  spawn(service) {
    const { plan } = service;
    if (plan.job) {
      plan.env.FLISK_OUTPUT = prepareMigratorOutputFile(this.projectRoot, plan.name);
      this.migratorOutputs.delete(plan.name);
    }
    service.startedAt = Date.now();
    const shell = shellInvocation(plan.command);
    const child = spawn(shell.file, shell.args, {
      cwd: plan.cwd,
      env: { ...this.baseEnv ?? process.env, ...plan.env },
      windowsVerbatimArguments: shell.windowsVerbatimArguments,
      // Its own process group, so a stop reaches what the shell started too, and a Ctrl+C in the terminal reaches only
      // `flisk up`, which then stops the services in order.
      detached: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    service.child = child;
    service.startTime = void 0;
    service.identityReady = void 0;
    const pid = child.pid;
    if (pid !== void 0) {
      service.identityReady = this.readStartTime(pid).then((startTime) => {
        if (this.stopping || service.child !== child || startTime === void 0)
          return;
        service.startTime = startTime;
        this.saveState();
      });
    }
    service.exited = new Promise((resolve2) => {
      child.once("exit", (code) => resolve2(code));
      child.once("error", () => resolve2(null));
    });
    this.events.onNote?.(plan.name, `started: ${plan.command}${child.pid ? ` (pid ${child.pid})` : ""}`);
    this.pipeLines(plan.name, child.stdout, "stdout");
    this.pipeLines(plan.name, child.stderr, "stderr");
    child.once("error", (error) => {
      this.events.onNote?.(plan.name, `could not start: ${error.message}`);
    });
    child.once("exit", (code, signal) => this.onExit(service, child, code, signal));
    this.saveState();
  }
  onExit(service, child, code, signal) {
    if (this.stopping || service.child !== child || service.restarting)
      return;
    service.isReady = false;
    this.saveState();
    const how = signal ? `was stopped by ${signal}` : `exited with code ${code}`;
    if (service.plan.job) {
      service.gaveUp = code !== 0;
      service.isReady = code === 0;
      if (code === 0) {
        try {
          const outputPath = getMigratorOutputPath(this.projectRoot, service.plan.name);
          const outputs = parseMigratorOutputFile(outputPath);
          this.migratorOutputs.set(service.plan.name, outputs);
        } catch (err) {
          service.gaveUp = true;
          service.isReady = false;
          this.events.onNote?.(service.plan.name, `output file error: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        this.migratorOutputs.delete(service.plan.name);
        clearMigratorOutputs(this.projectRoot, service.plan.name);
      }
      this.saveState();
      this.events.onNote?.(service.plan.name, service.isReady ? "finished (exit code 0)" : `${how}; a job is not restarted`);
      return;
    }
    if (!service.plan.restart) {
      service.gaveUp = !(code === 0 && service.plan.port === void 0);
      this.events.onNote?.(service.plan.name, `${how}; not restarting ("restart": "no")`);
      return;
    }
    const down = this.dependenciesDown(service);
    if (down.length > 0) {
      service.quickCrashes = 0;
      service.waitingFor = down;
      this.saveState();
      this.events.onNote?.(service.plan.name, `${how} while ${down.join(", ")} ${down.length === 1 ? "is" : "are"} down; starts again once ${down.length === 1 ? "it is" : "they are"} ready`);
      return;
    }
    const ranFor = Date.now() - service.startedAt;
    service.quickCrashes = ranFor < QUICK_CRASH_MS ? service.quickCrashes + 1 : 1;
    if (service.quickCrashes >= MAX_QUICK_CRASHES) {
      service.gaveUp = true;
      this.events.onNote?.(service.plan.name, `${how}; it exited ${MAX_QUICK_CRASHES} times in a row, so it is not restarted. Fix it, then run flisk up again.`);
      return;
    }
    const delay = (this.options.restartDelayMs ?? 1e3) * 2 ** (service.quickCrashes - 1);
    this.events.onNote?.(service.plan.name, `${how}; restarting in ${delay / 1e3}s`);
    service.restartTimer = setTimeout(() => this.respawn(service), delay);
  }
  /** Starts a service again after it exited, and reports when it is ready again. */
  respawn(service) {
    service.restartTimer = void 0;
    if (this.stopping)
      return;
    this.spawn(service);
    void waitForServiceReady(service.plan, {
      isAlive: () => !this.stopping && isChildRunning(service.child),
      timeoutMs: this.options.readyTimeoutMs
    }).then(async (isReady) => {
      await service.identityReady;
      if (!isReady || this.stopping)
        return;
      service.isReady = true;
      this.saveState();
      this.events.onNote?.(service.plan.name, "ready again");
      this.resumeDependents(service.plan.name);
    });
  }
  /**
   * The dependencies of this run that are not ready now but may come back (restarting, or waiting themselves). One that gave up
   * never comes back, so a dependent is not made to wait for it: it counts its crashes and gives up with a visible message.
   */
  dependenciesDown(service) {
    return service.plan.dependsOn.filter((dep) => {
      const other = this.services.get(dep);
      return other !== void 0 && !other.isReady && !other.gaveUp;
    });
  }
  /**
   * `name` became ready again: start each dependent that exited while it was down, and give a fresh start to one that stopped
   * restarting (it may have crashed before the supervisor saw the dependency go).
   */
  resumeDependents(name) {
    for (const service of this.services.values()) {
      if (this.stopping || !service.plan.dependsOn.includes(name))
        continue;
      if (service.plan.job || !service.plan.restart)
        continue;
      if (!service.waitingFor && !service.gaveUp)
        continue;
      if (service.restartTimer || isChildRunning(service.child))
        continue;
      if (this.dependenciesDown(service).length > 0)
        continue;
      service.waitingFor = void 0;
      service.gaveUp = false;
      service.quickCrashes = 0;
      this.events.onNote?.(service.plan.name, `${name} is ready again; starting`);
      this.respawn(service);
    }
  }
  pipeLines(name, stream, kind) {
    if (!stream)
      return;
    const logPath = nativeLogPath(this.projectRoot, name);
    let pending = "";
    let redactionWarningShown = false;
    const keyGuard = createPrivateKeyLineGuard();
    const emit = (line) => {
      let safeLine;
      try {
        safeLine = this.redactLine(keyGuard(line));
      } catch {
        if (!redactionWarningShown) {
          this.events.onNote?.(name, "output withheld: env secrets could not be read for redaction");
          redactionWarningShown = true;
        }
        return;
      }
      try {
        appendNativeLogLine(logPath, `${(/* @__PURE__ */ new Date()).toISOString()} ${safeLine}
`, this.logSizes);
      } catch {
      }
      this.events.onLine?.(name, safeLine, kind);
    };
    stream.setEncoding?.("utf-8");
    stream.on("data", (chunk) => {
      const lines = (pending + chunk).split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines)
        emit(line);
    });
    stream.on("end", () => {
      if (pending)
        emit(pending);
      pending = "";
    });
  }
  readStartTime(pid) {
    return (this.options.startTimeOf ?? processStartTime)(pid).catch(() => void 0);
  }
  /** Looks for restart requests from `flisk restart` (a separate process) a few times a second while the run is up. */
  startControlLoop() {
    if (this.controlTimer)
      return;
    this.controlTimer = setInterval(() => this.handleControlRequests(), CONTROL_POLL_MS);
    this.controlTimer.unref();
  }
  handleControlRequests() {
    if (this.stopping)
      return;
    const dir = nativeControlDir(this.projectRoot);
    let files;
    try {
      files = readdirSync(dir).filter((file) => file.endsWith(".req.json"));
    } catch {
      return;
    }
    for (const file of files) {
      const path = join2(dir, file);
      let request;
      try {
        request = JSON.parse(readFileSync2(path, "utf-8"));
      } catch {
        continue;
      }
      rmSync2(path, { force: true });
      if (typeof request.id !== "string" || typeof request.service !== "string")
        continue;
      void this.restartService(request.service, request.id);
    }
  }
  writeControlResult(id, result) {
    try {
      const dir = nativeControlDir(this.projectRoot);
      mkdirSync2(dir, { recursive: true, mode: 448 });
      writeFileSync(join2(dir, `${id}.res.json`), JSON.stringify(result));
    } catch {
    }
  }
  /**
   * Stops one service and starts it again from its current plan, then waits for its readiness check. Only this service is
   * touched; dependents keep running and are started again by the usual rules if they exit while it is down. The result is
   * written for the requester: `ready`, `failed` (it exited before it was ready), or `timeout`.
   */
  async restartService(name, id) {
    const finish = (result) => {
      this.writeControlResult(id, result);
      return result;
    };
    const service = this.services.get(name);
    if (!service) {
      return finish({ state: "failed", reason: `"${name}" is not part of this run` });
    }
    if (service.plan.container) {
      return finish({
        state: "failed",
        reason: `"${name}" runs as a container (docker run); restart the whole run with up and force`
      });
    }
    if (service.restarting) {
      return finish({ state: "failed", reason: `"${name}" is already being restarted` });
    }
    service.restarting = true;
    this.writeControlResult(id, { state: "restarting" });
    const startedAt = Date.now() - 1e3;
    try {
      if (service.restartTimer)
        clearTimeout(service.restartTimer);
      service.restartTimer = void 0;
      const pid = service.child?.pid;
      if (pid && isChildRunning(service.child)) {
        await stopProcessGroup(pid, this.options.stopTimeoutMs);
      }
      this.refreshPlans(service);
      service.isReady = false;
      service.gaveUp = false;
      service.quickCrashes = 0;
      service.waitingFor = void 0;
      this.events.onNote?.(name, "restarting (requested)");
      this.spawn(service);
    } finally {
      service.restarting = false;
    }
    const ready = service.plan.job ? await service.exited === 0 && !this.stopping : await waitForServiceReady(service.plan, {
      isAlive: () => !this.stopping && isChildRunning(service.child),
      timeoutMs: this.options.readyTimeoutMs
    });
    if (ready) {
      service.isReady = true;
      this.saveState();
      this.events.onNote?.(name, "ready again");
      this.resumeDependents(name);
      return finish({ state: "ready", pid: service.child?.pid });
    }
    const exited = !isChildRunning(service.child);
    return finish({
      state: exited ? "failed" : "timeout",
      reason: exited ? service.plan.job ? "the job did not exit 0" : "exited before it was ready" : `not ready after ${Math.round((this.options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS) / 1e3)}s (${notReadyReason(service.plan)})`,
      logsSince: startedAt
    });
  }
  /** A restart starts from the .env and plan as they are now, so a repaired value takes effect. */
  refreshPlans(service) {
    const reload = this.options.reload;
    if (!reload)
      return;
    try {
      const { plans, baseEnv } = reload();
      const fresh = plans.find((plan) => plan.name === service.plan.name);
      if (!fresh)
        return;
      service.plan = fresh;
      this.baseEnv = baseEnv;
    } catch {
    }
  }
  saveState() {
    const services = {};
    for (const [name, service] of this.services) {
      services[name] = {
        pid: service.child?.pid,
        ...service.child?.pid !== void 0 && service.startTime ? { startTime: service.startTime } : {},
        port: service.plan.port,
        url: service.plan.url,
        ready: service.isReady,
        ...service.plan.job ? { job: true } : {},
        ...service.plan.container ? { container: service.plan.container } : {},
        ...service.waitingFor ? { waitingFor: service.waitingFor } : {},
        ...service.gaveUp ? { failed: true } : {}
      };
    }
    writeNativeRunState(this.projectRoot, {
      pid: process.pid,
      ...this.pidStartTime ? { pidStartTime: this.pidStartTime } : {},
      startedAt: this.startedAt,
      services
    });
  }
};
function formatPrefix(name, index, width) {
  const color = PREFIX_COLORS[index % PREFIX_COLORS.length] ?? source_default.cyan;
  return color(`${name.padEnd(width)} | `);
}

export {
  NATIVE_DIR,
  localUrl,
  dependencyWaves,
  planNativeRun,
  findMissingPrograms,
  isPortListening,
  nativeRunStatePath,
  readNativeRunState,
  isProcessAlive,
  stopNativeRun,
  nativeServiceStates,
  readNativeLogLines,
  requestNativeRestart,
  NativeSupervisor,
  formatPrefix
};
