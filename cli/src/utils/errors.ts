// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import { QUICKSTART_DOCS_URL } from "./constants.js";
import { getContainerRuntimeStatus } from "./docker.js";
import { findProjectRoot } from "./paths.js";
import { suggestClosest } from "./suggestions.js";
import { isTiltAvailable } from "./tilt.js";

export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function logVerbose(message: string, err?: unknown): void {
  if (process.env.TDK_VERBOSE) {
    const errMsg = err !== undefined ? `: ${getErrorMessage(err)}` : "";
    console.warn(chalk.gray(`${message}${errMsg}`));
  }
}

export class TdkError extends Error {
  public suggestions: string[];
  public exitCode: number;

  constructor(message: string, suggestions: string[] = [], exitCode: number = 1) {
    super(message);
    this.name = "TdkError";
    this.suggestions = suggestions;
    this.exitCode = exitCode;
  }

  display(): void {
    showError(this.message, undefined, this.suggestions);
  }

  /** Display this error and exit the process with its exit code. */
  exit(): never {
    this.display();
    process.exit(this.exitCode);
  }
}

/**
 * Thrown by the `process.exit` test double so the stack unwinds at an intentional exit.
 * `runCommand` rethrows it instead of formatting it as a command failure.
 */
export class ProcessExitError extends Error {
  public readonly code: number;

  constructor(code: number = 1) {
    super(`process.exit(${code})`);
    this.name = "ProcessExitError";
    this.code = code;
  }
}

function closestNameSuggestions(
  names: readonly string[],
  candidates: readonly string[],
  includeInput = false,
): string[] {
  const suggestions = new Set<string>();
  for (const name of names) {
    const closest = suggestClosest(name, candidates);
    if (closest) {
      suggestions.add(
        includeInput ? `Did you mean "${closest}" for "${name}"?` : `Did you mean "${closest}"?`,
      );
    }
  }
  return [...suggestions];
}

export const errorFactories = {
  tiltNotInstalled: () =>
    new TdkError("Tilt CLI is not installed", [
      "Install Tilt: `brew install tilt` (macOS)",
      "Or download from: https://docs.tilt.dev/install.html",
      "Verify with: `tilt version`",
      `Setup guide: ${QUICKSTART_DOCS_URL}`,
    ]),
  dockerNotAvailable: () =>
    new TdkError("Docker (or a compatible container runtime) is not running", [
      "Start Docker Desktop, then verify with: `docker ps`",
      "Or start Colima: `colima start`",
      "Or start the Docker service on Linux: `sudo systemctl start docker`",
      `Setup guide: ${QUICKSTART_DOCS_URL}`,
    ]),
  dockerNotResponding: () =>
    new TdkError("Docker is running but not responding (`docker ps` hung for 10s)", [
      "Quit and reopen Docker Desktop, or run `colima restart`",
      "Then verify with: `docker ps`",
    ]),
  stackNotFound: (name: string, stackNames: readonly string[] = []) =>
    new TdkError(`Stack "${name}" not found`, [
      ...closestNameSuggestions([name], stackNames),
      "Run `flisk stacks` to see available stacks",
      "Run `flisk stack` to assign resources to a stack",
    ]),
  resourceNotFound: (name: string, resourceNames: readonly string[] = []) =>
    new TdkError(`Resource "${name}" not found`, [
      ...closestNameSuggestions([name], resourceNames),
      "Run `flisk resources` to list all resources",
      "Check the resource name spelling",
    ]),
  unknownServices: (names: readonly string[], validNames: readonly string[]) => {
    // Service selectors are Tilt resource names, so share the resource suggestion path.
    const suggestions = closestNameSuggestions(names, validNames, names.length > 1);
    return new TdkError(
      `Unknown service ${names.join(", ")}. Valid names: ${validNames.join(", ")}`,
      suggestions,
      2,
    );
  },
  directoryExists: (path: string) =>
    new TdkError(`Directory already exists: ${path}`, [
      "Use `--path` to specify a different location",
      "Remove the existing directory if no longer needed",
    ]),
  invalidPath: (path: string) =>
    new TdkError(`Invalid path: ${path}`, [
      "Path must be within the project directory",
      'Path cannot contain special characters like <>:"|?*',
    ]),
  notInProject: () =>
    new TdkError("Could not find project root (no .tdk/project.json found)", [
      "Run this from within a Flisk project",
      "Run `flisk project --yes` to initialize a new project",
    ]),
};

export function requireProjectRoot(): string {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    return errorFactories.notInProject().exit();
  }
  return projectRoot;
}

function handleCommandError(err: unknown): never {
  if (err instanceof TdkError) {
    err.exit();
  }
  showError(getErrorMessage(err));
  process.exit(1);
}

export async function runCommand<T>(
  action: () => Promise<T>,
  options?: { verbose?: boolean },
): Promise<T | never> {
  try {
    return await action();
  } catch (err: unknown) {
    if (err instanceof ProcessExitError) {
      throw err;
    }
    if (options?.verbose && err instanceof Error && err.stack) {
      console.error(chalk.gray(err.stack));
    }
    return handleCommandError(err);
  }
}

export async function withTiltCheck<T>(
  action: () => Promise<T>,
  options?: { verbose?: boolean },
): Promise<T | never> {
  const problems: TdkError[] = [];
  const runtime = getContainerRuntimeStatus();
  if (runtime === "unresponsive") {
    problems.push(errorFactories.dockerNotResponding());
  } else if (runtime === "missing") {
    problems.push(errorFactories.dockerNotAvailable());
  }
  if (!(await isTiltAvailable())) {
    problems.push(errorFactories.tiltNotInstalled());
  }

  if (problems.length > 0) {
    console.error(chalk.red(`\nFlisk can't start - missing prerequisites:\n`));
    problems.forEach((problem, i) => {
      if (i > 0) console.error("");
      problem.display();
    });
    console.error(chalk.gray(`\nRun \`flisk doctor\` for a full environment check.`));
    process.exit(1);
  }

  return runCommand(action, options);
}

export function showErrorAndExit(
  message: string,
  exitCode: number = 1,
  suggestions?: string[],
): never {
  showError(message, undefined, suggestions);
  process.exit(exitCode);
}

/** Display a formatted error message. Does NOT exit. */
export function showError(message: string, context?: string, suggestions?: string[]): void {
  console.error(chalk.red(`❌ ${message}`));

  if (context) {
    console.error(chalk.gray(`   ${context}`));
  }

  if (suggestions && suggestions.length > 0) {
    console.error(chalk.yellow("\n💡 Suggestions:"));
    for (const s of suggestions) {
      console.error(chalk.cyan(`   → ${s}`));
    }
  }
}

export function handleTiltFailure(command: "up" | "down", exitCode: number): never {
  console.error(chalk.red(`\ntilt ${command} failed with exit code ${exitCode}`));
  process.exit(exitCode);
}
