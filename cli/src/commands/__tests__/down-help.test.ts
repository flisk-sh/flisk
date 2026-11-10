// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { expect, it } from "vitest";
import { downCommand } from "../down.js";

it("shows examples in down help", () => {
  let help = "";
  downCommand.configureOutput({ writeOut: (text) => (help += text) });
  downCommand.outputHelp();
  expect(help).toContain("Examples:");
  expect(help).toContain("flisk down --dry-run");
});
