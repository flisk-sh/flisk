// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import * as fs from "node:fs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  EnvUnreadableError,
  envSecretValues,
  MIN_REDACTED_VALUE_LENGTH,
  REDACTED,
  redactSecrets,
  redactValue,
} from "../secret-redaction.js";

const dirs: string[] = [];

function projectWithEnv(content: string | undefined): string {
  const root = mkdtempSync(join(tmpdir(), "tdk-redact-"));
  dirs.push(root);
  if (content !== undefined) writeFileSync(join(root, ".env"), content);
  return root;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("envSecretValues", () => {
  it("returns long .env values, longest first, without quotes", () => {
    const root = projectWithEnv(
      [
        "DB_PASSWORD=a241b2b4adefe26480f645906b988454",
        'DATABASE_URL="postgresql://app:a241b2b4adefe26480f645906b988454@postgres:5432/app"',
        "PORT=4000",
        "# COMMENT=longer-than-eight-but-commented",
      ].join("\n"),
    );
    expect(envSecretValues(root)).toEqual([
      "postgresql://app:a241b2b4adefe26480f645906b988454@postgres:5432/app",
      "a241b2b4adefe26480f645906b988454",
    ]);
  });

  it("skips values shorter than the minimum so ordinary words are not masked", () => {
    const short = "x".repeat(MIN_REDACTED_VALUE_LENGTH - 1);
    expect(envSecretValues(projectWithEnv(`TOKEN=${short}\n`))).toEqual([]);
  });

  it("includes values with exactly the minimum redacted length", () => {
    const exact = "12345678";
    const tooShort = "1234567";
    const root = projectWithEnv(`EXACT=${exact}\nSHORT=${tooShort}\n`);
    expect(envSecretValues(root)).toEqual([exact]);
  });

  it("deduplicates identical values from different keys", () => {
    const root = projectWithEnv("SECRET_A=shared-secret-val\nSECRET_B=shared-secret-val\n");
    expect(envSecretValues(root)).toEqual(["shared-secret-val"]);
  });

  it("sorts multiple secrets strictly by length descending", () => {
    const root = projectWithEnv(
      [
        "SHORT_SECRET=eightlen",
        "MEDIUM_SECRET=fifteen_chars_1",
        "LONGEST_SECRET=twenty_four_chars_long!!",
      ].join("\n"),
    );
    expect(envSecretValues(root)).toEqual([
      "twenty_four_chars_long!!",
      "fifteen_chars_1",
      "eightlen",
    ]);
  });

  it("returns empty array for an empty or comments-only .env file", () => {
    expect(envSecretValues(projectWithEnv(""))).toEqual([]);
    expect(envSecretValues(projectWithEnv("   \n\n# only comments\n# second comment\n"))).toEqual(
      [],
    );
  });

  it("constructs EnvUnreadableError with expected properties", () => {
    const err = new EnvUnreadableError("/app/.env", "EACCES: permission denied");
    expect(err.name).toBe("EnvUnreadableError");
    expect(err.path).toBe("/app/.env");
    expect(err.message).toBe("Could not read /app/.env: EACCES: permission denied");
  });

  it("throws EnvUnreadableError when .env exists but cannot be read", () => {
    if (process.platform === "win32" || process.getuid?.() === 0) return;
    const root = projectWithEnv("TOKEN=abcdefghijk\n");
    fs.chmodSync(join(root, ".env"), 0o000);
    try {
      expect(() => envSecretValues(root)).toThrow(EnvUnreadableError);
    } finally {
      fs.chmodSync(join(root, ".env"), 0o600);
    }
  });

  it("returns nothing when there is no .env file", () => {
    expect(envSecretValues(projectWithEnv(undefined))).toEqual([]);
  });
});

describe("redactSecrets", () => {
  it("returns text unchanged when secrets array is empty", () => {
    expect(redactSecrets("database password is secret123", [])).toBe(
      "database password is secret123",
    );
  });

  it("leaves text unchanged when secrets do not appear", () => {
    expect(redactSecrets("hello world", ["supersecrettoken"])).toBe("hello world");
  });

  it("masks an entire string when it equals the secret exactly", () => {
    expect(redactSecrets("mysecretpassword", ["mysecretpassword"])).toBe(REDACTED);
  });

  it("masks every occurrence of each secret", () => {
    expect(redactSecrets("pw=hunter2hunter2 again hunter2hunter2", ["hunter2hunter2"])).toBe(
      `pw=${REDACTED} again ${REDACTED}`,
    );
  });

  it("masks multiple distinct secrets across text", () => {
    const text =
      "Connecting user admin with token_alpha to host using token_beta (fallback token_alpha)";
    expect(redactSecrets(text, ["token_alpha", "token_beta"])).toBe(
      `Connecting user admin with ${REDACTED} to host using ${REDACTED} (fallback ${REDACTED})`,
    );
  });

  it("masks a value that contains another secret as one piece", () => {
    const secrets = ["postgresql://app:secretsecret@db/app", "secretsecret"];
    expect(redactSecrets("url postgresql://app:secretsecret@db/app", secrets)).toBe(
      `url ${REDACTED}`,
    );
  });
});

describe("redactValue", () => {
  it("preserves non-string primitive values untouched", () => {
    expect(redactValue(42, ["secret123"])).toBe(42);
    expect(redactValue(true, ["secret123"])).toBe(true);
    expect(redactValue(false, ["secret123"])).toBe(false);
    expect(redactValue(null, ["secret123"])).toBeNull();
    expect(redactValue(undefined, ["secret123"])).toBeUndefined();
  });

  it("redacts top-level strings directly", () => {
    expect(redactValue("bearer secret123 token", ["secret123"])).toBe(`bearer ${REDACTED} token`);
  });

  it("redacts strings inside arrays and nested arrays", () => {
    const input = ["secret123", 100, [true, "another secret123 here"], { key: "secret123" }];
    expect(redactValue(input, ["secret123"])).toEqual([
      REDACTED,
      100,
      [true, `another ${REDACTED} here`],
      { key: REDACTED },
    ]);
  });

  it("redacts object values without altering object keys", () => {
    const input = { secret123: "value with secret123" };
    expect(redactValue(input, ["secret123"])).toEqual({
      secret123: `value with ${REDACTED}`,
    });
  });

  it("redacts nested strings and keeps the structure and non-string values", () => {
    const report = {
      schemaVersion: 1,
      data: { checks: [{ name: "DB", message: "password is secretsecret", didPass: true }] },
      errors: [],
      count: 3,
    };
    expect(redactValue(report, ["secretsecret"])).toEqual({
      schemaVersion: 1,
      data: { checks: [{ name: "DB", message: `password is ${REDACTED}`, didPass: true }] },
      errors: [],
      count: 3,
    });
  });

  it("returns the input untouched when there is nothing to redact", () => {
    const value = { a: "b" };
    expect(redactValue(value, [])).toBe(value);
  });
});
