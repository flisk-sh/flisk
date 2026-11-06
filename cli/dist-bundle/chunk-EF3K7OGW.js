import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  effectiveRuntimeStatus,
  getDeferredResourceNames,
  parseTiltResourceFailures
} from "./chunk-IXI5AKZB.js";
import {
  discoverResources,
  isHealthCheckDisabled
} from "./chunk-KZQVEXPY.js";
import {
  FliskError,
  findAllOnPath,
  findOnPath
} from "./chunk-NKTINEF4.js";
import {
  checkColima,
  nativeLimaPath,
  planColimaRepair
} from "./chunk-M5PYRDUN.js";
import {
  findProjectTiltUpPids,
  fliskNetworkOwner,
  fliskNetworkPrefixes,
  projectNetworkNames
} from "./chunk-5PPZSBJD.js";

// dist/utils/doctor-fix.js
import { execFile as execFile2, execFileSync } from "node:child_process";
import { existsSync, realpathSync, statfsSync as statfsSync2 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

// dist/utils/doctor-host.js
import { statfsSync } from "node:fs";
import { homedir } from "node:os";
var DISK_SPACE_CHECK = "Disk Space";
var GIB = 1024 ** 3;
var DISK_FAIL_GIB = 2;
var DISK_WARN_GIB = 10;
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
function checkDiskSpace(statfs = statfsSync, path = homedir()) {
  let freeGib;
  try {
    const stats = statfs(path);
    freeGib = Number(stats.bavail) * Number(stats.bsize) / GIB;
  } catch {
    return {
      name: DISK_SPACE_CHECK,
      didPass: true,
      isSkipped: true,
      message: "Could not read free disk space"
    };
  }
  const shown = `${freeGib.toFixed(1)} GB free`;
  if (freeGib < DISK_FAIL_GIB) {
    return {
      name: DISK_SPACE_CHECK,
      didPass: false,
      message: `${shown}: Docker cannot build or start containers`,
      fix: DISK_CLEANUP_FIX
    };
  }
  if (freeGib < DISK_WARN_GIB) {
    return {
      name: DISK_SPACE_CHECK,
      didPass: false,
      isWarning: true,
      message: `${shown}: image builds may fail`,
      fix: DISK_CLEANUP_FIX
    };
  }
  return { name: DISK_SPACE_CHECK, didPass: true, message: shown };
}
var DOCKER_DESKTOP_STUCK_FIX = "Quit Docker Desktop completely (whale icon > Quit Docker Desktop), reopen it, and wait until it shows Running. If it keeps getting stuck, check free disk space. Then retry: flisk doctor";
function dockerDesktopStuck(desktopRunning, platform = process.platform) {
  if (platform !== "darwin" || !desktopRunning)
    return null;
  return {
    name: "Container Runtime",
    didPass: false,
    message: "Docker Desktop is open, but its engine is not responding",
    fix: DOCKER_DESKTOP_STUCK_FIX
  };
}

// dist/utils/up-readiness.js
import { execFile } from "node:child_process";
function tiltGetUiResources(port) {
  return new Promise((resolve) => {
    execFile(findOnPath("tilt") ?? "tilt", ["get", "uiresources", "-o", "json", "--port", String(port)], { timeout: 15e3, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => resolve(error ? null : stdout));
  });
}
function tiltResourceLogs(port, name) {
  return new Promise((resolve) => {
    execFile(findOnPath("tilt") ?? "tilt", ["logs", name, "--port", String(port)], { timeout: 15e3, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => resolve(error ? null : stdout));
  });
}
function onlyEnabledResources(jsonText, disabledHealth) {
  const parsed = JSON.parse(jsonText);
  const items = (parsed.items ?? []).filter((item) => item.status?.disableStatus?.state !== "Disabled").map((item) => {
    let current = item;
    if (current.status?.updateStatus === "not_applicable") {
      current = { ...current, status: { ...current.status, updateStatus: "ok" } };
    }
    if (disabledHealth && current.metadata?.name && disabledHealth.has(current.metadata.name) && current.status?.composeResourceInfo) {
      const { healthStatus: _healthStatus, ...restInfo } = current.status.composeResourceInfo;
      current = {
        ...current,
        status: {
          ...current.status,
          composeResourceInfo: restInfo
        }
      };
    }
    return current;
  });
  return JSON.stringify({ items });
}
function getDisabledHealthResourceNames(resources) {
  try {
    const list = resources ?? discoverResources();
    return new Set(list.filter((svc) => isHealthCheckDisabled(svc.config)).map((svc) => svc.name));
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
function enabledNames(jsonText) {
  return (JSON.parse(jsonText).items ?? []).filter((item) => item.status?.disableStatus?.state !== "Disabled").flatMap((item) => item.metadata?.name ? [item.metadata.name] : []);
}
function checkExpectedResources(jsonText, expected) {
  const items = JSON.parse(jsonText).items ?? [];
  const byName = new Map(items.map((item) => [item.metadata?.name, item]));
  return {
    missing: expected.filter((name) => !byName.has(name)),
    disabled: expected.filter((name) => byName.get(name)?.status?.disableStatus?.state === "Disabled")
  };
}
function isAdvisoryResource(name) {
  return name.endsWith("-typecheck");
}
function evaluateTiltReadiness(jsonText, deferred, expected, disabledHealth) {
  const parsed = parseTiltResourceFailures(onlyEnabledResources(jsonText, disabledHealth), deferred);
  const blocking = parsed.failures.filter((failure) => !isAdvisoryResource(failure.name));
  const unhealthyButRunning = unhealthyRunningNames(jsonText);
  let result = {
    ready: blocking.length === 0 && parsed.pendingCount === 0 && parsed.okCount > 0,
    failures: blocking.map((failure) => ({
      name: failure.name,
      message: failure.error || `${failure.updateStatus}/${failure.runtimeStatus}`,
      ...unhealthyButRunning.has(failure.name) ? { runtime: true } : {}
    })),
    pending: parsed.pendingCount,
    timedOut: false,
    enabled: enabledNames(jsonText)
  };
  if (expected && expected.length > 0) {
    const { missing, disabled } = checkExpectedResources(jsonText, expected);
    if (missing.length > 0) {
      result = { ...result, ready: false, pending: result.pending + missing.length };
    }
    if (disabled.length > 0) {
      return {
        settled: true,
        result: {
          ...result,
          ready: false,
          failures: [
            ...result.failures,
            ...disabled.map((name) => ({ name, message: "disabled in Tilt" }))
          ]
        }
      };
    }
  }
  return {
    result,
    settled: result.ready || result.failures.length > 0 && result.pending === 0
  };
}
function findBuildingResourceNames(jsonText, deferred) {
  try {
    const parsed = JSON.parse(jsonText);
    return (parsed.items ?? []).filter((item) => {
      const name = item.metadata?.name;
      if (!name || name === "(Tiltfile)" || deferred?.has(name) || isAdvisoryResource(name)) {
        return false;
      }
      if (item.status?.disableStatus?.state === "Disabled")
        return false;
      return item.status?.updateStatus === "in_progress";
    }).map((item) => item.metadata?.name);
  } catch {
    return [];
  }
}
function findPendingResourceNames(jsonText, deferred) {
  try {
    const parsed = JSON.parse(jsonText);
    return (parsed.items ?? []).filter((item) => {
      const name = item.metadata?.name;
      if (!name || name === "(Tiltfile)" || deferred?.has(name) || isAdvisoryResource(name)) {
        return false;
      }
      if (item.status?.disableStatus?.state === "Disabled")
        return false;
      const update = item.status?.updateStatus ?? "";
      const runtime = effectiveRuntimeStatus(item.status);
      if (update === "error" || runtime === "error")
        return false;
      return update !== "ok" || runtime !== "ok";
    }).map((item) => item.metadata?.name);
  } catch {
    return [];
  }
}
function formatTail(text, maxLines = 10) {
  const lines = text.trimEnd().split("\n").map((l) => l.trimEnd()).filter((l) => l.length > 0);
  return lines.slice(-maxLines).join("\n");
}
function stateFingerprint(jsonText) {
  try {
    const parsed = JSON.parse(jsonText);
    return (parsed.items ?? []).map((i) => {
      const s = i.status;
      return `${i.metadata?.name}:${s?.updateStatus}:${s?.runtimeStatus}:${s?.disableStatus?.state}:${s?.composeResourceInfo?.healthStatus}:${s?.currentBuild?.startTime}:${s?.buildHistory?.length}`;
    }).join(";");
  } catch {
    return jsonText;
  }
}
function unhealthyRunningNames(jsonText) {
  try {
    const parsed = JSON.parse(jsonText);
    return new Set((parsed.items ?? []).filter((item) => item.status?.updateStatus !== "error" && // A container that exited keeps its last health status; only a running one can still turn healthy.
    item.status?.runtimeStatus === "ok" && item.status?.composeResourceInfo?.healthStatus === "unhealthy").map((item) => item.metadata?.name));
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
var DEFAULT_FAILURE_GRACE_MS = 12e4;
function withinFailureGrace(result, failingSince, now, graceMs) {
  if (result.failures.length === 0)
    return false;
  return result.failures.every((failure) => {
    const since = failingSince.get(failure.name);
    return failure.runtime === true && since !== void 0 && now - since < graceMs;
  });
}
function trackFailingSince(failingSince, failures, now) {
  const current = new Set(failures.map((failure) => failure.name));
  for (const name of [...failingSince.keys()]) {
    if (!current.has(name))
      failingSince.delete(name);
  }
  for (const name of current) {
    if (!failingSince.has(name))
      failingSince.set(name, now);
  }
}
function failureGraceFromEnv(value) {
  const parsed = value === void 0 || value.trim() === "" ? Number.NaN : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_FAILURE_GRACE_MS;
}
async function waitForTiltResourcesReady(port, options = {}) {
  const timeoutMs = options.timeoutMs ?? Number(process.env.FLISK_UP_READY_TIMEOUT_MS ?? 9e5);
  const intervalMs = options.intervalMs ?? 2e3;
  const fetchJson = options.fetchJson ?? tiltGetUiResources;
  const fetchLogs = options.fetchLogs ?? (options.fetchJson && options.fetchJson !== tiltGetUiResources ? async () => null : tiltResourceLogs);
  const deferred = options.deferred ?? getDeferredResourceNames();
  const disabledHealth = options.disabledHealth ?? getDisabledHealthResourceNames();
  const now = options.now ?? Date.now;
  const failureGraceMs = options.failureGraceMs ?? failureGraceFromEnv(process.env.FLISK_UP_FAILURE_GRACE_MS);
  const failingSince = /* @__PURE__ */ new Map();
  let lastProgressAt = now();
  let previousFingerprint = "";
  const previousLogLengths = /* @__PURE__ */ new Map();
  let lastJsonText = null;
  let last = {
    ready: false,
    failures: [],
    pending: 0,
    timedOut: false,
    enabled: []
  };
  for (; ; ) {
    const text = await fetchJson(port);
    if (text) {
      lastJsonText = text;
      try {
        const evaluation = evaluateTiltReadiness(text, deferred, options.expected, disabledHealth);
        last = evaluation.result;
        trackFailingSince(failingSince, last.failures, now());
        if (evaluation.settled && !withinFailureGrace(last, failingSince, now(), failureGraceMs)) {
          return last;
        }
        if (last.failures.length > 0 && !withinFailureGrace(last, failingSince, now(), failureGraceMs) && options.isStalled?.(text)) {
          return last;
        }
        const currentFingerprint = stateFingerprint(text);
        if (currentFingerprint !== previousFingerprint) {
          previousFingerprint = currentFingerprint;
          lastProgressAt = now();
        } else {
          const building = findBuildingResourceNames(text, deferred);
          if (building.length > 0) {
            for (const name of building) {
              const logs = await fetchLogs(port, name);
              if (logs !== null) {
                const prev = previousLogLengths.get(name);
                if (prev === void 0 || logs.length !== prev) {
                  previousLogLengths.set(name, logs.length);
                  lastProgressAt = now();
                }
              }
            }
          }
        }
      } catch {
      }
    }
    if (now() - lastProgressAt >= timeoutMs) {
      const stillBuilding = lastJsonText ? findBuildingResourceNames(lastJsonText, deferred) : [];
      const pendingNames = lastJsonText ? findPendingResourceNames(lastJsonText, deferred) : [];
      const unfinished = [.../* @__PURE__ */ new Set([...stillBuilding, ...pendingNames])];
      const lastLogs = {};
      for (const name of unfinished) {
        try {
          const logs = await fetchLogs(port, name);
          if (logs && logs.trim().length > 0) {
            lastLogs[name] = formatTail(logs, 10);
          }
        } catch {
        }
      }
      return {
        ...last,
        ready: false,
        timedOut: true,
        stillBuilding,
        lastLogs: Object.keys(lastLogs).length > 0 ? lastLogs : void 0
      };
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// dist/utils/doctor-fix.js
var execFilePromise = promisify(execFile2);
var DOCKER_TIMEOUT_MS = 15e3;
var PROBE_NETWORK = /^flisk_doctor_probe_(\d+)$/;
var runDocker = async (args) => {
  const { stdout } = await execFilePromise("docker", args, {
    encoding: "utf-8",
    timeout: DOCKER_TIMEOUT_MS,
    windowsHide: true
  });
  return stdout;
};
function dockerAnswers() {
  try {
    execFileSync("docker", ["info", "--format", "{{.ServerVersion}}"], {
      encoding: "utf-8",
      timeout: 15e3,
      stdio: ["ignore", "pipe", "ignore"]
    });
    return true;
  } catch {
    return false;
  }
}
function firstLine(error) {
  const stderr = String(error.stderr ?? error).trim();
  return stderr.split(/\r?\n/)[0] ?? "";
}
var STALE_TILT_MIN_AGE_S = 120;
function parseElapsed(etime) {
  const match = /^\s*(?:(?:(\d+)-)?(\d+):)?(\d+):(\d+)\s*$/.exec(etime);
  if (!match)
    return null;
  const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = match;
  return ((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60 + Number(seconds);
}
async function anyTiltAnswers(ports, probe = tiltGetUiResources, attempts = 2, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0)
      await wait(1e3);
    for (const port of ports) {
      if (await probe(port) !== null)
        return true;
    }
  }
  return false;
}
async function tiltProcessStatus(pid) {
  if (process.platform === "win32")
    return "unknown";
  try {
    const { stdout: etime } = await execFilePromise("ps", ["-p", String(pid), "-o", "etime="], {
      encoding: "utf-8",
      timeout: 5e3
    });
    const age = parseElapsed(etime);
    if (age === null || age < STALE_TILT_MIN_AGE_S)
      return "unknown";
    const { stdout } = await execFilePromise("lsof", ["-nP", "-a", "-p", String(pid), "-iTCP", "-sTCP:LISTEN", "-Fn"], { encoding: "utf-8", timeout: 5e3 });
    const ports = [...stdout.matchAll(/^n.*:(\d+)$/gm)].map((m) => Number(m[1]));
    return await anyTiltAnswers(ports) ? "healthy" : "stale";
  } catch {
    return "unknown";
  }
}
function createDockerFixDeps(run = runDocker) {
  return {
    colima: runColima,
    colimaStatus: () => checkColima(),
    dockerAnswers,
    async listNetworks() {
      const names = (await run(["network", "ls", "--format", "{{.Name}}"])).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const inspected = await Promise.all(names.map(async (name) => {
        try {
          const count = await run([
            "network",
            "inspect",
            "--format",
            "{{len .Containers}}",
            name
          ]);
          return { name, containers: Number(count.trim()) || 0 };
        } catch (error) {
          if (/no such network|not found/i.test(String(error)))
            return null;
          throw error;
        }
      }));
      return inspected.filter((network) => network !== null);
    },
    async removeNetwork(name) {
      try {
        await run(["network", "rm", name]);
      } catch (error) {
        throw new FliskError(firstLine(error), [
          `See what still uses it with: docker network inspect ${name}`,
          `Remove it by hand with: docker network rm ${name}`
        ]);
      }
    },
    freeDiskGib() {
      try {
        const stats = statfsSync2(homedir2());
        return Number(stats.bavail) * Number(stats.bsize) / 1024 ** 3;
      } catch {
        return null;
      }
    },
    async reclaimable() {
      let buildCache = null;
      try {
        const df = await run(["system", "df", "--format", "{{.Type}}	{{.Reclaimable}}"]);
        for (const line of df.split(/\r?\n/)) {
          const [type, size] = line.split("	");
          if (type === "Build Cache" && size)
            buildCache = size.replace(/\s*\(.*\)/, "").trim();
        }
      } catch {
      }
      let danglingImages = 0;
      try {
        const ids = await run(["images", "-q", "-f", "dangling=true"]);
        danglingImages = ids.split(/\r?\n/).filter(Boolean).length;
      } catch {
      }
      return { buildCache, danglingImages };
    },
    async prune(kind) {
      try {
        await run(kind === "builder" ? ["builder", "prune", "-f"] : ["image", "prune", "-f"]);
      } catch (error) {
        throw new FliskError(firstLine(error), [
          `Run it by hand: docker ${kind === "builder" ? "builder" : "image"} prune -f`,
          "Check the container engine with: flisk doctor"
        ]);
      }
    },
    async trimColima() {
      try {
        await execFilePromise("colima", ["ssh", "--", "sudo", "fstrim", "-av"], {
          encoding: "utf-8",
          timeout: 3e5,
          windowsHide: true
        });
      } catch (error) {
        throw new FliskError(firstLine(error), [
          "Run it by hand: colima ssh -- sudo fstrim -av",
          "Check the container engine with: flisk doctor"
        ]);
      }
    },
    async tiltStatus(pid) {
      return tiltProcessStatus(pid);
    },
    stopProcess(pid) {
      process.kill(pid, "SIGTERM");
    },
    isProcessAlive(pid) {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        return error.code === "EPERM";
      }
    }
  };
}
var dockerFixDeps = createDockerFixDeps();
async function runColima(action, run = execFilePromise, findNativeLima = nativeLimaPath, hasFile = existsSync) {
  if (action === "native-lima") {
    let nativeDir2 = findNativeLima();
    if (!nativeDir2) {
      const brewBin = hasFile("/opt/homebrew/bin/brew") ? "/opt/homebrew/bin/brew" : "brew";
      await run(brewBin, ["reinstall", "lima"], {
        encoding: "utf-8",
        timeout: 3e5
      });
      nativeDir2 = findNativeLima();
      if (!nativeDir2) {
        throw new FliskError("brew reinstall lima did not provide a native limactl", [
          "Reinstall Lima with the arm64 Homebrew in /opt/homebrew: brew reinstall lima",
          "Check the container engine with: flisk doctor"
        ]);
      }
    }
    const env2 = nativeDir2 ? { ...process.env, PATH: `${nativeDir2}:${process.env.PATH ?? ""}` } : process.env;
    await run("colima", ["start"], { encoding: "utf-8", timeout: 3e5, env: env2 });
    return;
  }
  const nativeDir = findNativeLima();
  const env = nativeDir ? { ...process.env, PATH: `${nativeDir}:${process.env.PATH ?? ""}` } : process.env;
  await run("colima", [action], { encoding: "utf-8", timeout: 3e5, env });
}
async function planDoctorFixes(projectName, deps = dockerFixDeps, context = {}) {
  const actions = [];
  const liveTilt = [];
  for (const pid of context.tiltPids ?? []) {
    if (await deps.tiltStatus(pid) === "stale") {
      actions.push({
        id: `stop-tilt:${pid}`,
        check: "Tilt processes",
        scope: "project",
        command: `kill -TERM ${pid}`,
        status: "planned",
        reason: "this project's Tilt is running but its UI does not answer"
      });
    } else {
      liveTilt.push(pid);
    }
  }
  const projectBusy = liveTilt.length > 0 ? `Tilt is running for this project (pid ${liveTilt.join(", ")}); run flisk down first` : void 0;
  const colima = deps.colimaStatus();
  const repair = planColimaRepair(colima, deps.dockerAnswers());
  if (repair === "start") {
    actions.push({
      id: "colima:start",
      check: "Colima",
      scope: "host",
      command: "colima start",
      status: "planned",
      reason: colima.problem ?? "the Colima VM is not running"
    });
  } else if (repair === "restart") {
    actions.push({
      id: "colima:restart",
      check: "Colima",
      scope: "host",
      command: "colima restart",
      status: "planned",
      reason: "the Colima VM is running but its Docker daemon does not answer"
    });
  } else if (repair === "native-lima") {
    const nativeDir = nativeLimaPath();
    actions.push({
      id: "colima:native-lima",
      check: "Colima",
      scope: "host",
      command: nativeDir ? `PATH="${nativeDir}:$PATH" colima start` : "brew reinstall lima",
      status: "planned",
      reason: nativeDir ? `the colima CLI on this PATH cannot see the VM; a native limactl is installed in ${nativeDir}` : "the colima CLI on this PATH cannot see the VM; lima is installed as an x86_64 build (brew reinstall lima)"
    });
  }
  const networks = await deps.listNetworks();
  const freeGib = deps.freeDiskGib();
  if (freeGib !== null && freeGib < DISK_WARN_GIB) {
    const { buildCache, danglingImages } = await deps.reclaimable();
    const low = `${freeGib.toFixed(1)} GB free`;
    if (buildCache && !/^0(\.0+)?\s*B$/i.test(buildCache)) {
      actions.push({
        id: "prune:builder",
        check: "Disk Space",
        scope: "host",
        command: "docker builder prune -f",
        status: "planned",
        reason: `${low}; ${buildCache} of build cache reclaimable`
      });
    }
    if (danglingImages > 0) {
      actions.push({
        id: "prune:images",
        check: "Disk Space",
        scope: "host",
        command: "docker image prune -f",
        status: "planned",
        reason: `${low}; ${danglingImages} untagged image${danglingImages === 1 ? "" : "s"}`
      });
    }
    const colima2 = deps.colimaStatus();
    if (colima2.isColima && colima2.running) {
      actions.push({
        id: "trim:colima",
        check: "Disk Space",
        scope: "host",
        command: "colima ssh -- sudo fstrim -av",
        status: "planned",
        reason: `${low}; Docker data lives in the Colima VM, whose disk image keeps its size on the Mac until it is trimmed`
      });
    }
  }
  const own = new Set(projectName ? projectNetworkNames(projectName) : []);
  const prefixes = fliskNetworkPrefixes(networks.map((network) => network.name));
  for (const network of networks) {
    const probe = PROBE_NETWORK.exec(network.name);
    let scope;
    let check;
    let reason = "unused network";
    if (probe) {
      scope = "probe";
      check = "Orphaned probe networks";
    } else if (own.has(network.name)) {
      scope = "project";
      check = "Docker networks";
    } else if (context.machine && fliskNetworkOwner(network.name, prefixes)) {
      scope = "machine";
      check = "Docker networks";
      reason = `unused network of project "${fliskNetworkOwner(network.name, prefixes)}"`;
    } else {
      continue;
    }
    const action = {
      id: `remove-network:${network.name}`,
      check,
      scope,
      command: `docker network rm ${network.name}`,
      status: "planned",
      reason
    };
    if (network.containers > 0) {
      action.status = "skipped";
      action.reason = `${network.containers} container(s) still attached`;
    } else if (scope === "project" && projectBusy) {
      action.status = "skipped";
      action.reason = projectBusy;
    } else if (probe && deps.isProcessAlive(Number(probe[1]))) {
      action.status = "skipped";
      action.reason = `probe of a running process (pid ${probe[1]})`;
    }
    actions.push(action);
  }
  return actions;
}
async function applyDoctorFixes(actions, options, deps = dockerFixDeps) {
  const results = [];
  for (const action of actions) {
    if (action.status !== "planned" || options.dryRun) {
      results.push(action);
      continue;
    }
    if (!options.confirm) {
      results.push({
        ...action,
        status: "skipped",
        reason: "confirmation required; run in a terminal or pass --yes"
      });
      continue;
    }
    let confirmed = false;
    try {
      confirmed = await options.confirm(action);
    } catch {
    }
    if (!confirmed) {
      results.push({ ...action, status: "skipped", reason: "not confirmed" });
      continue;
    }
    try {
      if (action.id === "trim:colima") {
        await deps.trimColima();
        results.push({ ...action, status: "applied", reason: "trimmed" });
        continue;
      }
      if (action.id.startsWith("prune:")) {
        await deps.prune(action.id === "prune:builder" ? "builder" : "images");
        results.push({ ...action, status: "applied", reason: "pruned" });
        continue;
      }
      if (action.id.startsWith("colima:")) {
        const what = action.id.slice("colima:".length);
        if (what === "start" || what === "restart") {
          await deps.colima(what);
          results.push({ ...action, status: "applied", reason: `colima ${what} ran` });
          continue;
        }
        try {
          await deps.colima("native-lima");
          results.push({
            ...action,
            status: "applied",
            reason: "native lima repaired and colima started"
          });
        } catch (error) {
          results.push({ ...action, status: "failed", reason: firstLine(error) });
        }
        continue;
      }
      if (action.id.startsWith("stop-tilt:")) {
        deps.stopProcess(Number(action.id.slice("stop-tilt:".length)));
        results.push({ ...action, status: "applied", reason: "stopped" });
        continue;
      }
      await deps.removeNetwork(action.id.slice("remove-network:".length));
      results.push({ ...action, status: "applied", reason: "removed" });
    } catch (error) {
      results.push({ ...action, status: "failed", reason: firstLine(error) });
    }
  }
  return results;
}
function hasFailedActions(actions) {
  return actions.some((action) => action.status === "failed");
}
async function readFliskVersion(path) {
  try {
    const { stdout } = await execFilePromise(path, ["--version"], {
      encoding: "utf-8",
      timeout: 5e3,
      windowsHide: true
    });
    return stdout.trim().split(/\r?\n/)[0] || null;
  } catch {
    return null;
  }
}
async function findFliskInstalls(paths = findAllOnPath("flisk"), readVersion = readFliskVersion) {
  const seen = /* @__PURE__ */ new Set();
  const installs = [];
  for (const path of paths) {
    let real = path;
    try {
      real = realpathSync(path);
    } catch {
    }
    if (seen.has(real))
      continue;
    seen.add(real);
    installs.push({ path, version: await readVersion(path) });
  }
  return installs;
}
async function checkDuplicateFliskInstalls(installs) {
  const found = installs ?? await findFliskInstalls();
  if (found.length <= 1) {
    return { name: "Flisk installs", didPass: true, message: "One flisk install on PATH" };
  }
  const list = found.map((i) => `${i.path} (${i.version ?? "version unknown"})`).join(", ");
  const versions = new Set(found.map((i) => i.version));
  return {
    name: "Flisk installs",
    didPass: false,
    isWarning: true,
    message: `${found.length} flisk installs on PATH${versions.size > 1 ? " with different versions" : ""}: ${list}`,
    fix: "Keep one: remove the others, or run flisk upgrade. The first on PATH is the one your shell runs; tools that launch /usr/local/bin/flisk directly may use another"
  };
}
function projectTiltPids(projectRoot, find = findProjectTiltUpPids) {
  const roots = /* @__PURE__ */ new Set([projectRoot]);
  try {
    roots.add(realpathSync(projectRoot));
  } catch {
  }
  const pids = /* @__PURE__ */ new Set();
  for (const root of roots) {
    for (const pid of find(join(root, ".flisk", ".flisk-out", "Tiltfile")))
      pids.add(pid);
  }
  return [...pids];
}

export {
  DISK_SPACE_CHECK,
  DISK_SAFE_CLEANUP,
  checkDiskSpace,
  dockerDesktopStuck,
  tiltGetUiResources,
  tiltResourceLogs,
  onlyEnabledResources,
  isAdvisoryResource,
  evaluateTiltReadiness,
  waitForTiltResourcesReady,
  planDoctorFixes,
  applyDoctorFixes,
  hasFailedActions,
  checkDuplicateFliskInstalls,
  projectTiltPids
};
