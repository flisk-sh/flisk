import type { Command } from "commander";
export interface HelpTargetResolution {
    command?: Command;
    unknown?: string;
    depth: number;
}
/**
 * Resolves `flisk help <cmd> [sub...]` across nested subcommands, stopping at the first option flag.
 */
export declare function resolveHelpTarget(args: readonly string[], commands: readonly Command[]): HelpTargetResolution;
/**
 * `flisk help <name>` (and nested `flisk help <cmd> <sub>`) should fail for a name that is not a
 * command or alias, like `flisk <name>` does. Returns the unknown name, or undefined when the
 * arguments are not `help <name>` or every path word resolves to a known command/subcommand.
 */
export declare function unknownHelpTarget(args: string[], commands: readonly Command[]): string | undefined;
