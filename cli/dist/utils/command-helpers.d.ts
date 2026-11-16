import type { Command } from "commander";
import type { ValidationResult } from "../types/index.js";
export declare const YES_OPTION_FLAGS = "-y, --yes";
export declare const YES_OPTION_DESCRIPTION = "Skip prompts and confirmations; use defaults";
export declare const NO_POSITIONAL_HINTS: Readonly<Record<string, string>>;
/**
 * Routes a command's usage errors (unknown option or command, missing argument or option
 * value, excess arguments) to the `{schemaVersion, data: null, errors}` envelope on stdout when
 * `--json` is requested, with the same exit code. Without `--json` the output is unchanged.
 * `hint` is added as a suggestion for excess positional arguments (#4246, #4251).
 */
export declare function routeUsageErrorsToJson<T extends Command>(command: T, hint?: string): T;
/**
 * Attaches positional argument hints and routes parse errors to JSON envelopes when `--json` is requested.
 */
export declare function attachNoPositionalHint<T extends Command>(command: T, commandName?: string): T;
/**
 * Registers the standard `-y, --yes` flag on a Commander command with shared help text.
 */
export declare function addYesOption<T extends Command>(command: T, description?: string): T;
export declare function confirmAction(message: string, defaultValue?: boolean): Promise<boolean>;
export declare function assertValid(validation: ValidationResult, exitCode?: number): asserts validation is {
    valid: true;
};
/**
 * Early return for `--dry-run`. Prints the standard `Dry run - ...` / `Would run: ...` pair, or, when the command
 * has a plan of its own to show (a list of files, say), calls `printPlan` instead. Returns true when it handled the run.
 */
export declare function handleDryRun(options: {
    dryRun?: boolean;
}, description: string, command: string, printPlan?: () => void): boolean;
/**
 * Prompt for confirmation with cancellation handling.
 * Displays a confirmation prompt and exits/cancels if user declines.
 * @param message - The confirmation message to display
 * @param onCancel - Optional callback when user cancels (defaults to returning false)
 * @returns Promise<boolean> - true if confirmed, false if cancelled (with callback)
 */
export declare function confirmOrCancel(message: string, onCancel?: () => void): Promise<boolean>;
