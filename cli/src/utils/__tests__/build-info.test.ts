// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearBuildInfoCache, getBuildCommit, getBuildInfo } from "../build-info.js";

describe("build-info", () => {
  let tempDir: string | null = null;
  const originalBuildInfoPath = process.env.FLISK_BUILD_INFO_PATH;
  const originalBuildCommit = process.env.FLISK_BUILD_COMMIT;
  const originalGithubSha = process.env.GITHUB_SHA;

  beforeEach(() => {
    clearBuildInfoCache();
    delete process.env.FLISK_BUILD_INFO_PATH;
    delete process.env.FLISK_BUILD_COMMIT;
    delete process.env.GITHUB_SHA;
  });

  afterEach(() => {
    clearBuildInfoCache();
    if (originalBuildInfoPath !== undefined) {
      process.env.FLISK_BUILD_INFO_PATH = originalBuildInfoPath;
    } else {
      delete process.env.FLISK_BUILD_INFO_PATH;
    }
    if (originalBuildCommit !== undefined) {
      process.env.FLISK_BUILD_COMMIT = originalBuildCommit;
    } else {
      delete process.env.FLISK_BUILD_COMMIT;
    }
    if (originalGithubSha !== undefined) {
      process.env.GITHUB_SHA = originalGithubSha;
    } else {
      delete process.env.GITHUB_SHA;
    }
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("returns null when build-info file does not exist", () => {
    tempDir = mkdtempSync(join(tmpdir(), "flisk-build-test-"));
    const result = getBuildInfo(join(tempDir, "missing.json"));
    expect(result).toBeNull();
  });

  it("parses valid build-info file with commit property", () => {
    tempDir = mkdtempSync(join(tmpdir(), "flisk-build-test-"));
    const file = join(tempDir, "build-info.json");
    writeFileSync(file, JSON.stringify({ commit: "abcdef1234567890", version: "1.4.30" }));

    const result = getBuildInfo(file);
    expect(result).not.toBeNull();
    expect(result?.commit).toBe("abcdef1234567890");
    expect(result?.commitSha).toBe("abcdef1234567890");
  });

  it("parses build-info file using commitSha fallback property", () => {
    tempDir = mkdtempSync(join(tmpdir(), "flisk-build-test-"));
    const file = join(tempDir, "build-info.json");
    writeFileSync(file, JSON.stringify({ commitSha: "9876543210fedcba" }));

    const result = getBuildInfo(file);
    expect(result).not.toBeNull();
    expect(result?.commit).toBe("9876543210fedcba");
  });

  it("parses build-info file using sha fallback property", () => {
    tempDir = mkdtempSync(join(tmpdir(), "flisk-build-test-"));
    const file = join(tempDir, "build-info.json");
    writeFileSync(file, JSON.stringify({ sha: "1122334455667788" }));

    const result = getBuildInfo(file);
    expect(result).not.toBeNull();
    expect(result?.commit).toBe("1122334455667788");
  });

  it("handles malformed JSON gracefully", () => {
    tempDir = mkdtempSync(join(tmpdir(), "flisk-build-test-"));
    const file = join(tempDir, "build-info.json");
    writeFileSync(file, "not valid json");

    const result = getBuildInfo(file);
    expect(result).toBeNull();
  });

  it("handles empty commit string gracefully", () => {
    tempDir = mkdtempSync(join(tmpdir(), "flisk-build-test-"));
    const file = join(tempDir, "build-info.json");
    writeFileSync(file, JSON.stringify({ commit: "   " }));

    const result = getBuildInfo(file);
    expect(result).toBeNull();
  });

  it("getBuildCommit prioritizes FLISK_BUILD_COMMIT over build-info file", () => {
    tempDir = mkdtempSync(join(tmpdir(), "flisk-build-test-"));
    const file = join(tempDir, "build-info.json");
    writeFileSync(file, JSON.stringify({ commit: "file-commit" }));

    process.env.FLISK_BUILD_INFO_PATH = file;
    process.env.FLISK_BUILD_COMMIT = "env-commit";
    process.env.GITHUB_SHA = "github-sha";

    expect(getBuildCommit()).toBe("env-commit");
  });

  it("getBuildCommit uses build-info file when FLISK_BUILD_COMMIT is not set", () => {
    tempDir = mkdtempSync(join(tmpdir(), "flisk-build-test-"));
    const file = join(tempDir, "build-info.json");
    writeFileSync(file, JSON.stringify({ commit: "file-commit" }));

    process.env.FLISK_BUILD_INFO_PATH = file;
    delete process.env.FLISK_BUILD_COMMIT;
    process.env.GITHUB_SHA = "github-sha";

    expect(getBuildCommit()).toBe("file-commit");
  });

  it("getBuildCommit prioritizes FLISK_BUILD_COMMIT over GITHUB_SHA", () => {
    tempDir = mkdtempSync(join(tmpdir(), "flisk-build-test-"));
    process.env.FLISK_BUILD_INFO_PATH = join(tempDir, "missing.json");
    process.env.FLISK_BUILD_COMMIT = "env-commit";
    process.env.GITHUB_SHA = "github-sha";

    expect(getBuildCommit()).toBe("env-commit");
  });

  it("getBuildCommit uses GITHUB_SHA when FLISK_BUILD_COMMIT is not set", () => {
    tempDir = mkdtempSync(join(tmpdir(), "flisk-build-test-"));
    process.env.FLISK_BUILD_INFO_PATH = join(tempDir, "missing.json");
    process.env.GITHUB_SHA = "github-sha";

    expect(getBuildCommit()).toBe("github-sha");
  });

  it("getBuildCommit returns unknown when no commit is available", () => {
    tempDir = mkdtempSync(join(tmpdir(), "flisk-build-test-"));
    process.env.FLISK_BUILD_INFO_PATH = join(tempDir, "missing.json");

    expect(getBuildCommit()).toBe("unknown");
  });
});
