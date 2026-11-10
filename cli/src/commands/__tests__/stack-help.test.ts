// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { expect, it } from "vitest";
import { stackCommand } from "../stack.js";

it("shows examples in stack help", () => {
  let help = "";
  stackCommand.configureOutput({ writeOut: (text) => (help += text) });
  stackCommand.outputHelp();
  expect(help).toContain("Examples:");
  expect(help).toContain("flisk stack --list");
});
