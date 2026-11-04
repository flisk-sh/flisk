// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTempDir, runCommandInProcess } from "../../test-support/index.js";
import {
  type ConnectHost,
  connectAgentHost,
  resolveConnectHost,
  tomlServerBlock,
} from "../../utils/agent-connect.js";
import { agentSkillFiles, PROJECT_AGENT_SKILLS } from "../../utils/agent-skills.js";
import { FliskError } from "../../utils/errors.js";

const dirs: string[] = [];
function tempDir(prefix: string): string {
  const dir = createTempDir(prefix);
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** Every file under `dir` as a map of relative path to content, so a test can prove what was (not) written. */
function snapshot(root: string, dir = root, out: Record<string, string> = {}) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) snapshot(root, full, out);
    else out[path.relative(root, full)] = fs.readFileSync(full, "utf-8");
  }
  return out;
}

function connect(
  host: ConnectHost,
  project: string,
  home: string,
  extra: { dryRun?: boolean; force?: boolean; scope?: "project" | "global" } = {},
) {
  return connectAgentHost({
    host,
    scope: extra.scope ?? "project",
    projectRoot: project,
    homeDir: home,
    dryRun: extra.dryRun,
    force: extra.force,
    platform: "darwin",
  });
}

const readJson = (file: string) => JSON.parse(fs.readFileSync(file, "utf-8"));

describe("flisk connect: Claude Code", () => {
  it("writes .mcp.json and the Flisk skills to .claude/skills in an empty project", () => {
    const project = tempDir("flisk-connect-claude-");
    const home = tempDir("flisk-connect-home-");
    const result = connect("claude", project, home);

    expect(readJson(path.join(project, ".mcp.json"))).toEqual({
      mcpServers: { flisk: { command: "flisk", args: ["mcp"] } },
    });
    for (const { rel, contents } of agentSkillFiles([".claude/skills"])) {
      expect(fs.readFileSync(path.join(project, rel), "utf-8")).toBe(contents);
    }
    expect(result.changes.filter((c) => c.kind === "skill")).toHaveLength(
      PROJECT_AGENT_SKILLS.length,
    );
    expect(result.changes.every((c) => c.action === "create")).toBe(true);
    // Only .claude/ and .mcp.json: no AGENTS.md, no .agents/, nothing in the home directory.
    expect(fs.readdirSync(project).sort()).toEqual([".claude", ".mcp.json"]);
    expect(snapshot(home)).toEqual({});
  });

  it("merges into an existing .mcp.json without dropping other servers or keys", () => {
    const project = tempDir("flisk-connect-claude-");
    const file = path.join(project, ".mcp.json");
    const other = { command: "npx", args: ["-y", "@example/other-mcp"], env: { LEVEL: "1" } };
    fs.writeFileSync(file, JSON.stringify({ mcpServers: { other }, extra: true }));

    const result = connect("claude", project, tempDir("flisk-connect-home-"));

    expect(readJson(file)).toEqual({
      mcpServers: { other, flisk: { command: "flisk", args: ["mcp"] } },
      extra: true,
    });
    expect(result.changes[0]).toMatchObject({ kind: "mcp", action: "update" });
  });

  it("changes nothing on a second run", () => {
    const project = tempDir("flisk-connect-claude-");
    const home = tempDir("flisk-connect-home-");
    connect("claude", project, home);
    const before = snapshot(project);

    const second = connect("claude", project, home);

    expect(snapshot(project)).toEqual(before);
    expect(second.changes.every((c) => c.action === "unchanged")).toBe(true);
  });

  it("--dry-run reports the plan and writes nothing", () => {
    const project = tempDir("flisk-connect-claude-");
    fs.writeFileSync(path.join(project, ".mcp.json"), '{"mcpServers":{"other":{"command":"x"}}}');
    const before = snapshot(project);

    const result = connect("claude", project, tempDir("flisk-connect-home-"), { dryRun: true });

    expect(snapshot(project)).toEqual(before);
    expect(result.dryRun).toBe(true);
    expect(result.changes[0]).toMatchObject({ kind: "mcp", action: "update" });
    expect(result.changes.filter((c) => c.action === "create")).toHaveLength(
      PROJECT_AGENT_SKILLS.length,
    );
  });

  it("keeps a different flisk entry and an edited skill unless --force", () => {
    const project = tempDir("flisk-connect-claude-");
    const home = tempDir("flisk-connect-home-");
    const file = path.join(project, ".mcp.json");
    const custom = { command: "/opt/flisk/bin/flisk", args: ["mcp"] };
    fs.writeFileSync(file, JSON.stringify({ mcpServers: { flisk: custom } }));
    const skill = path.join(project, ".claude/skills/flisk-up/SKILL.md");
    fs.mkdirSync(path.dirname(skill), { recursive: true });
    fs.writeFileSync(skill, "my own notes\n");

    const kept = connect("claude", project, home);
    expect(readJson(file).mcpServers.flisk).toEqual(custom);
    expect(fs.readFileSync(skill, "utf-8")).toBe("my own notes\n");
    expect(kept.changes.filter((c) => c.action === "kept").map((c) => c.path)).toEqual([
      file,
      skill,
    ]);

    const forced = connect("claude", project, home, { force: true });
    expect(readJson(file).mcpServers.flisk).toEqual({ command: "flisk", args: ["mcp"] });
    expect(fs.readFileSync(skill, "utf-8")).not.toBe("my own notes\n");
    expect(forced.changes.filter((c) => c.action === "update")).toHaveLength(2);
  });

  it("refuses a config it cannot parse and writes nothing", () => {
    const project = tempDir("flisk-connect-claude-");
    fs.writeFileSync(path.join(project, ".mcp.json"), "{ not json");
    const before = snapshot(project);

    expect(() => connect("claude", project, tempDir("flisk-connect-home-"))).toThrow(FliskError);
    expect(snapshot(project)).toEqual(before);
  });

  it("refuses --global, pointing at claude mcp add --scope user", () => {
    const home = tempDir("flisk-connect-home-");
    let error: unknown;
    try {
      connect("claude", tempDir("flisk-connect-claude-"), home, { scope: "global" });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(FliskError);
    expect((error as FliskError).suggestions.join("\n")).toContain(
      "claude mcp add --scope user flisk -- flisk mcp",
    );
    expect(snapshot(home)).toEqual({});
  });
});

describe("flisk connect: Cursor", () => {
  it("writes .cursor/mcp.json pinned to the workspace folder and skills to .agents/skills", () => {
    const project = tempDir("flisk-connect-cursor-");
    connect("cursor", project, tempDir("flisk-connect-home-"));

    expect(readJson(path.join(project, ".cursor/mcp.json"))).toEqual({
      mcpServers: {
        flisk: {
          type: "stdio",
          command: "sh",
          // Cursor expands the variable itself; the file holds it literally.
          args: ["-c", 'cd "$' + '{workspaceFolder}" && exec flisk mcp'],
        },
      },
    });
    for (const { rel } of agentSkillFiles([".agents/skills"])) {
      expect(fs.existsSync(path.join(project, rel))).toBe(true);
    }
    expect(fs.existsSync(path.join(project, ".claude"))).toBe(false);
  });

  it("uses the plain flisk entry on Windows, where there is no sh", () => {
    const project = tempDir("flisk-connect-cursor-");
    connectAgentHost({
      host: "cursor",
      scope: "project",
      projectRoot: project,
      homeDir: tempDir("flisk-connect-home-"),
      platform: "win32",
    });
    expect(readJson(path.join(project, ".cursor/mcp.json")).mcpServers.flisk).toEqual({
      type: "stdio",
      command: "flisk",
      args: ["mcp"],
    });
  });

  it("--global writes only ~/.cursor/mcp.json, merged, and nothing in the project", () => {
    const project = tempDir("flisk-connect-cursor-");
    const home = tempDir("flisk-connect-home-");
    const file = path.join(home, ".cursor/mcp.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ mcpServers: { other: { command: "x" } } }));

    const result = connect("cursor", project, home, { scope: "global" });

    expect(Object.keys(readJson(file).mcpServers).sort()).toEqual(["flisk", "other"]);
    expect(result.changes).toEqual([{ path: file, kind: "mcp", action: "update" }]);
    expect(snapshot(project)).toEqual({});
  });
});

describe("flisk connect: Codex", () => {
  it("writes .codex/config.toml with cwd pinned to the project", () => {
    const project = tempDir("flisk-connect-codex-");
    connect("codex", project, tempDir("flisk-connect-home-"));

    expect(fs.readFileSync(path.join(project, ".codex/config.toml"), "utf-8")).toBe(
      `[mcp_servers.flisk]\ncommand = "flisk"\nargs = ["mcp"]\ncwd = ${JSON.stringify(project)}\n`,
    );
    expect(fs.existsSync(path.join(project, ".agents/skills/flisk-build/SKILL.md"))).toBe(true);
  });

  it("appends to an existing config.toml, keeps other tables, and is idempotent", () => {
    const project = tempDir("flisk-connect-codex-");
    const home = tempDir("flisk-connect-home-");
    const file = path.join(project, ".codex/config.toml");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const original = 'model = "o4"\n\n[mcp_servers.other]\ncommand = "other"\n';
    fs.writeFileSync(file, original);

    connect("codex", project, home);
    const merged = fs.readFileSync(file, "utf-8");
    expect(merged).toBe(`${original}\n${tomlServerBlock(project)}`);

    const second = connect("codex", project, home);
    expect(fs.readFileSync(file, "utf-8")).toBe(merged);
    expect(second.changes[0].action).toBe("unchanged");
  });

  it("--force replaces only the flisk table and keeps the tables after it", () => {
    const project = tempDir("flisk-connect-codex-");
    const file = path.join(project, ".codex/config.toml");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      '[mcp_servers.flisk]\ncommand = "old"\n\n[mcp_servers.other]\ncommand = "o"\n',
    );

    const kept = connect("codex", project, tempDir("flisk-connect-home-"));
    expect(kept.changes[0].action).toBe("kept");

    connect("codex", project, tempDir("flisk-connect-home-"), { force: true });
    expect(fs.readFileSync(file, "utf-8")).toBe(
      `${tomlServerBlock(project)}\n[mcp_servers.other]\ncommand = "o"\n`,
    );
  });

  it("--global writes ~/.codex/config.toml without a project cwd", () => {
    const home = tempDir("flisk-connect-home-");
    connect("codex", tempDir("flisk-connect-codex-"), home, { scope: "global" });
    expect(fs.readFileSync(path.join(home, ".codex/config.toml"), "utf-8")).toBe(
      tomlServerBlock(null),
    );
  });
});

describe("flisk connect: host names", () => {
  it("accepts claude-code as an alias", () => {
    expect(resolveConnectHost("claude-code")).toBe("claude");
    expect(resolveConnectHost("Cursor")).toBe("cursor");
  });

  it("rejects an unknown host with exit code 2 and suggestions", () => {
    let error: unknown;
    try {
      resolveConnectHost("cursr");
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(FliskError);
    expect((error as FliskError).exitCode).toBe(2);
    expect((error as FliskError).message).toContain("claude, cursor, codex");
    expect((error as FliskError).suggestions[0]).toContain('Did you mean "cursor"?');
  });
});

describe("flisk connect: the command", () => {
  // Commander keeps option values between parses of one command object, so each case imports a fresh one.
  async function freshCommand(): Promise<Command> {
    vi.resetModules();
    return (await import("../connect.js")).connectCommand;
  }

  it("--json prints one envelope with the changes", async () => {
    const project = tempDir("flisk-connect-cmd-");
    const result = await runCommandInProcess(await freshCommand(), ["claude", "--json"], project);
    expect(result.status ?? 0).toBe(0);
    const envelope = JSON.parse(result.stdout);
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.errors).toEqual([]);
    expect(envelope.data).toMatchObject({ ok: true, host: "claude", scope: "project" });
    expect(fs.realpathSync(envelope.data.projectRoot)).toBe(fs.realpathSync(project));
    expect(envelope.data.changes[0]).toMatchObject({ kind: "mcp", action: "create" });
    expect(fs.existsSync(path.join(project, ".mcp.json"))).toBe(true);
  });

  it("--json with an unknown host prints a null-data envelope and exits 2", async () => {
    const project = tempDir("flisk-connect-cmd-");
    const result = await runCommandInProcess(await freshCommand(), ["vscode", "--json"], project);
    expect(result.status).toBe(2);
    const envelope = JSON.parse(result.stdout);
    expect(envelope.data).toBeNull();
    expect(envelope.errors[0].message).toContain('Unknown agent host "vscode"');
    expect(envelope.errors[0].suggestions.length).toBeGreaterThan(0);
    expect(snapshot(project)).toEqual({});
  });

  it("--dry-run prints the plan and writes nothing", async () => {
    const project = tempDir("flisk-connect-cmd-");
    const result = await runCommandInProcess(
      await freshCommand(),
      ["cursor", "--dry-run"],
      project,
    );
    expect(result.status ?? 0).toBe(0);
    expect(result.stdout).toContain("Dry run - would connect Flisk to Cursor");
    expect(result.stdout).toContain(".cursor/mcp.json");
    expect(result.stdout).toContain(
      `.agents/skills/  (${PROJECT_AGENT_SKILLS.length} Flisk skills)`,
    );
    expect(snapshot(project)).toEqual({});
  });

  it("refuses --project together with --global", async () => {
    const project = tempDir("flisk-connect-cmd-");
    const result = await runCommandInProcess(
      await freshCommand(),
      ["cursor", "--project", "--global"],
      project,
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Choose one of --project and --global");
  });
});
