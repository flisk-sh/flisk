// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { runFlisk } from "../../test-support/index.js";
import { restartCommand } from "../restart.js";

it("shows examples in restart help", () => {
  let help = "";
  restartCommand.configureOutput({ writeOut: (text) => (help += text) });
  restartCommand.outputHelp();
  expect(help).toContain("Examples:");
  expect(help).toContain("flisk restart orders-api");
});

it("documents --rebuild in restart help", () => {
  let help = "";
  restartCommand.configureOutput({ writeOut: (text) => (help += text) });
  restartCommand.outputHelp();
  expect(help).toContain("--rebuild");
  expect(help).toContain("Rebuild the image through Tilt");
  expect(help).toContain("flisk restart orders-api --rebuild");
});

describe("restart without a resource", () => {
  it("names flisk resources in the help-after-error hint", () => {
    const hint = (restartCommand as unknown as { _showHelpAfterError?: string })
      ._showHelpAfterError;
    expect(hint).toContain("flisk resources");
    expect(hint).toContain("resource names");
  });

  it("prints the hint when invoked without an argument", () => {
    const result = runFlisk(["restart"], { cwd: process.cwd() });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("missing required argument 'resource'");
    expect(result.stderr).toContain("Run `flisk resources`");
  });
});
