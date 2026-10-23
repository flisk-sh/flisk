/**
 * The data the shell completion scripts suggest.
 *
 * Every list is derived from the CLI itself: the commands and their flags come from the registered
 * Commander commands, and the value lists come from the framework, language and resource-type
 * registries. Nothing here repeats a list that already lives in the CLI, so a new command or a new
 * registry entry shows up in the completions without touching this file.
 */
import type { Command } from "commander";
/** What a command's positional argument completes. */
export type CompletionPositional = 
/** The stacks of the current project. */
"stacks"
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
 * Reads the completion candidates from the CLI: the registered commands with their flags, the
 * global flags of the root program, and the value lists of the framework, language and
 * resource-type registries.
 */
export declare function buildCompletionCandidates(program: Command): CompletionCandidates;
