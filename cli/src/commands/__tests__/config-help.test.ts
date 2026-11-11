// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { configCommand } from "../config.js";

describe("config subcommands help examples", () => {
  it("verifies config migrate help examples", () => {
    const migrateCmd = configCommand.commands.find((c) => c.name() === "migrate");
    let help = "";
    migrateCmd?.configureOutput({ writeOut: (text) => (help += text) });
    migrateCmd?.outputHelp();

    expect(help).toContain("Examples:");
    expect(help).toContain("flisk config migrate");
    expect(help).toContain("flisk config migrate --json");
  });

  it("verifies config explain help examples", () => {
    const explainCmd = configCommand.commands.find((c) => c.name() === "explain");
    let help = "";
    explainCmd?.configureOutput({ writeOut: (text) => (help += text) });
    explainCmd?.outputHelp();

    expect(help).toContain("Examples:");
    expect(help).toContain("flisk config explain Tiltfile");
    expect(help).toContain("flisk config explain services/orders-api/service.json");
    expect(help).toContain("flisk config explain Tiltfile --json");
  });

  it("verifies config verify help examples", () => {
    const verifyCmd = configCommand.commands.find((c) => c.name() === "verify");
    let help = "";
    verifyCmd?.configureOutput({ writeOut: (text) => (help += text) });
    verifyCmd?.outputHelp();

    expect(help).toContain("Examples:");
    expect(help).toContain("flisk config verify");
    expect(help).toContain("flisk config verify --json");
  });
});
