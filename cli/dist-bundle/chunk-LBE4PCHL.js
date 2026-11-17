import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  databaseResourceNames,
  namesSharedPlatformPostgres
} from "./chunk-LJHNJFBB.js";
import {
  isDatabaseCapabilityEnabled
} from "./chunk-BH5IJ6AV.js";
import {
  toComposeProjectName
} from "./chunk-HS5H5D2L.js";
import {
  readProjectNameOrUndefined
} from "./chunk-2BH5UW2N.js";
import {
  DATABASE_MANAGEMENT_FEATURE
} from "./chunk-73W4Y4TI.js";

// dist/utils/shared-infra.js
function usesSharedPostgresAmong(resource, databaseNames) {
  const config = resource.config;
  if (!config)
    return false;
  if (Array.isArray(config.featuresEnabled) && config.featuresEnabled.includes(DATABASE_MANAGEMENT_FEATURE))
    return true;
  const dependsOn = Array.isArray(config.dependsOn) ? config.dependsOn : [];
  return dependsOn.some((name) => typeof name === "string" && namesSharedPlatformPostgres(name, databaseNames));
}
function groupSharedPostgres(projectName, stacks, options) {
  if (options && !isDatabaseCapabilityEnabled(options.projectRoot, { ...options }))
    return null;
  const prefix = toComposeProjectName(projectName);
  const databases = [];
  const databaseNames = databaseResourceNames(stacks.flatMap((stack) => stack.resources));
  for (const stack of [...stacks].sort((a, b) => a.name.localeCompare(b.name))) {
    const services = stack.resources.filter((resource) => usesSharedPostgresAmong(resource, databaseNames)).map((resource) => resource.name);
    if (services.length === 0)
      continue;
    databases.push({
      name: `${prefix}_${stack.name.replace(/-/g, "_")}`,
      stack: stack.name,
      services: services.sort()
    });
  }
  if (databases.length === 0)
    return null;
  return { name: "postgres", databases };
}
function readProjectName(projectRoot) {
  return readProjectNameOrUndefined(projectRoot) ?? null;
}

export {
  groupSharedPostgres,
  readProjectName
};
