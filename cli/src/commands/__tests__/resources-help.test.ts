// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { expect, it } from "vitest";
import { resourcesCommand } from "../resources.js";

it("shows examples in resources help", () => {
  let help = "";
  resourcesCommand.configureOutput({ writeOut: (text) => (help += text) });
  resourcesCommand.outputHelp();
  expect(help).toContain("Examples:");
  expect(help).toContain("flisk resources");
});

it("explains that --verbose includes ports and --ports is the short form (#4423)", () => {
  let help = "";
  resourcesCommand.configureOutput({ writeOut: (text) => (help += text) });
  resourcesCommand.outputHelp();
  expect(help).toMatch(/--verbose[^\n]*port/i);
  expect(help).toMatch(/--ports[^\n]*short/i);
});
