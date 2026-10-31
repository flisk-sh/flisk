// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTempDir, runFlisk } from "../../test-support/index.js";
import { FliskError } from "../../utils/errors.js";
import { listProjectTemplates, PROJECT_TEMPLATES } from "../../utils/project-templates.js";
import { cloneProjectTemplate, printTemplateCatalog } from "../project.js";

const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();

/** A local repository with two commits; returns its path and the first commit's SHA. */
function twoCommitRepo(): { repo: string; first: string } {
  const repo = createTempDir("flisk-template-repo-");
  git(repo, "init", "--quiet");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "user.name", "Test");
  writeFileSync(join(repo, "version.txt"), "one\n");
  git(repo, "add", ".");
  git(repo, "commit", "--quiet", "-m", "one");
  const first = git(repo, "rev-parse", "HEAD");
  writeFileSync(join(repo, "version.txt"), "two\n");
  git(repo, "commit", "--quiet", "-am", "two");
  return { repo, first };
}

const TEST_KEY = "pinned-test-template";

afterEach(() => {
  delete PROJECT_TEMPLATES[TEST_KEY];
  vi.restoreAllMocks();
});

describe("flisk project --list", () => {
  it("prints the catalog as a stable JSON array with --json", () => {
    const result = runFlisk(["project", "--list", "--json"], { cwd: createTempDir() });
    expect(result.status, result.stderr).toBe(0);
    const rows = JSON.parse(result.stdout);
    expect(rows).toEqual(listProjectTemplates());
    expect(rows.map((row: { key: string }) => row.key)).toEqual(Object.keys(PROJECT_TEMPLATES));
    for (const row of rows) {
      expect(Object.keys(row)).toEqual(
        row.ref ? ["key", "repo", "description", "ref"] : ["key", "repo", "description"],
      );
    }
    expect(rows.find((row: { key: string }) => row.key === "launch")).toEqual({
      key: "launch",
      repo: "https://github.com/flisk-sh/flisk-template-launch.git",
      description: PROJECT_TEMPLATES.launch.description,
      ref: "f97e03a11d026715573a610a8370c3c7546c5af8",
    });
  });

  it("prints each template's key, repo, description and ref for a person", () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => {
      lines.push(String(line));
    });
    printTemplateCatalog(false);
    const text = lines.join("\n");
    for (const { key, repo, description, ref } of listProjectTemplates()) {
      expect(text).toContain(key);
      expect(text).toContain(repo);
      expect(text).toContain(description);
      if (ref) expect(text).toContain(`ref ${ref}`);
    }
    expect(text).not.toContain("ref undefined");
  });
});

describe("cloneProjectTemplate with a pinned ref", () => {
  it("checks out exactly the pinned commit after cloning", async () => {
    const { repo, first } = twoCommitRepo();
    PROJECT_TEMPLATES[TEST_KEY] = { repo, ref: first, description: "pinned" };
    const destination = join(createTempDir(), "app");
    await cloneProjectTemplate(TEST_KEY, destination, [], { quiet: true });
    expect(git(destination, "rev-parse", "HEAD")).toBe(first);
  });

  it("stays on the default branch when no ref is set", async () => {
    const { repo } = twoCommitRepo();
    PROJECT_TEMPLATES[TEST_KEY] = { repo, description: "unpinned" };
    const destination = join(createTempDir(), "app");
    await cloneProjectTemplate(TEST_KEY, destination, [], { quiet: true });
    expect(git(destination, "rev-parse", "HEAD")).toBe(git(repo, "rev-parse", "HEAD"));
  });

  it("reports a pinned commit that the repository does not have", async () => {
    const { repo } = twoCommitRepo();
    const missing = "0".repeat(40);
    PROJECT_TEMPLATES[TEST_KEY] = { repo, ref: missing, description: "bad pin" };
    const destination = join(createTempDir(), "app");
    const failure = cloneProjectTemplate(TEST_KEY, destination, [], { quiet: true });
    await expect(failure).rejects.toBeInstanceOf(FliskError);
    await expect(
      cloneProjectTemplate(TEST_KEY, join(createTempDir(), "again"), [], { quiet: true }),
    ).rejects.toThrow(`git checkout of the pinned commit ${missing} failed`);
  });
});
