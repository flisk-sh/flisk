// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTempDir, parseEnvelope, runFlisk } from "../../test-support/index.js";
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

  it("documents the envelope, not a bare array, in the --list help", () => {
    const result = runFlisk(["project", "--help"], { cwd: createTempDir() });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("data.templates");
    expect(result.stdout).not.toContain("a JSON array");
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

  it("leaves presentation files and their README links out of the clone (#4301)", async () => {
    const { repo } = twoCommitRepo();
    writeFileSync(join(repo, "SALES_PITCH.md"), "pitch");
    writeFileSync(join(repo, "DEMO_GUIDE.md"), "guide");
    writeFileSync(
      join(repo, "README.md"),
      "See [the pitch](SALES_PITCH.md) and [the walkthrough](DEMO_GUIDE.md).\n",
    );
    git(repo, "add", ".");
    git(repo, "commit", "--quiet", "-m", "docs");
    PROJECT_TEMPLATES[TEST_KEY] = {
      repo,
      description: "with docs",
      omit: ["SALES_PITCH.md", "DEMO_GUIDE.md"],
    };
    const destination = join(createTempDir(), "app");
    await cloneProjectTemplate(TEST_KEY, destination, [], { quiet: true });

    expect(existsSync(join(destination, "SALES_PITCH.md"))).toBe(false);
    expect(existsSync(join(destination, "DEMO_GUIDE.md"))).toBe(false);
    expect(existsSync(join(destination, "version.txt"))).toBe(true);
    expect(readFileSync(join(destination, "README.md"), "utf8")).toBe("");
  });

  it("leaves demo media and its README image out of the clone (#4285)", async () => {
    const { repo } = twoCommitRepo();
    mkdirSync(join(repo, "docs"), { recursive: true });
    mkdirSync(join(repo, "video", "shots"), { recursive: true });
    writeFileSync(join(repo, "docs", "demo.gif"), "gif");
    writeFileSync(join(repo, "docs", "demo.mp4"), "mp4");
    writeFileSync(join(repo, "video", "shots", "home.png"), "png");
    writeFileSync(
      join(repo, "README.md"),
      "[![demo](docs/demo.gif)](docs/demo.mp4)\n\n| shots | `video/shots.ts` |\n",
    );
    git(repo, "add", ".");
    git(repo, "commit", "--quiet", "-m", "media");
    PROJECT_TEMPLATES[TEST_KEY] = {
      repo,
      description: "with media",
      omit: ["docs/demo.gif", "docs/demo.mp4", "video/shots"],
    };
    const destination = join(createTempDir(), "app");
    await cloneProjectTemplate(TEST_KEY, destination, [], { quiet: true });

    expect(existsSync(join(destination, "docs", "demo.gif"))).toBe(false);
    expect(existsSync(join(destination, "docs", "demo.mp4"))).toBe(false);
    expect(existsSync(join(destination, "video", "shots"))).toBe(false);
    const readme = readFileSync(join(destination, "README.md"), "utf8");
    expect(readme).not.toContain("demo.gif");
    expect(readme).not.toContain("demo.mp4");
    expect(readme).toContain("`video/shots.ts`");
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
