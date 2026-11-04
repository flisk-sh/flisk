// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearBuildInfoCache, getPackageVersion } from "../../utils/paths.js";
import { versionCommand } from "../version.js";

/** Runs `flisk <args>` on a fresh program and returns what the command printed. */
async function runCli(args: string[]): Promise<string> {
  const printed: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
    printed.push(parts.join(" "));
  });

  const program = new Command().exitOverride();
  program.configureOutput({ writeOut: () => undefined, writeErr: () => undefined });
  program.addCommand(versionCommand);

  await program.parseAsync(args, { from: "user" });
  return printed.join("\n");
}

describe("flisk version", () => {
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
    vi.restoreAllMocks();
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

  it("prints the package version without commit by default", async () => {
    const output = await runCli(["version"]);

    expect(output).not.toBe("");
    expect(output).toBe(getPackageVersion());
  });

  it("prints the same version through the `v` alias", async () => {
    const output = await runCli(["v"]);

    expect(output).toBe(getPackageVersion());
  });

  it("prints the package version and commit sha with --verbose", async () => {
    process.env.FLISK_BUILD_COMMIT = "0123456789abcdef0123456789abcdef01234567";
    const output = await runCli(["version", "--verbose"]);

    expect(output).toBe(`${getPackageVersion()} (0123456789abcdef0123456789abcdef01234567)`);
  });

  it("prints the package version and commit sha with -v option", async () => {
    process.env.FLISK_BUILD_COMMIT = "fedcba9876543210fedcba9876543210fedcba98";
    const output = await runCli(["version", "-v"]);

    expect(output).toBe(`${getPackageVersion()} (fedcba9876543210fedcba9876543210fedcba98)`);
  });

  it("prints verbose version through `v` alias with -v", async () => {
    process.env.FLISK_BUILD_COMMIT = "1111222233334444555566667777888899990000";
    const output = await runCli(["v", "-v"]);

    expect(output).toBe(`${getPackageVersion()} (1111222233334444555566667777888899990000)`);
  });

  it("reads commit sha from a fake build info file when present", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "flisk-build-info-test-"));
    const fakeBuildInfoFile = join(tempDir, "build-info.json");
    const fakeCommit = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
    writeFileSync(
      fakeBuildInfoFile,
      JSON.stringify({ commit: fakeCommit, version: "1.4.30" }),
      "utf8",
    );

    process.env.FLISK_BUILD_INFO_PATH = fakeBuildInfoFile;

    const output = await runCli(["version", "--verbose"]);
    expect(output).toBe(`${getPackageVersion()} (${fakeCommit})`);
  });

  it("falls back to GITHUB_SHA when build info file and FLISK_BUILD_COMMIT are absent", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "flisk-build-info-test-"));
    process.env.FLISK_BUILD_INFO_PATH = join(tempDir, "nonexistent.json");
    process.env.GITHUB_SHA = "githubsha1234567890123456789012345678901";

    const output = await runCli(["version", "--verbose"]);
    expect(output).toBe(`${getPackageVersion()} (githubsha1234567890123456789012345678901)`);
  });

  it("falls back to unknown when no commit info is available", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "flisk-build-info-test-"));
    process.env.FLISK_BUILD_INFO_PATH = join(tempDir, "nonexistent.json");

    const output = await runCli(["version", "--verbose"]);
    expect(output).toBe(`${getPackageVersion()} (unknown)`);
  });
});
