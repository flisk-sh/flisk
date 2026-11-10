// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { expect, it } from "vitest";
import { logsCommand } from "../logs.js";

it("shows examples in logs help", () => {
  let help = "";
  logsCommand.configureOutput({ writeOut: (text) => (help += text) });
  logsCommand.outputHelp();
  expect(help).toContain("Examples:");
  expect(help).toContain("flisk logs --tail 50");
});
