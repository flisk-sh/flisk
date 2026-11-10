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

it("says down stops local processes too, not only Tilt resources", () => {
  expect(downCommand.description()).toBe(
    "Stop every running service of this project (local processes or Docker/Tilt)",
  );
  expect(downCommand.description()).not.toContain("tilt resources");
});
