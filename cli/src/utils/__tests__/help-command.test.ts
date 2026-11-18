// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { parseEnvelope, runFlisk } from "../../test-support/index.js";
import { resolveHelpTarget, unknownHelpTarget } from "../help-command.js";

function makeCommands(): Command[] {
  const up = new Command("up").alias("deploy");
  const status = new Command("status");
  const mcp = new Command("mcp");
  mcp.addCommand(new Command("check"));
  const config = new Command("config");
  config.addCommand(new Command("verify").alias("v"));
  return [up, status, mcp, config];
}

describe("unknownHelpTarget", () => {
  it("returns the name when `help` is given something that is not a command", () => {
    expect(unknownHelpTarget(["help", "bogus"], makeCommands())).toBe("bogus");
  });

  it("accepts command names and aliases", () => {
    const commands = makeCommands();
    expect(unknownHelpTarget(["help", "up"], commands)).toBeUndefined();
    expect(unknownHelpTarget(["help", "deploy"], commands)).toBeUndefined();
  });

  it("ignores everything that is not `help <name>`", () => {
    const commands = makeCommands();
    expect(unknownHelpTarget(["help"], commands)).toBeUndefined();
    expect(unknownHelpTarget(["help", "--help"], commands)).toBeUndefined();
    expect(unknownHelpTarget(["bogus"], commands)).toBeUndefined();
    expect(unknownHelpTarget([], commands)).toBeUndefined();
  });

  it("checks every command, not just the first", () => {
    expect(unknownHelpTarget(["help", "status"], makeCommands())).toBeUndefined();
  });

  it("treats every name as unknown when there are no commands", () => {
    expect(unknownHelpTarget(["help", "up"], [])).toBe("up");
  });

  it("walks nested subcommands and catches unknown second words", () => {
    const commands = makeCommands();
    expect(unknownHelpTarget(["help", "mcp", "check"], commands)).toBeUndefined();
    expect(unknownHelpTarget(["help", "config", "v"], commands)).toBeUndefined();
    expect(unknownHelpTarget(["help", "mcp", "bogus"], commands)).toBe("bogus");
    expect(unknownHelpTarget(["help", "up", "bogus"], commands)).toBe("bogus");
    expect(unknownHelpTarget(["up", "help", "bogus"], commands)).toBeUndefined();
  });
});

describe("resolveHelpTarget (#4486)", () => {
  it("resolves nested subcommands and returns their Command at depth 2", () => {
    const commands = makeCommands();
    const resolved = resolveHelpTarget(["help", "mcp", "check"], commands);
    expect(resolved.unknown).toBeUndefined();
    expect(resolved.depth).toBe(2);
    expect(resolved.command?.name()).toBe("check");
  });

  it("resolves nested help after a leading root flag", () => {
    const resolved = resolveHelpTarget(["--verbose", "help", "mcp", "check"], makeCommands());
    expect(resolved.depth).toBe(2);
    expect(resolved.command?.name()).toBe("check");
    expect(resolveHelpTarget(["--verbose"], makeCommands()).depth).toBe(0);
    expect(resolveHelpTarget([], makeCommands()).depth).toBe(0);
  });

  it("stops collecting path words at flags like --json", () => {
    const commands = makeCommands();
    const resolved = resolveHelpTarget(["help", "mcp", "check", "--json"], commands);
    expect(resolved.unknown).toBeUndefined();
    expect(resolved.depth).toBe(2);
    expect(resolved.command?.name()).toBe("check");
  });
});

describe("CLI `flisk help <cmd> <sub>` matches `flisk <cmd> <sub> --help` (#4486)", () => {
  for (const path of [
    ["mcp", "check"],
    ["config", "verify"],
    ["agent", "sessions"],
    ["tool", "add"],
  ]) {
    it(`flisk help ${path.join(" ")} equals flisk ${path.join(" ")} --help`, () => {
      const viaHelp = runFlisk(["help", ...path], { cwd: process.cwd() });
      const viaFlag = runFlisk([...path, "--help"], { cwd: process.cwd() });
      expect(viaHelp.status).toBe(0);
      expect(viaHelp.stderr).toBe("");
      expect(viaHelp.stdout).toBe(viaFlag.stdout);
    });
  }

  it("prints an unknown-command error and exits 1 for `flisk help mcp bogus`", () => {
    const result = runFlisk(["help", "mcp", "bogus"], { cwd: process.cwd() });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("error: unknown command 'bogus'");
  });

  it("returns the USAGE JSON envelope for `flisk help config bogus --json`", () => {
    const result = runFlisk(["help", "config", "bogus", "--json"], { cwd: process.cwd() });
    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    const env = parseEnvelope(result.stdout);
    expect(env.errors).toHaveLength(1);
    expect((env.errors[0] as { message: string }).message).toBe("error: unknown command 'bogus'");
  });
});
