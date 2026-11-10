// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { expect, it } from "vitest";
import { projectCommand } from "../project.js";

it("shows examples in project help", () => {
  let help = "";
  projectCommand.configureOutput({ writeOut: (text) => (help += text) });
  projectCommand.outputHelp();
  expect(help).toContain("Examples:");
  expect(help).toContain("flisk project");
});
