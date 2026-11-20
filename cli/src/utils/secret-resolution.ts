// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * The single secret resolver (#4702). Every consumer passes the provider, the project root and the
 * names it needs; values come back to the caller's environment and are never printed or written to
 * a file. `keychain` only fills names that the shell or the env file of the run does not already
 * have, so `env-file` behaviour stays the default and keychain is additive.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DiscoveredResource } from "../types/index.js";
import { PROJECT_ENV_FILE_VAR } from "./env-selection.js";
import { parseEnv } from "./env-validator.js";
import { createKeychain, type Keychain, SECRET_NAME_PATTERN } from "./keychain.js";
import { readSecretProvider, secretProviderUsageError } from "./secret-provider.js";
import { discoverResourcesFromRoot } from "./services.js";

export interface ResolveSecretsOptions {
  env?: NodeJS.ProcessEnv;
  /** Explicit `--env-file` of the run; takes precedence over FLISK_ENV_FILE and the project .env. */
  envFilePath?: string;
  /** Inject a fake keychain instead of calling `security` / `secret-tool`. */
  keychain?: Keychain;
  platform?: NodeJS.Platform;
  onUnsupported?: (message: string) => void;
}

/** Values for `names` from the env file of the run, overridden by the shell. Never logs a value. */
function envValues(
  projectRoot: string,
  names: readonly string[],
  env: NodeJS.ProcessEnv,
  envFilePath?: string,
): Record<string, string> {
  const path = envFilePath || env[PROJECT_ENV_FILE_VAR] || join(projectRoot, ".env");
  let fromFile = new Map<string, string>();
  try {
    if (existsSync(path)) fromFile = parseEnv(readFileSync(path, "utf-8"));
  } catch {
    // An unreadable env file is reported where the file is read; here every name counts as missing.
  }
  const out: Record<string, string> = {};
  for (const name of names) {
    if (!SECRET_NAME_PATTERN.test(name)) continue;
    const value = env[name] ?? fromFile.get(name);
    if (value?.trim()) out[name] = value;
  }
  return out;
}

/**
 * Resolves the given names with the selected provider.
 *
 * - `env-file` (the default) returns the env file / shell values and nothing else.
 * - `infisical` returns nothing: the free CLI has no bridge, as before #4702.
 * - `keychain` starts with the env file / shell values and looks up only the gaps in the keychain.
 *   On Windows the keychain is a no-op fallback and prints the required unsupported message.
 */
export function resolveSecrets(
  provider: string,
  projectRoot: string,
  names: readonly string[],
  options: ResolveSecretsOptions = {},
): Record<string, string> {
  const env = options.env ?? process.env;
  const selected = readSecretProvider({ FLISK_SECRET_PROVIDER: provider });
  if (selected.value === "") {
    const error = secretProviderUsageError({ FLISK_SECRET_PROVIDER: provider });
    if (error) throw error;
  }
  if (selected.value === "infisical") return {};

  const fromEnv = envValues(projectRoot, names, env, options.envFilePath);
  if (selected.value !== "keychain") return fromEnv;

  const keychain =
    options.keychain ??
    createKeychain({
      projectRoot,
      ...(options.platform ? { platform: options.platform } : {}),
      ...(options.onUnsupported ? { onUnsupported: options.onUnsupported } : {}),
    });
  const out = { ...fromEnv };
  for (const name of names) {
    if (!SECRET_NAME_PATTERN.test(name) || out[name]) continue;
    const value = keychain.get(name);
    if (value?.trim()) out[name] = value;
  }
  return out;
}

/** Every secret name a resource declares (required, optional and generated), without values. */
export function declaredSecretNames(resources: readonly DiscoveredResource[]): string[] {
  const names = new Set<string>();
  for (const resource of resources) {
    const secrets = resource.config?.secrets;
    if (!secrets || typeof secrets !== "object") continue;
    for (const kind of ["required", "optional", "generate"] as const) {
      const entries = (secrets as Record<string, unknown>)[kind];
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const name =
          typeof entry === "string"
            ? entry
            : entry && typeof entry === "object" && "name" in entry
              ? (entry as { name?: unknown }).name
              : undefined;
        if (typeof name === "string" && SECRET_NAME_PATTERN.test(name)) names.add(name);
      }
    }
  }
  return [...names].sort();
}

/** All names declared anywhere in a project, used by `flisk secret set|unset|list`. */
export function projectSecretNames(projectRoot: string): string[] {
  return declaredSecretNames(discoverResourcesFromRoot(projectRoot));
}
