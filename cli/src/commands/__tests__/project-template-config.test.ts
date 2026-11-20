// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTempDir, parseEnvelope, runFlisk } from "../../test-support/index.js";
import { PROJECT_TEMPLATES } from "../../utils/project-templates.js";
import { cloneProjectTemplate } from "../project.js";

const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();

/** A local repository with a single commit; returns its path. */
function singleCommitRepo(files: Record<string, string> = {}): string {
  const repo = createTempDir("flisk-template-repo-");
  git(repo, "init", "--quiet");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "user.name", "Test");
  for (const [path, content] of Object.entries(files)) {
    const dir = dirname(join(repo, path));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(repo, path), content);
  }
  if (Object.keys(files).length > 0) {
    git(repo, "add", ".");
    git(repo, "commit", "--quiet", "-m", "initial");
  }
  return repo;
}

const TEST_KEY = "config-test-template";

afterEach(() => {
  delete PROJECT_TEMPLATES[TEST_KEY];
});

describe("cloneProjectTemplate project config", () => {
  it("copies the bundled example with a project config", async () => {
    const dest = join(createTempDir(), "flisk-example");
    await cloneProjectTemplate("example", dest, [], { quiet: true });
    expect(existsSync(join(dest, ".flisk", "project.json"))).toBe(true);
    const config = JSON.parse(readFileSync(join(dest, ".flisk", "project.json"), "utf-8"));
    expect(config.project.name).toBe("flisk-example");
    expect(config.discovery.paths).toEqual(["services/*/*"]);
  });

  it("makes the copied example a project root", async () => {
    const dest = join(createTempDir(), "flisk-example");
    await cloneProjectTemplate("example", dest, [], { quiet: true });
    const result = runFlisk(["project", "--check", "--json"], { cwd: dest });
    const data = parseEnvelope(result.stdout).data;
    expect(data.hasProjectJson).toBe(true);
  });

  it("passes config verify on the first run after scaffolding (#4196)", async () => {
    const dest = join(createTempDir(), "flisk-example");
    await cloneProjectTemplate("example", dest, [], { quiet: true });

    const result = runFlisk(["config", "verify", "--json"], { cwd: dest });
    expect(result.status, result.stderr).toBe(0);
    expect(parseEnvelope(result.stdout).data.valid).toBe(true);
  }, 120_000);

  it("writes a project config for a cloned repo template", async () => {
    const repo = singleCommitRepo({ "version.txt": "1.0" });
    PROJECT_TEMPLATES[TEST_KEY] = {
      repo: pathToFileURL(repo).href,
      description: "test template",
    };
    const dest = join(createTempDir(), "my-app");
    await cloneProjectTemplate(TEST_KEY, dest, [], { quiet: true });
    expect(existsSync(join(dest, ".flisk", "project.json"))).toBe(true);
    const config = JSON.parse(readFileSync(join(dest, ".flisk", "project.json"), "utf-8"));
    expect(config.project.name).toBe("my-app");
  });

  it("keeps a project config the template already ships", async () => {
    const repo = singleCommitRepo({
      ".flisk/project.json": JSON.stringify({
        version: "1.0",
        project: { name: "already-here" },
      }),
    });
    PROJECT_TEMPLATES[TEST_KEY] = {
      repo: pathToFileURL(repo).href,
      description: "test template",
    };
    const dest = join(createTempDir(), "my-app");
    await cloneProjectTemplate(TEST_KEY, dest, [], { quiet: true });
    expect(existsSync(join(dest, ".flisk", "project.json"))).toBe(true);
    const config = JSON.parse(readFileSync(join(dest, ".flisk", "project.json"), "utf-8"));
    expect(config.project.name).toBe("already-here");
  });

  it("points at config regenerate when a starter config cannot generate files (#4196)", async () => {
    const repo = singleCommitRepo({
      ".flisk/project.json": JSON.stringify({
        version: "1.0",
        project: { name: "incomplete" },
      }),
    });
    PROJECT_TEMPLATES[TEST_KEY] = {
      repo: pathToFileURL(repo).href,
      description: "test template",
    };
    const dest = join(createTempDir(), "my-app");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await cloneProjectTemplate(TEST_KEY, dest, [], {});
      expect(warnSpy.mock.calls.flat().join("\n")).toContain("Could not generate the master files");
      expect(logSpy.mock.calls.flat().join("\n")).toContain("flisk config regenerate");
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it("writes a project config into a generated local-process starter (#4292)", async () => {
    const dest = join(createTempDir(), "swarm-app");
    await cloneProjectTemplate("swarm", dest, [], { quiet: true });
    expect(existsSync(join(dest, ".flisk", "project.json"))).toBe(true);
    const config = JSON.parse(readFileSync(join(dest, ".flisk", "project.json"), "utf-8"));
    expect(config.project.name).toBe("swarm-app");
  });
});
