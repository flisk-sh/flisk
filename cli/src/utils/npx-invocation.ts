// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { existsSync } from "node:fs";
import { win32 } from "node:path";
import { findOnPath } from "./which.js";

/** How to spawn `npx <args>` so every argument reaches npx exactly as given. */
export interface NpxInvocation {
  command: string;
  args: string[];
  shell: false;
  /** True when `args` is a ready cmd.exe line that Node must not quote again. */
  windowsVerbatimArguments: boolean;
}

export interface NpxRuntime {
  platform?: NodeJS.Platform;
  execPath?: string;
  exists?: (path: string) => boolean;
  comSpec?: string;
}

export interface PackageRunnerRuntime extends NpxRuntime {
  /** PATH to search for the runner; defaults to this process's PATH. */
  pathEnv?: string;
}

export type PackageRunner = "npx" | "bunx";

/**
 * Builds the npx call for `flisk export` and `flisk import` (#4004).
 *
 * Outside Windows npx is spawned directly. On Windows npx is a batch file (`npx.cmd`), and Node refuses to spawn a
 * batch file without a shell (CVE-2024-27980). A shell joins the arguments into one unquoted cmd.exe line, so a
 * path with a space splits in two and `&`, `|` or `%VAR%` in an argument are run or expanded by cmd.exe. So:
 *  - under node.exe, run npm's `npx-cli.js` with node itself: no shell, the arguments pass through untouched;
 *  - otherwise (the flisk binary, bun, an npm without npx-cli.js), run `npx.cmd` through cmd.exe with every
 *    argument quoted and caret-escaped, and tell Node not to quote the line again.
 */
export function npxInvocation(npxArgs: string[], runtime: NpxRuntime = {}): NpxInvocation {
  const platform = runtime.platform ?? process.platform;
  if (platform !== "win32") {
    return { command: "npx", args: npxArgs, shell: false, windowsVerbatimArguments: false };
  }

  const execPath = runtime.execPath ?? process.execPath;
  const exists = runtime.exists ?? existsSync;
  if (/^node(\.exe)?$/i.test(win32.basename(execPath))) {
    const npxCli = win32.join(win32.dirname(execPath), "node_modules", "npm", "bin", "npx-cli.js");
    if (exists(npxCli)) {
      return {
        // The runtime that owns npx-cli.js, by absolute path: a bare "node" would be searched in the current directory
        // first on Windows and could be another installation than the one whose npm holds npx-cli.js.
        command: execPath,
        args: [npxCli, ...npxArgs],
        shell: false,
        windowsVerbatimArguments: false,
      };
    }
  }

  // Never the ComSpec environment value: an environment variable must not choose the program that is spawned.
  const comSpec = runtime.comSpec ?? "cmd.exe";
  const line = ["npx.cmd", ...npxArgs.map(quoteCmdArgument)].join(" ");
  return {
    command: comSpec,
    args: ["/d", "/s", "/c", `"${line}"`],
    shell: false,
    windowsVerbatimArguments: true,
  };
}

/**
 * Picks the package runner for `flisk import` and `flisk export`: npx when installed, otherwise bunx. When neither is
 * on PATH, npx stays the fallback so the existing spawn error and install hint are reported (#3744).
 */
export function findPackageRunner(
  pathEnv: string | undefined,
  platform: NodeJS.Platform = process.platform,
): PackageRunner {
  const npx = findOnPath("npx", pathEnv, platform);
  if (npx) return "npx";
  const bunx = findOnPath("bunx", pathEnv, platform);
  if (bunx) return "bunx";
  return "npx";
}

/**
 * Builds the package-runner call: npx keeps its `--yes` flag and Windows handling, while bunx has no `--yes` and is a
 * batch file on Windows, so it goes through cmd.exe with every argument quoted.
 */
export function packageRunnerInvocation(
  packageArgs: readonly string[],
  runtime: PackageRunnerRuntime = {},
): NpxInvocation {
  const platform = runtime.platform ?? process.platform;
  if (findPackageRunner(runtime.pathEnv, platform) === "npx") {
    return npxInvocation(["--yes", ...packageArgs], runtime);
  }

  const args = [...packageArgs];
  if (platform !== "win32") {
    return { command: "bunx", args, shell: false, windowsVerbatimArguments: false };
  }

  // Bun's Windows installer ships `bunx.exe` and no `bunx.cmd` (#3744): run the discovered runner. An executable is
  // spawned directly; only a batch file (`bunx.cmd`, `bunx.bat`) needs cmd.exe and the quoting below, which then
  // runs the resolved path so the PATH search cannot pick a different copy than the one found here.
  const bunx = findOnPath("bunx", runtime.pathEnv, platform);
  if (bunx && !/\.(?:cmd|bat)$/i.test(bunx)) {
    return { command: bunx, args, shell: false, windowsVerbatimArguments: false };
  }

  // The same cmd.exe quoting as npxInvocation: environment values must not choose the program that is spawned.
  const comSpec = runtime.comSpec ?? "cmd.exe";
  const line = [quoteCmdArgument(bunx ?? "bunx.cmd"), ...args.map(quoteCmdArgument)].join(" ");
  return {
    command: comSpec,
    args: ["/d", "/s", "/c", `"${line}"`],
    shell: false,
    windowsVerbatimArguments: true,
  };
}

/** The user-facing error when neither npx nor bunx could be started. */
export function packageRunnerError(command: string, cause: string): string {
  return `${command}: could not run npx or bunx (${cause}). Install Node.js (npx) or Bun (bunx) and retry.`;
}

const CMD_META_CHARS = /([()\][%!^"`<>&|;, *?])/g;

/**
 * Quotes one argument for a batch file run by `cmd.exe /d /s /c`: escape it for the C runtime argument parser that
 * node uses, wrap it in double quotes, then caret-escape cmd.exe metacharacters twice (once for the command line,
 * once more because the batch file re-parses `%*`). This is the method cross-spawn uses (MIT).
 */
export function quoteCmdArgument(arg: string): string {
  // Backslashes before a double quote are doubled and the quote escaped; trailing backslashes are doubled
  // because the closing quote follows them.
  let quoted = arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, "$1$1");
  quoted = `"${quoted}"`;
  quoted = quoted.replace(CMD_META_CHARS, "^$1");
  return quoted.replace(CMD_META_CHARS, "^$1");
}

const SAFE_PACKAGE_SPEC = /^[A-Za-z0-9@._/:~+=^\\-]+$/;

/**
 * The npm package spec to run: the `FLISK_*_PACKAGE` override when it is a plain spec (name, version, path or URL),
 * else the pinned default. An override that starts with `-` (an npx option) or holds a space, quote or shell
 * metacharacter is ignored, so an environment value can never add options or commands to the npx call.
 */
export function safePackageSpec(override: string | undefined, fallback: string): string {
  if (typeof override !== "string" || override.startsWith("-")) return fallback;
  // A guard that returns the fallback on a mismatch: the override only flows on past a passing regexp test.
  if (!SAFE_PACKAGE_SPEC.test(override)) return fallback;
  return override;
}
