// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { expect, it } from "vitest";
import { mcpCommand } from "../mcp.js";

it("shows examples in mcp help", () => {
  let help = "";
  mcpCommand.configureOutput({ writeOut: (text) => (help += text) });
  mcpCommand.outputHelp();
  expect(help).toContain("Examples:");
  expect(help).toContain("flisk mcp");
});
