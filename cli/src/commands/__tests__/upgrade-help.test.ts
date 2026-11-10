// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { expect, it } from "vitest";
import { upgradeCommand } from "../upgrade.js";

it("shows examples in upgrade help", () => {
  let help = "";
  upgradeCommand.configureOutput({ writeOut: (text) => (help += text) });
  upgradeCommand.outputHelp();
  expect(help).toContain("Examples:");
  expect(help).toContain("flisk upgrade");
});
