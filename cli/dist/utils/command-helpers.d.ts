import type { ValidationResult } from "../types/index.js";
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
