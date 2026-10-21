// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { unknownHelpTarget } from "../help-command.js";

const commands = [new Command("up").alias("deploy"), new Command("status")];

describe("unknownHelpTarget", () => {
  it("returns the name when `help` is given something that is not a command", () => {
    expect(unknownHelpTarget(["help", "bogus"], commands)).toBe("bogus");
  });

  it("accepts command names and aliases", () => {
    expect(unknownHelpTarget(["help", "up"], commands)).toBeUndefined();
    expect(unknownHelpTarget(["help", "deploy"], commands)).toBeUndefined();
  });

  it("ignores everything that is not `help <name>`", () => {
    expect(unknownHelpTarget(["help"], commands)).toBeUndefined();
    expect(unknownHelpTarget(["help", "--help"], commands)).toBeUndefined();
    expect(unknownHelpTarget(["bogus"], commands)).toBeUndefined();
    expect(unknownHelpTarget([], commands)).toBeUndefined();
  });

  it("checks every command, not just the first", () => {
    expect(unknownHelpTarget(["help", "status"], commands)).toBeUndefined();
  });

  it("treats every name as unknown when there are no commands", () => {
    expect(unknownHelpTarget(["help", "up"], [])).toBe("up");
  });

  it("only looks at the word right after `help`", () => {
    expect(unknownHelpTarget(["help", "up", "bogus"], commands)).toBeUndefined();
    expect(unknownHelpTarget(["up", "help", "bogus"], commands)).toBeUndefined();
  });
});
