// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { expect, it } from "vitest";
import { stacksCommand } from "../stacks.js";

it("shows examples in stacks help", () => {
  let help = "";
  stacksCommand.configureOutput({ writeOut: (text) => (help += text) });
  stacksCommand.outputHelp();
  expect(help).toContain("Examples:");
  expect(help).toContain("flisk stacks");
});
