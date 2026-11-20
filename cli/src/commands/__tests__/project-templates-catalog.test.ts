// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTempDir, parseEnvelope, runFlisk } from "../../test-support/index.js";
import { describeRequirements } from "../../utils/create-plan.js";
import { FliskError } from "../../utils/errors.js";
import {
  listProjectTemplates,
  PROJECT_TEMPLATES,
  starterNeeds,
} from "../../utils/project-templates.js";
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
  it("prints the catalog as a standard envelope with --json", () => {
    const result = runFlisk(["project", "--list", "--json"], { cwd: createTempDir() });
    expect(result.status, result.stderr).toBe(0);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.errors).toEqual([]);
    const rows = envelope.data.templates;
    expect(rows).toEqual(listProjectTemplates());
    expect(rows.map((row: { key: string }) => row.key)).toEqual(Object.keys(PROJECT_TEMPLATES));
    for (const row of rows) {
      expect(Object.keys(row)).toEqual(
        row.ref
          ? ["key", "repo", "description", "needs", "ref"]
          : ["key", "repo", "description", "needs"],
      );
    }
    expect(rows.find((row: { key: string }) => row.key === "launch")).toEqual({
      key: "launch",
      repo: "https://github.com/flisk-sh/flisk-template-launch.git",
      description: PROJECT_TEMPLATES.launch.description,
      needs: starterNeeds("launch"),
      ref: "f97e03a11d026715573a610a8370c3c7546c5af8",
    });
  });

  it("documents the envelope, not a bare array, in the --list help", () => {
    const result = runFlisk(["project", "--help"], { cwd: createTempDir() });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("data.templates");
    expect(result.stdout).not.toContain("a JSON array");
  });

  it("prints each template's key, repo, description, needs and ref for a person", () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => {
      lines.push(String(line));
    });
    printTemplateCatalog(false);
    const text = lines.join("\n");
    for (const { key, repo, description, needs, ref } of listProjectTemplates()) {
      expect(text).toContain(key);
      expect(text).toContain(repo);
      expect(text).toContain(description);
      expect(text).toContain(`needs: ${needs}`);
      if (ref) expect(text).toContain(`ref ${ref}`);
    }
    expect(text).not.toContain("ref undefined");
    expect(text).not.toContain("needs: undefined");
  });

  it("uses the one needs wording for the list and create's review", () => {
    for (const { key, needs } of listProjectTemplates()) {
      expect(
        describeRequirements({ name: "shop", starter: key, runtime: "docker", extras: [] }),
      ).toBe(needs);
      expect(needs).toBe(starterNeeds(key));
    }
  });

  it("agrees with create --starter --dry-run for every starter", () => {
    const result = runFlisk(["project", "--list", "--json"], { cwd: createTempDir() });
    expect(result.status, result.stderr).toBe(0);
    const rows = parseEnvelope(result.stdout).data.templates as {
      key: string;
      needs: string;
    }[];
    expect(rows).toHaveLength(17);

    for (const row of rows) {
      const dryRun = runFlisk(["create", "shop", "--yes", "--dry-run", "--starter", row.key], {
        cwd: createTempDir(),
        timeout: 30_000,
      });
      expect(dryRun.status, `${row.key}: ${dryRun.stdout}\n${dryRun.stderr}`).toBe(0);
      const needs = dryRun.stdout.match(/^needs: (.+)$/m)?.[1];
      expect(needs, `${row.key} dry run has a needs line`).toBeDefined();
      expect(needs, `${row.key} dry run and project --list disagree`).toBe(row.needs);
    }
  });
});

describe("cloneProjectTemplate with a pinned ref", () => {
  it("checks out exactly the pinned commit after cloning", async () => {
    const { repo, first } = twoCommitRepo();
    PROJECT_TEMPLATES[TEST_KEY] = { repo, ref: first, description: "pinned" };
    const destination = join(createTempDir(), "app");
    await cloneProjectTemplate(TEST_KEY, destination, [], { quiet: true });
    expect(git(destination, "rev-parse", "HEAD")).toBe(first);
    expect(git(destination, "rev-parse", "--is-shallow-repository")).toBe("false");
    expect(git(destination, "remote")).toBe("upstream");
    expect(git(destination, "remote", "get-url", "upstream")).toBe(repo);
    git(destination, "remote", "add", "origin", "https://example.com/my-app.git");
    expect(git(destination, "remote", "get-url", "origin")).toBe("https://example.com/my-app.git");
  });

  it("stays on the default branch when no ref is set", async () => {
    const { repo } = twoCommitRepo();
    // Git ignores --depth for a plain local path; file:// exercises a real shallow clone.
    PROJECT_TEMPLATES[TEST_KEY] = { repo: pathToFileURL(repo).href, description: "unpinned" };
    const destination = join(createTempDir(), "app");
    await cloneProjectTemplate(TEST_KEY, destination, [], { quiet: true });
    expect(git(destination, "rev-parse", "HEAD")).toBe(git(repo, "rev-parse", "HEAD"));
    expect(git(destination, "rev-list", "--count", "HEAD")).toBe("1");
    expect(git(destination, "rev-parse", "--is-shallow-repository")).toBe("true");
    expect(git(destination, "remote")).toBe("upstream");
    expect(git(destination, "remote", "get-url", "upstream")).toBe(pathToFileURL(repo).href);
    git(destination, "remote", "add", "origin", "https://example.com/my-app.git");
    expect(git(destination, "remote", "get-url", "origin")).toBe("https://example.com/my-app.git");
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
