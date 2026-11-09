// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { expect, it } from "vitest";
import { connectCommand } from "../connect.js";

it("shows connection examples in help", () => {
  let help = "";
  connectCommand.configureOutput({ writeOut: (text) => (help += text) });
  connectCommand.outputHelp();
  expect(help).toContain("Examples:");
  expect(help).toContain("flisk connect cursor --dry-run");
});
