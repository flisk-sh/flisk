// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { FliskError } from "./errors.js";
/** The providers this CLI build understands. `""` means the default, `env-file`. */
export const SECRET_PROVIDERS = ["env-file", "infisical", "keychain"];
/**
 * Whether this build has a real secret-provider bridge. The free CLI ships only the
 * Infisical stub, so a build that replaces it with a working client opts in explicitly.
 */
export function hasSecretBridge(env = process.env) {
    return (env.FLISK_SECRET_BRIDGE ?? "").trim().toLowerCase() === "1";
}
/** Normalises the setting, preserving the original spelling for error messages. */
export function readSecretProvider(env = process.env) {
    const raw = (env.FLISK_SECRET_PROVIDER ?? "").trim();
    const lower = raw.toLowerCase();
    return {
        raw,
        value: SECRET_PROVIDERS.includes(lower) ? lower : "",
    };
}
/** An unknown provider is a usage error, not a missing secret. */
export function secretProviderUsageError(env = process.env) {
    const { raw, value } = readSecretProvider(env);
    if (raw === "" || value !== "")
        return null;
    return new FliskError(`FLISK_SECRET_PROVIDER="${raw}": unknown secret provider. Valid values: ${SECRET_PROVIDERS.join(", ")} (unset means ${SECRET_PROVIDERS[0]}).`, [
        `Use one of: ${SECRET_PROVIDERS.join(", ")}`,
        "Unset FLISK_SECRET_PROVIDER to read secrets from the project .env",
    ], 2);
}
