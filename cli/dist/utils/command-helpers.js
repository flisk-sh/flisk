import { showErrorAndExit } from "./errors.js";
import { showCancelled } from "./formatting.js";
import { promptConfirm } from "./prompt.js";
export const YES_OPTION_FLAGS = "-y, --yes";
export const YES_OPTION_DESCRIPTION = "Skip prompts and confirmations; use defaults";
/**
 * Registers the standard `-y, --yes` flag on a Commander command with shared help text.
 */
export function addYesOption(command, description = YES_OPTION_DESCRIPTION) {
    return command.option(YES_OPTION_FLAGS, description, false);
}
export async function confirmAction(message, defaultValue = true) {
    const confirm = await promptConfirm({ message, initial: defaultValue });
    if (!confirm) {
        showCancelled();
    }
    return confirm;
}
export function assertValid(validation, exitCode = 1) {
    if (!validation.valid) {
        showErrorAndExit(validation.error ?? "Validation failed", exitCode);
    }
}
/**
 * Early return for `--dry-run`. Prints the standard `Dry run - ...` / `Would run: ...` pair, or, when the command
 * has a plan of its own to show (a list of files, say), calls `printPlan` instead. Returns true when it handled the run.
 */
export function handleDryRun(options, description, command, printPlan) {
    if (options.dryRun) {
        if (printPlan) {
            printPlan();
        }
        else {
            console.log(`Dry run - ${description}`);
            console.log(`Would run: ${command}`);
        }
        return true;
    }
    return false;
}
/**
 * Prompt for confirmation with cancellation handling.
 * Displays a confirmation prompt and exits/cancels if user declines.
 * @param message - The confirmation message to display
 * @param onCancel - Optional callback when user cancels (defaults to returning false)
 * @returns Promise<boolean> - true if confirmed, false if cancelled (with callback)
 */
export async function confirmOrCancel(message, onCancel) {
    const confirmed = await confirmAction(message, true);
    if (!confirmed) {
        if (onCancel) {
            onCancel();
        }
        return false;
    }
    return true;
}
