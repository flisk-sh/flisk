// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { Command, Option } from "commander";
import { describe, expect, it } from "vitest";
import { createProgram } from "../../program.js";
import { COMMAND_GROUPS } from "../help.js";

/** A value that stands in for a placeholder such as `<resource>` or `[dir]`. */
const SAMPLE_VALUE = "example";

interface ParsedExample {
  /** Command path the help row names, for example `tool add` or `create`. */
  label: string;
  /** The example exactly as the help table prints it. */
  example: string;
  /** Arguments handed to the command's own option parser. */
  argv: string[];
}

/** `"mcp check"` becomes `["mcp", "check"]`; only the first listed name is used. */
function commandPath(name: string): string[] {
  return name.split(",")[0].trim().split(/\s+/).filter(Boolean);
}

/** Splits a run of comma-separated alternatives (`--stack, --ports`) into one list each. */
function commaVariants(tokens: string[]): string[][] {
  const index = tokens.findIndex((token) => token.endsWith(","));
  if (index === -1) return [tokens];

  const alternatives: string[] = [];
  let end = index;
  while (end < tokens.length && tokens[end].endsWith(",")) {
    alternatives.push(tokens[end].replace(/,+$/, ""));
    end++;
  }
  if (end < tokens.length) alternatives.push(tokens[end++]);

  return alternatives.flatMap((alternative) =>
    commaVariants(tokens.slice(end)).map((tail) => [
      ...tokens.slice(0, index),
      alternative,
      ...tail,
    ]),
  );
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

/** Walks the registered subcommands that the argument list starts with. */
function resolveCommand(program: Command, tokens: string[]): { command: Command; rest: string[] } {
  let command = program;
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index];
    if (token.startsWith("-")) break;
    const child = command.commands.find(
      (candidate) => candidate.name() === token || candidate.aliases().includes(token),
    );
    if (!child) break;
    command = child;
    index++;
  }

  return { command, rest: tokens.slice(index) };
}

function findOption(command: Command, token: string): Option | undefined {
  const flag = token.replace(/=.*$/, "");
  return command.options.find((option) => option.short === flag || option.long === flag);
}

/** Parses one example the way commander does, and rejects anything the command does not define. */
function assertExampleParses(command: Command, rest: string[]): void {
  const { unknown } = command.parseOptions(rest);
  const unknownOption = unknown.find((token) => token.startsWith("-"));
  if (unknownOption) throw new Error(`unknown option '${unknownOption}'`);
}

/** Adds a sample value when an option that takes one is printed without a value. */
function fillRequiredValues(command: Command, rest: string[]): string[] {
  const filled: string[] = [];

  for (let index = 0; index < rest.length; index++) {
    const token = rest[index];
    filled.push(token);
    if (!token.startsWith("-") || token === "-" || token === "--") continue;

    const option = findOption(command, token);
    const next = rest[index + 1];
    if (option?.required && (next === undefined || next.startsWith("-"))) {
      filled.push(SAMPLE_VALUE);
    }
  }

  return filled;
}

function collectExamples(): ParsedExample[] {
  const program = createProgram();
  const examples: ParsedExample[] = [];

  for (const group of COMMAND_GROUPS) {
    for (const entry of group.commands) {
      const path = commandPath(entry.name);
      const alias = entry.alias.trim();
      const aliasTokens = alias ? alias.split(/\s+/) : [""];

      const variants = commaVariants(aliasTokens).flatMap(pipeVariants).map(replacePlaceholders);

      for (const variant of variants) {
        const tokens = [...path, ...variant.filter(Boolean)];
        const { command, rest } = resolveCommand(program, tokens);
        examples.push({
          label: path.join(" "),
          example: alias ? `flisk ${path.join(" ")} ${alias}` : `flisk ${path.join(" ")}`,
          argv: fillRequiredValues(command, rest),
        });
      }
    }
  }

  return examples;
}

describe("flisk --help examples", () => {
  const examples = collectExamples();

  it("covers every command the help table lists", () => {
    const listed = COMMAND_GROUPS.flatMap((group) => group.commands.map((entry) => entry.name));
    expect(examples.length).toBeGreaterThanOrEqual(listed.length);
  });

  it("names a registered command for every row", () => {
    const program = createProgram();
    const registered = new Set(program.commands.map((command) => command.name()));
    // `help` is commander's built-in help command, not one the CLI registers.
    const builtIn = new Set(["help"]);

    for (const group of COMMAND_GROUPS) {
      for (const entry of group.commands) {
        const [first] = commandPath(entry.name);
        if (builtIn.has(first)) continue;
        expect(registered, `${entry.name} is not a registered command`).toContain(first);
      }
    }
  });

  it.each(examples)("parses the example for $label: $example", ({ label, argv }) => {
    const program = createProgram();
    const resolved = resolveCommand(program, [...label.split(" "), ...argv]);

    expect(() => assertExampleParses(resolved.command, resolved.rest)).not.toThrow();
  });

  it("rejects an example with an option its command does not define", () => {
    const program = createProgram();
    const create = program.commands.find((command) => command.name() === "create");
    expect(create).toBeDefined();

    expect(() =>
      assertExampleParses(create as Command, ["example", "--kind", "web", "--extras", "queue"]),
    ).toThrowError(/unknown option '--kind'/);
  });
});
