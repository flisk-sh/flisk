/**
 * The root program.
 *
 * The commands live in `commands/registry.ts`; this module wires them into a Commander program.
 * The shell completion generator reads the same program, so the completions and the CLI can never
 * disagree about which commands and flags exist.
 */
import type { Command } from "commander";
/** Builds the root program with every registered command. */
export declare function createProgram(): Command;
