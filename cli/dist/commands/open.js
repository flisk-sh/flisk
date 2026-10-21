// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import { Command } from "commander";
import { createDiscoveryContext } from "../utils/discovery-context.js";
import { showDetail, showStep } from "../utils/formatting.js";
import { getHostPortPlan } from "../utils/host-port-config.js";
import { findProjectRoot } from "../utils/paths.js";
import { resolveServicePath, resolveSubdomainBases } from "../utils/service-urls.js";
import { readProjectName } from "../utils/shared-infra.js";
import { openUrl } from "../utils/url-actions.js";
/** The frontends of the current project, with the URL each one is published under. */
export async function listFrontendTargets(projectRoot) {
    const discovery = createDiscoveryContext();
    const plan = await getHostPortPlan(projectRoot, { inspectDocker: false });
    const { appBase } = resolveSubdomainBases(plan?.ingressHttp);
    return discovery.resources
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
/** The first frontend that answers, or the first one when none is up yet. */
export async function pickReadyFrontend(targets, waitMs = 30000) {
    if (targets.length === 0)
        return undefined;
    const deadline = Date.now() + waitMs;
    while (true) {
        for (const target of targets) {
            if (await isFrontendReady(target.url))
                return target;
        }
        if (Date.now() >= deadline)
            return targets[0];
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
    const first = await pickReadyFrontend(targets);
    if (!first)
        return null;
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
