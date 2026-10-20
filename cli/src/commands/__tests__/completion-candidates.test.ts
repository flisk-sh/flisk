// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { BACKEND_FRAMEWORKS } from "../../backend-frameworks/registry.js";
import { BACKEND_LANGUAGES } from "../../backend-languages/registry.js";
import { FRONTEND_FRAMEWORKS } from "../../frontend-frameworks/registry.js";
import { createProgram } from "../../program.js";
import { RESOURCE_TYPE_VALUES } from "../../types/index.js";
import { VALID_RESOURCE_TYPES } from "../../utils/constants.js";
import { renderCompletionScript } from "../completion.js";
import { buildCompletionCandidates } from "../completion-candidates.js";

const SHELLS = ["bash", "zsh", "fish", "powershell"] as const;
type Shell = (typeof SHELLS)[number];

const program = createProgram();
const candidates = buildCompletionCandidates(program);

/** What a shell script offers: the command names, the flags and the values per command. */
interface ShellShape {
  names: string[];
  options: Record<string, string[]>;
  subcommands: Record<string, string[]>;
  /** The values of the flags that every command offers, keyed by flag name. */
  defaultValues: Record<string, string[]>;
  /** The values of the flags of a command, keyed by "<command path> <flag>". */
  commandValues: Record<string, string[]>;
  /** The values of the flags that depend on the `--type`, keyed by "<flag> <type>". */
  typeValues: Record<string, string[]>;
}

function sorted(values: string[]): string[] {
  return [...values].sort();
}

/** The flags of every command, in a stable order. */
function normalize(options: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(options)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([command, flags]) => [command, sorted(flags)]),
  );
}

function flagsOf(specs: string): string[] {
  return [...specs.matchAll(/'--([a-z0-9-]+)\[/g)].map(([, flag]) => `--${flag}`);
}

function bashShape(source: string): ShellShape {
  const names = (source.match(/commands="([^"]*)"/)?.[1] ?? "").split(/\s+/).filter(Boolean);
  const options: Record<string, string[]> = {};
  for (const match of source.matchAll(/^\s*"?([\w -]+)"?\) options="([^"]*)" ;;$/gm)) {
    options[match[1]] = match[2].split(/\s+/).filter(Boolean);
  }
  const subcommands: Record<string, string[]> = {};
  for (const match of source.matchAll(/^\s*([\w-]+)\) words="([^"]*)" ;;$/gm)) {
    // The project values of a positional argument are not command names.
    if (match[2].includes("${")) continue;
    subcommands[match[1]] = match[2].split(/\s+/).filter(Boolean);
  }
  const defaultValues: Record<string, string[]> = {};
  for (const match of source.matchAll(
    /^ {8}(--[\w-]+)\)\n {12}COMPREPLY=\( \$\(compgen -W "([^"]*)"/gm,
  )) {
    defaultValues[match[1]] = match[2].split(/\s+/).filter(Boolean);
  }
  const commandValues: Record<string, string[]> = {};
  for (const match of source.matchAll(
    /^ {8}"([\w -]+)"\)\n {12}COMPREPLY=\( \$\(compgen -W "([^"]*)"/gm,
  )) {
    commandValues[match[1]] = match[2].split(/\s+/).filter(Boolean);
  }
  const typeValues: Record<string, string[]> = {};
  for (const match of source.matchAll(
    /^ {8}(--[\w-]+)\)\n(?:.*\n)*? {16}tdk_type_values="([^"]*)"/gm,
  )) {
    const type = source.slice(match.index).match(/tdk_type" = "([\w-]+)"/)?.[1] ?? "";
    typeValues[`${match[1]} ${type}`] = match[2].split(/\s+/).filter(Boolean);
  }
  return { names, options, subcommands, defaultValues, commandValues, typeValues };
}

function zshShape(source: string): ShellShape {
  const commandBlock = source.match(
    /_tdk_commands\(\) \{\n {4}local commands=\(\n([\s\S]*?)\n {4}\)/,
  );
  const names = [...(commandBlock?.[1] ?? "").matchAll(/^\s*'([^:']+):/gm)].map(([, name]) => name);
  const options: Record<string, string[]> = {};
  for (const match of source.matchAll(/^ {8}(\S+)\)\n {12}_arguments \\\n([\s\S]*?)\n {12};;$/gm)) {
    const flags = flagsOf(match[2]);
    // The aliases of a command share its branch, the first word is the command itself.
    const command = match[1].split("|")[0];
    if (flags.length > 0) options[command] = flags;
  }
  for (const match of source.matchAll(
    /^ {8}(\S+)_args\)\n {12}case "\$line\[1\]" in\n([\s\S]*?)\n {12}esac\n {12};;$/gm,
  )) {
    for (const sub of match[2].matchAll(
      /^ {16}(\S+)\)\n {20}_arguments \\\n([\s\S]*?)\n {20};;$/gm,
    )) {
      const flags = flagsOf(sub[2]);
      if (flags.length > 0) options[`${match[1]} ${sub[1]}`] = flags;
    }
  }
  const subcommands: Record<string, string[]> = {};
  for (const match of source.matchAll(
    /_tdk_([\w-]+)_subcommands\(\) \{\n {4}local commands=\(\n([\s\S]*?)\n {4}\)/g,
  )) {
    subcommands[match[1]] = [...match[2].matchAll(/^\s*'([^:']+):/gm)].map(([, name]) => name);
  }
  const defaultValues: Record<string, string[]> = {};
  const commandValues: Record<string, string[]> = {};
  for (const match of source.matchAll(/^ {8}(\S+)\)\n {12}_arguments \\\n([\s\S]*?)\n {12};;$/gm)) {
    const command = match[1].split("|")[0];
    for (const spec of match[2].matchAll(/'(--[\w-]+)\[[^\]]*\]:[\w-]*:\(([^)]*)\)'/g)) {
      commandValues[`${command} ${spec[1]}`] = spec[2].split(/\s+/).filter(Boolean);
    }
  }
  const typeValues: Record<string, string[]> = {};
  for (const match of source.matchAll(
    /if \[\[ "\$tdk_type" = "([\w-]+)"[^\]]*\]\]; then\n {8}tdk_type_values=\(([^)]*)\)/g,
  )) {
    typeValues[match[1]] = match[2].split(/\s+/).filter(Boolean);
  }
  return { names, options, subcommands, defaultValues, commandValues, typeValues };
}

function fishShape(source: string): ShellShape {
  const names = [
    ...source.matchAll(/complete -c tdk -f -n '__fish_use_subcommand' -a '([^']+)'/g),
  ].map(([, name]) => name);
  const options: Record<string, string[]> = {};
  for (const match of source.matchAll(/complete -c tdk -f -n '([^']+)' -l ([a-z0-9-]+)/g)) {
    const path = [...match[1].matchAll(/__fish_seen_subcommand_from ([a-z0-9-]+)/g)].map(
      ([, name]) => name,
    );
    const key = path.join(" ");
    options[key] = [...(options[key] ?? []), `--${match[2]}`];
  }
  const subcommands: Record<string, string[]> = {};
  for (const match of source.matchAll(
    /complete -c tdk -f -n '__fish_seen_subcommand_from ([\w-]+)' -a '([^']+)' -d '/g,
  )) {
    subcommands[match[1]] = [...(subcommands[match[1]] ?? []), match[2]];
  }
  const defaultValues: Record<string, string[]> = {};
  const commandValues: Record<string, string[]> = {};
  for (const match of source.matchAll(
    /complete -c tdk -f -n '([^']+)' -l ([\w-]+) -d '[^']*' -r -a '([^']*)'/g,
  )) {
    const path = [...match[1].matchAll(/__fish_seen_subcommand_from ([\w-]+)/g)].map(
      ([, name]) => name,
    );
    const key = path.join(" ");
    if (key === "") {
      defaultValues[`--${match[2]}`] = match[3].split(/\s+/).filter(Boolean);
    } else {
      commandValues[`${key} --${match[2]}`] = match[3].split(/\s+/).filter(Boolean);
    }
  }
  const typeValues: Record<string, string[]> = {};
  for (const match of source.matchAll(/case ([\w-]+)\n {12}printf '%s\\n' ([^\n]*)/g)) {
    typeValues[match[1]] = match[2].split(/\s+/).filter(Boolean);
  }
  return { names, options, subcommands, defaultValues, commandValues, typeValues };
}

function powershellShape(source: string): ShellShape {
  const commandBlock = source.match(/\$commands = \[ordered\]@\{\n([\s\S]*?)\n {2}\}/);
  const names = [...(commandBlock?.[1] ?? "").matchAll(/^\s*'([^']+)' = '[^']*'/gm)].map(
    ([, name]) => name,
  );
  const optionBlock = source.match(/\$commandOptions = \[ordered\]@\{\n([\s\S]*?)\n {2}\}/);
  const options: Record<string, string[]> = {};
  for (const match of (optionBlock?.[1] ?? "").matchAll(/^\s*'([^']+)' = @\(([^)]*)\)/gm)) {
    const flags = [...match[2].matchAll(/'(--[^']+)'/g)].map(([, flag]) => flag);
    if (flags.length > 0) options[match[1]] = flags;
  }
  const subcommandBlock = source.match(/\$subcommands = \[ordered\]@\{\n([\s\S]*?)\n {2}\}/);
  const subcommands: Record<string, string[]> = {};
  for (const match of (subcommandBlock?.[1] ?? "").matchAll(/^\s*'([\w-]+ [\w-]+)' = '[^']*'/gm)) {
    const [parent, name] = match[1].split(" ");
    subcommands[parent] = [...(subcommands[parent] ?? []), name];
  }
  const defaultValues: Record<string, string[]> = {};
  const valueBlock = source.match(/\$optionValues = \[ordered\]@\{\n([\s\S]*?)\n {2}\}/);
  for (const match of (valueBlock?.[1] ?? "").matchAll(/^\s*'(--[^']+)' = @\(([^)]*)\)/gm)) {
    defaultValues[match[1]] = [...match[2].matchAll(/'([^']+)'/g)].map(([, value]) => value);
  }
  const commandValues: Record<string, string[]> = {};
  const commandValueBlock = source.match(
    /\$commandOptionValues = \[ordered\]@\{\n([\s\S]*?)\n {2}\}/,
  );
  for (const match of (commandValueBlock?.[1] ?? "").matchAll(
    /^\s*'([\w-]+ [\w-]+)' = @\(([^)]*)\)/gm,
  )) {
    commandValues[match[1]] = [...match[2].matchAll(/'([^']+)'/g)].map(([, value]) => value);
  }
  const typeValues: Record<string, string[]> = {};
  for (const match of source.matchAll(
    /if \(\$tdk_type -eq '([\w-]+)'(?: -or \$tdk_type -eq '')?\) \{ \$values = @\(([^)]*)\) \}/g,
  )) {
    typeValues[match[1]] = [...match[2].matchAll(/'([^']+)'/g)].map(([, value]) => value);
  }
  return { names, options, subcommands, defaultValues, commandValues, typeValues };
}

const SHAPE_BUILDERS: Record<Shell, (source: string) => ShellShape> = {
  bash: bashShape,
  zsh: zshShape,
  fish: fishShape,
  powershell: powershellShape,
};

function shapeOf(shell: Shell): ShellShape {
  return SHAPE_BUILDERS[shell](renderCompletionScript(shell, candidates));
}

/** The flags a shell offers for every command. */
function globalFlagsOf(shell: Shell): string[] {
  const source = renderCompletionScript(shell, candidates);
  switch (shell) {
    case "bash": {
      const match = source.match(/options="(--[^"]*)"/);
      return (match?.[1] ?? "").split(/\s+/).filter(Boolean);
    }
    case "zsh": {
      const block = source.match(/_arguments -C \\\n([\s\S]*?)\n {8}'1: :_tdk_commands'/);
      return flagsOf(block?.[1] ?? "");
    }
    case "fish": {
      return [...source.matchAll(/complete -c tdk -f -l ([a-z0-9-]+)/g)].map(
        ([, flag]) => `--${flag}`,
      );
    }
    case "powershell": {
      const match = source.match(/\$globalOptions = @\(([^)]*)\)/);
      return [...(match?.[1] ?? "").matchAll(/'(--[^']+)'/g)].map(([, flag]) => flag);
    }
  }
}

/** The values a shell offers for a flag of a command. */
function valuesOf(shell: Shell, path: string, flag: string): string[] {
  const shape = shapeOf(shell);
  const commandValues = shape.commandValues[`${path} ${flag}`];
  if (commandValues) return commandValues;
  return shape.defaultValues[flag] ?? [];
}

/** The values a shell offers for a flag that depends on the `--type` of the command line. */
function typeValuesOf(shell: Shell, flag: string, type: string): string[] {
  const source = renderCompletionScript(shell, candidates);
  switch (shell) {
    case "bash": {
      const arm = source.slice(source.indexOf(`\n        ${flag})\n`));
      const condition = arm.indexOf(`"$tdk_type" = "${type}"`);
      if (condition < 0) return [];
      return (
        arm
          .slice(condition)
          .match(/tdk_type_values="([^"]*)"/)?.[1]
          .split(/\s+/)
          .filter(Boolean) ?? []
      );
    }
    case "zsh": {
      const function_ = source.slice(source.indexOf(`_tdk_${flag.slice(2)}_values() {`));
      const condition = function_.indexOf(`"$tdk_type" = "${type}"`);
      if (condition < 0) return [];
      return (
        function_
          .slice(condition)
          .match(/tdk_type_values=\(([^)]*)\)/)?.[1]
          .split(/\s+/)
          .filter(Boolean) ?? []
      );
    }
    case "fish": {
      const function_ = source.slice(source.indexOf(`function __tdk_${flag.slice(2)}_values`));
      const condition = function_.indexOf(`case ${type}`);
      if (condition < 0) return [];
      const list = function_.slice(condition).match(/printf '%s\\n' ([^\n]*)/)?.[1] ?? "";
      return list.split(/\s+/).filter(Boolean);
    }
    case "powershell": {
      const block = source.slice(source.indexOf(`if ($previous -eq '${flag}')`));
      const line = block.split("\n").find((entry) => entry.includes(`$tdk_type -eq '${type}'`));
      if (!line) return [];
      const start = line.indexOf("@(");
      const list = line.slice(start + 2, line.indexOf(")", start));
      return [...list.matchAll(/'([^']+)'/g)].map(([, value]) => value);
    }
  }
}

/** The project values a shell offers behind a flag. */
function projectValuesOf(shell: Shell, flag: string): boolean {
  const source = renderCompletionScript(shell, candidates);
  switch (shell) {
    case "bash":
      return source.includes(`        ${flag})`);
    case "zsh": {
      // The zsh script completes the stacks and the resources with their own functions.
      return source.includes(flag === "--stack" ? ":stack:_tdk_stacks" : ":service:_tdk_resources");
    }
    case "fish": {
      const command = flag === "--stack" ? "tdk stacks --json" : "tdk resources --json";
      const line = source.split("\n").find((entry) => entry.includes(`-l ${flag.slice(2)} -r`));
      return line?.includes(command) ?? false;
    }
    case "powershell":
      return source.includes(`if ($previous -eq '${flag}')`);
  }
}

describe("shell completion candidates", () => {
  it("offers every registered command in all four shells", () => {
    for (const shell of SHELLS) {
      const { names } = shapeOf(shell);
      for (const command of program.commands) {
        expect(names, `${shell} is missing the command ${command.name()}`).toContain(
          command.name(),
        );
        for (const alias of command.aliases()) {
          expect(names, `${shell} is missing the alias ${alias}`).toContain(alias);
        }
      }
    }
  });

  it("offers every flag of every command in all four shells", () => {
    for (const shell of SHELLS) {
      const { options } = shapeOf(shell);
      for (const command of program.commands) {
        const expected = sorted(
          command.options.map((option) => option.long).filter((flag): flag is string => !!flag),
        );
        expect(sorted(options[command.name()] ?? []), `${shell} ${command.name()}`).toEqual(
          expected,
        );
      }
    }
  });

  it("offers the flags of the sub-commands in all four shells", () => {
    for (const shell of SHELLS) {
      const { options } = shapeOf(shell);
      for (const command of program.commands) {
        for (const subcommand of command.commands) {
          const expected = sorted(
            subcommand.options
              .map((option) => option.long)
              .filter((flag): flag is string => !!flag),
          );
          expect(
            sorted(options[`${command.name()} ${subcommand.name()}`] ?? []),
            `${shell} ${command.name()} ${subcommand.name()}`,
          ).toEqual(expected);
        }
      }
    }
  });

  it("offers the same commands and flags in all four shells", () => {
    const shapes = SHELLS.map((shell) => shapeOf(shell));
    const [reference, ...others] = shapes;

    for (const shape of others) {
      expect(sorted(shape.names)).toEqual(sorted(reference.names));
      expect(normalize(shape.options)).toEqual(normalize(reference.options));
    }
  });

  it("offers the sub-command names in all four shells", () => {
    for (const shell of SHELLS) {
      const { subcommands } = shapeOf(shell);
      for (const command of program.commands) {
        if (command.commands.length === 0) continue;
        const expected = sorted(command.commands.map((subcommand) => subcommand.name()));
        expect(sorted(subcommands[command.name()] ?? []), `${shell} ${command.name()}`).toEqual(
          expected,
        );
      }
    }
  });

  it("offers the same sub-command names in all four shells", () => {
    const shapes = SHELLS.map((shell) => shapeOf(shell));
    const [reference, ...others] = shapes;

    for (const shape of others) {
      expect(normalize(shape.subcommands)).toEqual(normalize(reference.subcommands));
    }
  });

  it("offers the resource types of the command that asks for them", () => {
    // `tdk resource` creates a resource, `tdk resources` filters the resources of the project.
    for (const shell of SHELLS) {
      expect(valuesOf(shell, "resource", "--type"), shell).toEqual([...RESOURCE_TYPE_VALUES]);
      expect(valuesOf(shell, "resources", "--type"), shell).toEqual([...VALID_RESOURCE_TYPES]);
    }
  });

  it("offers the frameworks of the type of the command line", () => {
    for (const shell of SHELLS) {
      expect(typeValuesOf(shell, "--framework", "frontend"), shell).toEqual(
        Object.keys(FRONTEND_FRAMEWORKS),
      );
      expect(typeValuesOf(shell, "--framework", "backend"), shell).toEqual(
        Object.keys(BACKEND_FRAMEWORKS),
      );
    }
  });

  it("offers the languages of the backend", () => {
    for (const shell of SHELLS) {
      expect(typeValuesOf(shell, "--language", "backend"), shell).toEqual(
        Object.keys(BACKEND_LANGUAGES),
      );
    }
  });

  it("completes the stacks and the resources of the current project", () => {
    for (const shell of SHELLS) {
      const source = renderCompletionScript(shell, candidates);
      expect(source, shell).toContain("tdk stacks --json");
      expect(source, shell).toContain("tdk resources --json");
    }
  });

  it("completes the stacks behind --stack and the resources behind --only in all four shells", () => {
    for (const shell of SHELLS) {
      expect(projectValuesOf(shell, "--stack"), shell).toBe(true);
      expect(projectValuesOf(shell, "--only"), shell).toBe(true);
    }
  });

  it("offers the global flags in all four shells", () => {
    const globalFlags = sorted(
      program.options
        .map((option) => option.long)
        .filter((flag): flag is string => !!flag)
        .concat("--help"),
    );

    for (const shell of SHELLS) {
      expect(sorted(globalFlagsOf(shell)), shell).toEqual(globalFlags);
    }
  });
});
