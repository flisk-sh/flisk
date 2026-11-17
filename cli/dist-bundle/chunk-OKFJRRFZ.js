import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  discoverResourcesWithProblems,
  isNativeProject
} from "./chunk-2BH5UW2N.js";
import {
  SERVICE_JSON,
  findProjectRoot
} from "./chunk-73W4Y4TI.js";

// dist/utils/native-project.js
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
function hasNearbyServiceJson(dir, depth = 0) {
  if (existsSync(join(dir, SERVICE_JSON)))
    return true;
  if (depth >= 2)
    return false;
  try {
    return readdirSync(dir, { withFileTypes: true }).some((entry) => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules" && hasNearbyServiceJson(join(dir, entry.name), depth + 1));
  } catch {
    return false;
  }
}
function findNativeProject(cwd = process.cwd()) {
  const projectRoot = findProjectRoot(cwd) ?? (hasNearbyServiceJson(cwd) ? cwd : null);
  if (!projectRoot)
    return null;
  try {
    const { resources } = discoverResourcesWithProblems(projectRoot);
    return isNativeProject(resources) ? { projectRoot, resources } : null;
  } catch {
    return null;
  }
}

export {
  hasNearbyServiceJson,
  findNativeProject
};
