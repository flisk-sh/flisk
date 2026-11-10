// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { expect, it } from "vitest";
import { doctorCommand } from "../doctor.js";

it("shows examples in doctor help", () => {
  let help = "";
  doctorCommand.configureOutput({ writeOut: (text) => (help += text) });
  doctorCommand.outputHelp();
  expect(help).toContain("Examples:");
  expect(help).toContain("flisk doctor");
});
