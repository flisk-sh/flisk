// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { writeSync } from "node:fs";
import { format, stripVTControlCharacters } from "node:util";
import chalk from "chalk";
import { FliskError, ProcessExitError } from "./errors.js";
import { createMachineEnvelope, type MachineError, toMachineError } from "./machine-output.js";

/** What a `--json` action reports: its data, any errors, and a non-zero exit code when the report is a failure. */
export interface JsonCommandResult {
  data: unknown;
  errors?: MachineError[];
  exitCode?: number;
}

/** A command failure with a machine code more precise than COMMAND_FAILED, such as IMPORT_FAILED. */
export class JsonCommandError extends FliskError {
  public readonly code: string;

  constructor(code: string, message: string, suggestions: string[] = [], exitCode: number = 1) {
    super(message, suggestions, exitCode);
    this.name = "JsonCommandError";
    this.code = code;
  }
}

/** The longest message taken from a command's stderr when it exited without a FliskError. */
const MAX_STDERR_MESSAGE = 2000;

/**
 * The message and suggestions of a failure that a deeper `showError` printed before it exited: its "❌" line and its
 * "→" lines. Without a "❌" line the other printed lines are the message, and without any the fallback is.
 */
export function failureFromStderr(
  text: string,
  fallback: string,
): Pick<MachineError, "message" | "suggestions"> {
  const lines = stripVTControlCharacters(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const suggestions = lines
    .filter((line) => line.startsWith("→"))
    .map((line) => line.replace(/^→\s*/, ""));
  const errorLine = lines.find((line) => line.startsWith("❌"));
  const rest = lines.filter((line) => !line.startsWith("→")).join("\n");
  const message = errorLine
    ? errorLine.replace(/^❌\s*/, "")
    : rest.slice(0, MAX_STDERR_MESSAGE) || fallback;
  return { message, ...(suggestions.length > 0 ? { suggestions } : {}) };
}

function describeFailure(error: unknown): { error: MachineError; exitCode: number } {
  if (error instanceof JsonCommandError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        ...(error.suggestions.length > 0 ? { suggestions: error.suggestions } : {}),
      },
      exitCode: error.exitCode,
    };
  }
  return toMachineError(error);
}

/**
 * Runs a command's action for `--json`. While it runs, colour is off and everything a person would read
 * (`console.log`, `console.info`, `console.debug`, `process.stdout.write`) goes to stderr, so stdout carries exactly one
 * envelope: the action's `data` on success, or `data: null` and one error on failure. A thrown FliskError becomes
 * COMMAND_FAILED with its suggestions (a JsonCommandError keeps its own code), anything else INTERNAL (exit 2). A
 * `process.exit` from deeper code becomes `failureCode`, with the message that code printed through `showError`.
 */
export async function runJsonCommand(
  failureCode: string,
  command: string,
  action: () => Promise<JsonCommandResult>,
): Promise<void> {
  const stdout = process.stdout;
  const original = {
    write: stdout.write,
    log: console.log,
    info: console.info,
    debug: console.debug,
    error: console.error,
    level: chalk.level,
  };
  let printedErrors = "";
  let emitted = false;
  const emit = (envelope: ReturnType<typeof createMachineEnvelope>, sync = false): void => {
    if (emitted) return;
    emitted = true;
    const line = `${JSON.stringify(envelope)}\n`;
    // An exit handler cannot wait for an asynchronous write, so the fallback writes synchronously.
    if (sync) writeSync(1, line);
    else original.write.call(stdout, line);
  };
  const exitFailure = (exitCode: number): MachineError => ({
    code: failureCode,
    ...failureFromStderr(printedErrors, `${command} exited with code ${exitCode}`),
  });
  const onExit = (exitCode: number): void => {
    emit(createMachineEnvelope(null, [exitFailure(exitCode)]), true);
  };
  const restore = (): void => {
    stdout.write = original.write;
    console.log = original.log;
    console.info = original.info;
    console.debug = original.debug;
    console.error = original.error;
    chalk.level = original.level;
    process.off("exit", onExit);
  };

  // Bun's console.error() with no arguments writes its newline to stdout, so an empty call prints "" instead.
  const toStderr = (...args: unknown[]): void =>
    original.error.apply(console, args.length > 0 ? args : [""]);
  chalk.level = 0;
  console.log = toStderr;
  console.info = toStderr;
  console.debug = toStderr;
  console.error = (...args: unknown[]): void => {
    printedErrors += `${format(...args)}\n`;
    toStderr(...args);
  };
  stdout.write = ((...args: Parameters<typeof process.stderr.write>) =>
    process.stderr.write(...args)) as typeof stdout.write;
  process.on("exit", onExit);

  let result: JsonCommandResult;
  try {
    result = await action();
  } catch (error) {
    if (error instanceof ProcessExitError) {
      // A test double for process.exit: report the exit the way the exit handler would, then let it unwind.
      emit(createMachineEnvelope(null, [exitFailure(error.code)]));
      restore();
      throw error;
    }
    restore();
    const failure = describeFailure(error);
    emit(createMachineEnvelope(null, [failure.error]));
    // The message goes to stderr too, unless the command already printed it there.
    if (!printedErrors.includes(failure.error.message)) console.error(failure.error.message);
    process.exit(failure.exitCode);
  }
  restore();
  emit(createMachineEnvelope(result.data, result.errors ?? []));
  if (result.exitCode) process.exit(result.exitCode);
}
