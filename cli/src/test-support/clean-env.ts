// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

/**
 * `process.env` for a spawned CLI child, without the legacy TDK_* variables of the host shell. A developer's profile
 * can export them, and the CLI warns about each one that has no FLISK_* equivalent, so a test that inherits them
 * gets output it did not ask for. FLISK_* stays: the CLI reads settings such as ports from it, and removing those
 * would change behavior, not only output. A test that needs a variable sets it through its own `env`.
 */
export function cleanEnv(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("TDK_")) delete env[key];
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env as NodeJS.ProcessEnv;
}
