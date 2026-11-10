// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { expect, it } from "vitest";
import { resourceCommand } from "../resource.js";

it("shows examples in resource help", () => {
  let help = "";
  resourceCommand.configureOutput({ writeOut: (text) => (help += text) });
  resourceCommand.outputHelp();
  expect(help).toContain("Examples:");
  expect(help).toContain("flisk resource api");
});
