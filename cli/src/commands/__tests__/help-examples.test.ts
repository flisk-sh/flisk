// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import { createProgram } from "../../program.js";
import { parseDemoRootOptions } from "../../utils/demo-args.js";
import { buildForwardedExportArgs } from "../export.js";
import { COMMAND_GROUPS, showHelp } from "../help.js";

/** A value that stands in for a placeholder such as `<resource>` or `[dir]`. */
const SAMPLE_VALUE = "example";

/** Rows dispatched before Commander reaches a subcommand: `demo` is the one-command flow (`cli.ts`), `help` is Commander's own. */
const DISPATCHED_SEPARATELY = new Set(["demo", "help"]);

interface ParsedExample {
  /** Command path the help row names, for example `tool add` or `create`. */
  label: string;
  /** The example exactly as the help table prints it. */
  example: string;
  /** Arguments handed to the CLI after the command path. */
  argv: string[];
}

/** `"mcp check"` becomes `["mcp", "check"]`; only the first listed name is used. */
function commandPath(name: string): string[] {
  return name.split(",")[0].trim().split(/\s+/).filter(Boolean);
}

/** Splits comma-separated alternatives (`--stack <stack>, --json`) into one token list each; a comma ends one alternative, which may hold several tokens (`kit <resource>`). */
function commaVariants(tokens: string[]): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];

  for (const token of tokens) {
    if (token.endsWith(",")) {
      current.push(token.replace(/,+$/, ""));
      groups.push(current);
      current = [];
    } else {
      current.push(token);
    }
  }
  if (current.length > 0) groups.push(current);

  return groups.length > 0 ? groups : [[]];
}

/** Expands one `a|b|c` token (`render|wrangler|compose`) into one list per value. */
function pipeVariants(tokens: string[]): string[][] {
  const index = tokens.findIndex((token) => {
    const body = token.replace(/^[<[]/, "").replace(/[>\]]$/, "");
    return body.includes("|");
  });
  if (index === -1) return [tokens];

  const body = tokens[index].replace(/^[<[]/, "").replace(/[>\]]$/, "");
  return body
    .split("|")
    .flatMap((alternative) =>
      pipeVariants([...tokens.slice(0, index), alternative, ...tokens.slice(index + 1)]),
    );
}

/** Replaces `[name]`, `<resource>` and `<url|resource>` leftovers with a sample value. */
function replacePlaceholders(tokens: string[]): string[] {
  return tokens.map((token) =>
    /^[<[].*[>\]]$/.test(token) ? SAMPLE_VALUE : token.replace(/,+$/, ""),
  );
}

/**
 * A program whose every action is a stub, so a full parse validates an example without running it.
 * Commander's dispatch then checks everything the real CLI checks: that the row names registered
 * commands and subcommands, that required positional arguments are present, and that every option
 * is known and carries a value when it needs one.
 */
function buildSilentProgram(): Command {
  const program = createProgram();
  const stub = (command: Command): void => {
    // Errors on a subcommand must throw, not exit the test process.
    command.exitOverride();
    command.action(() => {});
    for (const child of command.commands) stub(child);
  };
  stub(program);
  return program;
}

function collectExamples(): ParsedExample[] {
  const examples: ParsedExample[] = [];

  for (const group of COMMAND_GROUPS) {
    for (const entry of group.commands) {
      const path = commandPath(entry.name);
      const alias = entry.alias.trim();
      const aliasTokens = alias ? alias.split(/\s+/) : [""];

      const variants = commaVariants(aliasTokens).flatMap(pipeVariants).map(replacePlaceholders);

      for (const variant of variants) {
        const tokens = [...path, ...variant.filter(Boolean)];
        examples.push({
          label: path.join(" "),
          example: alias ? `flisk ${path.join(" ")} ${alias}` : `flisk ${path.join(" ")}`,
          // The example must be runnable as printed: no value is added that the row does not show.
          argv: variant.filter(Boolean),
        });
      }
    }
  }

  return examples;
}

describe("flisk --help examples", () => {
  const examples = collectExamples().filter(
    (example) => !DISPATCHED_SEPARATELY.has(example.label.split(" ")[0] ?? ""),
  );

  it("covers every command the help table lists", () => {
    const listed = COMMAND_GROUPS.flatMap((group) => group.commands.map((entry) => entry.name));
    expect(examples.length).toBeGreaterThanOrEqual(listed.length);
  });

  it("names a registered command for every row", () => {
    const program = createProgram();
    const registered = new Set(program.commands.map((command) => command.name()));

    for (const group of COMMAND_GROUPS) {
      for (const entry of group.commands) {
        const [first] = commandPath(entry.name);
        if (DISPATCHED_SEPARATELY.has(first)) continue;
        expect(registered, `${entry.name} is not a registered command`).toContain(first);
      }
    }
  });

  it.each(examples)("parses the example for $label: $example", ({ label, argv }) => {
    const program = buildSilentProgram();

    expect(() => program.parse([...label.split(" "), ...argv], { from: "user" })).not.toThrow();
  });

  it("rejects an example with an option its command does not define", () => {
    const program = buildSilentProgram();

    expect(() =>
      program.parse(["create", "example", "--kind", "web", "--extras", "queue"], { from: "user" }),
    ).toThrowError(/unknown option '--kind'/);
  });

  it("rejects an example that names an unknown subcommand", () => {
    const program = buildSilentProgram();

    // `tool` takes no positional arguments of its own, so Commander rejects the unknown
    // subcommand either as an unknown command or as an unexpected positional.
    expect(() => program.parse(["tool", "ad", "example"], { from: "user" })).toThrowError(
      /unknown command 'ad'|too many arguments/i,
    );
  });

  it("rejects an example that omits a required positional argument", () => {
    const program = buildSilentProgram();

    expect(() => program.parse(["agent", "sessions"], { from: "user" })).toThrowError(
      /missing required argument/i,
    );
  });

  it("keeps the wrangler example valid for flisk-export, which the wrapper cannot check", () => {
    // `flisk export` is an allowUnknownOption passthrough, so the parser cannot validate the
    // delegated exporter's own requirements; the wrangler mode of the pinned flisk-export needs
    // --resource, and the help row is the only place that example is shown.
    const exportRow = COMMAND_GROUPS.flatMap((group) => group.commands).find(
      (entry) => entry.name === "export",
    );
    expect(exportRow).toBeDefined();

    const tokens = (exportRow?.alias ?? "").split(/\s+/).filter(Boolean);
    expect(tokens[0]).toBe("wrangler");
    const resourceIndex = tokens.indexOf("--resource");
    expect(resourceIndex, "the wrangler example must pass --resource").toBeGreaterThan(-1);
    const resourceValue = tokens[resourceIndex + 1];
    expect(resourceValue, "--resource must carry a value").toBeDefined();
    expect(resourceValue).not.toMatch(/^-/);

    const forwarded = buildForwardedExportArgs(tokens, { dryRun: true });
    expect(forwarded).toContain("--resource");
    expect(resourceValue && forwarded.includes(resourceValue)).toBe(true);
    expect(forwarded).toContain("--dry-run");
  });

  describe("the demo row", () => {
    it("lists demo in the main help output without starting the demo", () => {
      const lines: string[] = [];
      const log = vi.spyOn(console, "log").mockImplementation((line: unknown) => {
        lines.push(String(line));
      });
      try {
        showHelp();
      } finally {
        log.mockRestore();
      }

      const text = lines.join("\n");
      expect(text).toContain("demo");
      expect(text).toContain("Run the demo stack with one command");
    });

    it("dispatches through the pre-Commander path the row documents", () => {
      // `flisk demo` is answered in cli.ts before Commander dispatch: parseDemoRootOptions must
      // recognise it so `flisk demo --help` shows the demo's own help, not the command table.
      // argv is process.argv-shaped: the interpreter and the script path come before "demo".
      const options = parseDemoRootOptions(["node", "flisk.js", "demo", "--help"]);
      expect(options.template).toBe("demo");
      expect(options.help).toBe(true);
    });
  });
});
