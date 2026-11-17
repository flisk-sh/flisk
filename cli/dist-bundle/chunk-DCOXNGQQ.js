import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  tiltGetUiResources
} from "./chunk-RD63MOSC.js";
import {
  formatBytes,
  isColimaDiskBloated,
  readColimaDisk,
  runColimaTrim
} from "./chunk-3P4YMCKC.js";
import {
  DISK_WARN_GIB,
  evaluateDisk
} from "./chunk-X45DIH6R.js";
import {
  checkColima,
  nativeLimaPath,
  planColimaRepair
} from "./chunk-QRGFABNE.js";
import {
  findProjectTiltUpPids,
  fliskNetworkOwner,
  fliskNetworkPrefixes,
  projectNetworkNames
} from "./chunk-QQ2PAYEU.js";
import {
  FliskError,
  findAllOnPath
} from "./chunk-73W4Y4TI.js";

// dist/utils/doctor-host.js
import { statfsSync } from "node:fs";
import { homedir } from "node:os";
var DISK_SPACE_CHECK = "Disk Space";
function checkDiskSpace(statfs = statfsSync, path = homedir(), vmFreeGib) {
  const disk = evaluateDisk({ statfs, path, vmFreeGib });
  if (disk.level === "unknown") {
    return { name: DISK_SPACE_CHECK, didPass: true, isSkipped: true, message: disk.message };
  }
  if (disk.level === "fail") {
    return { name: DISK_SPACE_CHECK, didPass: false, message: disk.message, fix: disk.fix };
  }
  if (disk.level === "warn") {
    return {
      name: DISK_SPACE_CHECK,
      didPass: false,
      isWarning: true,
      message: disk.message,
      fix: disk.fix
    };
  }
  return { name: DISK_SPACE_CHECK, didPass: true, message: disk.message };
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

// dist/utils/doctor-fix.js
import { execFile, execFileSync } from "node:child_process";
import { existsSync, realpathSync, statfsSync as statfsSync2 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
var execFilePromise = promisify(execFile);
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
    async colimaDiskBloat() {
      const report = await readColimaDisk();
      return report && isColimaDiskBloated(report) ? report : null;
    },
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
    trimColima: runColimaTrim,
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
  if (!actions.some((action) => action.id === "trim:colima")) {
    const bloat = await deps.colimaDiskBloat?.();
    if (bloat) {
      actions.push({
        id: "trim:colima",
        check: "Colima Disk",
        scope: "host",
        command: "colima ssh -- sudo fstrim -av",
        status: "planned",
        reason: `the Colima disk file takes ${formatBytes(bloat.diskFileBytes)} on the Mac while Docker uses ${formatBytes(bloat.dockerBytes)}`
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
  checkDiskSpace,
  dockerDesktopStuck,
  planDoctorFixes,
  applyDoctorFixes,
  hasFailedActions,
  checkDuplicateFliskInstalls,
  projectTiltPids
};
