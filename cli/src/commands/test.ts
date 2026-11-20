// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import chalk from "chalk";
import { Command } from "commander";
import type { DiscoveredResource } from "../types/index.js";
import { errorFactories, runCommand } from "../utils/errors.js";
import { runJsonCommand } from "../utils/json-command.js";
import { findProjectRoot } from "../utils/paths.js";
import { discoverResourcesFromRoot, getAllStacks } from "../utils/services.js";
import { type RunTarget, resolveRunTarget } from "./run.js";

/**
 * `flisk test [stack] [--json]` (#4049): run each service's declared test command with the environment `flisk run`
 * gives that service. One CLI call covers a whole stack, so an agent does not have to discover each package's test
 * script and run `flisk run <service> -- <cmd>` one service at a time.
 *
 * A service declares its command with the top-level `test` field in service.json. There is deliberately no alias:
 * `dev.testOnSave` is a Python-only watcher setting and `command` starts the service.
 */

/** How much of a test's combined stdout/stderr a result keeps. */
const OUTPUT_LIMIT = 64 * 1024;
const COMMAND_TIMEOUT_MS = 10 * 60_000;
const MAX_BUFFER = 32 * 1024 * 1024;

export type ServiceTestStatus = "passed" | "failed" | "skipped";

export interface ServiceTestResult {
  service: string;
  /** The command that was declared, or `null` when the service has no test command. */
  command: string | null;
  /** `null` means the test did not run because no command was declared. */
  ok: boolean | null;
  status: ServiceTestStatus;
  durationMs: number;
  outputTail: string;
}

export interface TestRunResult {
  /** `false` when at least one declared test failed, so `--json` consumers and MCP can detect the failure. */
  ok: boolean;
  stack: string | null;
  results: ServiceTestResult[];
  summary: { passed: number; failed: number; skipped: number };
}

type ResolveTarget = (
  projectRoot: string,
  service: string,
  command: string[],
  options?: { interactive: boolean; resources?: DiscoveredResource[] },
) => RunTarget;

type Execute = (target: RunTarget) => SpawnSyncReturns<string>;

export interface RunServiceTestsOptions {
  stack?: string;
  resources?: DiscoveredResource[];
  resolveTarget?: ResolveTarget;
  execute?: Execute;
  now?: () => number;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function tail(text: string): string {
  return text.length > OUTPUT_LIMIT ? text.slice(-OUTPUT_LIMIT) : text;
}

function combinedOutput(stdout: string | undefined, stderr: string | undefined): string {
  return tail([stdout ?? "", stderr ?? ""].filter(Boolean).join("\n"));
}

/** The declared test command, trimmed, or `null` when the service has none. */
export function resolveServiceTestCommand(
  resource: Pick<DiscoveredResource, "config">,
): string | null {
  const value = resource.config?.test;
  if (typeof value !== "string") return null;
  const command = value.trim();
  return command === "" ? null : command;
}

/** Splits a declared test command into the program and its arguments, honouring quotes. */
export function splitTestCommand(command: string): string[] {
  const words: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (let match = pattern.exec(command); match; match = pattern.exec(command)) {
    words.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return words;
}

/**
 * Runs every selected service's declared test command. `resolveTarget` and `execute` are injectable so a unit test can
 * prove the environment plumbing is reused without starting a real process or a container.
 */
export async function runServiceTests(
  projectRoot: string,
  options: RunServiceTestsOptions = {},
): Promise<TestRunResult> {
  const resources = options.resources ?? discoverResourcesFromRoot(projectRoot);
  const selected = options.stack
    ? resources.filter((resource) => (resource.stack ?? resource.config?.stack) === options.stack)
    : resources;
  if (options.stack && selected.length === 0) {
    throw errorFactories.stackNotFound(options.stack, getAllStacks(resources));
  }
  const resolve = options.resolveTarget ?? resolveRunTarget;
  const execute =
    options.execute ??
    ((target: RunTarget) =>
      spawnSync(target.file, target.args, {
        cwd: target.cwd,
        env: target.env ?? process.env,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: MAX_BUFFER,
        timeout: COMMAND_TIMEOUT_MS,
      }));
  const now = options.now ?? (() => Date.now());
  const results: ServiceTestResult[] = [];

  for (const resource of selected) {
    const command = resolveServiceTestCommand(resource);
    if (command === null) {
      results.push({
        service: resource.name,
        command: null,
        ok: null,
        status: "skipped",
        durationMs: 0,
        outputTail: "",
      });
      continue;
    }

    const started = now();
    let ok = false;
    let outputTail = "";
    try {
      const target = resolve(projectRoot, resource.name, splitTestCommand(command), {
        interactive: false,
        resources,
      });
      const run = execute(target);
      if (run.error) {
        outputTail = messageOf(run.error);
      } else {
        ok = (run.status ?? 1) === 0;
        outputTail = combinedOutput(run.stdout, run.stderr);
      }
    } catch (error) {
      outputTail = messageOf(error);
    }
    results.push({
      service: resource.name,
      command,
      ok,
      status: ok ? "passed" : "failed",
      durationMs: Math.max(0, now() - started),
      outputTail,
    });
  }

  const summary = {
    passed: results.filter((result) => result.status === "passed").length,
    failed: results.filter((result) => result.status === "failed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
  };
  return {
    ok: summary.failed === 0,
    stack: options.stack ?? null,
    results,
    summary,
  };
}

function showResults(result: TestRunResult): void {
  for (const item of result.results) {
    const icon =
      item.status === "passed"
        ? chalk.green("✓")
        : item.status === "failed"
          ? chalk.red("✗")
          : chalk.gray("-");
    const detail = item.command ?? "no test command (skipped)";
    console.log(`${icon} ${item.service}: ${detail} (${item.durationMs}ms)`);
    if (item.outputTail) {
      for (const line of item.outputTail.trimEnd().split("\n")) console.log(`    ${line}`);
    }
  }
  console.log(
    `${result.summary.passed} passed, ${result.summary.failed} failed, ${result.summary.skipped} skipped`,
  );
}

export const testCommand = new Command("test")
  .description("Run every service's declared tests with the stack's environment")
  .argument("[stack]", "Only test the services in this stack")
  .option("--json", "Print one JSON object with a result per service", false)
  .addHelpText(
    "after",
    '\nA service opts in with a `test` command in its service.json, for example:\n  "test": "bun test"\nServices without one are reported as skipped. Exits non-zero when any test fails.',
  )
  .action(async (stack: string | undefined, options: { json?: boolean }) => {
    if (options.json) {
      await runJsonCommand("TEST_FAILED", "flisk test", async () => {
        const projectRoot = findProjectRoot();
        if (!projectRoot) throw errorFactories.notInProject();
        const result = await runServiceTests(projectRoot, { stack });
        if (!result.ok) process.exitCode = 1;
        return { data: result };
      });
      return;
    }
    await runCommand(async () => {
      const projectRoot = findProjectRoot();
      if (!projectRoot) throw errorFactories.notInProject();
      const result = await runServiceTests(projectRoot, { stack });
      showResults(result);
      if (!result.ok) process.exitCode = 1;
    });
  });
