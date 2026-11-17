import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  stripTerminalControls
} from "./chunk-E57RI6CK.js";
import {
  onlyEnabledResources
} from "./chunk-RD63MOSC.js";
import {
  effectiveRuntimeStatus,
  isNeverStarted,
  isTiltResourcePending,
  parseTiltResourceFailures,
  summarizeTiltBuildError
} from "./chunk-KHTVPPO5.js";

// dist/utils/port-conflict-fix.js
var PORT_ENV_VARS = {
  "80": "FLISK_HTTP_PORT",
  "443": "FLISK_HTTPS_PORT",
  "5432": "FLISK_POSTGRES_PORT"
};
function conflictPort(message) {
  const match = message.match(/^host port (\d+) is already allocated$/) ?? message.match(/Bind for [^ ]+:(\d+) failed: port is already allocated/i);
  if (!match)
    return null;
  const [, port] = match;
  return port ? Number(port) : null;
}
function portConflictFix(message, occupant = null) {
  const port = conflictPort(message);
  if (port === null)
    return null;
  const envVar = PORT_ENV_VARS[String(port)];
  const body = occupant?.container ? `Fix: port ${port} is held by the Docker container ${occupant.container}. Stop it (docker stop ${occupant.container})` : occupant ? `Fix: port ${port} is held by ${occupant.command} (pid ${occupant.pid}). Stop it` : `Fix: stop the process using port ${port} (find it with: lsof -nP -iTCP:${port} -sTCP:LISTEN)`;
  return envVar ? `${body}, or set ${envVar} to a free port and run flisk up` : body;
}

// dist/utils/startup-report.js
function waitingOn(item) {
  return (item.status?.waiting?.on ?? []).filter((ref) => (ref.kind ?? "UIResource") === "UIResource" && ref.name).map((ref) => ref.name);
}
var NETWORK_POOL_EXHAUSTED = /all predefined address pools have been fully subnetted|non-overlapping IPv4 address pool|out of network address pools/i;
var INIT_NETWORKS_FALLBACK = "Docker could not create this project's networks; it is most likely out of network address pools";
async function machineProblemFixes(failures, fetchLogs) {
  const fixes = /* @__PURE__ */ new Map();
  for (const { name, message } of failures.slice(0, 5)) {
    const fix = machineProblemFix(message) ?? machineProblemFix(await fetchLogs(name) ?? "");
    if (fix)
      fixes.set(name, fix);
  }
  return fixes;
}
var BARE_EXIT_STATUS = /^(?:Command failed: )?exit status \d+$/i;
var FAILED_COMMAND = /^command\s+(?:"[\s\S]*"|\[[\s\S]*\])\s+failed\b/i;
var MAX_FAILURE_MESSAGE = 300;
var LOG_TAIL_LINES = 3;
async function withLoggedReasons(failures, fetchLogs) {
  const out = [];
  for (const [index, failure] of failures.entries()) {
    const message = failure.message.trim();
    const isBareExit = BARE_EXIT_STATUS.test(message);
    const isCommand = FAILED_COMMAND.test(message);
    if (!isBareExit && !isCommand) {
      out.push(failure);
      continue;
    }
    if (index >= 5) {
      out.push(isCommand ? { ...failure, message: capStart(message) } : failure);
      continue;
    }
    const log = stripTerminalControls(await fetchLogs(failure.name) ?? "");
    const errorLine = loggedErrorLine(log);
    const reason = errorLine ? capStart(errorLine.trim()) : isCommand ? logTail(log) : null;
    if (reason)
      out.push({ ...failure, message: reason });
    else if (isCommand && failure.name === "init-networks")
      out.push({ ...failure, message: INIT_NETWORKS_FALLBACK });
    else if (isCommand)
      out.push({ ...failure, message: capStart(message) });
    else
      out.push(failure);
  }
  return out;
}
async function explainFailures(failures, fetchLogs) {
  const explained = await withLoggedReasons(failures, fetchLogs);
  const fixes = await machineProblemFixes(explained, fetchLogs);
  return explained.map((failure) => {
    const fix = fixes.get(failure.name);
    return fix ? { ...failure, fix } : failure;
  });
}
function logTail(log, lines = LOG_TAIL_LINES) {
  const tail = stripTerminalControls(log).split("\n").map((line) => line.trim()).filter(Boolean).slice(-lines).join(" ");
  if (!tail)
    return null;
  return tail.length > MAX_FAILURE_MESSAGE ? `\u2026${tail.slice(tail.length - (MAX_FAILURE_MESSAGE - 1))}` : tail;
}
function formatWaitFailures(failures) {
  return failures.map((f) => {
    const lines = [`${f.name}: ${f.reason ?? f.message ?? "failed"}`];
    if (f.fix)
      lines.push(`    \u2192 ${f.fix.replace(/^Fix:\s*/, "")}`);
    if (f.logs && f.logs.length > 0) {
      lines.push(...f.logs.map((line) => `    ${line}`));
      lines.push(`    (${lastLines(f.logs.length)} of: flisk logs --service ${f.name})`);
    }
    return lines.join("\n");
  });
}
function lastLines(count) {
  return count === 1 ? "last line" : `last ${count} lines`;
}
function capStart(text) {
  return text.length > MAX_FAILURE_MESSAGE ? `${text.slice(0, MAX_FAILURE_MESSAGE - 1)}\u2026` : text;
}
function loggedErrorLine(log) {
  let reason = null;
  for (const line of log.split("\n")) {
    const match = line.trimEnd().match(/(?:^|\s)ERROR: (\S.*)$/);
    if (match)
      reason = match[1];
  }
  return reason;
}
function machineProblemFix(message) {
  if (NETWORK_POOL_EXHAUSTED.test(message)) {
    return "Fix: Docker has no free network ranges left. Run `flisk doctor --fix --scope=machine` to remove the unused networks of every Flisk project (networks in use are kept), or `flisk down --prune-networks` in a stopped project, or `docker network prune` for all unused networks, then run flisk up again";
  }
  return null;
}
function transitiveDependencies(name, dependsOn) {
  const seen = /* @__PURE__ */ new Set();
  const visit = (current) => {
    for (const dep of dependsOn[current] ?? []) {
      if (seen.has(dep))
        continue;
      seen.add(dep);
      visit(dep);
    }
  };
  visit(name);
  return seen;
}
function isPending(item) {
  return isTiltResourcePending(item.status?.updateStatus ?? "", effectiveRuntimeStatus(item.status));
}
var SHARED_INFRASTRUCTURE = ["postgres", "traefik", "golden-layers-build"];
function buildStartupReport(jsonText, dependsOn, deferred = /* @__PURE__ */ new Set()) {
  const enabledJson = onlyEnabledResources(jsonText);
  const failures = parseTiltResourceFailures(enabledJson, deferred).failures;
  const failed = failures.map((failure) => ({
    name: failure.name,
    message: failure.error ? summarizeTiltBuildError(failure.error) : `${failure.updateStatus}/${failure.runtimeStatus}`
  }));
  const failedNames = new Set(failed.map((entry) => entry.name));
  const items = JSON.parse(enabledJson).items ?? [];
  const deps = { ...dependsOn };
  for (const item of items) {
    const name = item.metadata?.name;
    if (!name)
      continue;
    const waits = waitingOn(item);
    if (waits.length > 0)
      deps[name] = [.../* @__PURE__ */ new Set([...deps[name] ?? [], ...waits])];
  }
  const blocked = [];
  const starting = [];
  const stillBuilding = [];
  for (const item of items) {
    const name = item.metadata?.name ?? "unknown";
    if (name === "(Tiltfile)" || failedNames.has(name) || deferred.has(name) || isNeverStarted(item.status))
      continue;
    const because = [
      .../* @__PURE__ */ new Set([
        ...[...transitiveDependencies(name, deps)].filter((dep) => failedNames.has(dep)),
        ...SHARED_INFRASTRUCTURE.filter((infra) => failedNames.has(infra))
      ])
    ].sort();
    if (because.length > 0) {
      blocked.push({ name, because });
    } else if (isPending(item)) {
      starting.push(name);
      if (item.status?.updateStatus === "in_progress") {
        stillBuilding.push(name);
      }
    }
  }
  return {
    failed,
    blocked,
    starting,
    stillBuilding: stillBuilding.length > 0 ? stillBuilding : void 0
  };
}
function isStartupStalled(jsonText, dependsOn, deferred = /* @__PURE__ */ new Set()) {
  const report = buildStartupReport(jsonText, dependsOn, deferred);
  return report.failed.length > 0 && report.starting.length === 0;
}
function formatStartupReport(report, timedOut, occupantOf, machineFixes = /* @__PURE__ */ new Map(), lastLogs) {
  const lines = [];
  for (const { name, message } of report.failed) {
    lines.push(`\u2717 ${name} failed: ${message}`);
    const port = conflictPort(message);
    const fix = portConflictFix(message, port !== null && occupantOf ? occupantOf(port) : null) ?? machineFixes.get(name) ?? machineProblemFix(message);
    if (fix)
      lines.push(`  ${fix}`);
  }
  for (const { name, because } of report.blocked) {
    lines.push(`\u2717 ${name} is not ready because ${because.join(", ")} failed`);
  }
  if (report.stillBuilding && report.stillBuilding.length > 0) {
    lines.push(`${timedOut ? "Timed out while building:" : "Still building:"} ${report.stillBuilding.join(", ")}`);
  }
  const startingOnly = report.starting.filter((s) => !report.stillBuilding?.includes(s));
  if (startingOnly.length > 0) {
    lines.push(`${timedOut ? "Timed out waiting for" : "Still starting:"} ${startingOnly.join(", ")}`);
  }
  const combinedLogs = { ...report.lastLogs ?? {}, ...lastLogs ?? {} };
  const timedOutServices = [...report.stillBuilding ?? [], ...startingOnly];
  if (timedOut) {
    for (const name of timedOutServices) {
      const logs = combinedLogs[name]?.trim();
      if (logs) {
        lines.push(`Last log lines for ${name}:`);
        for (const logLine of logs.split("\n").slice(-10)) {
          lines.push(`  ${logLine}`);
        }
      }
    }
  }
  if (lines.length > 0) {
    const causes = [...new Set(report.blocked.flatMap((entry) => entry.because))].sort();
    const count = report.blocked.length;
    const summary = count > 0 ? `: ${causes.join(", ")} failed, so ${count} dependent ${count === 1 ? "service is" : "services are"} not ready` : "";
    lines.push(`The environment is not ready${summary}. Tilt is still running; inspect it or run: flisk down`);
  }
  return lines;
}

export {
  machineProblemFixes,
  withLoggedReasons,
  explainFailures,
  formatWaitFailures,
  lastLines,
  transitiveDependencies,
  buildStartupReport,
  isStartupStalled,
  formatStartupReport
};
