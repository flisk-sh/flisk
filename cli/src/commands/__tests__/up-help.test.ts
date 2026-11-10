// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { expect, it } from "vitest";
import { upCommand } from "../up.js";

it("shows examples in up help", () => {
  let help = "";
  upCommand.configureOutput({ writeOut: (text) => (help += text) });
  upCommand.outputHelp();
  expect(help).toContain("Examples:");
  expect(help).toContain("flisk up");
});
