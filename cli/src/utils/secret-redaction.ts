// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expandEnvValue } from "./env-expand.js";
import { PROJECT_ENV_FILE_VAR } from "./env-selection.js";
import { parseEnv } from "./env-validator.js";
import { FliskError } from "./errors.js";
import { findProjectRoot } from "./paths.js";
import { discoverResourcesWithProblems } from "./services.js";

export const REDACTED = "[REDACTED]";

export class EnvUnreadableError extends FliskError {
  constructor(
    readonly path: string,
    reason: string,
    suggestions: string[] = [],
  ) {
    super(`Could not read ${path}: ${reason}`, suggestions);
    this.name = "EnvUnreadableError";
  }
}

/**
 * Shorter values are left alone: masking a two-letter value would hit ordinary words in every log line. The cost is
 * that a short secret in .env is not masked, so keep real secrets at least this long.
 */
export const MIN_REDACTED_VALUE_LENGTH = 8;

/**
 * Values of the project's own .env file and of the services' env, longest first so a value that contains another is masked
 * whole. The sources are the project `.env`, the file `--env-file` selected (FLISK_ENV_FILE) and `extraEnvPaths`, each
 * bring-your-own service's `envFile` files, the shell values of the names a service lists under `secrets`, and the `env` and
 * `params` entries of a service whose name says it is a secret (PASSWORD, TOKEN, KEY ...). Throws when an env file exists but
 * cannot be read: continuing without the values would print secrets unmasked.
 */
export function envSecretValues(
  projectRoot: string,
  extraEnvPaths: readonly string[] = [],
  extraSecretValues: readonly string[] = [],
): string[] {
  const selected = process.env[PROJECT_ENV_FILE_VAR];
  const values = [
    ...secretValuesOf(join(projectRoot, ".env")),
    ...extraEnvPaths.flatMap((path) => secretValuesOf(path)),
    ...(selected ? secretValuesOf(selected) : []),
    ...serviceSecretValues(projectRoot, [
      join(projectRoot, ".env"),
      ...extraEnvPaths,
      ...(selected ? [selected] : []),
    ]),
    ...extraSecretValues,
  ];
  return [...new Set(values)].sort((a, b) => b.length - a.length);
}

/** A variable name that says its value is a secret. */
const SECRET_NAME =
  /(?:SECRET|TOKEN|PASSW(?:OR)?D|PASSPHRASE|CREDENTIAL|PRIVATE|API_?KEY|ACCESS_?KEY|AUTH|(?:^|_)KEY$)/i;

function secretNamesOf(secrets: unknown): string[] {
  if (!secrets || typeof secrets !== "object") return [];
  const names: string[] = [];
  for (const kind of ["required", "optional", "generate"] as const) {
    const list = (secrets as Record<string, unknown>)[kind];
    if (Array.isArray(list)) {
      for (const item of list) {
        if (typeof item === "string") names.push(item);
        else if (
          item &&
          typeof item === "object" &&
          typeof (item as { name?: unknown }).name === "string"
        )
          names.push((item as { name: string }).name);
      }
    } else if (list && typeof list === "object") names.push(...Object.keys(list));
  }
  return names;
}

/**
 * Secret values held by an `env`-shaped map, using the same rules as a service.json `env`/`params`:
 * only secret-looking names are masked, `${VAR}` is expanded the way the process receives it, and a
 * multiline value is also kept line by line. Local overrides pass their env through here too, so a
 * secret introduced by service.local.json is masked just like one from service.json.
 */
export function secretValuesFromEnv(
  entries: Readonly<Record<string, unknown>> | undefined,
  vars: Readonly<Record<string, string | undefined>> = {},
): string[] {
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) return [];
  const found: string[] = [];
  const keep = (value: unknown): void => {
    if (typeof value !== "string" || value.length < MIN_REDACTED_VALUE_LENGTH) return;
    const parts = lineParts(value);
    found.push(value, ...(parts.length > 1 ? parts : []));
  };
  for (const [name, value] of Object.entries(entries)) {
    if (!SECRET_NAME.test(name)) continue;
    keep(value);
    if (typeof value === "string") keep(expandEnvValue(value, vars));
  }
  return found;
}

/**
 * Secret values that a service declares itself: the other half of what reaches a container or a local process besides the
 * project .env. A project whose services cannot be discovered contributes nothing here (the .env values still apply).
 *
 * An `env`/`params` value is kept both as written and as the process receives it: `${VAR}` expanded the way planNativeRun
 * expands it (the service directory's .env below the project env files below the shell), so `API_TOKEN: "${RUNTIME}"` masks
 * the shell's RUNTIME value. A multiline value is also kept line by line, because process output is redacted per line.
 */
function serviceSecretValues(projectRoot: string, projectEnvPaths: readonly string[]): string[] {
  let resources: ReturnType<typeof discoverResourcesWithProblems>["resources"];
  try {
    resources = discoverResourcesWithProblems(projectRoot).resources;
  } catch {
    return [];
  }
  const projectVars: Record<string, string> = {};
  for (const path of projectEnvPaths) Object.assign(projectVars, envVarsOf(path));
  const found: string[] = [];
  const keep = (value: unknown): void => {
    if (typeof value !== "string" || value.length < MIN_REDACTED_VALUE_LENGTH) return;
    const parts = lineParts(value);
    found.push(value, ...(parts.length > 1 ? parts : []));
  };
  for (const resource of resources) {
    const config = resource.config as Record<string, unknown> | undefined;
    if (!config) continue;
    for (const name of secretNamesOf(config.secrets)) keep(process.env[name]);
    const vars = { ...envVarsOf(join(resource.path, ".env")), ...projectVars, ...process.env };
    for (const field of ["env", "params"] as const) {
      found.push(
        ...secretValuesFromEnv(config[field] as Record<string, unknown> | undefined, vars),
      );
    }
    if (Array.isArray(config.envFile)) {
      for (const file of config.envFile) {
        if (typeof file === "string") found.push(...secretValuesOf(join(resource.path, file)));
      }
    }
  }
  return found;
}

/** The variables of an env file, only to expand `${VAR}` in service values; a missing file gives none. */
function envVarsOf(envPath: string): Record<string, string> {
  if (!existsSync(envPath)) return {};
  try {
    return Object.fromEntries(parseEnv(readFileSync(envPath, "utf-8")));
  } catch {
    // The same file is read again by secretValuesOf, which reports it as unreadable.
    return {};
  }
}

/** Smallest line of a multiline secret that is masked on its own; ordinary 1-3 letter words stay readable. */
const MIN_REDACTED_LINE_LENGTH = 4;

/**
 * Process output is split into lines before redaction, so the lines of a multiline value (a PEM key written with \\n in
 * double quotes, or spread over several physical lines) must be masked line by line, not only as a whole. Lines of a value
 * that is already long enough to be a secret may be shorter than the minimum.
 */
function lineParts(value: string): string[] {
  return value
    .split(/\r\n|\r|\n/)
    .map((part) => part.trim())
    .filter((part) => part.length >= MIN_REDACTED_LINE_LENGTH);
}

/** Quoted values that span physical lines; parseEnv reads the file line by line and misses them. */
function physicalMultilineValues(content: string): string[] {
  const pattern =
    /^[ \t]*(?:export[ \t]+)?[A-Za-z_][A-Za-z0-9_]*[ \t]*=[ \t]*("(?:[^"\\]|\\.)*"|'[^']*')/gm;
  const found: string[] = [];
  for (const match of content.matchAll(pattern)) {
    const body = match[1].slice(1, -1);
    if (/[\r\n]/.test(body)) found.push(body);
  }
  return found;
}

/** The values of one env file, long enough to be worth masking. Throws when the file cannot be read. */
function secretValuesOf(envPath: string): string[] {
  if (!existsSync(envPath)) return [];
  let content: string;
  try {
    content = readFileSync(envPath, "utf-8");
  } catch (error) {
    throw new EnvUnreadableError(envPath, error instanceof Error ? error.message : String(error), [
      `Check that ${envPath} is a readable file`,
    ]);
  }
  const values = [...parseEnv(content).values(), ...physicalMultilineValues(content)];
  return values.flatMap((value) => {
    if (value.length < MIN_REDACTED_VALUE_LENGTH) return [];
    const parts = lineParts(value);
    return parts.length > 1 ? [value, ...parts] : [value];
  });
}

/**
 * Secret shapes masked wherever they appear, whether or not the value is in an env file: a token an application printed from
 * its own memory, a connection string, a key pair. Each pattern keeps its non-secret part (`Bearer `, `postgres://user:`) so
 * the line stays readable. The list is deliberately short and specific; it is not a secret scanner.
 */
export const SECRET_PATTERNS: ReadonlyArray<{
  name: string;
  pattern: RegExp;
  replacement: string;
}> = [
  {
    name: "private key block",
    pattern:
      /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/g,
    replacement: REDACTED,
  },
  {
    // A key cut off before its END line (a log window, a truncated snapshot): everything after BEGIN may be key body.
    name: "private key without its end",
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*/g,
    replacement: REDACTED,
  },
  {
    name: "bearer token",
    pattern: /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi,
    replacement: `$1${REDACTED}`,
  },
  {
    name: "url credentials",
    pattern: /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+(@)/gi,
    replacement: `$1${REDACTED}$2`,
  },
  { name: "aws access key id", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, replacement: REDACTED },
  { name: "github token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, replacement: REDACTED },
  {
    name: "github fine-grained token",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g,
    replacement: REDACTED,
  },
  { name: "slack token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, replacement: REDACTED },
  {
    name: "stripe key",
    pattern: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
    replacement: REDACTED,
  },
  {
    name: "provider api key",
    pattern: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{24,}/g,
    replacement: REDACTED,
  },
  {
    name: "json web token",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
    replacement: REDACTED,
  },
];

/** Masks the secret shapes in SECRET_PATTERNS. */
export function redactSecretPatterns(text: string): string {
  let result = text;
  for (const { pattern, replacement } of SECRET_PATTERNS)
    result = result.replace(pattern, replacement);
  return result;
}

/** Masks the given secret values, then the secret shapes. */
export function redactSecrets(text: string, secrets: readonly string[]): string {
  let result = text;
  for (const secret of secrets) result = result.split(secret).join(REDACTED);
  return redactSecretPatterns(result);
}

/**
 * Masks a log that arrives line by line. A private key spans many lines and each line is masked alone, so the lines between
 * `-----BEGIN ... PRIVATE KEY-----` and `-----END ... PRIVATE KEY-----` are masked by remembering that the block is open.
 * One guard per stream; a block whose BEGIN line is not in the lines shown cannot be recognised.
 */
export function createPrivateKeyLineGuard(): (line: string) => string {
  let isOpen = false;
  return (line: string): string => {
    if (isOpen) {
      if (/-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/.test(line)) isOpen = false;
      return REDACTED;
    }
    if (
      /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/.test(line) &&
      !/-----END [A-Z0-9 ]*PRIVATE KEY/.test(line)
    ) {
      isOpen = true;
    }
    return line;
  };
}

/** Masks the text of log lines of several resources, one private key guard per resource, in the order given. */
export function redactLogLines<T extends { resource: string | null; text: string }>(
  lines: readonly T[],
  secrets: readonly string[],
): T[] {
  const guards = new Map<string | null, (line: string) => string>();
  return lines.map((line) => {
    let guard = guards.get(line.resource);
    if (!guard) {
      guard = createPrivateKeyLineGuard();
      guards.set(line.resource, guard);
    }
    return { ...line, text: redactSecrets(guard(line.text), secrets) };
  });
}

/** Redacts every string inside a JSON-shaped value, so the output stays valid JSON. */
export function redactValue<T>(value: T, secrets: readonly string[]): T {
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
  extraSecretValues: readonly string[] = [],
): (text: string) => string {
  let secrets: string[];
  try {
    secrets = envSecretValues(projectRoot, extraEnvPaths, extraSecretValues);
  } catch (error) {
    return () => {
      throw error;
    };
  }
  return (text: string) => redactSecrets(text, secrets);
}

/** What replaces output that cannot be masked because the project's env files cannot be read. */
export const OUTPUT_WITHHELD = "[output withheld: the project's env files could not be read]";

/**
 * The secret values of the project that holds `startDir` (the current directory by default); empty outside a project, so the
 * secret shapes still apply. Null when an env file exists but cannot be read, because the values are then unknown.
 */
export function projectSecretValues(startDir?: string): string[] | null {
  try {
    const root = findProjectRoot(startDir);
    return root ? envSecretValues(root) : [];
  } catch (error) {
    if (error instanceof EnvUnreadableError) return null;
    // Anything else (a service.json that cannot be read) only loses the service values, never the .env ones.
    try {
      const root = findProjectRoot(startDir);
      return root ? secretValuesOf(join(root, ".env")) : [];
    } catch {
      return null;
    }
  }
}

/** Masks text that came from an application, for the project that holds `startDir`. Never throws, never returns a secret. */
export function redactProjectText(text: string, startDir?: string): string {
  const secrets = projectSecretValues(startDir);
  return secrets === null ? OUTPUT_WITHHELD : redactSecrets(text, secrets);
}
