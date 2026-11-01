// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FliskError } from "../errors.js";
import {
  clearMigratorOutputs,
  getMigratorOutputPath,
  MAX_MIGRATOR_OUTPUT_BYTES,
  migratorOutputsDir,
  parseMigratorOutputFile,
  prepareMigratorOutputFile,
  resolveMigratorOutputsInEnv,
  validateMigratorOutputReferences,
} from "../migrator-output.js";

describe("migrator-output utility", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "flisk-migrator-output-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("getMigratorOutputPath and directories", () => {
    it("returns correct path under .flisk/outputs", () => {
      const p = getMigratorOutputPath(tempDir, "orders-migrator");
      expect(p).toBe(join(tempDir, ".flisk", "outputs", "orders-migrator.env"));
      expect(migratorOutputsDir(tempDir)).toBe(join(tempDir, ".flisk", "outputs"));
    });

    it("rejects invalid migrator names and path traversal", () => {
      expect(() => getMigratorOutputPath(tempDir, "")).toThrow(FliskError);
      expect(() => getMigratorOutputPath(tempDir, "../escape")).toThrow(FliskError);
      expect(() => getMigratorOutputPath(tempDir, "invalid/name")).toThrow(FliskError);
      expect(() => getMigratorOutputPath(tempDir, "name with spaces")).toThrow(FliskError);
      expect(() => getMigratorOutputPath(tempDir, "name$bad")).toThrow(FliskError);
    });
  });

  describe("prepareMigratorOutputFile and clearMigratorOutputs", () => {
    it("creates .flisk/outputs directory with 0o700 and purges pre-existing file", () => {
      const outPath = prepareMigratorOutputFile(tempDir, "seed");
      expect(existsSync(join(tempDir, ".flisk", "outputs"))).toBe(true);

      // Create a stale output file
      writeFileSync(outPath, "STALE_TOKEN=old_secret\n");
      expect(existsSync(outPath)).toBe(true);

      // Preparing again removes the stale file
      const preparedAgain = prepareMigratorOutputFile(tempDir, "seed");
      expect(preparedAgain).toBe(outPath);
      expect(existsSync(outPath)).toBe(false);
    });

    it("clearMigratorOutputs cleans specific migrator output or all outputs", () => {
      const pathA = prepareMigratorOutputFile(tempDir, "mig-a");
      const pathB = prepareMigratorOutputFile(tempDir, "mig-b");
      writeFileSync(pathA, "A=1\n");
      writeFileSync(pathB, "B=2\n");

      clearMigratorOutputs(tempDir, "mig-a");
      expect(existsSync(pathA)).toBe(false);
      expect(existsSync(pathB)).toBe(true);

      clearMigratorOutputs(tempDir);
      expect(existsSync(join(tempDir, ".flisk", "outputs"))).toBe(false);
    });
  });

  describe("parseMigratorOutputFile", () => {
    it("returns empty object when file does not exist", () => {
      expect(parseMigratorOutputFile(join(tempDir, "nonexistent.env"))).toEqual({});
    });

    it("parses single and multiple KEY=value lines strictly", () => {
      const filePath = join(tempDir, "test.env");
      writeFileSync(
        filePath,
        [
          "# Comment line",
          "SERVICE_TOKEN=token_value_12345",
          "",
          "PLATFORM_KEY=pk_test_abcdef=",
          "SPACED_VALUE=hello world with spaces",
          "# Another comment",
          "EMPTY_VAL=",
        ].join("\n"),
      );

      const parsed = parseMigratorOutputFile(filePath);
      expect(parsed).toEqual({
        SERVICE_TOKEN: "token_value_12345",
        PLATFORM_KEY: "pk_test_abcdef=",
        SPACED_VALUE: "hello world with spaces",
        EMPTY_VAL: "",
      });
    });

    it("handles CRLF line endings", () => {
      const filePath = join(tempDir, "crlf.env");
      writeFileSync(filePath, "TOKEN_A=val1\r\nTOKEN_B=val2\r\n");
      const parsed = parseMigratorOutputFile(filePath);
      expect(parsed).toEqual({
        TOKEN_A: "val1",
        TOKEN_B: "val2",
      });
    });

    it("throws FliskError on malformed line missing '=' separator", () => {
      const filePath = join(tempDir, "malformed.env");
      writeFileSync(filePath, "JUST_A_STRING_NO_EQUALS\n");
      expect(() => parseMigratorOutputFile(filePath)).toThrow(/missing '=' separator/);
    });

    it("throws FliskError on invalid key name", () => {
      const filePath = join(tempDir, "invalid-key.env");
      writeFileSync(filePath, "invalid-key-name=val\n");
      expect(() => parseMigratorOutputFile(filePath)).toThrow(
        /Invalid key name "invalid-key-name"/,
      );

      writeFileSync(filePath, "123_STARTS_WITH_DIGIT=val\n");
      expect(() => parseMigratorOutputFile(filePath)).toThrow(
        /Invalid key name "123_STARTS_WITH_DIGIT"/,
      );
    });

    it("throws FliskError when output file exceeds maximum allowed size (64KB)", () => {
      const filePath = join(tempDir, "oversized.env");
      const largeContent = `LONG_VALUE=${"x".repeat(MAX_MIGRATOR_OUTPUT_BYTES + 10)}\n`;
      writeFileSync(filePath, largeContent);

      expect(() => parseMigratorOutputFile(filePath)).toThrow(/exceeds maximum allowed size/);
    });

    it("throws FliskError when output file is a symbolic link", () => {
      const realFile = join(tempDir, "real.env");
      writeFileSync(realFile, "KEY=val\n");
      const symlinkFile = join(tempDir, "link.env");
      symlinkSync(realFile, symlinkFile);

      expect(() => parseMigratorOutputFile(symlinkFile)).toThrow(/must not be a symbolic link/);
    });
  });

  describe("validateMigratorOutputReferences", () => {
    it("passes when referenced migrators are declared in dependsOn", () => {
      expect(() =>
        validateMigratorOutputReferences(
          "api",
          {
            API_KEY: "${orders-migrator:SERVICE_TOKEN}",
            FALLBACK: "${orders-migrator:KEY:-fallback_value}",
            NORMAL: "plain_value",
          },
          ["orders-migrator", "postgres"],
        ),
      ).not.toThrow();
    });

    it("throws FliskError when service references unauthorized migrator", () => {
      expect(() =>
        validateMigratorOutputReferences(
          "api",
          {
            API_KEY: "${unauthorized-migrator:SERVICE_TOKEN}",
          },
          ["orders-migrator", "postgres"],
        ),
      ).toThrow(/Service "api" references unauthorized output from "unauthorized-migrator"/);
    });
  });

  describe("resolveMigratorOutputsInEnv", () => {
    it("resolves migrator output references into environment values", () => {
      const outputsByMigrator = {
        "orders-migrator": {
          SERVICE_TOKEN: "secret_token_xyz123",
          DB_PORT: "5432",
        },
      };

      const resolved = resolveMigratorOutputsInEnv(
        "api",
        {
          PLATFORM_API_KEY: "${orders-migrator:SERVICE_TOKEN}",
          DATABASE_PORT: "${orders-migrator:DB_PORT}",
          STATIC_VAL: "unchanged",
        },
        ["orders-migrator"],
        outputsByMigrator,
      );

      expect(resolved).toEqual({
        PLATFORM_API_KEY: "secret_token_xyz123",
        DATABASE_PORT: "5432",
        STATIC_VAL: "unchanged",
      });
    });

    it("uses fallback value when migrator key is missing and fallback is provided", () => {
      const outputsByMigrator = {
        "orders-migrator": {},
      };

      const resolved = resolveMigratorOutputsInEnv(
        "api",
        {
          OPTIONAL_TOKEN: "${orders-migrator:MISSING_KEY:-default_value}",
        },
        ["orders-migrator"],
        outputsByMigrator,
      );

      expect(resolved.OPTIONAL_TOKEN).toBe("default_value");
    });

    it("throws FliskError when key is missing and no fallback provided without leaking secret values", () => {
      const outputsByMigrator = {
        "orders-migrator": {
          OTHER_KEY: "other_secret",
        },
      };

      expect(() =>
        resolveMigratorOutputsInEnv(
          "api",
          {
            REQUIRED_TOKEN: "${orders-migrator:MISSING_KEY}",
          },
          ["orders-migrator"],
          outputsByMigrator,
        ),
      ).toThrow(/Migrator "orders-migrator" did not produce expected output "MISSING_KEY"/);
    });

    it("throws FliskError if unauthorized migrator is referenced at resolution time", () => {
      expect(() =>
        resolveMigratorOutputsInEnv(
          "api",
          {
            KEY: "${unauthorized-job:TOKEN}",
          },
          ["authorized-job"],
          {},
        ),
      ).toThrow(/references unauthorized output from "unauthorized-job"/);
    });
  });
});
