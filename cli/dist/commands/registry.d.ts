/**
 * The commands the CLI registers.
 *
 * `cli/src/program.ts` adds every command in this list to the root program, and the shell
 * completion generator reads the same program, so a new command cannot ship without a completion
 * candidate.
 *
 * The list is built inside a function on purpose: the completion command reads the program it is
 * registered on (`command.parent`), so `commands/completion.ts` never imports this module and
 * there is no cycle between the two.
 */
import type { Command } from "commander";
/** Every command the CLI registers, in the order `flisk --help` lists them. */
export declare function getRegisteredCommands(): readonly Command[];
