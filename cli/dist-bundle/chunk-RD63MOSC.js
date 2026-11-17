import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  effectiveRuntimeStatus,
  getDeferredResourceNames,
  parseTiltResourceFailures
} from "./chunk-KHTVPPO5.js";
import {
  discoverResources,
  isHealthCheckDisabled,
  redactProjectText
} from "./chunk-2BH5UW2N.js";
import {
  findOnPath
} from "./chunk-73W4Y4TI.js";

// dist/utils/up-readiness.js
import { execFile, execFileSync } from "node:child_process";
function tiltGetUiResources(port) {
  return new Promise((resolve) => {
    execFile(findOnPath("tilt") ?? "tilt", ["get", "uiresources", "-o", "json", "--port", String(port)], { timeout: 15e3, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => resolve(error ? null : stdout));
  });
}
function tiltResourceLogs(port, name) {
  return new Promise((resolve) => {
    execFile(
      findOnPath("tilt") ?? "tilt",
      ["logs", name, "--port", String(port)],
      { timeout: 15e3, maxBuffer: 16 * 1024 * 1024 },
      // An application can print its own environment, so what the user or an agent reads is masked here, at the one place every
      // `flisk up` log excerpt comes from (failure reasons, timeouts, URL checks).
      (error, stdout) => resolve(error ? null : redactProjectText(stdout))
    );
  });
}
function onlyEnabledResources(jsonText, disabledHealth, probeCannotRun) {
  const parsed = JSON.parse(jsonText);
  const items = (parsed.items ?? []).filter((item) => item.status?.disableStatus?.state !== "Disabled").map((item) => {
    let current = item;
    if (current.status?.updateStatus === "not_applicable") {
      current = { ...current, status: { ...current.status, updateStatus: "ok" } };
    }
    const name = current.metadata?.name;
    const health = current.status?.composeResourceInfo?.healthStatus;
    if (name && current.status?.composeResourceInfo && ((disabledHealth?.has(name) ?? false) || health === "unhealthy" && probeCannotRun?.(name) === true)) {
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
function probeNeverRan(probe) {
  const output = probe.Output ?? "";
  if (probe.ExitCode === -1)
    return /OCI runtime exec failed/.test(output);
  if (probe.ExitCode === 127)
    return /not found/i.test(output);
  if (probe.ExitCode === 126) {
    return /permission denied|cannot execute|not executable|is a directory/i.test(output);
  }
  return false;
}
function healthProbeCannotRun(service) {
  try {
    const ids = execFileSync("docker", ["ps", "-q", "--filter", `label=com.docker.compose.service=${service}`], { encoding: "utf-8", timeout: 8e3, stdio: ["ignore", "pipe", "ignore"] }).split("\n").filter(Boolean);
    if (ids.length !== 1)
      return false;
    const state = JSON.parse(execFileSync("docker", ["inspect", "--format", "{{json .State}}", ids[0]], {
      encoding: "utf-8",
      timeout: 8e3,
      stdio: ["ignore", "pipe", "ignore"]
    }));
    const log = state.Health?.Log ?? [];
    if (state.Status !== "running" || log.length === 0 || !log.every(probeNeverRan))
      return false;
    const shellForm = log.some((probe) => probe.ExitCode === 126 || probe.ExitCode === 127);
    return !(shellForm && (state.Health?.FailingStreak ?? 0) > log.length);
  } catch {
    return false;
  }
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
function evaluateTiltReadiness(jsonText, deferred, expected, disabledHealth, probeCannotRun) {
  const parsed = parseTiltResourceFailures(onlyEnabledResources(jsonText, disabledHealth, probeCannotRun), deferred);
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
  const probeCannotRun = options.probeCannotRun ?? (options.fetchJson && options.fetchJson !== tiltGetUiResources ? void 0 : healthProbeCannotRun);
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
        const evaluation = evaluateTiltReadiness(text, deferred, options.expected, disabledHealth, probeCannotRun);
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

export {
  tiltGetUiResources,
  tiltResourceLogs,
  onlyEnabledResources,
  healthProbeCannotRun,
  getDisabledHealthResourceNames,
  isAdvisoryResource,
  evaluateTiltReadiness,
  waitForTiltResourcesReady
};
