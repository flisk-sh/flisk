// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { writeSync } from "node:fs";
import type { Command } from "commander";
import type { ValidationResult } from "../types/index.js";
import { showErrorAndExit } from "./errors.js";
import { showCancelled } from "./formatting.js";
import { createMachineEnvelope } from "./machine-output.js";
import { promptConfirm } from "./prompt.js";

export const YES_OPTION_FLAGS = "-y, --yes";
export const YES_OPTION_DESCRIPTION = "Skip prompts and confirmations; use defaults";

export const NO_POSITIONAL_HINTS: Readonly<Record<string, string>> = {
  down: "Service names are not positional: down stops the whole project. Use: flisk down (or flisk down --project <path>)",
  status:
    "Service names are not positional: status shows the whole project. Use: flisk status (or flisk logs --service <name>)",
  logs: "Service names are not positional. Use: flisk logs --service <name>",
};

function isJsonRequested(command: Command): boolean {
  try {
    if (command.opts()?.json === true) return true;
  } catch {}
  const raw = (command as Command & { rawArgs?: string[] }).rawArgs;
  return raw?.includes("--json") ?? false;
}

/**
 * Attaches positional argument hints and routes parse errors to JSON envelopes when `--json` is requested.
 */
export function attachNoPositionalHint<T extends Command>(
  command: T,
  commandName = command.name(),
): T {
  const hint = NO_POSITIONAL_HINTS[commandName];
  if (!hint) return command;

  let originalShowHelp: string | boolean = `\n${hint}`;
  Object.defineProperty(command, "_showHelpAfterError", {
    get() {
      if (isJsonRequested(command)) return false;
      return originalShowHelp;
    },
    set(val: string | boolean) {
      originalShowHelp = val;
    },
    configurable: true,
    enumerable: true,
  });

  command.configureOutput({
    outputError: (str, write) => {
      if (isJsonRequested(command)) return;
      write(str);
    },
    writeErr: (str) => {
      if (isJsonRequested(command)) return;
      process.stderr.write(str);
    },
  });

  command.exitOverride((err) => {
    if (err.exitCode === 0) process.exit(0);
    if (isJsonRequested(command)) {
      const isExcess = err.code === "commander.excessArguments";
      const envelope = createMachineEnvelope(null, [
        {
          code: "USAGE",
          message: err.message,
          ...(isExcess && hint ? { suggestions: [hint] } : {}),
        },
      ]);
      // Synchronous: a queued pipe write would be lost to process.exit() below.
      writeSync(1, `${JSON.stringify(envelope)}\n`);
      process.exit(err.exitCode ?? 1);
    }
    process.exit(err.exitCode ?? 1);
  });

  return command;
}

/**
 * Registers the standard `-y, --yes` flag on a Commander command with shared help text.
 */
export function addYesOption<T extends Command>(
  command: T,
  description: string = YES_OPTION_DESCRIPTION,
): T {
  return command.option(YES_OPTION_FLAGS, description, false);
}

export async function confirmAction(message: string, defaultValue = true): Promise<boolean> {
  const confirm = await promptConfirm({ message, initial: defaultValue });

  if (!confirm) {
    showCancelled();
  }

  return confirm;
}

export function assertValid(
  validation: ValidationResult,
  exitCode: number = 1,
): asserts validation is { valid: true } {
  if (!validation.valid) {
    showErrorAndExit(validation.error ?? "Validation failed", exitCode);
  }
}

/**
 * Early return for `--dry-run`. Prints the standard `Dry run - ...` / `Would run: ...` pair, or, when the command
 * has a plan of its own to show (a list of files, say), calls `printPlan` instead. Returns true when it handled the run.
 */
export function handleDryRun(
  options: { dryRun?: boolean },
  description: string,
  command: string,
  printPlan?: () => void,
): boolean {
  if (options.dryRun) {
    if (printPlan) {
      printPlan();
    } else {
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
export async function confirmOrCancel(message: string, onCancel?: () => void): Promise<boolean> {
  const confirmed = await confirmAction(message, true);
  if (!confirmed) {
    if (onCancel) {
      onCancel();
    }
    return false;
  }
  return true;
}
