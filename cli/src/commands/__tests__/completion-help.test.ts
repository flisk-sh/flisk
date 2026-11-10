// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { expect, it } from "vitest";
import { completionCommand } from "../completion.js";

it("explains installation steps and shows completion examples", () => {
  let help = "";
  completionCommand.configureOutput({ writeOut: (text) => (help += text) });
  completionCommand.outputHelp();
  expect(help.replace(/\s+/g, " ")).toContain("prints any shell configuration steps still needed");
  expect(help).toContain("Examples:");
  expect(help).toContain("flisk completion zsh --install");
  expect(help).toContain("flisk completion fish --install");
});
