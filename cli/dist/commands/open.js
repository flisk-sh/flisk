// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import { Command } from "commander";
import { showDetail, showStep } from "../utils/formatting.js";
import { getHostPortPlan } from "../utils/host-port-config.js";
import { findProjectRoot } from "../utils/paths.js";
import { resolveServicePath, resolveSubdomainBases } from "../utils/service-urls.js";
import { discoverResourcesWithProblems } from "../utils/services.js";
import { readProjectName } from "../utils/shared-infra.js";
import { startSpinner } from "../utils/spinner.js";
import { openUrl } from "../utils/url-actions.js";
/** The frontends of the current project, with the URL each one is published under. */
export async function listFrontendTargets(projectRoot) {
    const { resources } = discoverResourcesWithProblems(projectRoot);
    const plan = await getHostPortPlan(projectRoot, { inspectDocker: false });
    const { appBase } = resolveSubdomainBases(plan?.ingressHttp, projectRoot);
    return resources
        .filter((resource) => resource.config?.appType === "frontend")
        .map((resource) => ({
        name: resource.name,
        url: `${appBase}${resolveServicePath(resource)}`,
    }));
}
/** True when the URL answers. A booting frontend needs a moment, so this is asked more than once. */
export async function isFrontendReady(url, timeoutMs = 2000) {
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        return response.status < 500;
    }
    catch {
        return false;
    }
}
/**
 * The first frontend that answers. Returns undefined when none answers within the wait, so the
 * caller can say so instead of opening a URL that refuses the connection.
 */
export async function pickReadyFrontend(targets, waitMs = 30000, onWait) {
    if (targets.length === 0)
        return undefined;
    const started = Date.now();
    const deadline = started + waitMs;
    while (true) {
        for (const target of targets) {
            if (await isFrontendReady(target.url))
                return target;
        }
        const elapsed = Date.now() - started;
        if (elapsed >= waitMs)
            return undefined;
        onWait?.(elapsed);
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
}
/**
 * Opens the first ready frontend of the project in the browser. Returns the URL it opened, or
 * null when the project has no frontend.
 */
export async function openFirstFrontend(projectRootOverride) {
    const projectRoot = projectRootOverride ?? findProjectRoot();
    if (!projectRoot) {
        console.log(chalk.yellow("Not in a Flisk project, so there is no frontend to open."));
        console.log(chalk.gray("Run `flisk project --yes` first, or `flisk open` inside a project."));
        return null;
    }
    const targets = await listFrontendTargets(projectRoot);
    if (targets.length === 0) {
        console.log(chalk.yellow("This project has no frontend service to open."));
        console.log(chalk.gray("Start the stack with `flisk up` and add a frontend with `flisk resource`."));
        return null;
    }
    const projectName = readProjectName(projectRoot);
    showStep(`Opening the first frontend of ${projectName ?? "this project"}`);
    for (const target of targets) {
        console.log(chalk.gray(`  - ${target.name}: ${target.url}`));
    }
    const spinner = startSpinner("Waiting for the frontend to answer...");
    const first = await pickReadyFrontend(targets, 120000, (elapsed) => {
        spinner.text = `Waiting for the frontend to answer... ${Math.round(elapsed / 1000)}s`;
    });
    if (!first) {
        spinner.fail("No frontend answered yet.");
        console.log(chalk.yellow("The stack is not serving the frontend yet."));
        console.log(chalk.gray("  - Start the stack in another terminal: flisk up"));
        console.log(chalk.gray("  - Then run this again: flisk open"));
        for (const target of targets) {
            console.log(chalk.gray(`  - ${target.name}: ${target.url}`));
        }
        return null;
    }
    spinner.succeed(`The frontend is up: ${first.name}`);
    const opened = await openUrl(first.url);
    console.log(opened
        ? chalk.green(`\nOpened ${first.url}`)
        : chalk.yellow(`\nCould not open a browser. Open ${first.url} yourself.`));
    showDetail("Run `flisk open` again to open the next frontend.");
    return first.url;
}
export const openCommand = new Command("open")
    .description("Open the first frontend of the project in your browser")
    .action(async () => {
    await openFirstFrontend();
});
