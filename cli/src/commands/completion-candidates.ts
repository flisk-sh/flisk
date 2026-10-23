// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * The data the shell completion scripts suggest.
 *
 * Every list is derived from the CLI itself: the commands and their flags come from the registered
 * Commander commands, and the value lists come from the framework, language and resource-type
 * registries. Nothing here repeats a list that already lives in the CLI, so a new command or a new
 * registry entry shows up in the completions without touching this file.
 */
import type { Command, Option } from "commander";
import { BACKEND_FRAMEWORKS } from "../backend-frameworks/registry.js";
import { BACKEND_LANGUAGES } from "../backend-languages/registry.js";
import { FRONTEND_FRAMEWORKS } from "../frontend-frameworks/registry.js";
import { RESOURCE_TYPE_VALUES } from "../types/index.js";
import { VALID_RESOURCE_TYPES } from "../utils/constants.js";

/** What a command's positional argument completes. */
export type CompletionPositional =
  /** The stacks of the current project. */
  | "stacks"
  /** The resources of the current project. */
  | "resources"
  /** The stacks and the resources of the current project. */
  | "stacks-and-resources"
  /** The names of the other commands (`flisk help <command>`). */
  | "commands";

/** A flag a command accepts. */
export interface CompletionOption {
  /** The long flag, for example `--json`. */
  flag: string;
  /** One-line summary shown next to the candidate. */
  description: string;
  /** True when the flag is followed by a value (`--type <type>`). */
  takesValue: boolean;
}

/** The values of a flag that depend on the `--type` of the current command line. */
export interface TypeDependentValues {
  /** The values for every `--type` the CLI accepts, keyed by the type. */
  byType: Record<string, string[]>;
  /** The values for a command line without a `--type`. */
  fallback: string[];
}

/** A command the shells suggest. */
export interface CompletionCommand {
  /** The name the user types (`flisk doctor`). */
  name: string;
  /** Alternative names the CLI accepts for the same command. */
  aliases: string[];
  /** One-line summary shown next to the candidate. */
  description: string;
  /** The flags the command accepts. */
  options: CompletionOption[];
  /** The command's own sub-commands (`flisk config verify`). */
  subcommands: CompletionCommand[];
  /** What the command's positional argument completes, when it takes a project value. */
  positional?: CompletionPositional;
  /** The name of the positional argument of the command, when it takes one. */
  argument?: string;
  /** True when the positional argument takes many values. */
  variadic?: boolean;
  /** The values of the flags of this command, when the command accepts another set. */
  optionValues?: Record<string, string[]>;
}

/** Everything the four completion scripts suggest. */
export interface CompletionCandidates {
  /** The commands, in the order the CLI registers them. */
  commands: CompletionCommand[];
  /** The flags every command accepts. */
  globalOptions: CompletionOption[];
  /** The fixed value lists, keyed by flag name (`--type` holds the resource types). */
  values: Record<string, string[]>;
  /** The values that depend on the `--type` of the command line, keyed by flag name. */
  typeValues: Record<string, TypeDependentValues>;
}

/**
 * The positional argument of a command, keyed by the command path (`"agent sessions"`). Only the
 * commands whose argument names something in the current project are listed.
 */
const POSITIONALS: Record<string, CompletionPositional> = {
  help: "commands",
  up: "stacks-and-resources",
  stack: "stacks",
  restart: "resources",
  logs: "resources",
  "agent sessions": "resources",
};

/**
 * The values of a flag, for the commands that accept another set than the default.
 *
 * `flisk resource` creates a resource and accepts the creatable types plus `sdk`
 * (`RESOURCE_TYPE_VALUES`), while `flisk resources` filters the resources of the project and accepts
 * every type a resource can have (`VALID_RESOURCE_TYPES`), which also holds `library` and
 * `migrator`. The completion offers exactly what the command accepts, so it never suggests a type
 * the command rejects.
 */
const COMMAND_VALUES: Record<string, Record<string, string[]>> = {
  resources: { "--type": [...VALID_RESOURCE_TYPES] },
};

/**
 * The values of the flags that depend on the `--type` of the command line.
 *
 * `--framework` only exists for a frontend or a backend resource, and the framework ids of the two
 * are disjoint, so the completion offers the frameworks of the type the user asked for. `--language`
 * belongs to a backend, so it offers the languages only for that type.
 */
const TYPE_VALUES: Record<string, TypeDependentValues> = {
  "--framework": {
    byType: {
      frontend: Object.keys(FRONTEND_FRAMEWORKS),
      backend: Object.keys(BACKEND_FRAMEWORKS),
    },
    // `flisk resource` creates a backend unless the user asks for another type.
    fallback: Object.keys(BACKEND_FRAMEWORKS),
  },
  "--language": {
    byType: { backend: Object.keys(BACKEND_LANGUAGES) },
    fallback: Object.keys(BACKEND_LANGUAGES),
  },
};

/**
 * The private accessors Commander offers for the help command and the help option.
 *
 * Commander keeps the help command out of `program.commands` and the help option out of
 * `program.options`, so the completions read them through these accessors. That is what keeps the
 * name, the description and the flag of the help command in step with the registered program.
 */
interface CommanderInternals {
  _getHelpCommand?: () => Command | null;
  _getHelpOption?: () => Option | null;
}

function toOptions(options: readonly Option[]): CompletionOption[] {
  return options
    .filter((option) => typeof option.long === "string")
    .map((option) => ({
      flag: option.long as string,
      description: option.description,
      takesValue: option.required || option.optional,
    }));
}

/**
 * The help command of the program.
 *
 * Commander adds it to the program itself, so the name, the description and the aliases are the
 * ones the CLI registers. The help flag is offered as well: `flisk help --help` prints the help of
 * the program, exactly like the help flag of every other command.
 */
function helpCommandOf(program: Command): CompletionCommand | undefined {
  const internals = program as unknown as CommanderInternals;
  const help = internals._getHelpCommand?.();
  if (!help) return undefined;

  const helpOption = internals._getHelpOption?.();
  return {
    name: help.name(),
    aliases: help.aliases(),
    description: help.description(),
    options: helpOption ? toOptions([helpOption]) : [],
    subcommands: [],
    positional: "commands",
  };
}

function toCompletionCommand(command: Command, path: string): CompletionCommand {
  const optionValues = COMMAND_VALUES[path];
  const argument = command.registeredArguments[0];
  return {
    name: command.name(),
    aliases: command.aliases(),
    description: command.description(),
    options: toOptions(command.options),
    subcommands: command.commands.map((subcommand) =>
      toCompletionCommand(subcommand, `${path} ${subcommand.name()}`),
    ),
    ...(POSITIONALS[path] ? { positional: POSITIONALS[path] } : {}),
    ...(argument ? { argument: argument.name() } : {}),
    ...(argument?.variadic ? { variadic: true } : {}),
    ...(optionValues ? { optionValues } : {}),
  };
}

/**
 * Reads the completion candidates from the CLI: the registered commands with their flags, the
 * global flags of the root program, and the value lists of the framework, language and
 * resource-type registries.
 */
export function buildCompletionCandidates(program: Command): CompletionCandidates {
  const help = helpCommandOf(program);
  const helpOption = (program as unknown as CommanderInternals)._getHelpOption?.();

  return {
    commands: [
      ...(help ? [help] : []),
      ...program.commands.map((command) => toCompletionCommand(command, command.name())),
    ],
    globalOptions: [...toOptions(program.options), ...(helpOption ? toOptions([helpOption]) : [])],
    values: {
      "--type": [...RESOURCE_TYPE_VALUES],
    },
    typeValues: TYPE_VALUES,
  };
}
