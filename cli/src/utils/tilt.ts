// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { spawn } from "node:child_process";
import { join } from "node:path";
import type { TiltCommandResult } from "../types/index.js";
import { errorFactories } from "./errors.js";
import { findProjectRoot } from "./paths.js";
import { findOnPath } from "./which.js";

export function runTilt(
  command: string,
  args: string[] = [],
  options: {
    verbose?: boolean;
    quiet?: boolean;
    inheritStdio?: boolean;
    timeoutMs?: number;
  } = {},
): Promise<TiltCommandResult> {
  return new Promise((resolve, reject) => {
    const tiltArgs = [command, ...args];

    if (options.verbose) {
      console.log(`Executing: tilt ${tiltArgs.join(" ")}`);
    }

    const child = spawn(findOnPath("tilt") ?? "tilt", tiltArgs, {
      stdio: options.inheritStdio ? "inherit" : "pipe",
      shell: false,
      windowsHide: process.platform === "win32",
      timeout: options.timeoutMs,
    });

    let stdout = "";
    let stderr = "";

    if (!options.inheritStdio) {
      child.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });
    }

    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn tilt: ${err.message}`));
    });
  });
}

export async function isTiltAvailable(): Promise<boolean> {
  try {
    const result = await runTilt("version", [], { inheritStdio: false, timeoutMs: 10_000 });
    return result.exitCode === 0;
  } catch {
    // tilt binary not found (or not spawnable) - treat as unavailable
    return false;
  }
}

export function getTiltfilePath(): string {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    throw errorFactories.notInProject();
  }

  return join(projectRoot, ".tdk", ".tdk-out", "Tiltfile");
}

function addTiltfilePath(args: string[]): void {
  const tiltfilePath = getTiltfilePath();
  args.push("-f", tiltfilePath);
}

export function buildTiltUpArgs(
  serviceNames: string[],
  options: {
    verbose?: boolean;
    quiet?: boolean;
    force?: boolean;
    watch?: boolean;
    focusTargets?: string[];
  } = {},
): string[] {
  const args: string[] = [];
  addTiltfilePath(args);

  // Bare positional resource names only scope what this `tilt up` invocation waits
  // on - they do NOT limit which resources the generated Tiltfile enables. Its focus
  // filter (Config.apply_focus / apply_focus_filter) only reads the `--focus` flag;
  // the positional-args catch-all it also defines (`cfg['args']`) is never read. So
  // without `--focus`, every `tdk up <stack>` silently fell back to Tilt's default
  // "pre-alpha" phase and built every stack in that phase, not just the one asked
  // for. Passing the stack name via `--focus` reuses the Tiltfile's own (already
  // dependency-aware) domain expansion instead of re-deriving it here.
  //
  // `--focus=...` needs a `--` before it: Tilt's own `tilt up` only accepts its own
  // fixed flag set directly (see `tilt up --help`) and rejects anything else with
  // "unknown flag" - `--` is what routes a token through to the Tiltfile's own
  // config.parse(). Bare words like a service name aren't flag-shaped, so they don't
  // need `--` to reach the Tiltfile's positional `args` catch-all.
  if (options.focusTargets && options.focusTargets.length > 0) {
    args.push("--", `--focus=${options.focusTargets.join(",")}`);
  }

  args.push(...serviceNames);

  if (options.verbose && !options.quiet) {
    args.push("--verbose");
  }

  if (options.watch) {
    args.push("--watch");
  }

  return args;
}

export function buildTiltDownArgs(
  options: { force?: boolean; yes?: boolean; focusTargets?: string[] } = {},
): string[] {
  const args: string[] = [];
  addTiltfilePath(args);

  // Note: `tilt down` has no `--force` or `--yes` flags. `tdk down` accepts them for
  // CLI flag convention and script compatibility, but they must not be passed to Tilt.

  // `tilt down` re-evaluates the Tiltfile and removes only the resources that evaluation registers. Without `--focus`
  // the Tiltfile falls back to its default phase and never registers a stack's own compose project, so `tdk up shop`
  // containers survived `tdk down`. Pass the same selection `tdk up` used (every stack) after `--`.
  if (options.focusTargets && options.focusTargets.length > 0) {
    args.push("--", `--focus=${options.focusTargets.join(",")}`);
  }

  return args;
}
