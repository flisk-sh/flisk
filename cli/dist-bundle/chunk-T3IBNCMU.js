import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);

// dist/utils/npm-lockfile.js
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
var LOCKFILE_COMMAND = "npm install --package-lock-only --ignore-scripts --no-audit --no-fund --legacy-peer-deps --workspaces=false";
function generateNpmLockfile(dir) {
  if (existsSync(join(dir, "package-lock.json")))
    return { ok: true, reason: "" };
  const [command, ...args] = LOCKFILE_COMMAND.split(" ");
  const result = spawnSync(command, args, {
    cwd: dir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 12e4
  });
  if (result.error) {
    const missing = result.error.code === "ENOENT";
    return { ok: false, reason: missing ? "npm is not installed" : result.error.message };
  }
  if (result.status !== 0) {
    const tail = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split("\n").slice(-2).join(" ");
    return { ok: false, reason: tail || `npm exited with ${result.status}` };
  }
  return existsSync(join(dir, "package-lock.json")) ? { ok: true, reason: "" } : { ok: false, reason: "npm wrote no package-lock.json" };
}

export {
  LOCKFILE_COMMAND,
  generateNpmLockfile
};
