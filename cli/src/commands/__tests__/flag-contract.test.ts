// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { describe, expect, it } from "vitest";
import { createTempDir, createTempProject, runTdk } from "../../test-support/index.js";

const commandsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * One row per command that prints `--json` and can run in a temp project without Docker, Tilt or prompts.
 * Each row is checked against the `--json` contract, both in a project and outside one.
 */
const JSON_MATRIX: Array<{ command: string[]; project: Parameters<typeof createTempProject>[0] }> =
  [
    {
      command: ["stacks"],
      project: { stacks: { api: { gateway: { appType: "backend", port: 3100 } } } },
    },
    {
      command: ["resources"],
      project: { stacks: { api: { gateway: { appType: "backend", port: 3100 } } } },
    },
    { command: ["projects"], project: { resources: { api: { runtime: "node" } } } },
    {
      command: ["status"],
      project: { stacks: { api: { gateway: { appType: "backend", port: 3100 } } } },
    },
    {
      command: ["networks"],
      project: { stacks: { api: { gateway: { appType: "backend", port: 3100 } } } },
    },
    { command: ["config", "verify"], project: {} },
  ];

/**
 * Commands and subcommands that register one of the three flags but have no matrix row yet. Each entry says why.
 * Shrinking this list is the work; a new entry needs a reason.
 */
const EXEMPT: Record<string, string> = {
  "agent sessions --json": "lists live agent sessions; needs the agent host",
  "config regenerate --dry-run": "writes generated files; needs a configured project",
  "doctor --json":
    "checks the host toolchain and probes ports; its own test file covers the report",
  "doctor --dry-run": "only applies with --fix; covered by the doctor test file",
  "doctor --yes": "only applies with --fix; covered by the doctor test file",
  "down --json": "stops containers; needs a running stack",
  "down --dry-run": "lists what it would stop; needs a running stack",
  "eject --dry-run": "needs a stack to eject",
  "eject --yes": "needs a stack to eject",
  "logs --json": "reads container logs; needs a running stack",
  "project --yes": "creates a project; prompts without --yes",
  "resource --yes": "changes resource assignments; needs a project",
  "restart --json": "restarts containers; needs a running stack",
  "runtime --json": "reports runtime state through Docker",
  "stack --yes": "changes stack assignments; needs a project",
  "up --json": "starts containers; needs Docker",
  "up --dry-run": "plans a start; needs a valid stack",
  "upgrade --dry-run": "needs an installed project to upgrade",
  "upgrade --yes": "needs an installed project to upgrade",
};

interface FlagSite {
  key: string;
  flags: string[];
}

/**
 * `--json` prints one envelope. Some commands pretty-print it over several lines, so the whole of stdout must parse
 * as one JSON value rather than one line.
 */
function parseOneEnvelope(stdout: string): {
  schemaVersion: number;
  data: unknown;
  errors: unknown[];
} {
  const envelope = JSON.parse(stdout) as {
    schemaVersion: number;
    data: unknown;
    errors: unknown[];
  };
  expect(Object.keys(envelope).sort()).toEqual(["data", "errors", "schemaVersion"]);
  return envelope;
}

/** Walks a Commander command and its subcommands, returning each one that registers a contract flag. */
function collectFlagSites(command: Command, prefix: string[] = []): FlagSite[] {
  const name = [...prefix, command.name()].filter(Boolean);
  const sites: FlagSite[] = [];
  for (const option of command.options) {
    if (option.long === "--json" || option.long === "--dry-run" || option.long === "--yes") {
      sites.push({ key: `${name.join(" ")} ${option.long}`, flags: [option.long] });
    }
  }
  for (const sub of command.commands) {
    sites.push(...collectFlagSites(sub, name));
  }
  return sites;
}

async function loadAllCommands(): Promise<Command[]> {
  const files = fs
    .readdirSync(commandsDir)
    .filter((file) => file.endsWith(".ts") && !file.includes(".test."));
  const commands: Command[] = [];
  for (const file of files) {
    const mod = (await import(path.join(commandsDir, file))) as Record<string, unknown>;
    for (const value of Object.values(mod)) {
      if (value && typeof value === "object" && "options" in value && "commands" in value) {
        commands.push(value as Command);
      }
    }
  }
  return commands;
}

describe("flag contract: --json", () => {
  it.each(JSON_MATRIX)(
    "tdk $command --json prints one envelope in a project",
    ({ command, project }) => {
      const root = createTempProject(project);
      const result = runTdk([...command, "--json"], { cwd: root });
      expect(result.stderr).not.toMatch(/^\{/m);
      const envelope = parseOneEnvelope(result.stdout);
      expect(envelope.schemaVersion).toBe(1);
      expect(Array.isArray(envelope.errors)).toBe(true);
    },
  );

  it.each(JSON_MATRIX)(
    "tdk $command --json outside a project fails with a null-data envelope",
    ({ command }) => {
      const result = runTdk([...command, "--json"], { cwd: createTempDir() });
      expect(result.status).not.toBe(0);
      expect(result.stderr).not.toMatch(/^\{/m);
      const envelope = parseOneEnvelope(result.stdout);
      expect(envelope.data).toBeNull();
      expect(envelope.errors.length).toBeGreaterThan(0);
    },
  );
});

describe("flag contract: completeness", () => {
  it("every command that registers --json, --dry-run or --yes has a matrix row or an exemption", async () => {
    const sites = (await loadAllCommands()).flatMap((command) => collectFlagSites(command));
    expect(sites.length).toBeGreaterThan(0);

    const covered = new Set(JSON_MATRIX.map((row) => `${row.command.join(" ")} --json`));
    const missing = sites
      .map((site) => site.key)
      .filter((key) => !covered.has(key) && !(key in EXEMPT));
    expect(missing).toEqual([]);
  });

  it("flags an exemption that no longer matches a real flag, so the list cannot go stale", async () => {
    const sites = new Set(
      (await loadAllCommands())
        .flatMap((command) => collectFlagSites(command))
        .map((site) => site.key),
    );
    const stale = Object.keys(EXEMPT).filter((key) => !sites.has(key));
    expect(stale).toEqual([]);
  });
});
