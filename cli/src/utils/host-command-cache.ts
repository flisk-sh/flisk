// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import type { ExecAsync } from "./exec-async.js";

/** Results of host commands for one `flisk doctor` run, keyed by command string and options. */
export type HostCommandCache = Map<string, { output: string } | { error: unknown }>;

/** Create the cache once per doctor run and pass it to the checks; never keep it at module level. */
export function createHostCommandCache(): HostCommandCache {
  return new Map();
}

/** Promises of async host commands for one `flisk doctor` run, keyed by command and timeout. */
export type AsyncCommandCache = Map<string, Promise<string>>;

/** Create the cache once per doctor run and pass it to `cacheExecAsync`; never keep it at module level. */
export function createAsyncCommandCache(): AsyncCommandCache {
  return new Map();
}

/**
 * Wrap an ExecAsync so each command and timeout runs once. The promise is stored, so a caller that
 * arrives while the command is still running joins it, and a rejected promise reaches every caller.
 */
export function cacheExecAsync(exec: ExecAsync, cache: AsyncCommandCache): ExecAsync {
  return (command, timeoutMs) => {
    const key = JSON.stringify([command, timeoutMs]);
    let pending = cache.get(key);
    if (!pending) {
      // `.then` turns a synchronous throw from exec into a rejection that is cached like any other.
      pending = Promise.resolve().then(() => exec(command, timeoutMs));
      cache.set(key, pending);
    }
    return pending;
  };
}

/**
 * The one `docker ps` that the port plan and the ingress check share. The cache key includes the
 * timeout, so both callers must use this exact command and timeout to hit the same entry.
 */
export const SHARED_DOCKER_PS = {
  args: ["ps", "--format", "{{.Names}}\\t{{.Image}}\\t{{.Ports}}"],
  shellCommand: "docker ps --format '{{.Names}}\\t{{.Image}}\\t{{.Ports}}'",
  timeoutMs: 10_000,
} as const;

/** True when the shared docker ps already ran in this cache and succeeded, so the daemon is up. */
export function hasSharedDockerPsOutput(cache: HostCommandCache | undefined): boolean {
  if (!cache) return false;
  const key = JSON.stringify([SHARED_DOCKER_PS.shellCommand, "utf-8", SHARED_DOCKER_PS.timeoutMs]);
  const cached = cache.get(key);
  return cached !== undefined && "output" in cached;
}

/**
 * Run `run` once per key. Later callers get the stored output, or the stored error rethrown.
 * Without a cache it just runs.
 */
export function runCachedHostCommand(
  cache: HostCommandCache | undefined,
  shellCommand: string,
  options: { encoding: string; timeout: number },
  run: () => string,
): string {
  if (!cache) return run();
  const key = JSON.stringify([shellCommand, options.encoding, options.timeout]);
  const cached = cache.get(key);
  if (cached) {
    if ("error" in cached) throw cached.error;
    return cached.output;
  }
  try {
    const output = run();
    cache.set(key, { output });
    return output;
  } catch (error) {
    cache.set(key, { error });
    throw error;
  }
}
