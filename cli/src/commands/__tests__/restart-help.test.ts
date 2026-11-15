// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { expect, it } from "vitest";
import { restartCommand } from "../restart.js";

it("shows examples in restart help", () => {
  let help = "";
  restartCommand.configureOutput({ writeOut: (text) => (help += text) });
  restartCommand.outputHelp();
  expect(help).toContain("Examples:");
  expect(help).toContain("flisk restart orders-api");
});

it("documents --rebuild in restart help", () => {
  let help = "";
  restartCommand.configureOutput({ writeOut: (text) => (help += text) });
  restartCommand.outputHelp();
  expect(help).toContain("--rebuild");
  expect(help).toContain("Rebuild the image through Tilt");
  expect(help).toContain("flisk restart orders-api --rebuild");
});
