import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  DEFAULT_ALWAYS_ENABLED_INFRA,
  isDatabaseCapabilityEnabled
} from "./chunk-BH5IJ6AV.js";
import {
  dependsOnOf,
  discoverResourcesFromRoot,
  readProjectJson
} from "./chunk-2BH5UW2N.js";
import {
  DATABASE_MANAGEMENT_FEATURE
} from "./chunk-73W4Y4TI.js";

// dist/utils/shared-platform-postgres.js
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
var POSTGRES_DEPENDENCY_NAMES = ["postgres", DATABASE_MANAGEMENT_FEATURE];
var PHASE_KEYS = ["pre_alpha", "alpha", "beta", "out_of_scope"];
function isSharedPlatformPostgresDependency(name) {
  return POSTGRES_DEPENDENCY_NAMES.includes(name);
}
function databaseResourceNames(resources) {
  return resources.filter((resource) => resource.config?.appType === "database").map((resource) => resource.name);
}
function namesSharedPlatformPostgres(name, databaseNames = []) {
  return isSharedPlatformPostgresDependency(name) || databaseNames.includes(name);
}
function readTextIfExists(path) {
  try {
    return existsSync(path) ? readFileSync(path, "utf-8") : void 0;
  } catch {
    return void 0;
  }
}
function parseStarlarkStringList(source, name) {
  const skipSpaces = (at) => {
    let i = at;
    while (i < source.length && /\s/.test(source.charAt(i)))
      i += 1;
    return i;
  };
  let from = 0;
  for (; ; ) {
    const at = source.indexOf(name, from);
    if (at === -1)
      return void 0;
    let i = skipSpaces(at + name.length);
    if (source[i] === "=") {
      i = skipSpaces(i + 1);
      if (source[i] === "[") {
        const end = source.indexOf("]", i + 1);
        if (end === -1)
          return void 0;
        return [...source.slice(i + 1, end).matchAll(/"([^"]+)"|'([^']+)'/g)].map((x) => x[1] ?? x[2] ?? "");
      }
    }
    from = at + name.length;
  }
}
function tiltfileAlwaysEnabledInfra(projectRoot) {
  const path = join(projectRoot, ".flisk", ".flisk-out", "Tiltfile");
  const text = readTextIfExists(path);
  if (!text)
    return void 0;
  return parseStarlarkStringList(text, "ALWAYS_ENABLED_INFRA");
}
function specMasterHasDatabaseManagement(projectRoot) {
  const path = join(projectRoot, ".flisk", ".flisk-out", "spec.master");
  const text = readTextIfExists(path);
  if (text === void 0)
    return void 0;
  return /"database-management"\s*:\s*True/.test(text);
}
function generatedDefaultFocusEnablesDatabaseManagement(projectRoot) {
  const output = join(projectRoot, ".flisk", ".flisk-out");
  const tiltfile = readTextIfExists(join(output, "Tiltfile"));
  const spec = readTextIfExists(join(output, "spec.master"));
  const config = readTextIfExists(join(output, "flisk-cli-ext", "discovery", "config.star"));
  const profiles = readTextIfExists(join(output, "flisk-cli-ext", "engine", "topologies", "tilt", "config", "profiles.star"));
  if (!tiltfile || !spec || !config || !profiles)
    return false;
  const preAlpha = spec.match(/PRE_ALPHA_RESOURCES\s*=\s*\{([^}]*)\}/)?.[1];
  const coreInfra = parseStarlarkStringList(config, "CORE_INFRA");
  return /FOCUS_MODE\s*,\s*FOCUS_ENABLED_ALL\s*,\s*FOCUS_ENABLED_RESOURCES\s*=\s*Config\.apply_focus\(cfg\)/.test(tiltfile) && /if FOCUS_MODE and FOCUS_ENABLED_ALL\s*:/.test(tiltfile) && /"[^"]+"\s*:\s*True|'[^']+'\s*:\s*True/.test(preAlpha ?? "") && (coreInfra?.includes("postgres") ?? false) && /["']postgres["']\s*:\s*["']database-management["']/.test(config) && /for infra in CORE_INFRA_EXPORT\s*:/.test(profiles) && /needed\[INFRA_STACK_MAP_EXPORT\[infra\]\]\s*=\s*True/.test(profiles);
}
function projectJsonFeatureOn(projectRoot) {
  const parsed = readProjectJson(projectRoot);
  if (!parsed)
    return false;
  const phases = parsed.phases ?? {};
  for (const phase of PHASE_KEYS) {
    const stacks = phases[phase]?.enabledStacks;
    if (Array.isArray(stacks) && stacks.includes(DATABASE_MANAGEMENT_FEATURE)) {
      return true;
    }
  }
  const alwaysEnabled = parsed.always_enabled_infra ?? DEFAULT_ALWAYS_ENABLED_INFRA;
  return Array.isArray(alwaysEnabled) && alwaysEnabled.includes(DATABASE_MANAGEMENT_FEATURE);
}
function knownDependsonNames(projectRoot, resources) {
  const known = /* @__PURE__ */ new Set();
  for (const name of POSTGRES_DEPENDENCY_NAMES)
    known.add(name);
  for (const resource of resources) {
    known.add(resource.name);
    if (resource.stack)
      known.add(resource.stack);
  }
  const parsed = readProjectJson(projectRoot);
  if (parsed) {
    const phases = parsed.phases ?? {};
    for (const phase of PHASE_KEYS) {
      const stacks = phases[phase]?.enabledStacks;
      if (Array.isArray(stacks)) {
        for (const stack of stacks)
          known.add(stack);
      }
    }
    const alwaysEnabled = parsed.always_enabled_infra ?? DEFAULT_ALWAYS_ENABLED_INFRA;
    if (Array.isArray(alwaysEnabled)) {
      for (const entry of alwaysEnabled)
        known.add(entry);
    }
  }
  const fromTilt = tiltfileAlwaysEnabledInfra(projectRoot);
  if (Array.isArray(fromTilt)) {
    for (const entry of fromTilt)
      known.add(entry);
  }
  return known;
}
function evaluateSharedPlatformPostgres(projectRoot, resources = discoverResourcesFromRoot(projectRoot), options) {
  if (!isDatabaseCapabilityEnabled(projectRoot, options)) {
    return {
      featureOn: false,
      featureOnFromProjectJson: false,
      featureOnFromTiltfile: false,
      featureOnFromSpecMaster: false,
      focusWouldEnableDatabaseManagement: false,
      dependsOnUsers: [],
      databaseResources: [],
      willStart: false,
      reason: "none",
      unknownDependsOnNames: []
    };
  }
  const featureOnFromProjectJson = projectJsonFeatureOn(projectRoot);
  const fromTilt = tiltfileAlwaysEnabledInfra(projectRoot);
  const featureOnFromTiltfile = Array.isArray(fromTilt) && fromTilt.includes(DATABASE_MANAGEMENT_FEATURE);
  const featureOnFromSpecMaster = specMasterHasDatabaseManagement(projectRoot) === true;
  const featureOn = featureOnFromProjectJson || featureOnFromTiltfile || featureOnFromSpecMaster;
  const focusWouldEnableDatabaseManagement = !featureOnFromProjectJson && generatedDefaultFocusEnablesDatabaseManagement(projectRoot);
  const known = knownDependsonNames(projectRoot, resources);
  const databaseResources = databaseResourceNames(resources);
  const dependsOnUsers = [];
  const unknownDependsOnNames = [];
  for (const resource of resources) {
    const deps = dependsOnOf(resource.config);
    let usesSharedPostgres = false;
    for (const dep of deps) {
      if (isSharedPlatformPostgresDependency(dep) || databaseResources.includes(dep)) {
        usesSharedPostgres = true;
        continue;
      }
      if (!known.has(dep)) {
        unknownDependsOnNames.push({ resource: resource.name, name: dep });
      }
    }
    if (usesSharedPostgres) {
      dependsOnUsers.push(resource.name);
    }
  }
  const willStart = featureOn || dependsOnUsers.length > 0 || databaseResources.length > 0;
  let reason = "none";
  if (featureOn) {
    reason = "feature";
  } else if (dependsOnUsers.length > 0 || databaseResources.length > 0) {
    reason = "dependsOn";
  }
  return {
    featureOn,
    featureOnFromProjectJson,
    featureOnFromTiltfile,
    featureOnFromSpecMaster,
    focusWouldEnableDatabaseManagement,
    dependsOnUsers,
    databaseResources,
    willStart,
    reason,
    unknownDependsOnNames
  };
}
function describeSharedPostgresUsers(evaluation) {
  const parts = [];
  if (evaluation.databaseResources.length > 0) {
    parts.push(`database resource(s) ${evaluation.databaseResources.join(", ")} declare it`);
  }
  if (evaluation.dependsOnUsers.length > 0) {
    parts.push(`resource(s) ${evaluation.dependsOnUsers.join(", ")} depend on ${dependsOnTargets(evaluation)}`);
  }
  return parts.join(" and ");
}
function dependsOnTargets(evaluation) {
  return ["postgres", "database-management", ...evaluation.databaseResources].join("/");
}

export {
  databaseResourceNames,
  namesSharedPlatformPostgres,
  evaluateSharedPlatformPostgres,
  describeSharedPostgresUsers
};
