// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
/// <reference types="vite/client" />

import * as fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import pkg from "../../../package.json" with { type: "json" };
import { createTempDir, runTdk } from "../../test-support/index.js";
import { listedCommandNames, showHelp } from "../help.js";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Commands that exist for maintainers of this repository, not for people using TDK.
const NOT_LISTED = new Set(["maintainers"]);

const commandModules = import.meta.glob<Record<string, Command>>("../*.{ts,tsx}");

/** The commands `cli.ts` registers, found from its `import { xCommand } from "./commands/x.js"` lines. */
async function registeredCommands(): Promise<Command[]> {
  const source = fs.readFileSync(join(srcDir, "cli.ts"), "utf-8");
  const imports = [
    ...source.matchAll(/import \{ (\w+Command) \} from "\.\/commands\/([\w-]+)\.js"/g),
  ];
  const commands: Command[] = [];
  for (const [, exportName, file] of imports) {
    const load = commandModules[`../${file}.ts`] ?? commandModules[`../${file}.tsx`];
    expect(load, `commands/${file} is imported by cli.ts`).toBeDefined();
    commands.push((await load())[exportName]);
  }
  return commands;
}

describe("tdk --help", () => {
  it("lists every command that cli.ts registers", async () => {
    const commands = await registeredCommands();
    expect(commands.length).toBeGreaterThan(15);

    const listed = new Set(listedCommandNames());
    const missing = commands
      .map((command) => command.name())
      .filter((name) => !NOT_LISTED.has(name) && !listed.has(name));

    expect(missing, "add a row to COMMAND_GROUPS in commands/help.ts").toEqual([]);
  });

  it("renders formatted banner, groups, global options, and quick start", () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      showHelp();
      const output = logs.join("\n");
      expect(output).toContain("tdk");
      expect(output).toContain(pkg.version);
      expect(output).toContain("Project Level");
      expect(output).toContain("Stack Level");
      expect(output).toContain("Resource Level");
      expect(output).toContain("Lifecycle");
      expect(output).toContain("Networking");
      expect(output).toContain("Utilities");
      expect(output).toContain("Global Options:");
      expect(output).toContain("-v, --version");
      expect(output).toContain("-h, --help");
      expect(output).toContain("--verbose");
      expect(output).toContain("Quick start:");
      expect(output).toContain("Examples:");
      expect(output).toContain("https://github.com/tdk-landscape/tdk-cli-core");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("rejects unknown commands with exit code 1", () => {
    const dir = createTempDir("tdk-unknown-cmd-");
    try {
      const res = runTdk(["unknown-command-xyz"], { cwd: dir });
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("error: unknown command 'unknown-command-xyz'");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects unknown command target passed to help with exit code 1", () => {
    const dir = createTempDir("tdk-unknown-help-");
    try {
      const res = runTdk(["help", "unknown-target-xyz"], { cwd: dir });
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("error: unknown command 'unknown-target-xyz'");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
