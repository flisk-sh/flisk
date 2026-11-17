import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  parseTiltProcesses
} from "./chunk-TZFR2MQ6.js";
import {
  FliskError
} from "./chunk-73W4Y4TI.js";

// dist/utils/tilt-port-owner.js
import { execFileSync as execFileSync2 } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

// dist/utils/tilt-process.js
import { execFileSync } from "node:child_process";
var run = (command, args) => execFileSync(command, args, { encoding: "utf-8", stdio: "pipe", windowsHide: true });
function findTiltProcessIdsOnPort(port, platform = process.platform, commandRunner = run) {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    return [];
  if (platform === "win32") {
    const script = `$port=${port}; Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $p=Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -eq 'tilt') { $_.OwningProcess } } | Sort-Object -Unique`;
    try {
      return commandRunner("powershell.exe", ["-NoProfile", "-Command", script]).split(/\s+/).map(Number).filter((pid) => Number.isInteger(pid) && pid > 0);
    } catch {
      throw new FliskError(`Unable to inspect Tilt listeners on port ${port} with PowerShell.`, ["Ensure PowerShell is available and accessible"], 1);
    }
  }
  let pids;
  try {
    pids = commandRunner("lsof", ["-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"]).split(/\s+/).map(Number).filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch (err) {
    const commandErr = err;
    const stderr = commandErr.stderr?.toString().trim();
    if (commandErr?.status === 1 && !stderr)
      return [];
    throw new FliskError(`Unable to inspect listeners on port ${port}. Install lsof or resolve the lsof error before using --force.`, ["Install lsof or verify permissions before running with --force"], 1);
  }
  return pids.filter((pid) => {
    try {
      const name = commandRunner("ps", ["-p", String(pid), "-o", "comm="]).trim();
      return name.split(/[\\/]/).at(-1) === "tilt";
    } catch {
      throw new FliskError(`Unable to identify the process listening on port ${port}.`, ["Check process inspection permissions"], 1);
    }
  });
}
function stopTiltProcessIds(pids, platform = process.platform, commandRunner = run) {
  for (const pid of pids) {
    if (platform === "win32")
      commandRunner("taskkill.exe", ["/PID", String(pid), "/F"]);
    else
      commandRunner("kill", ["-TERM", String(pid)]);
  }
  return pids;
}
function stopTiltOnPort(port, platform = process.platform, commandRunner = run) {
  return stopTiltProcessIds(findTiltProcessIdsOnPort(port, platform, commandRunner), platform, commandRunner);
}

// dist/utils/tilt-port-owner.js
var run2 = (command, args) => execFileSync2(command, args, {
  encoding: "utf-8",
  stdio: "pipe",
  timeout: 5e3,
  windowsHide: true
});
function findTiltPortOwner(port, platform = process.platform, commandRunner = run2) {
  if (platform === "win32")
    return null;
  try {
    const pids = commandRunner("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const pid of pids) {
      const command = commandRunner("ps", ["-p", pid, "-o", "command="]).trim();
      const [owner] = parseTiltProcesses(`${pid} ${command}`);
      if (owner)
        return owner;
    }
  } catch {
  }
  return null;
}
function canonical(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}
function isOwnTilt(owner, projectRoot) {
  return owner !== null && canonical(owner.root) === canonical(projectRoot);
}
function isForeignTilt(owner, projectRoot) {
  return owner !== null && canonical(owner.root) !== canonical(projectRoot);
}
async function classifyTiltPorts(candidatePorts, projectRoot, isServing, ownerOf = findTiltPortOwner) {
  const result = { running: [], foreign: [] };
  for (const port of candidatePorts) {
    if (!await isServing(port))
      continue;
    const owner = ownerOf(port);
    if (owner && isForeignTilt(owner, projectRoot))
      result.foreign.push({ port, root: owner.root });
    else
      result.running.push(port);
  }
  return result;
}
async function findProjectTiltPorts(options) {
  const ownerOf = options.ownerOf ?? findTiltPortOwner;
  const confirmedWatched = [];
  const unknownWatched = [];
  const foreign = [];
  for (const port of options.watchedPorts) {
    if (!await options.isServing(port))
      continue;
    const owner = ownerOf(port);
    if (owner && isForeignTilt(owner, options.projectRoot)) {
      foreign.push({ port, root: owner.root });
    } else if (isOwnTilt(owner, options.projectRoot)) {
      confirmedWatched.push(port);
    } else {
      unknownWatched.push(port);
    }
  }
  const watchedRunning = [...confirmedWatched, ...unknownWatched];
  const savedPort = options.savedPort;
  if (savedPort === null || options.watchedPorts.includes(savedPort)) {
    return { running: watchedRunning, foreign, savedRunning: [], unknownSaved: [] };
  }
  if (!await options.isServing(savedPort)) {
    return { running: watchedRunning, foreign, savedRunning: [], unknownSaved: [] };
  }
  const savedOwner = ownerOf(savedPort);
  if (isOwnTilt(savedOwner, options.projectRoot) && savedOwner !== null) {
    return {
      running: [...confirmedWatched, savedPort],
      foreign,
      savedRunning: [savedPort],
      unknownSaved: []
    };
  }
  if (isForeignTilt(savedOwner, options.projectRoot)) {
    return { running: watchedRunning, foreign, savedRunning: [], unknownSaved: [] };
  }
  if (confirmedWatched.length > 0) {
    return { running: confirmedWatched, foreign, savedRunning: [], unknownSaved: [savedPort] };
  }
  return { running: unknownWatched, foreign, savedRunning: [], unknownSaved: [savedPort] };
}
function stopOwnedTiltOnPort(port, projectRoot, expectedOwner, platform = process.platform, commandRunner = run2) {
  const currentOwner = findTiltPortOwner(port, platform, commandRunner);
  if (!isOwnTilt(currentOwner, projectRoot) || currentOwner === null) {
    return [];
  }
  if (expectedOwner && currentOwner.pid !== expectedOwner.pid) {
    return [];
  }
  const tiltPids = findTiltProcessIdsOnPort(port, platform, commandRunner);
  if (!tiltPids.includes(currentOwner.pid)) {
    return [];
  }
  return stopTiltProcessIds([currentOwner.pid], platform, commandRunner);
}

export {
  stopTiltOnPort,
  findTiltPortOwner,
  isOwnTilt,
  isForeignTilt,
  classifyTiltPorts,
  findProjectTiltPorts,
  stopOwnedTiltOnPort
};
