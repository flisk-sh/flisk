// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import {
  discoverRunningStacks,
  type RunningStack,
  type StackStopResult,
  stopRunningStack,
} from "../utils/down-all.js";
import { FliskError } from "../utils/errors.js";
import { createJsonEmitter } from "../utils/json-output.js";
import { toMachineError } from "../utils/machine-output.js";
import { promptConfirm } from "../utils/prompt.js";

export interface DownAllOptions {
  all?: boolean;
  yes?: boolean;
  force?: boolean;
  dryRun?: boolean;
  json?: boolean;
  verbose?: boolean;
}

/** A stack as it appears in the JSON report: no pids or internal stop details. */
export function stackReport(stack: RunningStack) {
  return {
    folder: stack.folder,
    runtime: stack.runtime,
    services: stack.services,
    ports: stack.ports,
    stacks: stack.stacks,
    missingFolder: stack.missingFolder,
  };
}

/** One line of the human inventory: folder, runtime, services and the ports they publish. */
export function formatStack(stack: RunningStack): string {
  const parts = [stack.folder, `[${stack.runtime}]`];
  if (stack.services.length > 0) parts.push(`services: ${stack.services.join(", ")}`);
  if (stack.ports.length > 0) parts.push(`ports: ${stack.ports.join(", ")}`);
  if (stack.stacks.length > 0) parts.push(`stacks: ${stack.stacks.join(", ")}`);
  if (stack.missingFolder) parts.push("folder missing");
  return `• ${parts.join("  ")}`;
}

/**
 * `flisk down --all`: one inventory, one confirmation, then one stop per stack. The stop path never runs `tilt down`, so a
 * project's generated Tiltfile and Compose files are not rewritten as a side effect of stopping it.
 */
export async function runDownAll(options: DownAllOptions): Promise<void> {
  const emit = options.json ? createJsonEmitter("DOWN_FAILED", "flisk down --all") : undefined;
  const stacks = await discoverRunningStacks();
  const projects = stacks.map(stackReport);

  if (!options.json) {
    console.log(
      stacks.length === 0
        ? "No Flisk projects are running."
        : `Running Flisk projects (${stacks.length}):\n${stacks.map(formatStack).join("\n")}`,
    );
  }

  if (options.dryRun) {
    if (!options.json) console.log(chalk.gray("Dry run - not stopping any project."));
    emit?.({ ok: true, all: true, dryRun: true, projects, stopped: [] });
    return;
  }

  if (stacks.length === 0) {
    emit?.({ ok: true, all: true, projects, stopped: [] });
    return;
  }

  if (!options.yes && !options.force) {
    if (options.json || !process.stdin.isTTY) {
      const error = new FliskError(
        `flisk down --all stops ${stacks.length} running Flisk project${stacks.length === 1 ? "" : "s"} and needs confirmation`,
        ["Run it in a terminal, or pass --yes (or -y): flisk down --all --yes"],
      );
      emit?.({ ok: false, all: true, projects, stopped: [] }, [toMachineError(error).error]);
      if (!options.json) console.error(`${error.message}\n${error.suggestions.join("\n")}`);
      process.exitCode = 1;
      return;
    }
    let confirmed = false;
    try {
      confirmed = await promptConfirm({
        message: `Stop all ${stacks.length} running Flisk project${stacks.length === 1 ? "" : "s"}?`,
        initial: false,
      });
    } catch {
      confirmed = false;
    }
    if (!confirmed) {
      if (!options.json) console.log(chalk.gray("Nothing stopped."));
      emit?.({ ok: true, all: true, projects, stopped: [], confirmed: false });
      return;
    }
  }

  const stopped: Array<ReturnType<typeof stackReport> & { stopped: string[] }> = [];
  const failed: Array<{ folder: string; runtime: string; error: string }> = [];
  for (const stack of stacks) {
    const result: StackStopResult = await stopRunningStack(stack);
    if (result.ok && result.stopped.length > 0) {
      stopped.push({ ...stackReport(stack), stopped: result.stopped });
    }
    if (!result.ok) {
      failed.push({
        folder: stack.folder,
        runtime: stack.runtime,
        error: result.error ?? "unknown error",
      });
    }
    if (!options.json) {
      if (result.stopped.length > 0) {
        console.log(chalk.blue(`Stopped ${stack.folder}: ${result.stopped.join(", ")}`));
      } else if (result.stale) {
        console.log(chalk.gray(`Stale run record at ${stack.folder}; nothing was running.`));
      } else {
        console.log(chalk.gray(`Nothing to stop at ${stack.folder}.`));
      }
    }
  }

  if (failed.length > 0 && !options.json) {
    for (const failure of failed) {
      console.error(chalk.yellow(`Could not fully stop ${failure.folder}: ${failure.error}`));
    }
  }
  if (failed.length > 0) process.exitCode = 1;
  emit?.(
    {
      ok: failed.length === 0,
      all: true,
      projects,
      stopped,
      ...(failed.length > 0 ? { failed } : {}),
    },
    failed.map((failure) => ({
      code: "DOWN_FAILED",
      message: `Could not fully stop ${failure.folder}: ${failure.error}`,
    })),
  );
}
