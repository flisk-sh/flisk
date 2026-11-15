/**
 * The CLI command tree as plain data, generated from `commands/registry.ts` by
 * `cli/scripts/generate-command-specs.mjs`. Do not edit by hand.
 *
 * `cli.ts` builds its Commander program from this table instead of importing every
 * command module. A heavy command file (generator, discovery, TUI, ...) is imported only
 * when that command actually runs, so `flisk <command> --help` and cheap argument
 * validation do not pay for the whole module graph (#4212).
 *
 * The parity test in `src/commands/__tests__/command-specs.test.ts` fails if this table
 * and `createProgram()` disagree about any command, option, argument or help text.
 */
import type { CommandSpec } from "./command-specs.js";
export declare const COMMAND_SPECS: readonly CommandSpec[];
