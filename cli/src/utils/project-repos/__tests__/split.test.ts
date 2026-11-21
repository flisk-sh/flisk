// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FliskError } from "../../errors.js";
import { cloneMissingRepos, cloneRepo, redactRepoUrl } from "../clone.js";
import { checkProjectRepos } from "../report.js";
import { validateRepoDir, validateRepoList, validateRepoUrl } from "../validate.js";

describe("project-repos/validate (leaf module)", () => {
  it("rejects bad URL schemes", () => {
    expect(validateRepoUrl("ftp://example.com/repo.git").valid).toBe(false);
    expect(validateRepoUrl("https://github.com/org/repo.git").valid).toBe(true);
    expect(validateRepoUrl("git@github.com:org/repo.git").valid).toBe(true);
  });

  it("rejects reserved destination directories", () => {
    const root = mkdtempSync(join(tmpdir(), "flisk-validate-"));
    try {
      expect(validateRepoDir(".git", root).valid).toBe(false);
      expect(validateRepoDir("node_modules/pkg", root).valid).toBe(false);
      expect(validateRepoDir("services/shop/api", root).valid).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects duplicate and nested destination entries", () => {
    const root = mkdtempSync(join(tmpdir(), "flisk-validate-"));
    try {
      const dup = validateRepoList(
        [
          { url: "https://github.com/org/a.git", dir: "services/a" },
          { url: "https://github.com/org/b.git", dir: "services/a" },
        ],
        root,
      );
      expect(dup.valid).toBe(false);
      expect(dup.reason).toMatch(/Duplicate destination/);
      const nested = validateRepoList(
        [
          { url: "https://github.com/org/a.git", dir: "services/a" },
          { url: "https://github.com/org/b.git", dir: "services/a/b" },
        ],
        root,
      );
      expect(nested.valid).toBe(false);
      expect(nested.reason).toMatch(/nested/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("project-repos/clone (leaf module)", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "flisk-clone-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("clones with a fake spawner and reports the result", async () => {
    const seen: string[][] = [];
    const runner = async (args: string[]): Promise<string> => {
      seen.push(args);
      mkdirSync(args[args.length - 1] as string, { recursive: true });
      return "";
    };
    const result = await cloneRepo(
      { url: "https://github.com/org/repo.git", dir: "services/repo" },
      root,
      runner,
    );
    expect(result).toEqual({
      url: "https://github.com/org/repo.git",
      dir: "services/repo",
      cloned: true,
      skipped: false,
    });
    expect(seen[0]?.[0]).toBe("clone");
    expect(existsSync(join(root, "services/repo"))).toBe(true);
  });

  it("propagates a spawner failure as a FliskError with the token redacted", async () => {
    const runner = async (): Promise<string> => {
      throw new Error("fatal: could not read from remote repository");
    };
    await expect(
      cloneRepo(
        { url: "https://secret-token@github.com/org/repo.git", dir: "services/repo" },
        root,
        runner,
      ),
    ).rejects.toThrow(FliskError);
    await expect(
      cloneRepo(
        { url: "https://secret-token@github.com/org/repo.git", dir: "services/repo" },
        root,
        runner,
      ),
    ).rejects.toThrow(/https:\/\/\*\*\*@github\.com/);
    expect(existsSync(join(root, "services/repo"))).toBe(false);
  });

  it("redacts user-info from URLs", () => {
    expect(redactRepoUrl("https://token123@github.com/org/repo.git")).toBe(
      "https://***@github.com/org/repo.git",
    );
  });

  it("cloneMissingRepos returns [] for an empty list", async () => {
    await expect(cloneMissingRepos(root, [])).resolves.toEqual([]);
  });
});

describe("project-repos/report (leaf module)", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "flisk-report-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("reports a fixture tree: missing, non-git folder, and clean clone", async () => {
    // Present but not a git repo.
    mkdirSync(join(root, "services/plain"), { recursive: true });
    // A real, clean git repo.
    const cloned = join(root, "services/cloned");
    mkdirSync(cloned, { recursive: true });
    execFileSync("git", ["init", "-q", cloned]);
    execFileSync("git", ["-C", cloned, "config", "user.email", "test@flisk.dev"]);
    execFileSync("git", ["-C", cloned, "config", "user.name", "Flisk Test"]);
    writeFileSync(join(cloned, "README.md"), "hi\n");
    execFileSync("git", ["-C", cloned, "add", "."]);
    execFileSync("git", ["-C", cloned, "commit", "-qm", "init"]);

    const result = await checkProjectRepos(root, [
      { url: "https://github.com/org/missing.git", dir: "services/missing" },
      { url: "https://github.com/org/plain.git", dir: "services/plain" },
      { url: "https://github.com/org/cloned.git", dir: "services/cloned" },
    ]);
    expect(result.didPass).toBe(false);
    expect(result.message).toMatch(/2 service repository missing/);
    expect(result.message).toMatch(/services\/missing/);
    expect(result.message).toMatch(/not a Git repository/);
  });
});
