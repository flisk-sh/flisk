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
