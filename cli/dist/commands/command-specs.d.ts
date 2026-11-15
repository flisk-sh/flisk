import { Command } from "commander";
export interface CommandOptionSpec {
    flags: string;
    description: string;
    defaultValue?: unknown;
    mandatory?: boolean;
    argChoices?: string[];
    envVar?: string;
    hidden?: boolean;
    presetArg?: unknown;
}
export interface CommandArgumentSpec {
    name: string;
    description: string;
    required: boolean;
    variadic: boolean;
    defaultValue?: unknown;
    argChoices?: string[];
}
export interface CommandSpec {
    name: string;
    /** Path from the root program, e.g. ["config", "verify"]. */
    path: string[];
    description: string;
    aliases: string[];
    hidden: boolean;
    /** False for command groups (`config`, `tool`, ...) that only own subcommands. */
    hasAction: boolean;
    /** Commands that call `.helpOption(false)` (the flisk-export/import forwarders). */
    helpOptionDisabled?: boolean;
    /** Commands that customise the built-in help flag. */
    helpOption?: {
        flags: string;
        description: string;
    };
    allowUnknown: boolean;
    passThrough: boolean;
    positionalOptions: boolean;
    allowExcessArguments: boolean;
    options: CommandOptionSpec[];
    arguments: CommandArgumentSpec[];
    helpTexts: Record<string, string[]>;
    subcommands: CommandSpec[];
}
/** Called only when Commander accepted the argv and reached a command action. */
export type RunRealCommand = (spec: CommandSpec) => Promise<void>;
/**
 * Cheap validation of a `flisk resource <name>` argument, hoisted so a bad name fails
 * before the generator, discovery and framework modules are imported (#4212).
 *
 * The name is validated only when no earlier check in `resource.ts` could fail first:
 * no `--path`/`--resource-path`, no `--frameworks` listing, no `--base-path`, no
 * version pin in the project, and no `--json` (which prints its own envelope). In those
 * cases the real action runs unchanged and keeps its exact output and exit code.
 */
export declare function validateCheapArguments(spec: CommandSpec, args: readonly unknown[], options: Record<string, unknown>): void;
/**
 * Builds the root program from plain specs. `run` is called only when Commander has accepted
 * the arguments and reached an action, never for help, version or parse errors.
 */
export declare function createSpecProgram(specs: readonly CommandSpec[], run: RunRealCommand): Command;
