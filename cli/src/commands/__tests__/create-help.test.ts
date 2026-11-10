// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { expect, it } from "vitest";
import { createCommand } from "../create.js";

it("shows examples in create help", () => {
  let help = "";
  createCommand.configureOutput({ writeOut: (text) => (help += text) });
  createCommand.outputHelp();
  expect(help).toContain("Examples:");
  expect(help).toContain("flisk create my-app --yes --start");
});
