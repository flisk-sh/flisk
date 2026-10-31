// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import { Command } from "commander";
import { createDiscoveryContext } from "../utils/discovery-context.js";
import { errorFactories, FliskError, runCommand } from "../utils/errors.js";
import { getHostPortPlan } from "../utils/host-port-config.js";
import { createMachineEnvelope, writeMachineError } from "../utils/machine-output.js";
import { runMcpCheck } from "../utils/mcp-check.js";
import { findProjectRoot, getPackageVersion } from "../utils/paths.js";
import { buildServicePorts } from "../utils/status-ports.js";
function isLoopbackHost(hostname) {
    const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return (host === "localhost" ||
        host.endsWith(".localhost") ||
        host === "::1" ||
        /^127\.\d+\.\d+\.\d+$/.test(host));
}
function parseTargetUrl(target) {
    let parsed;
    try {
        parsed = new URL(target);
    }
    catch {
        throw new FliskError(`"${target}" is not a valid URL`, ["Pass the full endpoint, such as https://mcp.example.com/mcp, or a resource name"], 2);
    }
    // Plain http is fine on this machine, where `flisk up` serves resources; anywhere else it must be https.
    if (parsed.protocol === "https:" ||
        (parsed.protocol === "http:" && isLoopbackHost(parsed.hostname))) {
        return parsed.toString();
    }
    throw new FliskError(`flisk mcp check needs an https URL, got ${parsed.protocol}//${parsed.host}`, [
        "Use the https address of the server",
        "Plain http is accepted only for localhost, *.localhost and loopback addresses",
    ], 2);
}
/** The local MCP endpoint of a resource: the address `flisk status` prints for it, plus /mcp. */
async function resolveResourceUrl(name) {
    const projectRoot = findProjectRoot();
    if (!projectRoot)
        throw errorFactories.notInProject();
    const { resources } = createDiscoveryContext();
    const resource = resources.find((candidate) => candidate.name === name);
    if (!resource) {
        throw errorFactories.resourceNotFound(name, resources.map((candidate) => candidate.name));
    }
    const kind = resource.config?.appType ?? resource.type;
    if (kind !== "mcp") {
        throw new FliskError(`Resource "${name}" is a ${kind ?? "resource of unknown type"}, not an MCP server`, [
            "Pass the name of a resource created with `flisk resource <name> --type mcp`",
            "Or pass the server's https URL instead of a resource name",
        ], 2);
    }
    let ingressHttp;
    try {
        ingressHttp = (await getHostPortPlan(projectRoot, { inspectDocker: false })).ingressHttp;
    }
    catch {
        ingressHttp = undefined;
    }
    const { url } = buildServicePorts(resource, ingressHttp);
    if (!url) {
        throw new FliskError(`Resource "${name}" has no HTTP route, so it cannot serve MCP`, [
            "Create an MCP server with `flisk resource <name> --type mcp`",
            "Or pass the server's URL instead of a resource name",
        ], 2);
    }
    return `${url.replace(/\/+$/, "")}/mcp`;
}
export async function resolveMcpCheckTarget(target) {
    if (target.includes("://"))
        return { url: parseTargetUrl(target), resource: null };
    return { url: await resolveResourceUrl(target), resource: target };
}
function printReport(report, target) {
    const heading = target.resource ? `${target.resource} (${report.url})` : report.url;
    console.log(chalk.bold(`MCP check: ${heading}`));
    if (report.serverName)
        console.log(chalk.gray(`Server: ${report.serverName}`));
    console.log();
    const width = Math.max(5, ...report.checks.map((check) => check.check.length));
    console.log(chalk.bold(`  ${"Result".padEnd(6)}  ${"Check".padEnd(width)}  Detail`));
    for (const check of report.checks) {
        let label = chalk.green("pass".padEnd(6));
        if (check.isSkipped)
            label = chalk.gray("skip".padEnd(6));
        else if (!check.didPass)
            label = chalk.red("FAIL".padEnd(6));
        console.log(`  ${label}  ${check.check.padEnd(width)}  ${chalk.gray(check.detail)}`);
    }
    console.log();
    const total = report.checks.filter((check) => !check.isSkipped).length;
    const summary = `${total - report.failures} of ${total} checks passed`;
    console.log(report.didPass ? chalk.green(summary) : chalk.red(`${summary}, ${report.failures} failed`));
}
/**
 * `flisk mcp check`. A factory rather than an exported Command, so the command exists once, under `flisk mcp`, for every
 * reader of the command tree (help, completion, the flag contract).
 */
export function createMcpCheckCommand() {
    return new Command("check")
        .description("Check an MCP server's protocol (initialize, tools, prompts, errors, HTTP rules, icon); read-only unless --call")
        .argument("<target>", "An https URL of the MCP endpoint, or the name of a resource in this project")
        .option("--call", "Also call each tool once with sample arguments (a call can reach the network)", false)
        .option("--no-icon", "Skip the icon-512.png check")
        .option("--json", "Print the report as a JSON envelope", false)
        .action(async (targetArg, options) => {
        const run = async () => {
            const target = await resolveMcpCheckTarget(targetArg);
            const report = await runMcpCheck(target.url, {
                call: options.call === true,
                icon: options.icon !== false,
                userAgent: `flisk-mcp-check/${getPackageVersion()} (+https://flisk.sh)`,
            });
            return { report, target };
        };
        if (options.json) {
            let outcome;
            try {
                outcome = await run();
            }
            catch (error) {
                writeMachineError(error);
            }
            const { report, target } = outcome;
            const errors = report.didPass
                ? []
                : [
                    {
                        code: "MCP_CHECK_FAILED",
                        message: `${report.failures} MCP check(s) failed for ${report.url}`,
                        suggestions: report.checks
                            .filter((check) => !check.didPass)
                            .map((check) => `${check.check}: ${check.detail}`),
                    },
                ];
            console.log(JSON.stringify(createMachineEnvelope({ resource: target.resource, ...report }, errors)));
            if (!report.didPass)
                process.exitCode = 1;
            return;
        }
        await runCommand(async () => {
            const { report, target } = await run();
            printReport(report, target);
            if (!report.didPass)
                process.exitCode = 1;
        });
    });
}
