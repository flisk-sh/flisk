// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * `flisk tool add <tool> [name]`: add a tool by the name people know it by (React, PostgreSQL, FastAPI, RAG).
 *
 * The tool list and what each one does live in utils/tool-catalog.ts. A tool Flisk can generate runs the real
 * `flisk resource` command; a built-in tool says so; a tool Flisk cannot generate prints the steps to run it under Flisk;
 * a cloud provider is rejected with exit 1, because Flisk runs the stack on your own computer.
 */
import { spawnSync } from "node:child_process";
import chalk from "chalk";
import { Command } from "commander";
import { cliInvocation } from "../utils/cli-invocation.js";
import { addYesOption } from "../utils/command-helpers.js";
import { errorFactories, FliskError, runCommand } from "../utils/errors.js";
import { runJsonCommand } from "../utils/json-command.js";
import { findProjectRoot } from "../utils/paths.js";
import { discoverResourcesWithProblems } from "../utils/services.js";
import { findTool, manualSteps, resourceArgs, TOOL_CATALOG, toolIds, } from "../utils/tool-catalog.js";
import { validateResourceName, validateStackName } from "../utils/validation.js";
const GROUP_TITLES = {
    frontend: "Frontend",
    backend: "Backend",
    data: "Data",
    ai: "AI",
    devops: "DevOps",
    widgets: "Widgets (cards in Flisk Chat)",
    guidewire: "Guidewire",
    cloud: "Not added (cloud and clusters)",
};
const STATUS_LABEL = {
    resource: "adds a resource",
    "built-in": "built in",
    manual: "manual steps",
    rejected: "rejected",
};
/** The catalog as lines, grouped, for `flisk tool add` with no tool. */
export function formatToolList() {
    const lines = ["Tools you can add with flisk tool add <tool> [name]:", ""];
    for (const group of Object.keys(GROUP_TITLES)) {
        const tools = TOOL_CATALOG.filter((tool) => tool.group === group);
        if (tools.length === 0)
            continue;
        lines.push(GROUP_TITLES[group]);
        for (const tool of tools) {
            lines.push(`  ${tool.id.padEnd(16)} ${tool.title.padEnd(36)} ${STATUS_LABEL[tool.status]}`);
        }
        lines.push("");
    }
    return lines;
}
/** What `flisk tool add --json` reports for one tool, before anything runs. */
export function describeTool(tool, options = {}) {
    const base = { id: tool.id, title: tool.title, group: tool.group, status: tool.status };
    switch (tool.status) {
        case "resource":
            return { ...base, command: ["flisk", ...resourceArgs(tool, options)].join(" ") };
        case "built-in":
            return { ...base, note: tool.note };
        case "manual":
            return { ...base, reason: tool.reason, steps: manualSteps(tool, options.name) };
        case "rejected":
            return { ...base, reason: tool.reason, instead: tool.instead };
    }
}
function unknownTool(input) {
    return new FliskError(`Flisk does not know the tool "${input}".`, [
        `Use one of: ${toolIds().join(", ")}.`,
        "See them grouped with: flisk tool add",
    ]);
}
function rejectedError(tool) {
    return new FliskError(`flisk tool add does not add ${tool.title}. ${tool.reason}`, [
        "Use instead:",
        ...tool.instead.map((line) => `  ${line}`),
    ]);
}
/** One argument as a shell would need it, so a suggested command can be pasted as printed. */
function shellArg(arg) {
    return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, "'\\''")}'`;
}
function commandLine(args) {
    return ["flisk", ...args].map(shellArg).join(" ");
}
/**
 * The words after `flisk tool add`: the longest leading run that names a tool, then at most one resource name. So
 * `google cloud platform`, `spring boot api` and `react web` all read the way people mean them.
 */
export function resolveWords(words) {
    for (let count = words.length; count > 0; count--) {
        const tool = findTool(words.slice(0, count).join(" "));
        if (!tool)
            continue;
        const rest = words.slice(count);
        if (rest.length > 1) {
            throw new FliskError(`"${rest.join(" ")}" is more than one resource name; ${tool.title} takes at most one.`, [`flisk tool add ${tool.id} ${rest.join("-").toLowerCase()}`]);
        }
        return { tool, name: rest[0] };
    }
    throw unknownTool(words[0] ?? "");
}
function readProject() {
    const root = findProjectRoot();
    if (!root)
        return undefined;
    return { resources: discoverResourcesWithProblems(root).resources };
}
/**
 * Checks that `flisk resource` would otherwise get wrong for a tool: an invalid name, a name already taken (which
 * `flisk resource` would silently register as it is, so the tool would never be added), and a project with several
 * stacks and no --stack.
 */
export function checkResource(tool, name, stack, project) {
    const validation = validateResourceName(name);
    if (!validation.valid) {
        throw new FliskError(validation.error ?? `Resource name "${name}" is not valid.`, [
            `flisk tool add ${tool.id} ${tool.defaultName}-2`,
        ]);
    }
    if (stack !== undefined) {
        const stackValidation = validateStackName(stack);
        if (!stackValidation.valid) {
            throw new FliskError(stackValidation.error ?? `Stack name "${stack}" is not valid.`, [
                `flisk tool add ${tool.id} ${name} --stack ${stack
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-+|-+$/g, "") || "main"}`,
            ]);
        }
    }
    if (!project)
        return;
    const taken = project.resources.find((resource) => resource.name === name);
    if (taken) {
        throw new FliskError(`A resource named "${name}" already exists${taken.type ? ` (${taken.type})` : ""}, so ${tool.title} was not added.`, [
            `Add it under another name: flisk tool add ${tool.id} ${tool.id}-${name}`,
            "See the names in use with: flisk resources",
        ]);
    }
    if (stack)
        return;
    const stacks = [...new Set(project.resources.flatMap((resource) => resource.stack ?? []))].sort();
    if (stacks.length > 1) {
        throw new FliskError(`This project has ${stacks.length} stacks (${stacks.join(", ")}); say which one gets ${tool.title}.`, stacks.map((each) => `flisk tool add ${tool.id} ${name} --stack ${each}`));
    }
}
/** Runs `flisk resource` for a tool. Text mode streams its output; --json returns its envelope's data. */
export function runResource(args, json, invocation = cliInvocation(), spawn = spawnSync) {
    const [command, ...prefix] = invocation;
    const result = spawn(command, [...prefix, ...args], {
        encoding: "utf8",
        stdio: json ? ["ignore", "pipe", "inherit"] : "inherit",
    });
    if (!json) {
        if (result.status !== 0) {
            throw new FliskError(`flisk ${args.slice(0, 2).join(" ")} failed.`, [
                `Run it yourself to see why: ${commandLine(args)}`,
            ]);
        }
        return undefined;
    }
    const stdout = String(result.stdout ?? "").trim();
    let envelope = {};
    try {
        envelope = JSON.parse(stdout.split("\n").pop() ?? "{}");
    }
    catch {
        // fall through to the failure below
    }
    if (result.status !== 0 || envelope.data === undefined || envelope.data === null) {
        const message = envelope.errors?.[0]?.message ?? `flisk ${args.slice(0, 2).join(" ")} failed`;
        throw new FliskError(message, [`Run it yourself to see why: ${commandLine(args)}`]);
    }
    return envelope.data;
}
/** The whole action, without the JSON wrapper, so tests can call it. */
export function addTool(words, options, run = (args, json) => runResource(args, json), project = readProject) {
    if (words.length === 0 || words.every((word) => !word.trim())) {
        if (options.json)
            return { tools: TOOL_CATALOG.map((tool) => describeTool(tool)) };
        for (const line of formatToolList())
            console.log(line);
        return undefined;
    }
    const { tool, name } = resolveWords(words);
    // Docker and a CI workflow are not services, so they have no name to give; say so instead of ignoring it.
    if (name && (tool.status === "built-in" || (tool.status === "manual" && !tool.defaultName))) {
        throw new FliskError(`${tool.title} takes no resource name, so "${name}" was not used.`, [
            `flisk tool add ${tool.id}`,
        ]);
    }
    if (name && tool.status === "manual") {
        const validation = validateResourceName(name);
        if (!validation.valid) {
            throw new FliskError(validation.error ?? `Resource name "${name}" is not valid.`, [
                `flisk tool add ${tool.id} ${tool.defaultName}`,
            ]);
        }
    }
    const described = describeTool(tool, { name, stack: options.stack });
    switch (tool.status) {
        case "rejected":
            throw rejectedError(tool);
        case "built-in":
            if (!options.json)
                console.log(`${chalk.green("✓")} ${tool.title}: ${tool.note}`);
            return described;
        case "manual":
            if (!options.json) {
                console.log(`${chalk.yellow("!")} ${tool.title}: ${tool.reason}`);
                console.log("");
                manualSteps(tool, name).forEach((step, index) => {
                    console.log(`  ${index + 1}. ${step}`);
                });
            }
            return described;
        case "resource": {
            const view = project();
            // Without a project `flisk resource` fails with two errors; say it once, with the command that fixes it.
            if (!view) {
                const error = errorFactories.notInProject();
                error.suggestions.push(`Then run: flisk tool add ${tool.id}${name ? ` ${name}` : ""}`);
                throw error;
            }
            checkResource(tool, name ?? tool.defaultName, options.stack, view);
            const args = resourceArgs(tool, {
                name,
                stack: options.stack,
                dryRun: options.dryRun,
                json: options.json,
            });
            if (!options.json)
                console.log(chalk.gray(`$ flisk ${args.join(" ")}`));
            const resource = run(args, Boolean(options.json));
            if (!options.json && tool.next)
                console.log(`\nNext: ${tool.next}`);
            return { ...described, ...(options.json ? { resource } : {}) };
        }
    }
}
const toolAddCommand = addYesOption(new Command("add"))
    .description("Add a tool by name (react, postgresql, fastapi, rag…); cloud providers are rejected")
    .argument("[tool-and-name...]", "The tool (one or more words, for example react or spring boot), then an optional resource name (default per tool: web, server, db…); leave it out to list every tool")
    .option("-s, --stack <stack>", "Stack to assign the resource to (default: as flisk resource picks it)")
    .option("--dry-run", "Preview the resource without writing files or reserving a port", false)
    .option("--json", "Print one JSON envelope on stdout; implies --yes", false)
    .addHelpText("after", "\nExamples:\n  flisk tool add\n  flisk tool add react\n  flisk tool add postgresql\n  flisk tool add fastapi orders-api --stack shop\n  flisk tool add spring boot\n  flisk tool add rag --dry-run")
    .action(async (words, options) => {
    if (options.json) {
        await runJsonCommand("TOOL_ADD_FAILED", "flisk tool add", async () => ({
            data: addTool(words, options),
        }));
        return;
    }
    await runCommand(async () => {
        addTool(words, options);
    });
});
/** `flisk tool`: tools by their everyday name. `add` is its only subcommand. */
export const toolCommand = new Command("tool")
    .description("Add a tool by name: flisk tool add react, postgresql, fastapi, rag (cloud is rejected)")
    .addCommand(toolAddCommand)
    .addHelpText("after", "\nExamples:\n  flisk tool add\n  flisk tool add react");
