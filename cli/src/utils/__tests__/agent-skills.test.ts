// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AGENT_SKILL_DIRS,
  installAgentSkills,
  PROJECT_AGENT_SKILLS,
  PROJECT_AGENTS_MD,
  rewriteSkillLinks,
} from "../agent-skills.js";

const repoRoot = resolve(__dirname, "../../../..");
const templatesDir = join(repoRoot, "cli", "templates", "agent-skills");

describe("agent skills shipped to new projects", () => {
  let root = "";
  afterEach(() => {
    if (root.startsWith(tmpdir())) rmSync(root, { recursive: true, force: true });
  });

  it("ships exactly the listed skills, each identical to .claude/skills", () => {
    expect(readdirSync(templatesDir).sort()).toEqual([...PROJECT_AGENT_SKILLS].sort());
    for (const name of PROJECT_AGENT_SKILLS) {
      const shipped = readFileSync(join(templatesDir, name, "SKILL.md"), "utf-8");
      const source = readFileSync(join(repoRoot, ".claude", "skills", name, "SKILL.md"), "utf-8");
      // When this fails, copy .claude/skills/<name>/SKILL.md to cli/templates/agent-skills/<name>/.
      expect(shipped, name).toBe(source);
    }
  });

  it("points repository-relative docs links at GitHub", () => {
    expect(
      rewriteSkillLinks("see [jobs](../../../docs/byo.md#one-shot) and [x](https://a.b/c)"),
    ).toBe(
      "see [jobs](https://github.com/flisk-sh/flisk/blob/main/docs/byo.md#one-shot) and [x](https://a.b/c)",
    );
  });

  it("writes every skill for Claude Code and other agents, plus AGENTS.md", () => {
    root = mkdtempSync(join(tmpdir(), "flisk-agent-skills-"));
    const written = installAgentSkills(root);
    expect(written).toHaveLength(PROJECT_AGENT_SKILLS.length * AGENT_SKILL_DIRS.length + 1);
    for (const dir of AGENT_SKILL_DIRS) {
      for (const name of PROJECT_AGENT_SKILLS) {
        const file = readFileSync(join(root, dir, name, "SKILL.md"), "utf-8");
        expect(file).toContain(`name: ${name}`);
        expect(file).not.toContain("](../");
      }
    }
    expect(readFileSync(join(root, "AGENTS.md"), "utf-8")).toBe(PROJECT_AGENTS_MD);
  });

  it("never overwrites a file that already exists", () => {
    root = mkdtempSync(join(tmpdir(), "flisk-agent-skills-"));
    mkdirSync(join(root, ".claude", "skills", "flisk-build"), { recursive: true });
    writeFileSync(join(root, ".claude", "skills", "flisk-build", "SKILL.md"), "mine");
    writeFileSync(join(root, "AGENTS.md"), "# my rules\n");

    const written = installAgentSkills(root);

    expect(readFileSync(join(root, ".claude", "skills", "flisk-build", "SKILL.md"), "utf-8")).toBe(
      "mine",
    );
    expect(readFileSync(join(root, "AGENTS.md"), "utf-8")).toBe("# my rules\n");
    expect(written).not.toContain("AGENTS.md");
    expect(existsSync(join(root, ".agents", "skills", "flisk-build", "SKILL.md"))).toBe(true);
    expect(installAgentSkills(root)).toEqual([]);
  });
});
