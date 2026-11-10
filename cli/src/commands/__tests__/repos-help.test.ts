// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { expect, it } from "vitest";
import { reposCommand } from "../repos.js";

it("shows configuration and examples in repos clone help", () => {
  let help = "";
  const clone = reposCommand.commands.find((command) => command.name() === "clone");
  expect(clone).toBeDefined();
  clone?.configureOutput({ writeOut: (text) => (help += text) });
  clone?.outputHelp();
  expect(help).toContain("url, dir");
  expect(help).toContain("optional branch");
  expect(help).toContain("Examples:");
  expect(help).toContain("flisk repos clone --json");
  expect(help).toContain("https://github.com/flisk-sh/flisk/blob/main/docs/layout.md");
});
