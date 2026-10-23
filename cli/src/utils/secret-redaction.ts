// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "./env-validator.js";

export const REDACTED = "[REDACTED]";

export class EnvUnreadableError extends Error {
  constructor(
    readonly path: string,
    reason: string,
  ) {
    super(`Could not read ${path}: ${reason}`);
    this.name = "EnvUnreadableError";
  }
}

/**
 * Shorter values are left alone: masking a two-letter value would hit ordinary words in every log line. The cost is
 * that a short secret in .env is not masked, so keep real secrets at least this long.
 */
export const MIN_REDACTED_VALUE_LENGTH = 8;

/**
 * Values of the project's own .env file, longest first so a value that contains another is masked whole. Throws when the
 * file exists but cannot be read: continuing without the values would print secrets unmasked.
 */
export function envSecretValues(
  projectRoot: string,
  extraEnvPaths: readonly string[] = [],
): string[] {
  const values = [
    ...secretValuesOf(join(projectRoot, ".env")),
    ...extraEnvPaths.flatMap((path) => secretValuesOf(path)),
  ];
  return [...new Set(values)].sort((a, b) => b.length - a.length);
}

/** The values of one env file, long enough to be worth masking. Throws when the file cannot be read. */
function secretValuesOf(envPath: string): string[] {
  if (!existsSync(envPath)) return [];
  let content: string;
  try {
    content = readFileSync(envPath, "utf-8");
  } catch (error) {
    throw new EnvUnreadableError(envPath, error instanceof Error ? error.message : String(error));
  }
  return [...parseEnv(content).values()].filter(
    (value) => value.length >= MIN_REDACTED_VALUE_LENGTH,
  );
}

export function redactSecrets(text: string, secrets: readonly string[]): string {
  let result = text;
  for (const secret of secrets) result = result.split(secret).join(REDACTED);
  return result;
}

/** Redacts every string inside a JSON-shaped value, so the output stays valid JSON. */
export function redactValue<T>(value: T, secrets: readonly string[]): T {
  if (secrets.length === 0) return value;
  if (typeof value === "string") return redactSecrets(value, secrets) as T;
  if (Array.isArray(value)) return value.map((item) => redactValue(item, secrets)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactValue(item, secrets)]),
    ) as T;
  }
  return value;
}

/**
 * A redactor for text that may hold the project's own secrets. When the project's .env exists but cannot be read, the values
 * are unknown, so the redactor throws instead of guessing: the caller then shows and stores nothing rather than raw text. The
 * original error is kept, so a caller can still tell an unreadable .env from another failure.
 *
 * `extraEnvPaths` are the other env files of the run (the file `flisk up --env-file` selected): their values are secrets as
 * much as the ones in the project .env.
 */
export function createEnvRedactor(
  projectRoot: string,
  extraEnvPaths: readonly string[] = [],
): (text: string) => string {
  let secrets: string[];
  try {
    secrets = envSecretValues(projectRoot, extraEnvPaths);
  } catch (error) {
    return () => {
      throw error;
    };
  }
  return (text: string) => redactSecrets(text, secrets);
}
