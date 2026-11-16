// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import { QUICKSTART_DOCS_URL } from "./constants.js";
import { getContainerRuntimeStatus } from "./docker.js";
import { rememberShownError } from "./last-error.js";
import { findProjectRoot } from "./paths.js";
import { rankByDistance, suggestClosest } from "./suggestions.js";
import { isTiltAvailable } from "./tilt.js";

export const UNKNOWN_RESOURCE_CODE = "UNKNOWN_RESOURCE" as const;

export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function logVerbose(message: string, err?: unknown): void {
  if (process.env.FLISK_VERBOSE) {
    const errMsg = err !== undefined ? `: ${getErrorMessage(err)}` : "";
    console.warn(chalk.gray(`${message}${errMsg}`));
  }
}

export class FliskError extends Error {
  public suggestions: string[];
  public exitCode: number;

  constructor(message: string, suggestions: string[] = [], exitCode: number = 1) {
    super(message);
    this.name = "FliskError";
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

export function unknownResourceSuggestions(
  name: string,
  validNames: readonly string[] = [],
): string[] {
  const ranked = rankByDistance(name, validNames);
  const closest = suggestClosest(name, ranked);
  return [
    ...(closest ? [`Did you mean "${closest}"?`] : []),
    ranked.length > 0 ? `Resources: ${ranked.join(", ")}` : "This project has no resources yet",
    "See the names with: flisk resources",
  ];
}

export class UnknownResourceError extends FliskError {
  public readonly code = UNKNOWN_RESOURCE_CODE;

  constructor(name: string, suggestions: string[]) {
    super(`Resource "${name}" not found in project.`, suggestions, 1);
    this.name = "UnknownResourceError";
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
    new FliskError("Tilt CLI is not installed", [
      "Install Tilt: `brew install tilt` (macOS)",
      "Or download from: https://docs.tilt.dev/install.html",
      "Verify with: `tilt version`",
      `Setup guide: ${QUICKSTART_DOCS_URL}`,
    ]),
  dockerNotAvailable: () =>
    new FliskError("Docker (or a compatible container runtime) is not running", [
      "Start Docker Desktop, then verify with: `docker ps`",
      "Or start Colima: `colima start`",
      "Or start the Docker service on Linux: `sudo systemctl start docker`",
      `Setup guide: ${QUICKSTART_DOCS_URL}`,
    ]),
  dockerNotResponding: () =>
    new FliskError("Docker is running but not responding (`docker ps` hung for 10s)", [
      "Quit and reopen Docker Desktop, run `colima restart`, or restart Kiri",
      "Then verify with: `docker ps`",
    ]),
  stackNotFound: (name: string, stackNames: readonly string[] = []) =>
    new FliskError(`Stack "${name}" not found`, [
      ...closestNameSuggestions([name], stackNames),
      // Name the stacks the command already knows, as resource errors do.
      ...(stackNames.length > 0 ? [`Stacks: ${stackNames.join(", ")}`] : []),
      "Run `flisk stacks` to see available stacks",
      "Run `flisk stack` to assign resources to a stack",
    ]),
  resourceNotFound: (name: string, resourceNames: readonly string[] = []) =>
    new FliskError(`Resource "${name}" not found`, [
      ...closestNameSuggestions([name], resourceNames),
      "Run `flisk resources` to list all resources",
      "Check the resource name spelling",
    ]),
  unknownResource: (name: string, validNames: readonly string[] = []): UnknownResourceError =>
    new UnknownResourceError(name, unknownResourceSuggestions(name, validNames)),
  unknownServices: (names: readonly string[], validNames: readonly string[]) => {
    // Service selectors are Tilt resource names, so share the resource suggestion path.
    const orderedValid =
      names.length === 1 && names[0] !== undefined
        ? rankByDistance(names[0], validNames)
        : validNames;
    const suggestions = closestNameSuggestions(names, orderedValid, names.length > 1);
    return new FliskError(
      `Unknown service ${names.join(", ")}. Valid names: ${orderedValid.join(", ")}`,
      suggestions,
      2,
    );
  },
  directoryExists: (path: string) =>
    new FliskError(`Directory already exists: ${path}`, [
      "Use `--path` to specify a different location",
      "Remove the existing directory if no longer needed",
    ]),
  invalidPath: (path: string) =>
    new FliskError(`Invalid path: ${path}`, [
      "Path must be within the project directory",
      'Path cannot contain special characters like <>:"|?*',
    ]),
  notInProject: () =>
    new FliskError("Could not find project root (no .flisk/project.json found)", [
      "Run this from within a Flisk project",
      "Run `flisk project --yes` to initialize a new project",
    ]),
  noResources: () =>
    new FliskError("This project has no resources yet, so there is nothing to start.", [
      "Add one: flisk resource api --type backend --stack app",
      "Or start from a template: flisk create",
    ]),
  interactiveTerminalRequired: (commandName = "flisk ui") =>
    new FliskError(
      `\`${commandName}\` needs an interactive terminal (stdin and stdout must be a TTY).`,
      ["For scripts and agents: flisk status --json, flisk logs, flisk resources --json"],
    ),
};

export function requireProjectRoot(): string {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    return errorFactories.notInProject().exit();
  }
  return projectRoot;
}

/**
 * Resolves the project root before a command mutates or probes Docker on the machine (#4282).
 * Exits with the not-in-project error when `resolveRoot` returns null.
 */
export function requireProjectBeforeDocker(
  resolveRoot: () => string | null = findProjectRoot,
  onNotInProject?: (error: FliskError) => never,
): string {
  const projectRoot = resolveRoot();
  if (!projectRoot) {
    const error = errorFactories.notInProject();
    if (onNotInProject) {
      return onNotInProject(error);
    }
    return error.exit();
  }
  return projectRoot;
}

/** Prints a command failure the way every command does (a FliskError with its suggestions, anything else as one error line) and exits 1. */
export function handleCommandError(err: unknown): never {
  if (err instanceof FliskError) {
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
  const problems: FliskError[] = [];
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
  rememberShownError({ message, suggestions: suggestions ?? [] });
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
