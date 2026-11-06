import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);

// dist/utils/cli-command.js
import { execFileSync } from "node:child_process";
import { accessSync, constants, readdirSync } from "node:fs";
import { delimiter, join } from "node:path";
var CLI_COMMAND = "flisk";
var CLI_PACKAGE = "@flisk-sh/flisk";
var CLI_REPOSITORY = "https://github.com/flisk-sh/flisk";
var LEGACY_PACKAGE = "@tdk-landscape/tdk-cli-core";
function isCommandOnPath(command = CLI_COMMAND, env = process.env) {
  const path = env.PATH ?? env.Path ?? "";
  for (const dir of path.split(delimiter)) {
    if (!dir)
      continue;
    const candidates = [
      join(dir, command),
      join(dir, `${command}.cmd`),
      join(dir, `${command}.exe`)
    ];
    for (const candidate of candidates) {
      try {
        accessSync(candidate, constants.X_OK);
        return true;
      } catch {
      }
    }
  }
  return false;
}
function suggestedWorkspace(env = process.env) {
  const home = env.HOME ?? env.USERPROFILE ?? "";
  if (!home)
    return "flisk-workspace";
  const documents = join(home, "Documents");
  try {
    accessSync(documents, constants.F_OK);
    return join(documents, "flisk");
  } catch {
    return join(home, "flisk");
  }
}
function isEmptyWorkspace(dir) {
  try {
    return readdirSync(dir).every((entry) => entry.startsWith("."));
  } catch {
    return true;
  }
}
function readyNextStep(env = process.env, cwd = process.cwd()) {
  if (!isCommandOnPath(CLI_COMMAND, env)) {
    return `The \`${CLI_COMMAND}\` command is not on PATH (this run is not a global install). Install it with \`npm install -g ${CLI_PACKAGE}\`, then run \`${CLI_COMMAND} project --yes\`. If npm reports EEXIST for \`flisk\`, the old package still owns that command: run \`npm uninstall -g ${LEGACY_PACKAGE}\` first. The current release is published from ${CLI_REPOSITORY}.`;
  }
  if (isEmptyWorkspace(cwd)) {
    return `Next: ${CLI_COMMAND} project --yes`;
  }
  const workspace = suggestedWorkspace(env);
  return `Next: mkdir -p ${workspace} && cd ${workspace} && ${CLI_COMMAND} project --yes
(${CLI_COMMAND} project writes .flisk/ and the master configs into the current folder, so it starts clean in a folder of its own. Or clone a starter: ${CLI_COMMAND} project example)`;
}
function ensureGlobalInstall(env = process.env) {
  if (isCommandOnPath(CLI_COMMAND, env))
    return "present";
  const manager = env.npm_execpath?.includes("bun") ? "bun" : "npm";
  const remove = manager === "bun" ? "bun remove -g" : "npm uninstall -g";
  try {
    execFileSync(remove, [LEGACY_PACKAGE], { stdio: "ignore", timeout: 12e4 });
  } catch {
  }
  try {
    execFileSync(manager, ["install", "-g", CLI_PACKAGE], { stdio: "ignore", timeout: 3e5 });
    return "installed";
  } catch {
    return "failed";
  }
}

export {
  CLI_REPOSITORY,
  LEGACY_PACKAGE,
  readyNextStep,
  ensureGlobalInstall
};
