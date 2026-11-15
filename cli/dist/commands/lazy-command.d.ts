import type { CommandSpec } from "./command-specs.js";
/** The module and export that owns each top-level command. */
export declare const LAZY_COMMANDS: Readonly<Record<string, {
    module: string;
    exportName: string;
}>>;
/**
 * Imports one command module and runs the real action with the original argv.
 *
 * The spec program has already validated the arguments, so this parse only dispatches.
 * Commander's option sources and `command.parent` are reconstructed from the full argv.
 */
export declare function runLazyCommand(spec: CommandSpec, argv: readonly string[]): Promise<void>;
