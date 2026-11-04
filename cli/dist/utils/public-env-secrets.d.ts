import type { CheckResult } from "../types/index.js";
export interface PublicEnvSecretFinding {
    variableName: string;
    filePath: string;
    relativeFilePath: string;
}
/**
 * Public variable prefixes that get bundled into client-side JavaScript.
 */
export declare function isPublicEnvVar(name: string): boolean;
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
export declare function isSecretLookingValue(rawValue: string, varName?: string): boolean;
/**
 * Discovers relevant local project environment files (.env, .env.local, .env.development, etc.)
 * in the project root and service directories.
 */
export declare function findProjectEnvFiles(projectRoot: string): string[];
/**
 * Scans discovered project environment files for secret-looking values assigned to
 * public variables (NEXT_PUBLIC_* and VITE_*).
 *
 * Redaction guarantee: Returned findings contain ONLY variableName, filePath, and relativeFilePath.
 * Secret values are never retained in findings or returned structures.
 */
export declare function scanPublicEnvSecrets(projectRoot: string): PublicEnvSecretFinding[];
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
export declare function checkPublicEnvSecrets(projectRoot?: string, strict?: boolean): CheckResult;
