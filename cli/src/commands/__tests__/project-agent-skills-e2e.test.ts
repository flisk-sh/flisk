// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runFlisk } from "./project-e2e-helpers.js";

describe("flisk project writes the agent skills", () => {
  let root = "";
  afterEach(() => {
    if (root.startsWith(tmpdir())) rmSync(root, { recursive: true, force: true });
  });

  it("adds flisk-build for Claude Code and other agents, and AGENTS.md", () => {
    root = mkdtempSync(join(tmpdir(), "flisk-project-skills-"));
    const out = runFlisk(["project", "--yes"], root);
    expect(out).toContain("Added agent skills");
    expect(existsSync(join(root, ".claude", "skills", "flisk-build", "SKILL.md"))).toBe(true);
    expect(existsSync(join(root, ".agents", "skills", "flisk-build", "SKILL.md"))).toBe(true);
    expect(existsSync(join(root, "AGENTS.md"))).toBe(true);
  }, 120_000);

  it("skips them with --no-agent-skills", () => {
    root = mkdtempSync(join(tmpdir(), "flisk-project-skills-"));
    runFlisk(["project", "--yes", "--no-agent-skills"], root);
    expect(existsSync(join(root, ".flisk", "project.json"))).toBe(true);
    expect(existsSync(join(root, ".claude"))).toBe(false);
    expect(existsSync(join(root, ".agents"))).toBe(false);
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
  }, 120_000);
});
