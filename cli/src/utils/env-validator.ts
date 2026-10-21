// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeTextFileAtomic } from "./atomic-write.js";

export interface EnvVariable {
  name: string;
  description: string;
  required: boolean;
  default?: string;
  example?: string;
  /** Written by `completeEnvFile` when a project's .env lacks it (a generated value, or the default). */
  complete?: boolean;
}

const REQUIRED_ENV_VARS: EnvVariable[] = [
  {
    name: "VERDACCIO_URL_DOCKER",
    description: "Docker-internal URL of the private npm registry (Verdaccio, a paid feature)",
    // Verdaccio is a premium, off-by-default service, so a free project must not need its URL.
    required: false,
    default: "http://verdaccio:4873",
    example: "http://verdaccio:4873",
  },
  {
    name: "VERDACCIO_URL",
    description: "Local URL of the private npm registry (Verdaccio, a paid feature)",
    required: false,
    default: "http://localhost:4873",
  },
  {
    name: "TILT_ENV",
    description: "Tilt environment name",
    required: true,
    default: "dev",
    example: "dev",
    complete: true,
  },
  {
    name: "DATABASE_URL",
    description: "PostgreSQL connection string (uses the generated DB_PASSWORD below)",
    required: false,
    // Built from DB_PASSWORD in generateEnvFile(); there is no shared literal password.
  },
  {
    name: "DB_PASSWORD",
    description: "PostgreSQL superuser password (docker-compose POSTGRES_PASSWORD)",
    required: true,
    // No static default: a shared password across every generated project is a
    // credential leak waiting to happen. generateEnvFile() fills this one in with
    // a fresh random value per project instead.
    example: "postgres",
    complete: true,
  },
  {
    name: "JWT_SECRET",
    description:
      "Secret that signs local-jwt tokens (generated once per project; never shared between projects)",
    // Not required for `tdk doctor`: `tdk up` adds it to an older project's .env before starting anything.
    required: false,
    complete: true,
  },
];

const generateDbPassword = (): string => randomBytes(16).toString("hex");
const generateJwtSecret = (): string => randomBytes(32).toString("hex");

/**
 * The keys `completeEnvFile` keeps complete in the project `.env`. An env file that replaces the
 * project `.env` for a run (`tdk up --env-file`) carries the same keys, so it is read from here
 * instead of from a second list.
 */
export const COMPLETED_ENV_VARS: string[] = REQUIRED_ENV_VARS.filter((v) => v.complete).map(
  (v) => v.name,
);

function generatedValue(name: string, password: string): string {
  if (name === "DB_PASSWORD") return password;
  if (name === "JWT_SECRET") return generateJwtSecret();
  if (name === "DATABASE_URL") return `postgresql://postgres:${password}@postgres:5432/app_dev`;
  return REQUIRED_ENV_VARS.find((v) => v.name === name)?.default ?? "";
}

function parseEnvValue(raw: string): string {
  const value = raw.trim();
  const quote = value[0];

  if (quote === '"' || quote === "'") {
    let escaped = false;
    for (let index = 1; index < value.length; index += 1) {
      const char = value[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) {
        const quoted = value.slice(1, index);
        if (quote === '"') {
          const escapes: Record<string, string> = {
            n: "\n",
            r: "\r",
            t: "\t",
            '"': '"',
            "\\": "\\",
            $: "$",
          };
          return quoted.replace(
            /\\([nrt"\\$])/g,
            (_match, escapedChar: string) => escapes[escapedChar] ?? escapedChar,
          );
        }
        return quoted.replace(/\\'/g, "'");
      }
    }
    return value;
  }

  const commentIndex = raw.search(/\s#/);
  return (commentIndex === -1 ? raw : raw.slice(0, commentIndex)).trim();
}

/** Parses the Compose-compatible subset used by TDK for project environment files. */
export function parseEnv(content: string): Map<string, string> {
  const result = new Map<string, string>();
  const normalized = content.startsWith("\uFEFF") ? content.slice(1) : content;
  for (const rawLine of normalized.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const assignment = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const equals = assignment.indexOf("=");
    if (equals <= 0) continue;
    const name = assignment.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    result.set(name, parseEnvValue(assignment.slice(equals + 1)));
  }
  return result;
}

function describe(envVar: EnvVariable): string[] {
  const lines = [`# ${envVar.description}`];
  if (envVar.required) lines.push("# Required (the value below is a working default)");
  if (envVar.example) lines.push(`# Example: ${envVar.example}`);
  return lines;
}

export function generateEnvFile(): string {
  const password = generateDbPassword();
  const lines: string[] = [
    "# 🔧 TDK Environment Configuration",
    "# Generated by `tdk project`. The defaults work as-is; edit only to change them.",
    "# Keep this file out of git: it holds a generated database password and JWT secret.",
    "#",
    "# After editing, run: tdk config regenerate && tdk up",
    "",
  ];

  for (const envVar of REQUIRED_ENV_VARS) {
    lines.push(...describe(envVar));
    lines.push(`${envVar.name}=${generatedValue(envVar.name, password)}`);
    lines.push("");
  }

  return lines.join("\n");
}

/** The password a postgres-style URL carries, or undefined when there is none or it is a variable reference. */
function urlPassword(url: string): string | undefined {
  const match = url.match(/^[a-z][a-z0-9+.-]*:\/\/[^:/@\s]+:([^@\s]*)@/i);
  if (!match || match[1].includes("$")) return undefined;
  return match[1];
}

export function validateEnvFile(projectRoot: string): {
  missing: string[];
  invalid: string[];
  warnings: string[];
} {
  const envPath = join(projectRoot, ".env");
  const result = {
    missing: [] as string[],
    invalid: [] as string[],
    warnings: [] as string[],
  };

  if (!existsSync(envPath)) {
    return {
      missing: REQUIRED_ENV_VARS.filter((v) => v.required).map((v) => v.name),
      invalid: [],
      warnings: [".env file not found - will be auto-generated"],
    };
  }

  const env = parseEnv(readFileSync(envPath, "utf-8"));

  for (const envVar of REQUIRED_ENV_VARS) {
    if (envVar.required && !env.has(envVar.name)) {
      result.missing.push(envVar.name);
    }

    if (env.has(envVar.name) && !(env.get(envVar.name) ?? "").trim()) {
      result.invalid.push(`${envVar.name} is set but empty`);
    }
  }

  const databaseUrl = env.get("DATABASE_URL");
  const dbPassword = env.get("DB_PASSWORD");
  if (databaseUrl && dbPassword) {
    const inUrl = urlPassword(databaseUrl);
    if (inUrl !== undefined && inUrl !== dbPassword) {
      result.warnings.push(
        "DATABASE_URL carries a different password than DB_PASSWORD; the database container uses DB_PASSWORD",
      );
    }
  }

  return result;
}

/**
 * Replaces the value in one parsed assignment while preserving its prefix, inline comment, and line ending.
 * The caller only uses this for assignments whose parsed value is empty or whitespace.
 */
function replaceEmptyEnvValue(line: string, name: string, value: string): string {
  const parsed = parseEnv(line);
  if (!parsed.has(name)) return line;

  const equalsIndex = line.indexOf("=");
  if (equalsIndex < 0) return line;
  const rawValue = line.slice(equalsIndex + 1);
  const commentIndex = rawValue.search(/\s#/);
  const comment = commentIndex < 0 ? "" : rawValue.slice(commentIndex);
  return line.slice(0, equalsIndex + 1) + value + comment;
}

/**
 * Appends missing keys a newer CLI expects and fills empty generated keys in place.
 * Non-empty values are not changed. Creates the file when it is missing.
 *
 * @returns the names that were added or filled in, empty when the file was already complete
 */
export function completeEnvFile(projectRoot: string): string[] {
  const envPath = join(projectRoot, ".env");

  if (!existsSync(envPath)) {
    writeFileSync(envPath, generateEnvFile(), { mode: 0o600 });
    return REQUIRED_ENV_VARS.map((v) => v.name);
  }

  const existing = readFileSync(envPath, "utf-8");
  const env = parseEnv(existing);
  const toComplete = REQUIRED_ENV_VARS.filter((v) => {
    if (!v.complete) return false;
    if (!env.has(v.name)) return true;
    return !(env.get(v.name) ?? "").trim();
  });
  if (toComplete.length === 0) return [];

  const toAdd = toComplete.filter((v) => !env.has(v.name));
  const toRepair = toComplete.filter((v) => env.has(v.name));

  // Anything generated from the password must use the project's existing non-empty value.
  const existingPassword = env.get("DB_PASSWORD");
  const password = existingPassword?.trim() ? existingPassword : generateDbPassword();
  const lines = existing.split(/(\r\n|\n|\r)/);

  for (const envVar of toRepair) {
    let lineIndex = -1;
    for (let index = 0; index < lines.length; index += 2) {
      if (parseEnv(lines[index]).has(envVar.name)) lineIndex = index;
    }
    if (lineIndex < 0) {
      throw new Error(`Could not locate empty .env assignment for ${envVar.name}`);
    }
    lines[lineIndex] = replaceEmptyEnvValue(
      lines[lineIndex],
      envVar.name,
      generatedValue(envVar.name, password),
    );
  }

  let updated = lines.join("");
  if (toAdd.length > 0) {
    const addedLines = [
      "",
      "# Added by TDK: keys this version expects. Existing values above were not changed.",
      "",
    ];
    for (const envVar of toAdd) {
      addedLines.push(...describe(envVar));
      addedLines.push(`${envVar.name}=${generatedValue(envVar.name, password)}`);
      addedLines.push("");
    }

    const separator = updated.endsWith("\n") || updated.endsWith("\r") ? "" : "\n";
    updated += separator + addedLines.join("\n");
  }

  writeTextFileAtomic(envPath, updated);
  return toComplete.map((v) => v.name);
}

export function ensureEnvFile(projectRoot: string): boolean {
  const envPath = join(projectRoot, ".env");

  if (!existsSync(envPath)) {
    writeFileSync(envPath, generateEnvFile(), { mode: 0o600 });
    return true;
  }

  return false;
}
