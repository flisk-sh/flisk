import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  buildStartupReport,
  transitiveDependencies
} from "./chunk-DLM3GIFT.js";
import {
  onlyEnabledResources
} from "./chunk-RD63MOSC.js";
import {
  effectiveRuntimeStatus,
  isTiltResourcePending
} from "./chunk-KHTVPPO5.js";

// dist/utils/service-runtime-state.js
function deriveServiceStates(jsonText, dependsOn, deferred = /* @__PURE__ */ new Set()) {
  const report = buildStartupReport(jsonText, dependsOn, deferred);
  const failed = new Map(report.failed.map((entry) => [entry.name, entry.message]));
  const blocked = new Map(report.blocked.map((entry) => [entry.name, entry.because]));
  const starting = new Set(report.starting);
  const items = JSON.parse(onlyEnabledResources(jsonText)).items ?? [];
  const direct = /* @__PURE__ */ new Map();
  for (const item of items) {
    const name = item.metadata?.name;
    if (!name || name === "(Tiltfile)")
      continue;
    if (failed.has(name)) {
      direct.set(name, { status: "error", reason: failed.get(name) });
    } else if (blocked.has(name)) {
      const because = blocked.get(name) ?? [];
      direct.set(name, {
        status: "error",
        reason: `${because.join(", ")} failed`,
        blockedBy: because
      });
    } else if (starting.has(name)) {
      direct.set(name, { status: "pending" });
    } else if (deferred.has(name) && isTiltResourcePending(item.status?.updateStatus ?? "", effectiveRuntimeStatus(item.status))) {
      direct.set(name, { status: "unknown", reason: "starts on its first request" });
    } else {
      direct.set(name, { status: "ready" });
    }
  }
  const result = {};
  for (const [name, state] of direct) {
    if (state.status !== "ready") {
      result[name] = state;
      continue;
    }
    const deps = [...transitiveDependencies(name, dependsOn)].filter((dep) => direct.has(dep));
    const failedDeps = deps.filter((dep) => direct.get(dep)?.status === "error").sort();
    const waitingDeps = deps.filter((dep) => direct.get(dep)?.status === "pending").sort();
    if (failedDeps.length > 0) {
      result[name] = {
        status: "error",
        reason: `${failedDeps.join(", ")} failed`,
        blockedBy: failedDeps
      };
    } else if (waitingDeps.length > 0) {
      result[name] = { status: "pending", reason: `waiting for ${waitingDeps.join(", ")}` };
    } else {
      result[name] = state;
    }
  }
  return result;
}

export {
  deriveServiceStates
};
