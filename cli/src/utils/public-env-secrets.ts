// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { CheckResult } from "../types/index.js";
import { parseEnv } from "./env-validator.js";
import { findProjectRoot } from "./paths.js";
import { discoverResourcesFromRoot } from "./services.js";

export interface PublicEnvSecretFinding {
  variableName: string;
  filePath: string;
  relativeFilePath: string;
}

/**
 * Public variable prefixes that get bundled into client-side JavaScript.
 */
export function isPublicEnvVar(name: string): boolean {
  return name.startsWith("NEXT_PUBLIC_") || name.startsWith("VITE_");
}

/**
 * Known publishable prefix patterns. Values with these prefixes are public by design
 * (such as Stripe or Clerk publishable keys: pk_live_..., pk_test_...) and must not trigger warnings.
 */
const PUBLISHABLE_PREFIXES = [
  "pk_live_",
  "pk_test_",
  "pk_",
  "publishable_",
  "pubkey_",
  "pub_",
  "public_",
  "public-",
];

/**
 * Common placeholder / template tokens used in documentation and starter templates
 * that should not trigger secret warnings.
 */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /^sk_(test|live)_x+$/i,
  /^sk_test_x$/i,
  /^your[-_](api[-_]key|secret|token|password|cred)/i,
  /^my[-_](api[-_]key|secret|token|password|cred)/i,
  /^test[-_](api[-_]key|secret|token|password|cred)/i,
  /^dummy[-_]?(token|key|secret)?/i,
  /^fake[-_]?(token|key|secret)?/i,
  /^example[-_]?(token|key|secret)?/i,
  /^sample[-_]?(token|key|secret)?/i,
  /^(change|replace)[-_]me/i,
  /^insert[-_]key/i,
  /<[^>]+>/,
  /\[[^\]]+\]/,
  /\{[^}]+\}/,
  /^xxx+$/i,
  /^\.\.\.+$/,
];

/**
 * High-confidence provider secret patterns.
 * Evaluated before generic text heuristics (such as kebab-case words).
 */
const HIGH_CONFIDENCE_SECRET_PATTERNS: RegExp[] = [
  // Stripe secret / restricted keys (sk_live_..., sk_test_..., rk_live_..., rk_test_...)
  /^(sk|rk)_(live|test)_[0-9a-zA-Z]{14,}$/,
  // OpenAI API keys
  /^sk-(proj|svcacct|admin)-[A-Za-z0-9_-]{20,}$/,
  /^sk-[a-zA-Z0-9]{32,}$/,
  // Anthropic API keys
  /^sk-ant-[a-zA-Z0-9_-]{20,}$/,
  // AWS access key ID (20 characters: AKIA/ASIA/ABIA/ACCA + 16 chars)
  /^(AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}$/,
  // GitHub access tokens (personal, oauth, user, server, refresh, fine-grained)
  /^(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}$/,
  /^github_pat_[A-Za-z0-9_]{40,}$/,
  // Slack tokens (bot, user, app, workspace)
  /^xox[baprs]-[0-9a-zA-Z]{10,}/,
  // Google API keys (AIza...)
  /^AIza[-0-9A-Za-z_]{34,40}$/,
  // SendGrid API keys (SG.xxx.yyy)
  /^SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}$/,
  // Twilio API keys
  /^SK[0-9a-fA-F]{32}$/,
  // NPM access tokens
  /^npm_[A-Za-z0-9]{36}$/,
  // Webhook secrets
  /^whsec_[A-Za-z0-9]{24,}$/,
  // Shopify access tokens
  /^shpa[tca]_[0-9a-fA-F]{32}$/,
  // PEM private key headers
  /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/,
  // JSON Web Tokens (3 base64url segments separated by dots)
  /^eyJ[A-Za-z0-9-_=]+\.eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]+$/,
  // URLs containing credentials (e.g. https://user:password@host)
  /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/\s:@]+:[^/\s:@]+@/,
  // Generic secret prefixes followed by 16+ alphanumeric characters
  /^(secret|sec)[_-][A-Za-z0-9]{16,}$/i,
];

/** Keywords in variable names that indicate secret/credential intent. */
const SENSITIVE_VAR_NAME_PATTERN =
  /(SECRET|PASSWORD|PASSWD|PRIVATE_KEY|API_SECRET|AUTH_SECRET|SIGNING_KEY|ADMIN_TOKEN|ACCESS_TOKEN)/i;

/** Build identifier / version keywords in variable names. */
const BUILD_IDENTIFIER_VAR_PATTERN = /(BUILD|COMMIT|VERSION|REVISION|RELEASE|HASH|DIST)/i;

const IGNORED_SCAN_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "out",
  ".flisk",
  ".turbo",
  ".cache",
]);

/**
 * Checks whether an environment variable value assigned to a public variable
 * looks like a leaked secret or credential.
 *
 * Designed to be deterministic, explainable, and resilient against false positives:
 * - Empty or short values (< 8 chars) are ignored.
 * - Known publishable prefixes (pk_, publishable_, etc.) are allowed.
 * - Documentation placeholders (sk_test_x, <...>, etc.) are ignored.
 * - Ordinary configuration (PascalCase feature flags, kebab-case config, URLs, build IDs) is allowed.
 * - High-confidence credential patterns and sensitive variable names with token-shaped values are flagged.
 */
export function isSecretLookingValue(rawValue: string, varName?: string): boolean {
  const value = rawValue.trim();

  // 1. Trivial length or empty
  if (value.length < 8) return false;

  // 2. Common non-secret primitives
  const lower = value.toLowerCase();
  if (lower === "true" || lower === "false" || lower === "null" || lower === "undefined") {
    return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return false;
  }

  // 3. Known publishable prefixes (pk_live_..., pk_test_..., publishable_...)
  for (const prefix of PUBLISHABLE_PREFIXES) {
    if (lower.startsWith(prefix)) return false;
  }

  // 4. Placeholders & example tokens (sk_test_x, <YOUR_KEY>, replace_me, dummy, etc.)
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(value)) return false;
  }
  if (
    /\b(placeholder|replace_me|change_me|your_key|my_key|fake_key|dummy_key|sample_key)\b/i.test(
      value,
    )
  ) {
    return false;
  }

  // 5. File paths
  if (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("~/") ||
    /^[a-zA-Z]:\\/.test(value)
  ) {
    return false;
  }

  // 6. High-confidence secret patterns (evaluated before generic text heuristics)
  for (const pattern of HIGH_CONFIDENCE_SECRET_PATTERNS) {
    if (pattern.test(value)) return true;
  }

  // 7. Explicit sensitive variable name with token-shaped value
  if (varName && SENSITIVE_VAR_NAME_PATTERN.test(varName)) {
    if (value.length >= 12 && !BUILD_IDENTIFIER_VAR_PATTERN.test(varName)) {
      return true;
    }
  }

  // 8. URLs without credentials are safe public config
  if (/^https?:\/\/[^\s]+$/i.test(value)) {
    return false;
  }

  // 9. Standard UUIDs are safe identifiers
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return false;
  }

  // 10. Ordinary kebab-case configuration strings (e.g. my-ordinary-public-configuration-value-2026)
  if (/^[a-z0-9]+(-[a-z0-9]+)+$/i.test(value)) {
    return false;
  }

  // 11. Common build IDs and version numbers (e.g. build-20261029-abc, v1.4.13)
  if (
    /^(v?[0-9]+\.[0-9]+(\.[0-9]+)?(-[a-z0-9.]+)?|build-[0-9a-z.-]+|rel-[0-9a-z.-]+)$/i.test(value)
  ) {
    return false;
  }

  // 12. If variable name indicates build/commit/version/hash, allow hex/hash values
  if (varName && BUILD_IDENTIFIER_VAR_PATTERN.test(varName)) {
    return false;
  }

  // 13. Ordinary PascalCase or camelCase feature flag names (e.g. ThisIsAVeryLongFeatureFlagValue2026)
  if (/^[A-Za-z][A-Za-z0-9]+$/.test(value)) {
    return false;
  }

  return false;
}

/**
 * True when the path is strictly inside the project root directory.
 */
function isInsideProjectRoot(projectRoot: string, targetPath: string): boolean {
  const relativePath = relative(resolve(projectRoot), resolve(targetPath));
  if (relativePath === "") return true;
  if (isAbsolute(relativePath)) return false;
  return relativePath !== ".." && !relativePath.startsWith(`..${sep}`);
}

/**
 * Verifies that a file path exists, is a regular file, and resolves inside the project root
 * (preventing traversal or following symlinks pointing outside the project).
 */
function isSafeProjectEnvFile(projectRoot: string, filePath: string): boolean {
  try {
    if (!existsSync(filePath)) return false;
    const realRoot = realpathSync(projectRoot);
    const realFile = realpathSync(filePath);
    return isInsideProjectRoot(realRoot, realFile);
  } catch {
    return false;
  }
}

/**
 * Discovers relevant local project environment files (.env, .env.local, .env.development, etc.)
 * in the project root and service directories.
 */
export function findProjectEnvFiles(projectRoot: string): string[] {
  const envFiles = new Set<string>();

  const scanDir = (dir: string, depth = 0) => {
    if (depth > 3 || !existsSync(dir)) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.name.startsWith(".") &&
          entry.name !== ".env" &&
          !entry.name.startsWith(".env.")
        ) {
          // Skip hidden directories (.git, .next, .flisk, etc.)
          continue;
        }
        if (IGNORED_SCAN_DIRS.has(entry.name)) continue;

        const fullPath = join(dir, entry.name);
        if (entry.isFile() || entry.isSymbolicLink()) {
          if (entry.name === ".env" || entry.name.startsWith(".env.")) {
            if (isSafeProjectEnvFile(projectRoot, fullPath)) {
              envFiles.add(fullPath);
            }
          }
        } else if (entry.isDirectory()) {
          scanDir(fullPath, depth + 1);
        }
      }
    } catch {
      // Ignore unreadable directories
    }
  };

  // 1. Scan project root recursively up to depth 3
  scanDir(projectRoot, 0);

  // 2. Scan discovered service directories (in case services live outside depth 3)
  try {
    const resources = discoverResourcesFromRoot(projectRoot);
    for (const resource of resources) {
      if (resource.path && isSafeProjectEnvFile(projectRoot, resource.path)) {
        scanDir(resource.path, 0);
      }
    }
  } catch {
    // If services cannot be discovered, root scan is still preserved
  }

  // 3. Scan FLISK_ENV_FILE if specified
  const fliskEnvFile = process.env.FLISK_ENV_FILE;
  if (fliskEnvFile) {
    const resolved = resolve(projectRoot, fliskEnvFile);
    if (isSafeProjectEnvFile(projectRoot, resolved)) {
      try {
        if (statSync(resolved).isFile()) {
          envFiles.add(resolved);
        }
      } catch {
        // Ignore unreadable file
      }
    }
  }

  return [...envFiles].sort();
}

/**
 * Scans discovered project environment files for secret-looking values assigned to
 * public variables (NEXT_PUBLIC_* and VITE_*).
 *
 * Redaction guarantee: Returned findings contain ONLY variableName, filePath, and relativeFilePath.
 * Secret values are never retained in findings or returned structures.
 */
export function scanPublicEnvSecrets(projectRoot: string): PublicEnvSecretFinding[] {
  const envFiles = findProjectEnvFiles(projectRoot);
  const findings: PublicEnvSecretFinding[] = [];

  for (const filePath of envFiles) {
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      // Skip unreadable files safely
      continue;
    }

    const parsed = parseEnv(content);
    for (const [key, value] of parsed.entries()) {
      if (!isPublicEnvVar(key)) continue;
      if (isSecretLookingValue(value, key)) {
        const rel = relative(projectRoot, filePath) || filePath;
        findings.push({
          variableName: key,
          filePath,
          relativeFilePath: rel,
        });
      }
    }
  }

  return findings;
}

/**
 * Flisk doctor check: inspects project environment files and flags NEXT_PUBLIC_*
 * and VITE_* variables that hold secret-looking values.
 *
 * Warning-only by default: didPass is true and isWarning is true when strict is false,
 * preserving flisk doctor exit code 0.
 * In strict mode (--strict), didPass is false and isWarning is false, failing the check.
 *
 * Secret value guarantee: Output messages contain ONLY variable names and source file paths,
 * never values or substrings.
 */
export function checkPublicEnvSecrets(
  projectRoot: string = findProjectRoot() ?? process.cwd(),
  strict = false,
): CheckResult {
  const findings = scanPublicEnvSecrets(projectRoot);

  if (findings.length === 0) {
    return {
      name: "Public Environment Secrets",
      didPass: true,
      message: "No secret-looking values detected in public environment variables",
    };
  }

  const formatted = findings.map((f) => `${f.variableName} (${f.relativeFilePath})`).join(", ");

  return {
    name: "Public Environment Secrets",
    didPass: !strict,
    isWarning: !strict,
    message: `Potential secret-looking values detected in public environment variables: ${formatted}`,
    fix: "Move secrets to server-side variables or API routes. Public variables (NEXT_PUBLIC_*, VITE_*) are embedded into client bundles.",
  };
}
