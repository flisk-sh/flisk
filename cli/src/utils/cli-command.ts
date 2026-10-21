// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { accessSync, constants, readdirSync } from "node:fs";
import { delimiter, join } from "node:path";

/** The command users install and type. */
export const CLI_COMMAND = "flisk";

/** The npm package that installs it. */
export const CLI_PACKAGE = "@flisk-sh/flisk";

/** The package the CLI was published under before the rename. It owns the old `flisk` command. */
export const LEGACY_PACKAGE = "@tdk-landscape/tdk-cli-core";

/** True when the command can be typed as-is, so `flisk ...` resolves. */
export function isCommandOnPath(
  command: string = CLI_COMMAND,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const path = env.PATH ?? env.Path ?? "";
  for (const dir of path.split(delimiter)) {
    if (!dir) continue;
    const candidates = [
      join(dir, command),
      join(dir, `${command}.cmd`),
      join(dir, `${command}.exe`),
    ];
    for (const candidate of candidates) {
      try {
        accessSync(candidate, constants.X_OK);
        return true;
      } catch {
        // Not on this PATH entry; keep looking.
      }
    }
  }
  return false;
}

/**
 * A folder to start a project in. It follows the platform convention: Documents when the
 * machine has one, a plain folder in the home directory otherwise.
 */
export function suggestedWorkspace(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.HOME ?? env.USERPROFILE ?? "";
  if (!home) return "flisk-workspace";
  const documents = join(home, "Documents");
  try {
    accessSync(documents, constants.F_OK);
    return join(documents, "flisk");
  } catch {
    return join(home, "flisk");
  }
}

/** True when the directory holds no visible entries, so a project can start there as-is. */
export function isEmptyWorkspace(dir: string): boolean {
  try {
    return readdirSync(dir).every((entry) => entry.startsWith("."));
  } catch {
    return true;
  }
}

/**
 * The next step to print once the machine is ready.
 *
 * An ephemeral run (`npx @flisk-sh/flisk`) never installs the command, so pointing at
 * `flisk ...` there would fail with "command not found"; that case says how to install it
 * instead. A project also should not start in whatever folder the shell happens to be in,
 * so a directory that already holds files gets a workspace to move into first.
 */
export function readyNextStep(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string {
  if (!isCommandOnPath(CLI_COMMAND, env)) {
    return (
      `The \`${CLI_COMMAND}\` command is not on PATH (this run is not a global install). ` +
      `Install it with \`npm install -g ${CLI_PACKAGE}\`, then run \`${CLI_COMMAND} project --yes\`. ` +
      `If npm reports EEXIST for \`flisk\`, the old package still owns that command: ` +
      `run \`npm uninstall -g ${LEGACY_PACKAGE}\` first.`
    );
  }

  if (isEmptyWorkspace(cwd)) {
    return `Next: ${CLI_COMMAND} project --yes`;
  }

  const workspace = suggestedWorkspace(env);
  return (
    `Next: mkdir -p ${workspace} && cd ${workspace} && ${CLI_COMMAND} project --yes\n` +
    `(${CLI_COMMAND} project writes .tdk/ and the master configs into the current folder, ` +
    `so it starts clean in a folder of its own. Or clone a starter: ${CLI_COMMAND} project example)`
  );
}

/**
 * Installs the CLI globally when it is only running ephemerally (`npx @flisk-sh/flisk`),
 * so the `flisk` command keeps working after the run. The old package is removed first:
 * it owns the `flisk` command and would make the install fail with EEXIST.
 */
export function ensureGlobalInstall(
  env: NodeJS.ProcessEnv = process.env,
): "installed" | "present" | "failed" {
  if (isCommandOnPath(CLI_COMMAND, env)) return "present";
  const manager = env.npm_execpath?.includes("bun") ? "bun" : "npm";
  const remove = manager === "bun" ? "bun remove -g" : "npm uninstall -g";
  try {
    execFileSync(remove, [LEGACY_PACKAGE], { stdio: "ignore", timeout: 120000 });
  } catch {
    // Not installed under the old name, or the manager is missing.
  }
  try {
    execFileSync(manager, ["install", "-g", CLI_PACKAGE], { stdio: "inherit", timeout: 300000 });
    return "installed";
  } catch {
    return "failed";
  }
}
