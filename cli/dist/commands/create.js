// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * `flisk create`: pick a stack by answering a few questions, then get a running project.
 *
 * It asks only on an interactive terminal. With `--yes`, with flags for every answer, or without a
 * terminal it never prompts, so scripts and CI behave the same way every time. The answers become
 * the same `flisk project` / `flisk resource` commands a person would type (see `create-plan.ts`).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { addYesOption } from "../utils/command-helpers.js";
import { asksBackend, asksExtras, asksFrontend, buildCreatePlan, CREATE_BACKENDS, CREATE_DEFAULTS, CREATE_FRONTENDS, CREATE_KINDS, CREATE_STACK, describeAnswers, isTemplateKind, isValidProjectName, parseExtras, } from "../utils/create-plan.js";
import { FliskError, runCommand } from "../utils/errors.js";
import { installServiceDependencies } from "../utils/one-command.js";
import { promptConfirm, promptMultiSelect, promptSelect, promptText } from "../utils/prompt.js";
const KIND_TITLES = {
    web: "A web app: website + API + Postgres",
    api: "An API with a worker or queue",
    saas: "A SaaS starter: dashboard and checkout",
    agent: "An AI agent stack: agent + MCP tools + Postgres + NATS",
    swarm: "A multi-agent swarm (local processes, no Docker)",
    ecommerce: "A Vue storefront with a catalog API",
};
const EXTRA_TITLES = {
    queue: "NATS queue",
    worker: "Background worker",
    mcp: "MCP tool server",
    agent: "AI agent",
    redis: "Redis",
};
/** Looks a flag value up in its allowed list, failing with the list so the fix is one read away. */
function pick(flag, value, allowed) {
    if (allowed.includes(value))
        return value;
    throw new FliskError(`Unknown --${flag} "${value}". Use one of: ${allowed.join(", ")}.`, [
        `flisk create --${flag} ${allowed[0]}`,
        "Leave the flag out to be asked, or to take the default.",
    ]);
}
/** Whether the command may ask questions: a terminal on both ends, and no `--yes`. */
export function isInteractive(options, tty) {
    return Boolean(tty.in && tty.out && !options.yes);
}
/**
 * Collects the answers. A flag wins over a question, and a question is only asked for a part the
 * chosen kind uses. Without a terminal the defaults fill what a flag did not.
 */
export async function collectAnswers(nameArg, options, interactive) {
    let name = nameArg;
    if (name === undefined) {
        name = interactive
            ? await promptText({
                message: "Project name?",
                initial: "my-app",
                validate: (value) => isValidProjectName(value) || "Use lowercase letters, digits and dashes, e.g. my-app.",
            })
            : "my-app";
    }
    if (!isValidProjectName(name)) {
        throw new FliskError(`"${name}" is not a usable project name. Use lowercase letters, digits and dashes, e.g. my-app.`, ["Pick a name like my-app or shop-2: flisk create my-app"]);
    }
    const kind = options.kind
        ? pick("kind", options.kind, CREATE_KINDS)
        : interactive
            ? await promptSelect({
                message: "What are you building?",
                choices: CREATE_KINDS.map((value) => ({ title: KIND_TITLES[value], value })),
            })
            : CREATE_DEFAULTS.kind;
    const frontend = options.frontend
        ? pick("frontend", options.frontend, CREATE_FRONTENDS)
        : interactive && asksFrontend(kind)
            ? await promptSelect({
                message: "Which website framework?",
                choices: [
                    { title: "React (Vite)", value: "react" },
                    { title: "Vue 3", value: "vue" },
                    { title: "Svelte", value: "svelte" },
                    { title: "No website", value: "none" },
                ],
            })
            : CREATE_DEFAULTS.frontend;
    const backend = options.backend
        ? pick("backend", options.backend, CREATE_BACKENDS)
        : interactive && asksBackend(kind)
            ? await promptSelect({
                message: "Which API framework?",
                choices: [
                    { title: "Hono (Bun)", value: "hono" },
                    { title: "Express", value: "express" },
                    { title: "Fastify", value: "fastify" },
                    { title: "Elysia", value: "elysia" },
                ],
            })
            : CREATE_DEFAULTS.backend;
    let extras = [...CREATE_DEFAULTS.extras];
    if (options.extras !== undefined) {
        const parsed = options.extras === "none" ? { extras: [] } : parseExtras(options.extras);
        if ("error" in parsed)
            throw new FliskError(parsed.error, [
                "flisk create --extras queue,worker",
                "flisk create --extras none",
            ]);
        extras = parsed.extras;
    }
    else if (interactive && asksExtras(kind)) {
        extras = await promptMultiSelect({
            message: "Add anything else? (Postgres is always included)",
            choices: Object.keys(EXTRA_TITLES).map((value) => ({
                title: EXTRA_TITLES[value],
                value,
            })),
        });
    }
    return { name, kind, frontend, backend, extras };
}
/** The project folder must not exist, or must be empty, so a create never overwrites anything. */
export function assertFolderIsFree(dir) {
    if (!existsSync(dir))
        return;
    if (readdirSync(dir).length === 0)
        return;
    throw new FliskError(`The folder ${dir} already exists and is not empty.`, [
        "Pick another name: flisk create <name>",
        "Or remove the folder first.",
    ]);
}
function renderStep(step) {
    return `flisk ${step.args.join(" ")}`;
}
/** Runs one planned step with this CLI, quietly. Returns its output on failure. */
function runStep(binPath, step, cwd) {
    const result = spawnSync(process.execPath, [binPath, ...step.args], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}
export const createCommand = addYesOption(new Command("create"))
    .description("Pick a stack with a few questions and get a project that runs")
    .argument("[name]", "Project folder to create (default: my-app)")
    .option("--kind <kind>", `What you are building: ${CREATE_KINDS.join(", ")}`)
    .option("--frontend <id>", `Website framework: ${CREATE_FRONTENDS.join(", ")}`)
    .option("--backend <id>", `API framework: ${CREATE_BACKENDS.join(", ")}`)
    .option("--extras <list>", 'Extra parts, comma-separated: queue, worker, mcp, agent, redis, or "none"')
    .option("--dry-run", "Print the commands that would run and stop", false)
    .option("--start", "Install dependencies and start the stack when it is ready", false)
    .action(async (nameArg, options) => {
    await runCommand(() => runCreate(nameArg, options));
});
async function runCreate(nameArg, options) {
    const interactive = isInteractive(options, {
        in: process.stdin.isTTY === true,
        out: process.stdout.isTTY === true,
    });
    if (interactive) {
        console.log(chalk.bold("\nFlisk: pick your stack\n"));
    }
    const answers = await collectAnswers(nameArg, options, interactive);
    const steps = buildCreatePlan(answers);
    if (options.dryRun) {
        console.log(describeAnswers(answers).join("\n"));
        console.log("");
        for (const step of steps) {
            const where = step.inProject ? `(in ./${answers.name})` : "";
            console.log(`${renderStep(step)} ${chalk.gray(where)}`.trimEnd());
        }
        return;
    }
    const projectDir = resolve(process.cwd(), answers.name);
    assertFolderIsFree(projectDir);
    const binPath = process.argv[1];
    if (!binPath) {
        throw new FliskError("The CLI entry point could not be found.", [
            "Reinstall the Flisk CLI and run the command again.",
        ]);
    }
    if (!isTemplateKind(answers.kind))
        mkdirSync(projectDir, { recursive: true });
    for (const step of steps) {
        process.stdout.write(`  ${step.label}... `);
        const result = runStep(binPath, step, step.inProject ? projectDir : process.cwd());
        if (!result.ok) {
            console.log(chalk.red("failed"));
            console.log(result.output.trimEnd());
            throw new FliskError(`"${renderStep(step)}" did not finish.`, [
                `Run it yourself in ${projectDir} to see the full output.`,
            ]);
        }
        console.log(chalk.green("done"));
    }
    const stack = isTemplateKind(answers.kind) ? undefined : CREATE_STACK;
    const upCommand = stack ? `flisk up ${stack}` : "flisk up";
    console.log(`\n${chalk.green("✔")} Created ${chalk.bold(answers.name)}`);
    let start = Boolean(options.start);
    if (!start && interactive) {
        start = await promptConfirm({
            message: "Install dependencies and start it now?",
            initial: true,
        });
    }
    if (!start) {
        console.log(`\nNext:\n  cd ${answers.name}\n  ${upCommand}\n`);
        return;
    }
    process.stdout.write("  Installing dependencies... ");
    const installs = await installServiceDependencies(projectDir);
    const failed = installs.filter((entry) => !entry.ok);
    if (failed.length > 0) {
        console.log(chalk.red("failed"));
        throw new FliskError(`${failed.length} of ${installs.length} services could not install.`, [
            `Run "bun install" in ${join(projectDir, failed[0]?.dir ?? "")}.`,
        ]);
    }
    console.log(chalk.green("done"));
    const up = spawnSync(process.execPath, [binPath, "up", ...(stack ? [stack] : [])], {
        cwd: projectDir,
        stdio: "inherit",
    });
    if (up.status !== 0) {
        throw new FliskError(`"${upCommand}" did not finish.`, [
            `Run "flisk doctor" in ${projectDir}.`,
        ]);
    }
}
