// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import chalk from "chalk";
import { Command } from "commander";
import { probeHostPort } from "../utils/doctor-runtime.js";
import { FliskError } from "../utils/errors.js";
import { showDetail, showStep } from "../utils/formatting.js";
import { getHostPortPlan } from "../utils/host-port-config.js";
import { JsonCommandError, runJsonCommand } from "../utils/json-command.js";
import { isProcessAlive, readNativeRunState } from "../utils/native-runtime.js";
import { isNativeProject } from "../utils/native-service.js";
import { findProjectRoot } from "../utils/paths.js";
import { resolveServicePath, resolveSubdomainBases } from "../utils/service-urls.js";
import { discoverResourcesWithProblems } from "../utils/services.js";
import { readProjectName } from "../utils/shared-infra.js";
import { startSpinner } from "../utils/spinner.js";
import { buildServicePorts } from "../utils/status-ports.js";
import { suggestClosest } from "../utils/suggestions.js";
import { openUrl } from "../utils/url-actions.js";

export interface FrontendTarget {
  name: string;
  url: string;
}

/** Keep the container startup grace period; native projects wait only while their supervisor is alive. */
async function shouldWaitForFrontend(projectRoot: string): Promise<boolean> {
  const { resources } = discoverResourcesWithProblems(projectRoot);
  if (!isNativeProject(resources)) return true;
  const state = readNativeRunState(projectRoot);
  return state !== null && isProcessAlive(state.pid);
}

/** The frontends of the current project, with the URL each one is published under. */
export async function listFrontendTargets(projectRoot: string): Promise<FrontendTarget[]> {
  const { resources } = discoverResourcesWithProblems(projectRoot);
  if (isNativeProject(resources)) {
    return resources
      .filter((resource) => resource.config?.appType === "frontend")
      .flatMap((resource) => {
        const { directUrl } = buildServicePorts(resource, undefined, { native: true });
        return directUrl ? [{ name: resource.name, url: directUrl }] : [];
      });
  }
  const plan = await getHostPortPlan(projectRoot, { inspectDocker: false });
  const { appBase } = resolveSubdomainBases(plan?.ingressHttp, projectRoot);
  return resources
    .filter((resource) => resource.config?.appType === "frontend")
    .map((resource) => ({
      name: resource.name,
      url: `${appBase}${resolveServicePath(resource)}`,
    }));
}

/** The frontends to act on: the named one, or every frontend when no name is given. */
export function selectFrontends(targets: FrontendTarget[], name?: string): FrontendTarget[] {
  return name === undefined ? targets : targets.filter((target) => target.name === name);
}

/** Says which frontends exist, the way `resource not found` names the project's resources. */
export function unknownFrontendSuggestions(name: string, targets: FrontendTarget[]): string[] {
  const names = targets.map((target) => target.name);
  const closest = suggestClosest(name, names);
  return [
    ...(closest ? [`Did you mean "${closest}"?`] : []),
    `Frontends: ${names.join(", ")}`,
    "Run `flisk resources` to list all resources",
  ];
}

/** True when the URL answers. A booting frontend needs a moment, so this is asked more than once. */
export async function isFrontendReady(url: string, timeoutMs = 2000): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return response.status < 500;
  } catch {
    return false;
  }
}

/**
 * The first frontend that answers. Returns undefined when none answers within the wait, so the
 * caller can say so instead of opening a URL that refuses the connection.
 */
export async function pickReadyFrontend(
  targets: FrontendTarget[],
  waitMs = 30000,
  onWait?: (elapsedMs: number) => void,
): Promise<FrontendTarget | undefined> {
  if (targets.length === 0) return undefined;
  const started = Date.now();
  while (true) {
    for (const target of targets) {
      if (await isFrontendReady(target.url)) return target;
    }
    const elapsed = Date.now() - started;
    if (elapsed >= waitMs) return undefined;
    onWait?.(elapsed);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

/**
 * The first frontend of the project that answers, or undefined when none does. With a wait of
 * zero this is a cheap "is a stack for this project already running?" check.
 */
export async function findReadyFrontend(
  projectRoot: string,
  waitMs = 0,
  onWait?: (elapsedMs: number) => void,
): Promise<FrontendTarget | undefined> {
  const targets = await listFrontendTargets(projectRoot);
  return pickReadyFrontend(targets, waitMs, onWait);
}

/**
 * Opens the first ready frontend, or prints its URL when isPrintOnly is set. Returns the URL,
 * or null when there is no ready frontend.
 */
export async function openFirstFrontend(
  projectRootOverride?: string,
  options: { isPrintOnly?: boolean; resource?: string } = {},
): Promise<string | null> {
  const report = options.isPrintOnly ? console.error : console.log;
  const projectRoot = projectRootOverride ?? findProjectRoot();
  if (!projectRoot) {
    report(chalk.yellow("Not in a Flisk project, so there is no frontend to open."));
    report(chalk.gray("Run `flisk project --yes` first, or `flisk open` inside a project."));
    return null;
  }

  const targets = await listFrontendTargets(projectRoot);
  if (targets.length === 0) {
    report(chalk.yellow("This project has no frontend service to open."));
    report(chalk.gray("Start the stack with `flisk up` and add a frontend with `flisk resource`."));
    return null;
  }

  const selected = selectFrontends(targets, options.resource);
  if (options.resource !== undefined && selected.length === 0) {
    new FliskError(
      `Resource "${options.resource}" not found`,
      unknownFrontendSuggestions(options.resource, targets),
    ).display();
    return null;
  }

  if (options.isPrintOnly) {
    const shouldWait = await shouldWaitForFrontend(projectRoot);
    const first = await pickReadyFrontend(selected, shouldWait ? 120000 : 0);
    if (!first) {
      const target = selected[0];
      console.error(
        shouldWait
          ? "No frontend answered yet. Start the stack with `flisk up` and try again."
          : "No frontend is answering at " +
              (target?.url ?? "the selected URL") +
              ". Start the stack with `flisk up` and try again.",
      );
      return null;
    }
    console.log(first.url);
    return first.url;
  }

  const projectName = readProjectName(projectRoot);
  showStep(
    options.resource === undefined
      ? `Opening the first frontend of ${projectName ?? "this project"}`
      : `Opening ${options.resource} of ${projectName ?? "this project"}`,
  );
  for (const target of selected) {
    console.log(chalk.gray(`  - ${target.name}: ${target.url}`));
  }

  const shouldWait = await shouldWaitForFrontend(projectRoot);
  const spinner = startSpinner("Waiting for the frontend to answer...");
  const first = await pickReadyFrontend(selected, shouldWait ? 120000 : 0, (elapsed) => {
    spinner.text = `Waiting for the frontend to answer... ${Math.round(elapsed / 1000)}s`;
  });

  if (!first) {
    spinner.fail("No frontend answered yet.");
    const { resources } = discoverResourcesWithProblems(projectRoot);
    // Local-process projects never use Docker ingress: skip port-80 / Docker advice (#3715).
    if (isNativeProject(resources) || !shouldWait) {
      for (const target of selected) {
        console.log(
          chalk.yellow(
            `No frontend is answering at ${target.url}. Start the stack with \`flisk up\`.`,
          ),
        );
      }
      return null;
    }
    const plan = await getHostPortPlan(projectRoot, { inspectDocker: false });
    const ingress = plan?.ingressHttp;
    const reachable = ingress ? (await probeHostPort(ingress)) === "in-use" : false;
    if (ingress && !reachable) {
      // The stack is up but this machine cannot reach the published port: Docker is not
      // publishing it to the host. Saying that is more useful than "not serving yet".
      console.log(
        chalk.yellow(`The stack is running, but this machine cannot reach port ${ingress}.`),
      );
      console.log(chalk.gray("  Docker is not publishing the port to the host."));
      const { checkColima } = await import("../utils/colima.js");
      const colima = checkColima();
      if (colima.isColima && !colima.running) {
        console.log(chalk.gray(`  ${colima.problem ?? "The Colima VM is not running"}`));
        console.log(chalk.gray(`  Fix: ${colima.fix ?? "colima start"}`));
      } else {
        console.log(
          chalk.gray(
            "  Restart the Docker runtime (Docker Desktop, Colima or Kiri), then run `flisk open` again.",
          ),
        );
      }
    } else {
      console.log(chalk.yellow("The stack is not serving the frontend yet."));
      console.log(chalk.gray("  - Start the stack in another terminal: flisk up"));
      console.log(chalk.gray("  - Then run this again: flisk open"));
    }
    for (const target of selected) {
      console.log(chalk.gray(`  - ${target.name}: ${target.url}`));
    }
    return null;
  }

  spinner.succeed(`The frontend is up: ${first.name}`);
  const opened = await openUrl(first.url);
  console.log(
    opened
      ? chalk.green(`\nOpened ${first.url}`)
      : chalk.yellow(`\nCould not open a browser. Open ${first.url} yourself.`),
  );
  showDetail("Run `flisk open <name>` to open another frontend.");
  return first.url;
}

export const openCommand = new Command("open")
  .description("Open the first ready frontend in your browser, or the frontend you name")
  .argument("[resource]", "Frontend to open; defaults to the first ready one")
  .option("--print", "Print the frontend URL without opening a browser")
  .option("--json", "Print one JSON envelope on stdout; implies --print", false)
  .addHelpText(
    "after",
    "\nExamples:\n  flisk open\n  flisk open web2\n  flisk open --print\n  flisk open web2 --print\n  flisk open --print --json\n  flisk open --json",
  )
  .action(async (resource: string | undefined, options: { print?: boolean; json?: boolean }) => {
    if (options.json) {
      await runJsonCommand("OPEN_FAILED", "flisk open", async () => {
        const projectRoot = findProjectRoot();
        if (!projectRoot) {
          throw new JsonCommandError(
            "NOT_IN_PROJECT",
            "Not in a Flisk project, so there is no frontend to open.",
            ["Run `flisk project --yes` first, or `flisk open` inside a project."],
          );
        }
        const targets = await listFrontendTargets(projectRoot);
        if (targets.length === 0) {
          throw new JsonCommandError(
            "NO_FRONTEND",
            "This project has no frontend service to open.",
            ["Start the stack with `flisk up` and add a frontend with `flisk resource`."],
          );
        }
        const selected = selectFrontends(targets, resource);
        if (resource !== undefined && selected.length === 0) {
          throw new JsonCommandError(
            "UNKNOWN_FRONTEND",
            `Resource "${resource}" not found`,
            unknownFrontendSuggestions(resource, targets),
          );
        }
        const shouldWait = await shouldWaitForFrontend(projectRoot);
        const first = await pickReadyFrontend(selected, shouldWait ? 120000 : 0);
        if (!first) {
          const target = selected[0];
          throw new JsonCommandError(
            "FRONTEND_NOT_READY",
            shouldWait
              ? "No frontend answered yet. Start the stack with `flisk up` and try again."
              : "No frontend is answering at " +
                  (target?.url ?? "the selected URL") +
                  ". Start the stack with `flisk up` and try again.",
            ["Start the stack with `flisk up` and try again."],
          );
        }
        return { data: { url: first.url, resource: first.name } };
      });
      return;
    }
    const url = await openFirstFrontend(undefined, {
      isPrintOnly: options.print,
      ...(resource === undefined ? {} : { resource }),
    });
    if (url === null) process.exitCode = 1;
  });
