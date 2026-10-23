import type { Command } from "commander";
/**
 * `flisk help <name>` should fail for a name that is not a command or alias, like `flisk <name>` does.
 * Returns the unknown name, or undefined when the arguments are not `help <name>` or the name is known.
 */
export declare function unknownHelpTarget(args: string[], commands: readonly Command[]): string | undefined;
