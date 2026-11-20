// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { writeSync } from "node:fs";
import { type Command, Option } from "commander";
import type { ValidationResult } from "../types/index.js";
import { rewriteUnknownCommandMessage } from "./command-suggestions.js";
import { FliskError, showErrorAndExit } from "./errors.js";
import { showCancelled } from "./formatting.js";
import { createMachineEnvelope } from "./machine-output.js";
import { promptConfirm } from "./prompt.js";

export const YES_OPTION_FLAGS = "-y, --yes";
export const YES_OPTION_DESCRIPTION = "Skip prompts and confirmations; use defaults";
export const JSON_OPTION_FLAGS = "--json";
/** Every `--json` help line starts with this sentence so a user can tell it never prompts (#4265). */
export const JSON_OPTION_DESCRIPTION = "Print one versioned JSON envelope on stdout; never prompts";

/** Registers the standard `--json` flag with shared help text and an optional command-specific tail. */
export function jsonOption(tail?: string): Option {
  return new Option(
    JSON_OPTION_FLAGS,
    tail ? `${JSON_OPTION_DESCRIPTION}; ${tail}` : JSON_OPTION_DESCRIPTION,
  ).default(false);
}

export const NO_POSITIONAL_HINTS: Readonly<Record<string, string>> = {
  down: "Service names are not positional: down stops the whole project. Use: flisk down (or flisk down --project <path>)",
  status:
    "Service names are not positional: status shows the whole project. Use: flisk status (or flisk logs --service <name>)",
  logs: "Service names are not positional. Use: flisk logs --service <name>",
  networks:
    "Service names are not positional: `flisk networks` lists every service and takes no resource name.",
  projects:
    "Project and resource names are not positional: `flisk projects` shows the current project.",
};

const NO_POSITIONAL_SUGGESTIONS: Readonly<Record<string, readonly string[]>> = {
  networks: [
    "Filter by stack: flisk networks --stack <stack>",
    "One service: flisk networks --json (pick the service from data.services)",
  ],
  projects: [
    "Show the current project: flisk projects (run from the project directory)",
    "Check its configuration: flisk projects --check",
    "Get project details as JSON: flisk projects --json",
  ],
};

/**
 * True when `--json` was passed to flisk: parsed by this command, or anywhere on the command
 * line before `--` (an unknown command or option stops parsing before `--json` is read).
 */
function isJsonRequested(command: Command): boolean {
  try {
    if (command.opts()?.json === true) return true;
  } catch {}
  let root: Command = command;
  while (root.parent) root = root.parent;
  const raw = (root as Command & { rawArgs?: string[] }).rawArgs ?? [];
  // Before parseAsync() runs, Commander has no rawArgs yet; an early error (an unknown `help`
  // target) still has to see --json, so read the real invocation instead (#4246).
  const args = raw.length > 0 ? raw : process.argv.slice(2);
  const end = args.indexOf("--");
  return (end === -1 ? args : args.slice(0, end)).includes("--json");
}

/** Splits Commander's `(Did you mean x?)` line off a usage error message. */
function splitDidYouMean(message: string): { message: string; didYouMean?: string } {
  const match = /^([\s\S]*?)\n\((Did you mean [^\n]*\?)\)\s*$/.exec(message);
  if (!match?.[1] || !match[2]) return { message };
  return { message: match[1], didYouMean: match[2] };
}

/**
 * Routes a command's usage errors (unknown option or command, missing argument or option
 * value, excess arguments) to the `{schemaVersion, data: null, errors}` envelope on stdout when
 * `--json` is requested, with the same exit code. Without `--json` the output is unchanged.
 * `hint` is added as a suggestion for excess positional arguments (#4246, #4251).
 */
export function routeUsageErrorsToJson<T extends Command>(command: T, hint?: string): T {
  const output = command.configureOutput() as {
    outputError?: (str: string, write: (str: string) => void) => void;
    writeErr?: (str: string) => void;
  };
  const outputError = output.outputError ?? ((str, write) => write(str));
  const writeErr = output.writeErr ?? ((str) => process.stderr.write(str));
  const rewriteMessage = (str: string): string =>
    command.parent === null ? rewriteUnknownCommandMessage(str) : str;

  command.configureOutput({
    outputError: (str, write) => {
      if (isJsonRequested(command)) return;
      outputError(rewriteMessage(str), write);
    },
    writeErr: (str) => {
      if (isJsonRequested(command)) return;
      writeErr(str);
    },
  });

  command.exitOverride((err) => {
    if (err.exitCode === 0) process.exit(0);
    // Every parse error is a usage error: an unknown command or option, a missing
    // argument or option value, extra arguments. The commands report their own value
    // errors with exit code 2, so a parser error must not exit 1 next to them (#4523).
    const exitCode = err.exitCode && err.exitCode !== 1 ? err.exitCode : 2;
    if (isJsonRequested(command)) {
      const { message, didYouMean } = splitDidYouMean(rewriteMessage(err.message));
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
    process.exit(exitCode);
  });

  return command;
}

/** `flisk resource` (create) and `flisk resources` (list) are one letter apart, so a `--list` or `-l`
 * on the create command points at the listing command instead of only "unknown option" (#4377). */
export const RESOURCE_LIST_HINT =
  "To list resources, run `flisk resources` (or `flisk resources --json`).";

export function addResourceListHint<T extends Command>(command: T): T {
  const baseOutputError = command.configureOutput().outputError;
  command.configureOutput({
    outputError: (str: string, write: (str: string) => void) => {
      const askedForList =
        str.includes("unknown option '--list'") || str.includes("unknown option '-l'");
      const message = askedForList ? `${str}\n${RESOURCE_LIST_HINT}\n` : str;
      if (baseOutputError) {
        baseOutputError(message, write);
      } else {
        write(message);
      }
    },
  });
  return command;
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

  const suggestions = NO_POSITIONAL_SUGGESTIONS[commandName];
  if (suggestions) {
    // Reject before the action so the real and lightweight programs share the same usage error.
    command.allowExcessArguments().hook("preAction", () => {
      if (command.args.length === 0) return;
      const enteredName = command.parent?.args[0] ?? commandName;
      const name = [commandName, ...command.aliases()].includes(enteredName)
        ? enteredName
        : commandName;
      const formatTypedName = (text: string) =>
        text.replaceAll(`flisk ${commandName}`, `flisk ${name}`);
      const error = new FliskError(formatTypedName(hint), suggestions.map(formatTypedName));
      if (isJsonRequested(command)) {
        const envelope = createMachineEnvelope(null, [
          { code: "USAGE", message: error.message, suggestions: error.suggestions },
        ]);
        writeSync(1, `${JSON.stringify(envelope)}\n`);
        process.exit(error.exitCode);
      }
      error.exit();
    });
    return routeUsageErrorsToJson(command);
  }

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

  if (commandName === "logs") {
    const originalError = command.error.bind(command);
    command.error = (message, options) => {
      const previous = originalShowHelp;
      if (options?.code !== "commander.excessArguments") originalShowHelp = false;
      try {
        return originalError(message, options);
      } finally {
        originalShowHelp = previous;
      }
    };
  }

  return routeUsageErrorsToJson(command, hint);
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
