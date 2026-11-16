// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { writeSync } from "node:fs";
import { showErrorAndExit } from "./errors.js";
import { showCancelled } from "./formatting.js";
import { createMachineEnvelope } from "./machine-output.js";
import { promptConfirm } from "./prompt.js";
export const YES_OPTION_FLAGS = "-y, --yes";
export const YES_OPTION_DESCRIPTION = "Skip prompts and confirmations; use defaults";
export const NO_POSITIONAL_HINTS = {
    down: "Service names are not positional: down stops the whole project. Use: flisk down (or flisk down --project <path>)",
    status: "Service names are not positional: status shows the whole project. Use: flisk status (or flisk logs --service <name>)",
    logs: "Service names are not positional. Use: flisk logs --service <name>",
};
/**
 * True when `--json` was passed to flisk: parsed by this command, or anywhere on the command
 * line before `--` (an unknown command or option stops parsing before `--json` is read).
 */
function isJsonRequested(command) {
    try {
        if (command.opts()?.json === true)
            return true;
    }
    catch { }
    let root = command;
    while (root.parent)
        root = root.parent;
    const raw = root.rawArgs ?? [];
    // Before parseAsync() runs, Commander has no rawArgs yet; an early error (an unknown `help`
    // target) still has to see --json, so read the real invocation instead (#4246).
    const args = raw.length > 0 ? raw : process.argv.slice(2);
    const end = args.indexOf("--");
    return (end === -1 ? args : args.slice(0, end)).includes("--json");
}
/** Splits Commander's `(Did you mean x?)` line off a usage error message. */
function splitDidYouMean(message) {
    const match = /^([\s\S]*?)\n\((Did you mean [^\n]*\?)\)\s*$/.exec(message);
    if (!match?.[1] || !match[2])
        return { message };
    return { message: match[1], didYouMean: match[2] };
}
/**
 * Routes a command's usage errors (unknown option or command, missing argument or option
 * value, excess arguments) to the `{schemaVersion, data: null, errors}` envelope on stdout when
 * `--json` is requested, with the same exit code. Without `--json` the output is unchanged.
 * `hint` is added as a suggestion for excess positional arguments (#4246, #4251).
 */
export function routeUsageErrorsToJson(command, hint) {
    const output = command.configureOutput();
    const outputError = output.outputError ?? ((str, write) => write(str));
    const writeErr = output.writeErr ?? ((str) => process.stderr.write(str));
    command.configureOutput({
        outputError: (str, write) => {
            if (isJsonRequested(command))
                return;
            outputError(str, write);
        },
        writeErr: (str) => {
            if (isJsonRequested(command))
                return;
            writeErr(str);
        },
    });
    command.exitOverride((err) => {
        if (err.exitCode === 0)
            process.exit(0);
        if (isJsonRequested(command)) {
            const { message, didYouMean } = splitDidYouMean(err.message);
            const suggestions = [
                ...(didYouMean ? [didYouMean] : []),
                ...(err.code === "commander.excessArguments" && hint ? [hint] : []),
            ];
            const envelope = createMachineEnvelope(null, [
                { code: "USAGE", message, ...(suggestions.length > 0 ? { suggestions } : {}) },
            ]);
            // Synchronous: a queued pipe write would be lost to process.exit() below.
            writeSync(1, `${JSON.stringify(envelope)}\n`);
        }
        process.exit(err.exitCode ?? 1);
    });
    return command;
}
/**
 * Attaches positional argument hints and routes parse errors to JSON envelopes when `--json` is requested.
 */
export function attachNoPositionalHint(command, commandName = command.name()) {
    const hint = NO_POSITIONAL_HINTS[commandName];
    if (!hint)
        return command;
    let originalShowHelp = `\n${hint}`;
    Object.defineProperty(command, "_showHelpAfterError", {
        get() {
            if (isJsonRequested(command))
                return false;
            return originalShowHelp;
        },
        set(val) {
            originalShowHelp = val;
        },
        configurable: true,
        enumerable: true,
    });
    return routeUsageErrorsToJson(command, hint);
}
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
