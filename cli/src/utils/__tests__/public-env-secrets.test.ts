// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkPublicEnvSecrets,
  findProjectEnvFiles,
  isPublicEnvVar,
  isSecretLookingValue,
  scanPublicEnvSecrets,
} from "../public-env-secrets.js";

// Synthetic test credentials: purely generated mock tokens for test coverage
const makeKey = (parts: string[]) => parts.join("");

const SYNTHETIC_STRIPE_LIVE = makeKey([
  "sk",
  "_live_",
  "51M00000000000000000000000000000000000000000000000000000000",
]);
const SYNTHETIC_STRIPE_TEST = makeKey([
  "sk",
  "_test_",
  "51M00000000000000000000000000000000000000000000000000000000",
]);
const SYNTHETIC_STRIPE_RESTRICTED = makeKey([
  "rk",
  "_live_",
  "51M00000000000000000000000000000000000000000000000000000000",
]);
const SYNTHETIC_OPENAI_KEY = makeKey([
  "sk",
  "-proj-",
  "1234567890abcdefghijklmnopqrstuvwxyz1234567890",
]);
const SYNTHETIC_ANTHROPIC_KEY = makeKey([
  "sk",
  "-ant-",
  "api03-abcdef1234567890abcdef1234567890-abcdef",
]);
const SYNTHETIC_AWS_KEY = makeKey(["AK", "IA", "IOSFODNN7EXAMPLE"]);
const SYNTHETIC_GITHUB_PAT = makeKey(["gh", "p_", "0123456789abcdefghijklmnopqrstuvwxyz01"]);
const SYNTHETIC_GITHUB_FINE = makeKey([
  "github",
  "_pat_",
  "11AAAAAAA0000000000000000000000000000000000000000000000000",
]);
const SYNTHETIC_SLACK_BOT = makeKey([
  "xox",
  "b-",
  "123456789012-1234567890123-abcdefghijklmnopqrstuvwx",
]);
const SYNTHETIC_GOOGLE_API = makeKey(["AI", "za", "SyA0123456789012345678901234567890"]);
const SYNTHETIC_SENDGRID = makeKey([
  "SG",
  ".",
  "0123456789012345678901.0123456789012345678901234567890123456789012",
]);
const SYNTHETIC_TWILIO = makeKey(["SK", "0123456789abcdef0123456789abcdef"]);
const SYNTHETIC_NPM_TOKEN = makeKey(["npm", "_", "0123456789abcdef0123456789abcdef0123"]);
const SYNTHETIC_WEBHOOK_SEC = makeKey(["whsec", "_", "0123456789abcdef0123456789abcdef01234567"]);
const SYNTHETIC_JWT = makeKey([
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
  ".",
  "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ",
  ".",
  "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
]);
const SYNTHETIC_URL_CREDS = "https://admin:my-secret-password-1234@api.internal.example.com";
const SYNTHETIC_PRIVATE_KEY = makeKey([
  "-----BEGIN RSA ",
  "PRIVATE ",
  "KEY-----\nMIIEowIBAAKCAQEA0synthetic...\n-----END RSA ",
  "PRIVATE KEY-----",
]);

describe("public env secret detection", () => {
  describe("isPublicEnvVar", () => {
    it("flags NEXT_PUBLIC_ and VITE_ variables as public", () => {
      expect(isPublicEnvVar("NEXT_PUBLIC_API_URL")).toBe(true);
      expect(isPublicEnvVar("NEXT_PUBLIC_STRIPE_KEY")).toBe(true);
      expect(isPublicEnvVar("VITE_APP_TITLE")).toBe(true);
      expect(isPublicEnvVar("VITE_AUTH_TOKEN")).toBe(true);
    });

    it("ignores server-side and standard backend variables", () => {
      expect(isPublicEnvVar("DATABASE_URL")).toBe(false);
      expect(isPublicEnvVar("DB_PASSWORD")).toBe(false);
      expect(isPublicEnvVar("JWT_SECRET")).toBe(false);
      expect(isPublicEnvVar("STRIPE_SECRET_KEY")).toBe(false);
      expect(isPublicEnvVar("OPENAI_API_KEY")).toBe(false);
      expect(isPublicEnvVar("API_KEY")).toBe(false);
      expect(isPublicEnvVar("PUBLIC_API_KEY")).toBe(false);
    });
  });

  describe("isSecretLookingValue - Positive high-confidence credential detection", () => {
    it("flags Stripe secret and restricted keys", () => {
      expect(isSecretLookingValue(SYNTHETIC_STRIPE_LIVE)).toBe(true);
      expect(isSecretLookingValue(SYNTHETIC_STRIPE_TEST)).toBe(true);
      expect(isSecretLookingValue(SYNTHETIC_STRIPE_RESTRICTED)).toBe(true);
    });

    it("flags OpenAI API keys", () => {
      expect(isSecretLookingValue(SYNTHETIC_OPENAI_KEY)).toBe(true);
      expect(
        isSecretLookingValue(makeKey(["sk-", "1234567890abcdef1234567890abcdef12345678"])),
      ).toBe(true);
    });

    it("flags Anthropic API keys", () => {
      expect(isSecretLookingValue(SYNTHETIC_ANTHROPIC_KEY)).toBe(true);
    });

    it("flags AWS IAM access keys", () => {
      expect(isSecretLookingValue(SYNTHETIC_AWS_KEY)).toBe(true);
      expect(isSecretLookingValue(["ASIA", "IOSFODNN7EXAMPLE"].join(""))).toBe(true);
    });

    it("flags GitHub tokens", () => {
      expect(isSecretLookingValue(SYNTHETIC_GITHUB_PAT)).toBe(true);
      expect(isSecretLookingValue(SYNTHETIC_GITHUB_FINE)).toBe(true);
      expect(
        isSecretLookingValue(["gho", "0123456789abcdefghijklmnopqrstuvwxyz01"].join("_")),
      ).toBe(true);
    });

    it("flags Slack bot and user tokens", () => {
      expect(isSecretLookingValue(SYNTHETIC_SLACK_BOT)).toBe(true);
      expect(
        isSecretLookingValue(
          makeKey(["xox", "p-", "123456789012-1234567890123-abcdefghijklmnopqrstuvwx"]),
        ),
      ).toBe(true);
    });

    it("flags Google API keys", () => {
      expect(isSecretLookingValue(SYNTHETIC_GOOGLE_API)).toBe(true);
    });

    it("flags SendGrid, Twilio, and NPM tokens", () => {
      expect(isSecretLookingValue(SYNTHETIC_SENDGRID)).toBe(true);
      expect(isSecretLookingValue(SYNTHETIC_TWILIO)).toBe(true);
      expect(isSecretLookingValue(SYNTHETIC_NPM_TOKEN)).toBe(true);
    });

    it("flags webhook secrets and Shopify tokens", () => {
      expect(isSecretLookingValue(SYNTHETIC_WEBHOOK_SEC)).toBe(true);
      expect(isSecretLookingValue(["shpat", "0123456789abcdef0123456789abcdef"].join("_"))).toBe(
        true,
      );
    });

    it("flags PEM private key blocks and JWT tokens", () => {
      expect(isSecretLookingValue(SYNTHETIC_PRIVATE_KEY)).toBe(true);
      expect(isSecretLookingValue(SYNTHETIC_JWT)).toBe(true);
    });

    it("flags URLs with embedded credentials", () => {
      expect(isSecretLookingValue(SYNTHETIC_URL_CREDS)).toBe(true);
      expect(isSecretLookingValue("postgres://user:pass1234@db:5432/app")).toBe(true);
    });

    it("flags sensitive variable names containing token values", () => {
      expect(
        isSecretLookingValue("4f8a3c9b2e1d7a0f5e8b4c3d2a1f0e9b", "NEXT_PUBLIC_STRIPE_SECRET_KEY"),
      ).toBe(true);
      expect(isSecretLookingValue("superSecretAdminToken99", "VITE_ADMIN_PASSWORD")).toBe(true);
    });
  });

  describe("isSecretLookingValue - Negative cases and false-positive safeguards", () => {
    it("permits publishable keys with pk_ prefixes", () => {
      expect(
        isSecretLookingValue("pk_live_51M00000000000000000000000000000000000000000000000000000000"),
      ).toBe(false);
      expect(
        isSecretLookingValue("pk_test_51M00000000000000000000000000000000000000000000000000000000"),
      ).toBe(false);
      expect(isSecretLookingValue("pk_test_custom_identifier_2026")).toBe(false);
      expect(isSecretLookingValue("publishable_key_12345678901234567890")).toBe(false);
      expect(isSecretLookingValue("pubkey_client_12345678901234567890")).toBe(false);
      expect(isSecretLookingValue("pub_production_token_1234567890")).toBe(false);
    });

    it("permits long PascalCase and camelCase feature flags", () => {
      expect(isSecretLookingValue("ThisIsAVeryLongFeatureFlagValue2026")).toBe(false);
      expect(isSecretLookingValue("enableCheckoutRedesignV2Experiment2026")).toBe(false);
      expect(isSecretLookingValue("FeatureVariantAlpha")).toBe(false);
    });

    it("permits long hyphenated kebab-case configuration values", () => {
      expect(isSecretLookingValue("my-ordinary-public-configuration-value-2026")).toBe(false);
      expect(isSecretLookingValue("theme-dark-mode-high-contrast-2026")).toBe(false);
      expect(isSecretLookingValue("region-us-east-1-cluster-alpha")).toBe(false);
    });

    it("permits build IDs, versions, and git commit hashes", () => {
      expect(isSecretLookingValue("build-20261029-73b9708b")).toBe(false);
      expect(isSecretLookingValue("v1.4.13-build-20261029")).toBe(false);
      expect(isSecretLookingValue("rel-2026-10-29-01")).toBe(false);
      expect(
        isSecretLookingValue(
          "8e71f9ed1234567890abcdef1234567890abcdef",
          "NEXT_PUBLIC_GIT_COMMIT_SHA",
        ),
      ).toBe(false);
      expect(
        isSecretLookingValue("8e71f9ed1234567890abcdef1234567890abcdef", "VITE_BUILD_HASH"),
      ).toBe(false);
    });

    it("permits public URLs without embedded credentials", () => {
      expect(isSecretLookingValue("https://api.example.com/v1")).toBe(false);
      expect(isSecretLookingValue("http://localhost:3000")).toBe(false);
      expect(isSecretLookingValue("https://cdn.example.org/assets/script.js?v=2026")).toBe(false);
    });

    it("permits documentation placeholders and test tokens", () => {
      expect(isSecretLookingValue("sk_test_x")).toBe(false);
      expect(isSecretLookingValue("sk_live_x")).toBe(false);
      expect(isSecretLookingValue("sk_test_xxx")).toBe(false);
      expect(isSecretLookingValue("your_api_key_here")).toBe(false);
      expect(isSecretLookingValue("your-secret-token")).toBe(false);
      expect(isSecretLookingValue("<INSERT_OPENAI_KEY_HERE>")).toBe(false);
      expect(isSecretLookingValue("[REPLACE_WITH_YOUR_KEY]")).toBe(false);
      expect(isSecretLookingValue("{YOUR_API_TOKEN}")).toBe(false);
      expect(isSecretLookingValue("replace_me_in_production")).toBe(false);
      expect(isSecretLookingValue("dummy_api_key")).toBe(false);
    });

    it("permits empty, short, boolean, numeric, UUID, and path values", () => {
      expect(isSecretLookingValue("")).toBe(false);
      expect(isSecretLookingValue("short")).toBe(false);
      expect(isSecretLookingValue("true")).toBe(false);
      expect(isSecretLookingValue("false")).toBe(false);
      expect(isSecretLookingValue("123456789")).toBe(false);
      expect(isSecretLookingValue("123e4567-e89b-12d3-a456-426614174000")).toBe(false);
      expect(isSecretLookingValue("/usr/local/bin/config")).toBe(false);
      expect(isSecretLookingValue("./config/public.json")).toBe(false);
    });
  });

  describe("file discovery and project scanning", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), "flisk-test-env-secrets-"));
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("finds project env files across root and service folders", () => {
      writeFileSync(join(tempDir, ".env"), "NEXT_PUBLIC_URL=https://example.com\n");
      writeFileSync(join(tempDir, ".env.local"), "VITE_APP=test\n");
      const appDir = join(tempDir, "apps", "web");
      mkdirSync(appDir, { recursive: true });
      writeFileSync(join(appDir, ".env.production"), "VITE_CONFIG=production\n");

      // Mock service.json so discoverResourcesFromRoot finds it
      writeFileSync(
        join(appDir, "service.json"),
        JSON.stringify({
          schemaVersion: 1,
          name: "web",
          appName: "web",
          runtime: "bun",
          appType: "frontend",
          port: 3000,
        }),
      );

      const files = findProjectEnvFiles(tempDir);
      const relativeFiles = files.map((f) => f.replace(tempDir, "").replace(/^[\\/]/, ""));
      expect(relativeFiles).toContain(".env");
      expect(relativeFiles).toContain(".env.local");
      expect(relativeFiles).toContain(join("apps", "web", ".env.production"));
    });

    it("prevents following symlinks pointing outside the project root", () => {
      const outsideDir = mkdtempSync(join(tmpdir(), "flisk-outside-"));
      const outsideSecretFile = join(outsideDir, ".env.outside");
      writeFileSync(outsideSecretFile, `NEXT_PUBLIC_SECRET=${SYNTHETIC_STRIPE_LIVE}\n`);

      try {
        writeFileSync(join(tempDir, ".env"), "NEXT_PUBLIC_OK=safe\n");
        const maliciousSymlink = join(tempDir, ".env.symlink");
        symlinkSync(outsideSecretFile, maliciousSymlink);

        const files = findProjectEnvFiles(tempDir);
        expect(files).not.toContain(maliciousSymlink);

        const findings = scanPublicEnvSecrets(tempDir);
        expect(findings).toEqual([]);
      } finally {
        rmSync(outsideDir, { recursive: true, force: true });
      }
    });

    it("scans multiple environment files and reports findings with relative paths", () => {
      writeFileSync(
        join(tempDir, ".env"),
        [
          `NEXT_PUBLIC_STRIPE=${SYNTHETIC_STRIPE_LIVE}`,
          "NEXT_PUBLIC_SAFE=my-ordinary-public-configuration-value-2026",
          `DATABASE_URL=postgres://user:${SYNTHETIC_STRIPE_LIVE}@db:5432/app`,
        ].join("\n"),
      );

      const appDir = join(tempDir, "services", "frontend");
      mkdirSync(appDir, { recursive: true });
      writeFileSync(
        join(appDir, "service.json"),
        JSON.stringify({
          schemaVersion: 1,
          name: "frontend",
          appName: "frontend",
          runtime: "bun",
          appType: "frontend",
          port: 3000,
        }),
      );
      writeFileSync(
        join(appDir, ".env.local"),
        [
          `VITE_OPENAI_TOKEN=${SYNTHETIC_OPENAI_KEY}`,
          "VITE_PUBLIC_KEY=pk_live_123456789012345678901234567890",
        ].join("\n"),
      );

      const findings = scanPublicEnvSecrets(tempDir);
      expect(findings).toHaveLength(2);

      // Verify findings have correct variableName and filenames, and non-public DATABASE_URL is ignored
      const varNames = findings.map((f) => f.variableName).sort();
      expect(varNames).toEqual(["NEXT_PUBLIC_STRIPE", "VITE_OPENAI_TOKEN"]);

      const relPaths = findings.map((f) => f.relativeFilePath).sort();
      expect(relPaths).toEqual([".env", join("services", "frontend", ".env.local")]);

      // CRITICAL: verify the finding objects themselves do NOT contain the secret value
      for (const finding of findings) {
        expect(JSON.stringify(finding)).not.toContain(SYNTHETIC_STRIPE_LIVE);
        expect(JSON.stringify(finding)).not.toContain(SYNTHETIC_OPENAI_KEY);
      }
    });

    it("handles malformed dotenv lines safely without crashing", () => {
      writeFileSync(
        join(tempDir, ".env"),
        [
          "MALFORMED_LINE_WITHOUT_EQUALS",
          " =empty_key",
          "???INVALID_IDENTIFIER=value",
          `NEXT_PUBLIC_KEY=${SYNTHETIC_GITHUB_PAT}`,
          "   # trailing comment only",
        ].join("\n"),
      );

      const findings = scanPublicEnvSecrets(tempDir);
      expect(findings).toHaveLength(1);
      expect(findings[0].variableName).toBe("NEXT_PUBLIC_KEY");
    });
  });

  describe("checkPublicEnvSecrets - Doctor diagnostic results", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), "flisk-test-doctor-check-"));
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("passes cleanly when no secret-looking values are found", () => {
      writeFileSync(
        join(tempDir, ".env"),
        [
          "NEXT_PUBLIC_API_URL=https://api.example.com",
          "NEXT_PUBLIC_STRIPE_PUB=pk_live_51M00000000000000000000000000000000000000000000000000000000",
          "NEXT_PUBLIC_FLAG=ThisIsAVeryLongFeatureFlagValue2026",
          "VITE_CONFIG=my-ordinary-public-configuration-value-2026",
          "VITE_PLACEHOLDER=sk_test_x",
        ].join("\n"),
      );

      const result = checkPublicEnvSecrets(tempDir, false);
      expect(result).toMatchObject({
        name: "Public Environment Secrets",
        didPass: true,
        message: "No secret-looking values detected in public environment variables",
      });
      expect(result.isWarning).toBeUndefined();
    });

    it("reports a non-fatal warning by default when secrets are detected", () => {
      writeFileSync(join(tempDir, ".env"), `NEXT_PUBLIC_AWS=${SYNTHETIC_AWS_KEY}\n`);

      const result = checkPublicEnvSecrets(tempDir, false);
      expect(result).toMatchObject({
        name: "Public Environment Secrets",
        didPass: true,
        isWarning: true,
      });
      expect(result.message).toContain("NEXT_PUBLIC_AWS (.env)");
      expect(result.fix).toContain("Move secrets to server-side variables or API routes");

      // CRITICAL: secret value is NEVER present in the result object
      expect(result.message).not.toContain(SYNTHETIC_AWS_KEY);
      expect(result.fix).not.toContain(SYNTHETIC_AWS_KEY);
      expect(result.name).not.toContain(SYNTHETIC_AWS_KEY);
      expect(JSON.stringify(result)).not.toContain(SYNTHETIC_AWS_KEY);
    });

    it("fails the check under strict mode", () => {
      writeFileSync(join(tempDir, ".env"), `NEXT_PUBLIC_SLACK=${SYNTHETIC_SLACK_BOT}\n`);

      const result = checkPublicEnvSecrets(tempDir, true);
      expect(result).toMatchObject({
        name: "Public Environment Secrets",
        didPass: false,
        isWarning: false,
      });
      expect(result.message).toContain("NEXT_PUBLIC_SLACK (.env)");
      expect(JSON.stringify(result)).not.toContain(SYNTHETIC_SLACK_BOT);
    });
  });
});
