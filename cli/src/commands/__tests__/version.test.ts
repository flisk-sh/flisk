// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPackageVersion } from "../../utils/paths.js";
import { versionCommand } from "../version.js";

/** Runs `flisk <args>` on a fresh program and returns what the command printed. */
async function runCli(args: string[]): Promise<string> {
  const printed: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
    printed.push(parts.join(" "));
  });

  const program = new Command().exitOverride();
  program.configureOutput({ writeOut: () => undefined, writeErr: () => undefined });
  program.addCommand(versionCommand);

  await program.parseAsync(args, { from: "user" });
  return printed.join("\n");
}

describe("flisk version", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints the package version", async () => {
    const output = await runCli(["version"]);

    expect(output).not.toBe("");
    expect(output).toBe(getPackageVersion());
  });

  it("prints the same version through the `v` alias", async () => {
    const output = await runCli(["v"]);

    expect(output).toBe(getPackageVersion());
  });
});
