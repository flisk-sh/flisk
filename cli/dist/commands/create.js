// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * `flisk create`: pick what you are building with a few key presses, then get a project that runs.
 *
 * It asks only on an interactive terminal. With `--yes`, with flags for every answer, or without a
 * terminal it never prompts, so scripts and CI behave the same way every time. A small web app or
 * API runs as plain local processes (Node only: no Docker, no Tilt, no database); frameworks and
 * extras are the Docker route's questions (see `create-plan.ts`).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { loadTemplate } from "../generator/template-engine.js";
import { arrowMultiSelect, arrowSelect, arrowText, PromptCancelled, } from "../utils/arrow-prompt.js";
import { addYesOption } from "../utils/command-helpers.js";
import { asksBackend, asksExtras, asksFrontend, asksRuntime, buildCreatePlan, CREATE_BACKENDS, CREATE_DEFAULTS, CREATE_FRONTENDS, CREATE_KINDS, CREATE_RUNTIMES, CREATE_STACK, DEFAULT_LOCAL_PORTS, describeAnswers, describeParts, describeRequirements, isTemplateKind, isValidProjectName, parseExtras, runsLocally, } from "../utils/create-plan.js";
import { FliskError, runCommand } from "../utils/errors.js";
import { pickDemoPorts } from "../utils/native-demo.js";
import { installServiceDependencies } from "../utils/one-command.js";
const KIND_CHOICES = [
    {
        title: "Web app",
        value: "web",
        hint: "A website and an API. Runs on your computer, no Docker.",
    },
    { title: "API or backend", value: "api", hint: "An API you can grow with jobs and queues." },
    { title: "SaaS product", value: "saas", hint: "A dashboard and a checkout, ready to edit." },
    { title: "AI application", value: "agent", hint: "An agent, its tools, Postgres and a queue." },
    { title: "More starters…", value: "more", hint: "A multi-agent swarm, a storefront." },
];
const MORE_KIND_CHOICES = [
    { title: "Multi-agent swarm", value: "swarm", hint: "A coordinator and workers. No Docker." },
    { title: "Storefront", value: "ecommerce", hint: "A Vue shop with a catalog API." },
];
const RUNTIME_CHOICES = [
    {
        title: "On my computer (recommended)",
        value: "local",
        hint: "Needs only Node.js. No Docker, no database.",
    },
    {
        title: "With Docker and Tilt",
        value: "docker",
        hint: "For Postgres, queues, a gateway and your choice of framework.",
    },
];
const FRONTEND_CHOICES = [
    { title: "React (recommended)", value: "react", hint: "The most common choice." },
    { title: "Vue 3", value: "vue", hint: "Gentle to learn." },
    { title: "Svelte", value: "svelte", hint: "Small and fast." },
    { title: "No website", value: "none", hint: "An API only." },
];
const BACKEND_CHOICES = [
    { title: "Hono (recommended)", value: "hono", hint: "Small and fast, on Bun." },
    { title: "Express", value: "express", hint: "The classic." },
    { title: "Fastify", value: "fastify", hint: "Fast, with schemas." },
    { title: "Elysia", value: "elysia", hint: "Typed, on Bun." },
];
const EXTRA_CHOICES = [
    { title: "Queue (NATS)", value: "queue", hint: "Pass jobs between services." },
    { title: "Background worker", value: "worker", hint: "Runs jobs away from requests." },
    { title: "MCP tool server", value: "mcp", hint: "Tools an AI agent can call." },
    { title: "AI agent", value: "agent", hint: "An agent that keeps its sessions." },
    { title: "Redis", value: "redis", hint: "A fast cache." },
];
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
/** A framework or extras flag only means something to the Docker route, so it picks that route. */
function impliesDocker(options) {
    return (options.frontend !== undefined || options.backend !== undefined || options.extras !== undefined);
}
/**
 * Collects the answers. A flag wins over a question, and a question is only asked for a part the
 * chosen kind uses. Without a terminal the defaults fill what a flag did not.
 *
 * The order is what a newcomer needs: what you are building, then how it runs, then (only for the
 * Docker route) the frameworks and extras, and the name last with a default Enter accepts.
 */
export async function collectAnswers(nameArg, options, interactive) {
    if (nameArg !== undefined && !isValidProjectName(nameArg)) {
        throw new FliskError(`"${nameArg}" is not a usable project name. Use lowercase letters, digits and dashes, e.g. my-app.`, ["Pick a name like my-app or shop-2: flisk create my-app"]);
    }
    let kind;
    if (options.kind) {
        kind = pick("kind", options.kind, CREATE_KINDS);
    }
    else if (interactive) {
        const first = await arrowSelect({
            message: "What do you want to build?",
            choices: KIND_CHOICES,
        });
        kind =
            first === "more"
                ? await arrowSelect({ message: "Which starter?", choices: MORE_KIND_CHOICES })
                : first;
    }
    else {
        kind = CREATE_DEFAULTS.kind;
    }
    let runtime = CREATE_DEFAULTS.runtime;
    if (options.runtime) {
        runtime = pick("runtime", options.runtime, CREATE_RUNTIMES);
    }
    else if (impliesDocker(options)) {
        runtime = "docker";
    }
    else if (interactive && asksRuntime(kind)) {
        runtime = await arrowSelect({
            message: "How do you want to run it?",
            choices: RUNTIME_CHOICES,
        });
    }
    if (runtime === "local" && impliesDocker(options) && asksRuntime(kind)) {
        throw new FliskError("--frontend, --backend and --extras need the Docker runtime.", [
            "Use --runtime docker, or leave those flags out to run on your computer.",
        ]);
    }
    const frontend = options.frontend
        ? pick("frontend", options.frontend, CREATE_FRONTENDS)
        : interactive && asksFrontend(kind, runtime)
            ? await arrowSelect({
                message: "Which website framework?",
                choices: FRONTEND_CHOICES,
            })
            : CREATE_DEFAULTS.frontend;
    const backend = options.backend
        ? pick("backend", options.backend, CREATE_BACKENDS)
        : interactive && asksBackend(kind, runtime)
            ? await arrowSelect({
                message: "Which API framework?",
                choices: BACKEND_CHOICES,
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
    else if (interactive && asksExtras(kind, runtime)) {
        extras = await arrowMultiSelect({
            message: "Add anything else? (Postgres is always included)",
            choices: EXTRA_CHOICES,
        });
    }
    // The name comes last and has a default, so a first run is arrows and Enter, never typing.
    const name = nameArg ??
        (interactive
            ? await arrowText({
                message: "Project name?",
                initial: "my-app",
                validate: (value) => isValidProjectName(value) || "Use lowercase letters, digits and dashes, e.g. my-app.",
            })
            : "my-app");
    return { name, kind, runtime, frontend, backend, extras };
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
/** One line per step for the dry run and the failure report. */
export function renderStep(step) {
    if (step.args)
        return `flisk ${step.args.join(" ")}`;
    return `write ${(step.files ?? []).map((file) => file.path).join(", ")}`;
}
/** What gets created, what it needs, and what is chosen, shown before anything is written. */
export function reviewLines(answers, steps) {
    const chosen = describeAnswers(answers)
        .filter((line) => !line.startsWith("name:"))
        .join(" · ");
    return [
        `Creating ${answers.name}: ${describeParts(answers, steps)}`,
        `Needs: ${describeRequirements(answers)}`,
        `Chosen: ${chosen}`,
    ];
}
/** Writes the files of a local step, filling `__NAME__` in templates. Returns the paths written. */
export function writeLocalFiles(projectDir, name, files) {
    const written = [];
    for (const file of files) {
        const target = join(projectDir, file.path);
        mkdirSync(dirname(target), { recursive: true });
        const body = file.template
            ? loadTemplate(file.template).replaceAll("__NAME__", name)
            : file.json
                ? `${JSON.stringify(file.json, null, 2)}\n`
                : (file.text ?? "");
        writeFileSync(target, body);
        written.push(file.path);
    }
    return written;
}
/** Runs one planned command with this CLI, quietly. Returns its output on failure. */
function runStep(binPath, step, cwd) {
    const result = spawnSync(process.execPath, [binPath, ...(step.args ?? [])], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}
/** What to tell someone when a step fails halfway: what finished, what did not, how to start over. */
export function recoveryMessage(projectDir, steps, failedIndex) {
    const failed = steps[failedIndex];
    return [
        `The project in ${projectDir} is incomplete${failed ? `: "${failed.label}" did not finish` : ""}.`,
        ...steps.slice(0, failedIndex).map((step) => `  done: ${step.label}`),
        ...steps.slice(failedIndex + 1).map((step) => `  not run: ${step.label}`),
        `To start over: rm -rf ${projectDir}, then run flisk create again.`,
    ];
}
export const createCommand = addYesOption(new Command("create"))
    .description("Pick what you are building with a few key presses and get a project that runs")
    .argument("[name]", "Project folder to create (default: my-app)")
    .option("--kind <kind>", `What you are building: ${CREATE_KINDS.join(", ")} (default: web)`)
    .option("--runtime <runtime>", "web and api: local (Node only, no Docker; default) or docker (Docker and Tilt, with frameworks and extras)")
    .option("--frontend <id>", `Docker runtime: website framework: ${CREATE_FRONTENDS.join(", ")}`)
    .option("--backend <id>", `Docker runtime: API framework: ${CREATE_BACKENDS.join(", ")}`)
    .option("--extras <list>", 'Docker runtime: extra parts, comma-separated: queue, worker, mcp, agent, redis, or "none"')
    .option("--dry-run", "Print what would be created and run, and stop", false)
    .option("--start", "Install dependencies and start the project when it is ready", false)
    .action(async (nameArg, options) => {
    // runCommand turns every error into an exit, so a cancel is handled inside it.
    await runCommand(async () => {
        try {
            await runCreate(nameArg, options);
        }
        catch (error) {
            if (!(error instanceof PromptCancelled))
                throw error;
            console.log(chalk.dim("\nCancelled. Nothing was written."));
            process.exitCode = 130;
        }
    });
});
async function runCreate(nameArg, options) {
    const interactive = isInteractive(options, {
        in: process.stdin.isTTY === true,
        out: process.stdout.isTTY === true,
    });
    if (interactive) {
        console.log(chalk.bold("\nLet's create your project"));
        console.log(chalk.dim("Start with a working default. Change only what you need.\n"));
    }
    const answers = await collectAnswers(nameArg, options, interactive);
    if (!isValidProjectName(answers.name)) {
        throw new FliskError(`"${answers.name}" is not a usable project name. Use lowercase letters, digits and dashes, e.g. my-app.`, ["Pick a name like my-app or shop-2: flisk create my-app"]);
    }
    // Free ports are picked before the plan, so the plan itself stays a pure function.
    let ports = DEFAULT_LOCAL_PORTS;
    if (runsLocally(answers) && !isTemplateKind(answers.kind) && !options.dryRun) {
        ports = await pickDemoPorts();
    }
    const steps = buildCreatePlan(answers, ports);
    if (options.dryRun) {
        console.log(describeAnswers(answers).join("\n"));
        console.log(`needs: ${describeRequirements(answers)}\n`);
        for (const step of steps) {
            const where = step.inProject ? chalk.gray(`(in ./${answers.name})`) : "";
            console.log(`${renderStep(step)} ${where}`.trimEnd());
        }
        console.log(chalk.gray("\nDry run: nothing was written."));
        return;
    }
    const projectDir = resolve(process.cwd(), answers.name);
    assertFolderIsFree(projectDir);
    // The review comes before anything is written, in every mode, so a default is never a surprise.
    const review = reviewLines(answers, steps);
    if (interactive) {
        console.log("");
        for (const line of review)
            console.log(`  ${line}`);
        console.log("");
        const go = await arrowSelect({
            message: "Create it?",
            choices: [
                { title: "Yes, create it", value: "create" },
                { title: "No, cancel", value: "cancel" },
            ],
        });
        if (go === "cancel") {
            console.log(chalk.dim("\nCancelled. Nothing was written."));
            process.exitCode = 130;
            return;
        }
    }
    else {
        for (const line of review)
            console.log(line);
    }
    const binPath = process.argv[1];
    if (!binPath) {
        throw new FliskError("The CLI entry point could not be found.", [
            "Reinstall the Flisk CLI and run the command again.",
        ]);
    }
    if (!isTemplateKind(answers.kind))
        mkdirSync(projectDir, { recursive: true });
    for (const [index, step] of steps.entries()) {
        process.stdout.write(`  ${step.label}... `);
        if (step.files) {
            try {
                writeLocalFiles(projectDir, answers.name, step.files);
            }
            catch (error) {
                console.log(chalk.red("failed"));
                console.log(chalk.dim(String(error instanceof Error ? error.message : error)));
                throw new FliskError(`${step.label} did not finish.`, recoveryMessage(projectDir, steps, index));
            }
            console.log(chalk.green("done"));
            continue;
        }
        const result = runStep(binPath, step, step.inProject ? projectDir : process.cwd());
        if (!result.ok) {
            console.log(chalk.red("failed"));
            console.log(result.output.trimEnd());
            throw new FliskError(`"${renderStep(step)}" did not finish.`, recoveryMessage(projectDir, steps, index));
        }
        console.log(chalk.green("done"));
    }
    const local = runsLocally(answers) && !isTemplateKind(answers.kind);
    const stack = !runsLocally(answers) && !isTemplateKind(answers.kind) ? CREATE_STACK : undefined;
    // A local app starts the way create-next-app's does: npm install, then npm run dev.
    const upCommand = local ? "npm run dev" : stack ? `flisk up ${stack}` : "flisk up";
    console.log(`\n${chalk.green("✔")} Created ${chalk.bold(answers.name)}`);
    let start = Boolean(options.start);
    if (!start && interactive) {
        start =
            (await arrowSelect({
                message: local ? "Start it now?" : "Install dependencies and start it now?",
                choices: [
                    { title: "Yes, start it", value: "yes" },
                    { title: "No, I'll do it later", value: "no" },
                ],
            })) === "yes";
    }
    if (!start) {
        console.log(`\nNext:\n  cd ${answers.name}\n${local ? "  npm install\n" : ""}  ${upCommand}\n`);
        if (local) {
            console.log(chalk.dim("It needs Node.js and npm only. To add a database, a queue or a framework later, see README.md.\n"));
        }
        return;
    }
    if (local) {
        const npm = process.platform === "win32" ? "npm.cmd" : "npm";
        for (const args of [["install"], ["run", "dev"]]) {
            const run = spawnSync(npm, args, { cwd: projectDir, stdio: "inherit" });
            if (run.error || run.status !== 0) {
                throw new FliskError(`"npm ${args.join(" ")}" did not finish.`, [
                    "The project is created. Install Node.js (it includes npm) if npm is missing.",
                    `Then run it yourself: cd ${answers.name} && npm install && npm run dev`,
                ]);
            }
        }
        return;
    }
    {
        process.stdout.write("  Installing dependencies... ");
        const installs = await installServiceDependencies(projectDir);
        const failed = installs.filter((entry) => !entry.ok);
        if (failed.length > 0) {
            console.log(chalk.red("failed"));
            throw new FliskError(`${failed.length} of ${installs.length} services could not install.`, [
                `The project is created and complete; only the install needs a retry.`,
                `Run "bun install" in ${join(projectDir, failed[0]?.dir ?? "")}, then ${upCommand} in ${projectDir}.`,
            ]);
        }
        console.log(chalk.green("done"));
    }
    const up = spawnSync(process.execPath, [binPath, "up", ...(stack ? [stack] : [])], {
        cwd: projectDir,
        stdio: "inherit",
    });
    if (up.status !== 0) {
        throw new FliskError(`"${upCommand}" did not finish.`, [
            `The project is created. Run "flisk doctor" in ${projectDir} to see what is missing, then ${upCommand}.`,
        ]);
    }
}
