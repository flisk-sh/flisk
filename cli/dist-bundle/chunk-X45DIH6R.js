import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  FliskError,
  findOnPath,
  showError
} from "./chunk-73W4Y4TI.js";

// dist/utils/disk-guard.js
import { execFileSync } from "node:child_process";
import { statfsSync } from "node:fs";
import { homedir } from "node:os";
var GIB = 1024 ** 3;
var DISK_FAIL_GIB = 5;
var DISK_WARN_GIB = 15;
var NATIVE_DISK_FAIL_GIB = 1;
var NATIVE_DISK_WARN_GIB = 2;
var DISK_MIN_ENV = "FLISK_DISK_MIN_GIB";
var DISK_WARN_ENV = "FLISK_DISK_WARN_GIB";
var DISK_SAFE_CLEANUP = "docker builder prune -f";
var DISK_CLEANUP_FIX = [
  "This is about the machine, not the project: free disk space, then retry: flisk doctor",
  `  ${DISK_SAFE_CLEANUP}        # build cache only; keeps images, containers and volumes`,
  "  docker image prune -f          # dangling images only",
  "  docker system prune -af        # last resort: every unused image, rebuilt on the next flisk up",
  "  npm cache clean --force",
  "  bun pm cache rm",
  "  brew cleanup -s"
].join("\n");
var NATIVE_DISK_CLEANUP_FIX = [
  "This is about the machine, not the project: free disk space, then retry: flisk doctor",
  "  Local processes write logs under .flisk/ and installs write dependencies: remove old logs and unused node_modules folders",
  "  npm cache clean --force",
  "  bun pm cache rm",
  "  brew cleanup -s"
].join("\n");
function diskRule(runtime = "container", env = process.env) {
  const native = runtime === "native";
  const failBelowGib = gibFromEnv(env[DISK_MIN_ENV], native ? NATIVE_DISK_FAIL_GIB : DISK_FAIL_GIB);
  const warnBelowGib = Math.max(gibFromEnv(env[DISK_WARN_ENV], native ? NATIVE_DISK_WARN_GIB : DISK_WARN_GIB), failBelowGib);
  if (native) {
    return {
      failBelowGib,
      warnBelowGib,
      failMessage: (shown) => `${shown}: running the project needs at least ${failBelowGib} GiB for logs and installs`,
      warnMessage: (shown) => `${shown}: logs and installs may fail below ${failBelowGib} GiB`,
      fix: NATIVE_DISK_CLEANUP_FIX
    };
  }
  return {
    failBelowGib,
    warnBelowGib,
    failMessage: (shown) => `${shown}: building images needs at least ${failBelowGib} GiB, and a full disk damages Docker's image store`,
    warnMessage: (shown) => `${shown}: image builds may fail below ${failBelowGib} GiB`,
    fix: DISK_CLEANUP_FIX
  };
}
function gibFromEnv(value, fallback) {
  if (value === void 0 || value.trim() === "")
    return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
function diskThresholds(env = process.env) {
  const failBelowGib = gibFromEnv(env[DISK_MIN_ENV], DISK_FAIL_GIB);
  const warnBelowGib = Math.max(gibFromEnv(env[DISK_WARN_ENV], DISK_WARN_GIB), failBelowGib);
  return { failBelowGib, warnBelowGib };
}
function readHostFreeGib(statfs = statfsSync, path = homedir()) {
  try {
    const stats = statfs(path);
    return Number(stats.bavail) * Number(stats.bsize) / GIB;
  } catch {
    return null;
  }
}
function evaluateDisk(input = {}) {
  const rule = diskRule(input.runtime, input.env);
  const { failBelowGib, warnBelowGib } = rule;
  const host = readHostFreeGib(input.statfs, input.path);
  const vm = input.runtime === "native" ? null : input.vmFreeGib ?? null;
  if (host === null && vm === null) {
    return {
      level: "unknown",
      failBelowGib,
      warnBelowGib,
      message: "Could not read free disk space"
    };
  }
  const useVm = vm !== null && (host === null || vm < host);
  const freeGib = useVm ? vm : host;
  const source = useVm ? "docker-vm" : "host";
  const where = useVm ? "the Docker VM disk" : "this machine";
  const shown = `${freeGib.toFixed(1)} GiB free on ${where}`;
  const base = { freeGib, source, failBelowGib, warnBelowGib };
  if (freeGib < failBelowGib) {
    return {
      ...base,
      level: "fail",
      message: rule.failMessage(shown),
      fix: rule.fix
    };
  }
  if (freeGib < warnBelowGib) {
    return {
      ...base,
      level: "warn",
      message: rule.warnMessage(shown),
      fix: rule.fix
    };
  }
  return { ...base, level: "ok", message: shown };
}
var defaultRun = (cmd, args) => {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      timeout: 5e3,
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return null;
  }
};
function readDockerVmFreeGib(deps = {}) {
  const run = deps.run ?? defaultRun;
  const root = run("docker", ["info", "--format", "{{.DockerRootDir}}"])?.trim();
  if (!root?.startsWith("/"))
    return null;
  const local = readHostFreeGib(deps.statfs ?? statfsSync, root);
  if (local !== null)
    return local;
  const df = run("colima", ["ssh", "--", "df", "-Pk", root]);
  const fields = df?.trim().split("\n").pop()?.trim().split(/\s+/);
  const availableKib = Number(fields?.[3]);
  return Number.isFinite(availableKib) ? availableKib * 1024 / GIB : null;
}
function diskWarningField(disk) {
  if (!disk || disk.level !== "warn")
    return void 0;
  return {
    level: disk.level,
    freeGib: Number((disk.freeGib ?? 0).toFixed(1)),
    source: disk.source,
    failBelowGib: disk.failBelowGib,
    warnBelowGib: disk.warnBelowGib,
    message: disk.message,
    fix: disk.fix
  };
}
function enforceDiskGuard(deps = {}) {
  const disk = evaluateDisk(deps);
  const lines = (disk.fix ?? "").split("\n");
  if (disk.level === "fail") {
    deps.emit?.({ ok: false, disk: diskFailureField(disk) }, [
      { code: "DISK_SPACE_LOW", message: disk.message, suggestions: lines }
    ]);
    (deps.showError ?? defaultShowError)(disk.message, lines);
    return (deps.exit ?? process.exit)(1);
  }
  if (disk.level === "warn" && !deps.quiet) {
    const warn = deps.warn ?? ((line) => console.warn(line));
    warn(`\u26A0 ${disk.message}`);
    for (const line of lines)
      warn(`  ${line}`);
  }
  return disk;
}
function diskFailureField(disk) {
  return {
    level: disk.level,
    freeGib: Number((disk.freeGib ?? 0).toFixed(1)),
    source: disk.source,
    failBelowGib: disk.failBelowGib
  };
}
function defaultShowError(message, suggestions) {
  showError(message, void 0, suggestions);
}

// dist/utils/docker-build-cache.js
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
var execFilePromise = promisify(execFile);
var DOCKER_TIMEOUT_MS = 15e3;
var DOCKER_BUILD_CACHE_CHECK = "Docker Build Cache";
var DOCKER_BUILD_CACHE_WARN_GIB = 10;
var defaultDockerRunner = async (args) => {
  const { stdout } = await execFilePromise("docker", args, {
    encoding: "utf-8",
    timeout: DOCKER_TIMEOUT_MS,
    windowsHide: true
  });
  return stdout;
};
function parseSizeToBytes(raw) {
  const match = raw.trim().match(/^([\d.]+)\s*([a-zA-Z]+)?$/);
  if (!match)
    return 0;
  const num = Number.parseFloat(match[1] ?? "0");
  if (!Number.isFinite(num))
    return 0;
  const unit = (match[2] ?? "B").toUpperCase();
  switch (unit) {
    case "B":
      return num;
    case "KB":
      return num * 1e3;
    case "MB":
      return num * 1e3 ** 2;
    case "GB":
      return num * 1e3 ** 3;
    case "TB":
      return num * 1e3 ** 4;
    case "K":
    case "KIB":
      return num * 1024;
    case "M":
    case "MIB":
      return num * 1024 ** 2;
    case "G":
    case "GIB":
      return num * 1024 ** 3;
    case "T":
    case "TIB":
      return num * 1024 ** 4;
    default:
      return num;
  }
}
function parseDockerBuildCache(dfOutput) {
  for (const line of dfOutput.split(/\r?\n/)) {
    const parts = line.split("	");
    const type = (parts[0] ?? "").trim();
    if (type.toLowerCase() === "build cache") {
      const entries = Number.parseInt((parts[1] ?? "").trim(), 10) || 0;
      const rawSize = (parts[2] ?? "").trim() || "0B";
      const rawReclaimable = (parts[3] ?? "").replace(/\s*\(.*\)/, "").trim() || "0B";
      const sizeBytes = parseSizeToBytes(rawSize);
      const reclaimableBytes = parseSizeToBytes(rawReclaimable);
      return {
        size: rawSize,
        sizeBytes,
        sizeGib: sizeBytes / 1024 ** 3,
        entries,
        reclaimable: rawReclaimable,
        reclaimableBytes
      };
    }
  }
  return null;
}
async function checkDockerBuildCache(runner = defaultDockerRunner, hasDocker = Boolean(findOnPath("docker"))) {
  if (!hasDocker) {
    return {
      name: DOCKER_BUILD_CACHE_CHECK,
      didPass: false,
      message: "Docker CLI not found",
      fix: "Install Docker: https://docs.docker.com/get-docker/"
    };
  }
  let stdout;
  try {
    stdout = await runner([
      "system",
      "df",
      "--format",
      "{{.Type}}	{{.TotalCount}}	{{.Size}}	{{.Reclaimable}}"
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      name: DOCKER_BUILD_CACHE_CHECK,
      didPass: true,
      isSkipped: true,
      message: `Could not read Docker build cache: ${msg.split(/\r?\n/)[0]}`
    };
  }
  const info = parseDockerBuildCache(stdout);
  if (!info) {
    return {
      name: DOCKER_BUILD_CACHE_CHECK,
      didPass: true,
      isSkipped: true,
      message: "Could not parse Docker build cache information"
    };
  }
  const buildCache = {
    size: info.size,
    entries: info.entries,
    reclaimable: info.reclaimable
  };
  const entryLabel = info.entries === 1 ? "entry" : "entries";
  if (info.sizeGib >= DOCKER_BUILD_CACHE_WARN_GIB) {
    return {
      name: DOCKER_BUILD_CACHE_CHECK,
      didPass: false,
      isWarning: true,
      message: `${info.size} across ${info.entries} ${entryLabel}: Docker build cache exceeds ${DOCKER_BUILD_CACHE_WARN_GIB} GiB threshold. Cache is shared across all projects on this machine`,
      fix: "Prune old build cache: flisk down --prune-cache (or docker builder prune --filter until=24h). Note: this affects other projects on this machine.",
      buildCache
    };
  }
  const shown = info.entries === 0 || info.sizeBytes === 0 ? "0 B in 0 entries (Docker build cache is empty)" : `${info.size} across ${info.entries} ${entryLabel} (shared across all projects on this machine)`;
  return {
    name: DOCKER_BUILD_CACHE_CHECK,
    didPass: true,
    message: shown,
    buildCache
  };
}
function validateCacheUntil(until) {
  if (!until || typeof until !== "string")
    return false;
  const trimmed = until.trim();
  if (/^(\d+[hmsd])+$/i.test(trimmed))
    return true;
  if (/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?$/.test(trimmed))
    return true;
  return false;
}
function normalizeCacheUntil(until) {
  const trimmed = until.trim();
  if (!/^(\d+[hmsd])+$/i.test(trimmed))
    return trimmed;
  let hours = 0n;
  let rest = "";
  for (const match of trimmed.matchAll(/(\d+)([hmsd])/gi)) {
    const value = BigInt(match[1] ?? "0");
    const unit = (match[2] ?? "").toLowerCase();
    if (unit === "d" || unit === "h") {
      hours += unit === "d" ? value * 24n : value;
    } else {
      rest += `${value}${unit}`;
    }
  }
  return `${hours > 0n || !rest ? `${hours}h` : ""}${rest}`;
}
function parseReclaimedFromPrune(stdout) {
  const match = stdout.match(/(?:Total reclaimed space|Total):\s*([0-9.]+\s*[a-zA-Z]+)/i);
  return match?.[1]?.trim() ?? "0 B";
}
async function pruneDockerBuildCache(options = {}) {
  const until = options.until ?? "24h";
  if (!validateCacheUntil(until)) {
    throw new FliskError(`Invalid --cache-until format: "${until}"`, [
      "Use a duration such as 24h, 168h, 7d, or 2h30m"
    ]);
  }
  const runner = options.runner ?? defaultDockerRunner;
  const normalized = normalizeCacheUntil(until);
  const stdout = await runner(["builder", "prune", "-f", "--filter", `until=${normalized}`]);
  const reclaimed = parseReclaimedFromPrune(stdout);
  return { reclaimed, until: normalized };
}
var DEFAULT_BUILD_CACHE_CEILING_GIB = 20;
var BUILD_CACHE_CEILING_ENV = "FLISK_BUILD_CACHE_MAX_GIB";
function resolveBuildCacheCeilingGib(env = process.env) {
  const raw = env[BUILD_CACHE_CEILING_ENV];
  if (raw === void 0 || raw.trim() === "")
    return DEFAULT_BUILD_CACHE_CEILING_GIB;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_BUILD_CACHE_CEILING_GIB;
}
var BUILD_CACHE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1e3;
var BUILD_CACHE_NEAR_CEILING_RATIO = 0.5;
var BUILD_CACHE_STAMP = "build-cache-check.json";
function dockerDaemonIdentity(env = process.env, home = homedir2()) {
  let context = env.DOCKER_CONTEXT ?? "";
  if (!context) {
    try {
      const configDir = env.DOCKER_CONFIG ?? join(home, ".docker");
      const config = JSON.parse(readFileSync(join(configDir, "config.json"), "utf-8"));
      context = config.currentContext ?? "";
    } catch {
    }
  }
  return `${env.DOCKER_HOST ?? ""}|${context || "default"}`;
}
function stampPath(home) {
  return join(home, ".flisk", BUILD_CACHE_STAMP);
}
function readStamp(home) {
  try {
    const raw = JSON.parse(readFileSync(stampPath(home), "utf-8"));
    if (typeof raw.checkedAt === "number" && typeof raw.sizeGib === "number" && typeof raw.daemon === "string") {
      return { checkedAt: raw.checkedAt, sizeGib: raw.sizeGib, daemon: raw.daemon };
    }
  } catch {
  }
  return void 0;
}
function writeStamp(home, stamp) {
  try {
    mkdirSync(join(home, ".flisk"), { recursive: true });
    writeFileSync(stampPath(home), JSON.stringify(stamp));
  } catch {
  }
}
async function enforceBuildCacheCeiling(run = defaultDockerRunner, env = process.env, options = {}) {
  const ceilingGib = resolveBuildCacheCeilingGib(env);
  if (ceilingGib === 0)
    return { pruned: false, ceilingGib };
  const home = options.home ?? homedir2();
  const now = options.now ?? Date.now;
  const daemon = options.daemon ?? dockerDaemonIdentity(env, home);
  const last = readStamp(home);
  const age = last ? now() - last.checkedAt : -1;
  const hostFreeGib = options.hostFreeGib === void 0 ? readHostFreeGib(void 0, home) : options.hostFreeGib;
  const isDiskComfortable = hostFreeGib !== null && hostFreeGib >= diskThresholds(env).warnBelowGib;
  if (last && isDiskComfortable && last.daemon === daemon && age >= 0 && age < BUILD_CACHE_CHECK_INTERVAL_MS && last.sizeGib < ceilingGib * BUILD_CACHE_NEAR_CEILING_RATIO) {
    return { pruned: false, ceilingGib, sizeGib: last.sizeGib, skipped: true };
  }
  try {
    const df = await run([
      "system",
      "df",
      "--format",
      "{{.Type}}	{{.TotalCount}}	{{.Size}}	{{.Reclaimable}}"
    ]);
    const sizeGib = parseDockerBuildCache(df)?.sizeGib;
    if (sizeGib !== void 0)
      writeStamp(home, { checkedAt: now(), sizeGib, daemon });
    if (sizeGib === void 0 || sizeGib <= ceilingGib)
      return { pruned: false, ceilingGib, sizeGib };
    await run([
      "builder",
      "prune",
      "-f",
      "--keep-storage",
      String(Math.round(ceilingGib * 1024 ** 3))
    ]);
    writeStamp(home, { checkedAt: now(), sizeGib: ceilingGib, daemon });
    return { pruned: true, ceilingGib, sizeGib };
  } catch {
    return { pruned: false, ceilingGib };
  }
}

export {
  DISK_WARN_GIB,
  DISK_SAFE_CLEANUP,
  evaluateDisk,
  readDockerVmFreeGib,
  diskWarningField,
  enforceDiskGuard,
  defaultDockerRunner,
  parseSizeToBytes,
  parseDockerBuildCache,
  checkDockerBuildCache,
  validateCacheUntil,
  normalizeCacheUntil,
  pruneDockerBuildCache,
  enforceBuildCacheCeiling
};
