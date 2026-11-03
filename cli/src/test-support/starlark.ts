// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach } from "vitest";

// Starlark tests run the engine's own Starlark under `tilt alpha tiltfile-result`. Everything about finding Tilt, skipping
// or failing without it, the timeout and the error output lives here, so a missing Tilt gives one message, not one per file.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Per run, in milliseconds. A cold Tilt start under full-suite load takes several seconds. */
export const TILT_TIMEOUT_MS = 60_000;

export const MISSING_TILT_MESSAGE =
  "Tilt was not found on PATH. Install Tilt to run the Starlark tests, or leave FLISK_REQUIRE_TILT unset to skip them.";

/** Whether `tilt version` runs. Exported so a test can stub the lookup. */
export function probeTilt(): boolean {
  return spawnSync("tilt", ["version"], { encoding: "utf-8" }).status === 0;
}

/**
 * Returns whether Tilt is available. When it is missing, returns false and logs one warning, or throws when
 * `FLISK_REQUIRE_TILT=1` (CI), so the suites that call this skip locally and fail in CI.
 */
export function resolveTiltAvailability(
  probe: () => boolean = probeTilt,
  env: NodeJS.ProcessEnv = process.env,
  warn: (message: string) => void = (message) => process.stderr.write(`${message}\n`),
): boolean {
  if (probe()) return true;
  if (env.FLISK_REQUIRE_TILT === "1") throw new Error(MISSING_TILT_MESSAGE);
  warn(MISSING_TILT_MESSAGE);
  return false;
}

let tiltState: boolean | undefined;
/**
 * Whether the Starlark suites run. Resolved on first use, not at import, so importing this folder from a test that
 * does not need Tilt never spawns `tilt` or throws. The Starlark suites use `describe.skipIf(!tiltAvailable())`.
 */
export function tiltAvailable(): boolean {
  tiltState ??= resolveTiltAvailability();
  return tiltState;
}

/** A path under the engine folder, for `load()` in a snippet. */
export function engineFile(...segments: string[]): string {
  return join(repoRoot, "runtime", "engine", ...segments);
}

export interface StarlarkOptions {
  /** The Tiltfile body. It runs in a scratch project, so it usually starts with a `load(...)` of `file`. */
  args: string;
  /** Merged over `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Adds `--verbose`, so `print()` output reaches the output. */
  verbose?: boolean;
  /** Files written into the scratch project before the run, keyed by relative path. */
  files?: Record<string, string>;
  /** How long the run may take, in milliseconds (Default: `TILT_TIMEOUT_MS`). */
  timeoutMs?: number;
}

export interface StarlarkRun extends SpawnSyncReturns<string> {
  /** The scratch project the Tiltfile ran in. It is removed after the test. */
  dir: string;
}

/**
 * Kills what is left of a tilt run's process group, such as a server tilt forked. Windows has no process groups, and
 * the timeout there ends tilt with TerminateProcess, which cannot be trapped, so this does nothing on Windows.
 */
export function killProcessGroup(pid: number, kill: typeof process.kill = process.kill): void {
  // A pid of 0 means the spawn failed, and kill(-0) would signal this process's own group.
  if (process.platform === "win32" || pid <= 0) return;
  try {
    kill(-pid, "SIGKILL");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ESRCH") throw err;
  }
}

const scratchDirs: string[] = [];
afterEach(() => {
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * Runs `args` as a Tiltfile in a scratch project and returns the exit status and output. `file` is the module under
 * test: it must exist and is named in the error when the run cannot start. A failed `fail(...)` check is a
 * non-zero status, which the caller asserts on, so this does not throw for it.
 */
export function evaluateStarlark(file: string, options: StarlarkOptions): StarlarkRun {
  if (!existsSync(file)) throw new Error(`Starlark module not found: ${file}`);
  const dir = mkdtempSync(join(tmpdir(), "flisk-starlark-"));
  scratchDirs.push(dir);
  for (const [path, content] of Object.entries(options.files ?? {})) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  const tiltfile = join(dir, "Tiltfile");
  writeFileSync(tiltfile, options.args);
  const args = ["alpha", "tiltfile-result"];
  if (options.verbose) args.push("--verbose");
  args.push("-f", tiltfile);
  const spawnOptions = {
    cwd: dir,
    encoding: "utf-8" as const,
    timeout: options.timeoutMs ?? TILT_TIMEOUT_MS,
    // Tilt traps SIGTERM, so the default timeout signal left a stuck run, and this call, waiting forever (#2011).
    killSignal: "SIGKILL" as const,
    // Its own process group, so that killProcessGroup also ends what tilt started. On Windows, detached opens a console.
    // spawnSync honours it, but @types/node leaves it out of SpawnSyncOptions, hence the variable.
    detached: process.platform !== "win32",
    env: { ...process.env, ...options.env },
  };
  const result = spawnSync("tilt", args, spawnOptions);
  killProcessGroup(result.pid);
  if (result.error) {
    throw new Error(`tilt could not run ${file}: ${result.error.message}\n${result.stderr}`);
  }
  return Object.assign(result, { dir });
}
