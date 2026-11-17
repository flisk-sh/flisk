import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  hasNearbyServiceJson
} from "./chunk-OKFJRRFZ.js";
import {
  findProjectRoot
} from "./chunk-73W4Y4TI.js";

// dist/utils/inferred-node-project.js
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
function inferNodeProject(cwd) {
  if (findProjectRoot(cwd))
    return null;
  if (hasNearbyServiceJson(cwd))
    return null;
  if (existsSync(join(cwd, "docker-compose.yml")) || existsSync(join(cwd, "docker-compose.yaml")))
    return null;
  if (existsSync(join(cwd, "Tiltfile")))
    return null;
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath))
    return null;
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch {
    return null;
  }
  if (pkg.workspaces)
    return null;
  const script = pkg.scripts?.dev || pkg.scripts?.start;
  if (!script)
    return null;
  const manager = detectPackageManager(cwd);
  const scriptKey = pkg.scripts?.dev ? "dev" : "start";
  const command = `${manager} run ${scriptKey}`;
  const serviceName = sanitizeServiceName(pkg.name || basename(cwd));
  const service = {
    name: serviceName,
    path: cwd,
    configPath: join(cwd, "package.json"),
    type: "backend",
    stack: void 0,
    config: {
      appName: serviceName,
      appType: "backend",
      command,
      port: extractPortFromScript(script)
    }
  };
  return { kind: "service", service, command, script: scriptKey };
}
function detectPackageManager(cwd) {
  if (existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb")))
    return "bun";
  if (existsSync(join(cwd, "pnpm-lock.yaml")))
    return "pnpm";
  if (existsSync(join(cwd, "yarn.lock")))
    return "yarn";
  return "npm";
}
function extractPortFromScript(script) {
  const portMatch = script.match(/(?:--port|-p)\s+(\d+)/);
  if (portMatch)
    return parseInt(portMatch[1], 10);
  return void 0;
}
function sanitizeServiceName(name) {
  return name.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase().slice(0, 63) || "app";
}
function inferredStateRoot(cwd) {
  const hash = createHash("sha256").update(cwd).digest("hex").slice(0, 8);
  const folderName = sanitizeServiceName(basename(cwd));
  return join(homedir(), ".flisk", "inferred", `${folderName}-${hash}`);
}

export {
  inferNodeProject,
  inferredStateRoot
};
