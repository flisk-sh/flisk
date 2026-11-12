// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

/** Results of host commands for one `flisk doctor` run, keyed by command string and options. */
export type HostCommandCache = Map<string, { output: string } | { error: unknown }>;

/** Create the cache once per doctor run and pass it to the checks; never keep it at module level. */
export function createHostCommandCache(): HostCommandCache {
  return new Map();
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
