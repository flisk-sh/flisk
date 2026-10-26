// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

const NEW_PREFIX = "FLISK_";
const LEGACY_PREFIX = "TDK_";

/**
 * Bridges the TDK_* → FLISK_* rename. FLISK_X is the preferred name; the engine and
 * subprocesses (Tilt, Starlark) still read TDK_X, so FLISK_X is mirrored onto TDK_X
 * unless TDK_X is already set. Returns the legacy names that were used without a
 * FLISK_ equivalent, so callers can print one deprecation notice.
 */
export function applyEnvAliases(env: NodeJS.ProcessEnv): string[] {
  const deprecated: string[] = [];
  for (const key of Object.keys(env)) {
    if (key.startsWith(NEW_PREFIX)) {
      const legacy = LEGACY_PREFIX + key.slice(NEW_PREFIX.length);
      if (env[legacy] === undefined) env[legacy] = env[key];
    }
  }
  for (const key of Object.keys(env)) {
    if (
      key.startsWith(LEGACY_PREFIX) &&
      env[NEW_PREFIX + key.slice(LEGACY_PREFIX.length)] === undefined
    ) {
      deprecated.push(key);
    }
  }
  return deprecated;
}
