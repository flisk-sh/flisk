// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { expect, it } from "vitest";
import { statusCommand } from "../status.js";

it("shows examples in status help", () => {
  let help = "";
  statusCommand.configureOutput({ writeOut: (text) => (help += text) });
  statusCommand.outputHelp();
  expect(help).toContain("Examples:");
  expect(help).toContain("flisk status");
});
