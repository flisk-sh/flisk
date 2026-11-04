// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * `flisk create`: pick what you are building with a few key presses, then get a project that runs.
 *
 * This file is only the journey. What can be built comes from Flisk's generator registries (create-catalog.ts), the project is
 * built by the real `flisk project` and `flisk resource` commands (create-plan.ts), and the next steps are read back from what
 * those commands wrote. It keeps no list of frameworks, languages or starters of its own.
 */
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { DEFAULT_BACKEND_LANGUAGE, getBackendLanguage } from "../backend-languages/registry.js";
import { arrowMultiSelect, arrowSelect, arrowText, PromptCancelled, } from "../utils/arrow-prompt.js";
import { addYesOption } from "../utils/command-helpers.js";
import { backendCatalog, extraCatalog, frontendCatalog, starterCatalog, } from "../utils/create-catalog.js";
import { asksToStart, buildCreatePlan, CREATE_RUNTIMES, describeAnswers, describeParts, describeRequirements, isEmptyApp, isValidProjectName, LOCAL_BACKEND_DIR, LOCAL_FRONTEND_DIR, missingPrograms, starterInfo, toProjectName, } from "../utils/create-plan.js";
import { FliskError, runCommand } from "../utils/errors.js";
import { installServiceDependencies } from "../utils/one-command.js";
import { isWindows } from "../utils/platform.js";
import { findOnPath } from "../utils/which.js";
const SHAPE_CHOICES = [
    {
        title: "A website that saves and shows information",
        value: "both",
        hint: "Pages people open in a browser, plus the part behind them (default).",
    },
    { title: "Just a website", value: "web", hint: "Pages people open in a browser." },
    {
        title: "Just the part behind the scenes",
        value: "api",
        hint: "A service other programs talk to (an API).",
    },
    {
        title: "A ready-made app to start from…",
        value: "starter",
        hint: "An online shop, an AI helper, a team tool and more.",
    },
    {
        title: "I know what I want: let me choose every part",
        value: "custom",
        hint: "Pick the framework, language and extras yourself.",
    },
];
/** What to do when a program is missing: one link or command a person can follow without knowing the tool. */
const INSTALL_HELP = {
    node: "Node.js (also gives you npm): https://nodejs.org",
    npm: "npm comes with Node.js: https://nodejs.org",
    bun: "Bun: curl -fsSL https://bun.sh/install | bash",
    go: "Go: https://go.dev/dl",
    cargo: "Rust: https://rustup.rs",
    python3: "Python: https://www.python.org/downloads",
    uvicorn: "uvicorn: pip install uvicorn",
};
/** How to get each missing program; empty when nothing is missing or nothing is known about it. */
export function installHelp(missing) {
    return missing.flatMap((program) => INSTALL_HELP[program] ? [`  ${INSTALL_HELP[program]}`] : []);
}
/** A flag value must be one of the ids the catalog offers; the error lists them. */
function oneOf(flag, value, ids, extra = []) {
    const allowed = [...ids, ...extra];
    if (allowed.includes(value))
        return value;
    throw new FliskError(`Unknown --${flag} "${value}". Use one of: ${allowed.join(", ")}.`, [
        `flisk create --${flag} ${allowed[0] ?? "<id>"}`,
        "Leave the flag out to be asked, or to take the default.",
    ]);
}
/** Whether the command may ask questions: a terminal on both ends, and no `--yes`. */
export function isInteractive(options, tty) {
    return Boolean(tty.in && tty.out && !options.yes);
}
/** Catalog options as menu rows; a Docker-only option is marked and its pick switches the runtime. */
function toChoices(options) {
    return options.map((option, index) => ({
        title: index === 0 ? `${option.title} (default)` : option.title,
        value: option.id,
        hint: `${option.hint}${option.local ? "" : " · needs Docker"}`.trim(),
    }));
}
/** One row per language + framework: picking a row writes the whole stack, so one Enter replaces two questions.
 *
 * The registries bake the language into every label ("Bun + Hono" for the language, "Bun + Express" for the
 * framework), so a row title is exactly the label of what the row is: the default framework keeps the language's
 * label, any other framework keeps its own. A language with no frameworks keeps its label as a bare row.
 */
function backendChoices(catalog) {
    const rows = [];
    for (const language of catalog) {
        if (language.frameworks.length === 0) {
            rows.push({ title: language.title, value: language.id, hint: language.hint });
            continue;
        }
        for (const [index, framework] of language.frameworks.entries()) {
            const globalDefault = index === 0 && language.id === catalog[0]?.id;
            rows.push({
                title: `${globalDefault ? language.title : framework.title}${globalDefault ? " (default)" : ""}`,
                value: `${language.id}/${framework.id}`,
                hint: language.hint,
            });
        }
    }
    return rows;
}
/** "bun/hono" is the backend answer; a lone id is a language that owns its runtime. */
function splitStackChoice(pick) {
    const [language, framework] = pick.split("/");
    return { language, ...(framework ? { framework } : {}) };
}
/** Resolves `--backend` and `--language` into the API choice the catalog allows, or throws with what it allows. */
function resolveBackend(framework, language) {
    const catalog = backendCatalog();
    const languages = catalog.map((entry) => entry.id);
    const lang = language ? oneOf("language", language, languages) : undefined;
    // A framework names its language: the one that lists it.
    const owner = framework
        ? catalog.find((entry) => entry.frameworks.some((option) => option.id === framework))
        : undefined;
    if (framework) {
        const everyFramework = catalog.flatMap((entry) => entry.frameworks.map((option) => option.id));
        oneOf("backend", framework, everyFramework);
        if (lang && owner && lang !== owner.id) {
            throw new FliskError(`--backend ${framework} runs on ${owner.id}, not ${lang}.`, [
                `Use --language ${owner.id}, or leave --language out.`,
            ]);
        }
        return { language: owner?.id ?? catalog[0]?.id ?? "", framework };
    }
    const chosen = catalog.find((entry) => entry.id === lang) ?? catalog[0];
    if (!chosen)
        return undefined;
    return {
        language: chosen.id,
        ...(chosen.frameworks[0] && !lang ? { framework: chosen.frameworks[0].id } : {}),
    };
}
/**
 * Collects the answers. A flag wins over a question, and a question is only asked for a part the chosen shape uses. Without a
 * terminal the registries' defaults fill what a flag did not.
 */
export async function collectAnswers(nameArg, options, interactive) {
    if (nameArg !== undefined && !isValidProjectName(nameArg)) {
        throw new FliskError(`"${nameArg}" is not a usable project name. Use lowercase letters, digits and dashes, e.g. my-app.`, ["Pick a name like my-app or shop-2: flisk create my-app"]);
    }
    const starters = starterCatalog();
    const frontends = frontendCatalog();
    const backends = backendCatalog();
    const extrasCatalog = extraCatalog();
    if (options.backend === "none" && options.language !== undefined) {
        throw new FliskError(`--language ${options.language} has no API to apply to: --backend none leaves the API out.`, ["Drop --backend none to get an API in that language, or drop --language."]);
    }
    const flagged = {
        frontend: options.frontend !== undefined,
        backend: options.backend !== undefined || options.language !== undefined,
    };
    // 1. What to build.
    let shape = "both";
    if (options.starter)
        shape = "starter";
    else if (flagged.frontend || flagged.backend) {
        shape = options.frontend === "none" ? "api" : options.backend === "none" ? "web" : "both";
        if (!flagged.backend && flagged.frontend)
            shape = options.frontend === "none" ? "api" : "web";
        if (!flagged.frontend && flagged.backend)
            shape = options.backend === "none" ? "web" : "api";
    }
    else if (interactive) {
        shape = await arrowSelect({
            message: "What do you want to make?",
            choices: SHAPE_CHOICES,
        });
    }
    // The plain journey picks the framework, language and extras from the registries' defaults; only
    // "let me choose every part" shows those menus.
    const advanced = shape === "custom";
    if (advanced)
        shape = "both";
    // 2. A starter carries its own parts and its own runtime.
    let starter;
    if (shape === "starter") {
        starter = options.starter
            ? oneOf("starter", options.starter, starters.map((option) => option.id))
            : await arrowSelect({
                message: "Which starter?",
                filterable: true,
                choices: [...starters]
                    .sort((x, y) => Number(y.local) - Number(x.local))
                    .map((option) => ({
                    title: option.title,
                    value: option.id,
                    hint: `${option.hint}${option.local ? " · runs on your computer" : " · needs Docker, see its README"}`,
                })),
            });
    }
    const starterLocal = starters.find((option) => option.id === starter)?.local ?? false;
    // 3. How to run it is never asked: starters decide for themselves, extras and Docker-only parts turn
    //    the app into a Docker project, and everything else runs on the computer with --runtime docker as the escape hatch.
    let runtime = starter ? (starterLocal ? "local" : "docker") : "local";
    // 4. The website.
    let frontend;
    if (!starter && shape !== "api") {
        if (options.frontend && options.frontend !== "none") {
            frontend = oneOf("frontend", options.frontend, frontends.map((option) => option.id), ["none"]);
        }
        else if (!options.frontend) {
            frontend =
                interactive && advanced
                    ? await arrowSelect({
                        message: "Which website framework?",
                        filterable: true,
                        choices: toChoices(frontends),
                    })
                    : frontends.find((option) => option.local)?.id;
        }
        const picked = frontends.find((option) => option.id === frontend);
        if (picked && !picked.local)
            runtime = "docker";
    }
    // 5. The API: one menu of language + framework rows, so a stack is chosen with a single Enter.
    let backend;
    if (!starter && shape !== "web") {
        if (flagged.backend && options.backend !== "none") {
            backend = resolveBackend(options.backend, options.language);
        }
        else if (!flagged.backend) {
            if (interactive && advanced) {
                const stack = await arrowSelect({
                    message: "Which API stack?",
                    filterable: true,
                    choices: backendChoices(backends),
                });
                backend = splitStackChoice(stack);
            }
            else {
                backend = resolveBackend(undefined, undefined);
            }
        }
    }
    // 6. Extras: infrastructure. Empty keeps the app on your computer; a pick makes it a Docker project.
    let extras = [];
    if (options.extras !== undefined) {
        extras =
            options.extras === "none"
                ? []
                : options.extras
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean)
                    .map((value) => oneOf("extras", value, extrasCatalog.map((extra) => extra.id), ["none"]));
    }
    else if (interactive && advanced && !starter) {
        extras = await arrowMultiSelect({
            message: "Add anything else?  Leaving it empty runs the app on this computer.",
            choices: extrasCatalog.map((extra) => ({
                title: extra.title,
                value: extra.id,
                hint: extra.hint,
            })),
        });
    }
    if (options.runtime)
        runtime = oneOf("runtime", options.runtime, CREATE_RUNTIMES);
    else if (extras.length > 0 && !starter)
        runtime = "docker";
    if (runtime === "local" && extras.length > 0 && !starter) {
        throw new FliskError("--extras (queues, databases, workers) need the Docker runtime.", [
            "Use --runtime docker, or leave --extras out to run on your computer.",
        ]);
    }
    // 7. The name comes last and has a default, so a first run is arrows and Enter, never typing.
    let name = nameArg ?? "my-app";
    if (nameArg === undefined && interactive) {
        const typed = await arrowText({
            message: "Project name?",
            initial: "my-app",
            // Anything readable is fine: "My Shop!" becomes the folder my-shop.
            validate: (value) => isValidProjectName(toProjectName(value)) ||
                "Type a name with at least one letter, e.g. my-shop.",
        });
        name = toProjectName(typed ?? "my-app");
    }
    const answers = {
        name,
        ...(starter ? { starter } : {}),
        runtime,
        ...(frontend ? { frontend } : {}),
        ...(backend ? { backend } : {}),
        extras,
    };
    if (isEmptyApp(answers)) {
        throw new FliskError("There is nothing to create: no website, no API and no starter.", [
            "Pick a website or an API, or use --starter <name>.",
        ]);
    }
    return answers;
}
/** The project folder must not exist, or must be empty, so a create never overwrites anything. */
export function assertFolderIsFree(dir) {
    // lstat, not stat: a link named like the project would send every write somewhere else.
    let entry;
    try {
        entry = lstatSync(dir);
    }
    catch {
        return;
    }
    if (entry.isSymbolicLink()) {
        throw new FliskError(`${dir} is a link to another place, not a folder.`, [
            "Pick another name: flisk create <name>",
        ]);
    }
    if (!entry.isDirectory()) {
        throw new FliskError(`${dir} already exists and is not a folder.`, [
            "Pick another name: flisk create <name>",
        ]);
    }
    if (readdirSync(dir).length === 0)
        return;
    throw new FliskError(`The folder ${dir} already exists and is not empty.`, [
        "Pick another name: flisk create <name>",
        "Or remove the folder first.",
    ]);
}
/**
 * Claim the project folder right before anything is written. The earlier check ran before the
 * confirmation, so this re-checks it and creates the folder without `recursive` on the last
 * segment: if another process made it in the meantime, mkdir fails (EEXIST) and create aborts
 * instead of writing into a folder it no longer owns.
 */
/** Returns true when create made the folder, false when it took over an empty folder that was already there. */
export function claimFolder(dir) {
    assertFolderIsFree(dir);
    const existed = existsSync(dir);
    // An empty folder the user made is claimed the same way as a new one: rmdir only succeeds while it is still
    // empty, and the mkdir below fails if anything re-creates it, so nothing that appears in between is ever used.
    if (existsSync(dir)) {
        try {
            rmdirSync(dir);
        }
        catch {
            throw new FliskError(`The folder ${dir} is no longer empty.`, [
                "Something wrote into it while create was starting. Nothing was written by create.",
                "Pick another name: flisk create <name>",
            ]);
        }
    }
    mkdirSync(dirname(dir), { recursive: true });
    try {
        mkdirSync(dir);
    }
    catch (error) {
        if (error.code === "EEXIST") {
            throw new FliskError(`The folder ${dir} appeared while create was starting.`, [
                "Nothing was written. Pick another name: flisk create <name>",
            ]);
        }
        throw error;
    }
    return !existed;
}
/** One line per step for the dry run and the failure report. */
export function renderStep(step) {
    return `flisk ${step.args.join(" ")}`;
}
/** What gets created, what it needs, and what was chosen, shown before anything is written. */
export function reviewLines(answers, steps, onPath = (program) => findOnPath(program) !== null) {
    const chosen = describeAnswers(answers)
        .filter((line) => !line.startsWith("name:"))
        .join(" · ");
    const lines = [
        `Creating ${answers.name}: ${describeParts(answers, steps)}`,
        `Needs: ${describeRequirements(answers, onPath)}`,
        `Chosen: ${chosen}`,
    ];
    // The runtime is never a question: an app runs on this computer unless the parts say otherwise,
    // so the Docker route stays reachable as a one-flag switch.
    if (answers.runtime === "local" && !answers.starter) {
        lines.push(`Runs on this computer. --runtime docker switches to containers, one gateway and live reload.`);
    }
    const missing = missingPrograms(answers, onPath);
    if (missing.length > 0) {
        lines.push(`To install what is missing:`, ...installHelp(missing));
    }
    return lines;
}
function readJson(path) {
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    }
    catch {
        return undefined;
    }
}
/** The install command without the "# optional: Docker builds the image" note: on your computer the install is needed. */
export function localInstallHint(hint) {
    return hint.split("#")[0]?.trim() ?? hint;
}
/** The local services a project actually contains, read from the files the generators wrote. */
export function generatedServices(projectDir, answers) {
    const found = [];
    for (const dir of [LOCAL_FRONTEND_DIR, LOCAL_BACKEND_DIR]) {
        const service = readJson(join(projectDir, dir, "service.json"));
        if (!service)
            continue;
        const pkg = readJson(join(projectDir, dir, "package.json"));
        const scripts = (pkg?.scripts ?? {});
        const language = dir === LOCAL_BACKEND_DIR ? answers.backend?.language : undefined;
        found.push({
            dir,
            install: pkg
                ? "npm install"
                : language
                    ? localInstallHint(getBackendLanguage(language).installHint)
                    : undefined,
            run: scripts.dev ? "npm run dev" : String(service.command ?? ""),
            ...(typeof service.port === "number" ? { port: service.port } : {}),
        });
    }
    return found;
}
/**
 * Programs that must be installed before --start can run the app. The default language's package manager stands in
 * for npm, exactly as the installer below does.
 */
export function startBlockers(answers, onPath = (program) => findOnPath(program) !== null) {
    const fallback = getBackendLanguage(DEFAULT_BACKEND_LANGUAGE).installHint.split(" ")[0] ?? "npm";
    return missingPrograms(answers, onPath).filter((program) => !(program === "npm" && onPath(fallback)));
}
/** The first port a starter's services declare, so the next steps can say where to look. */
export function firstPort(projectDir) {
    let entries = [];
    try {
        entries = readdirSync(projectDir).sort();
    }
    catch {
        return undefined;
    }
    for (const dir of entries) {
        const port = readJson(join(projectDir, dir, "service.json"))?.port;
        if (typeof port === "number")
            return port;
    }
    return undefined;
}
/** Where to look once it runs: the website's page, or the API's health check when there is no website. */
export function whereToOpen(services) {
    const web = services.find((service) => service.dir === LOCAL_FRONTEND_DIR && service.port);
    if (web)
        return `Then open http://localhost:${web.port} in your browser.`;
    const api = services.find((service) => service.dir === LOCAL_BACKEND_DIR && service.port);
    if (api)
        return `Then check it works: http://localhost:${api.port}/health`;
    return undefined;
}
/** The commands to run next, from what was generated. */
export function nextSteps(projectDir, answers, services = generatedServices(projectDir, answers)) {
    if (answers.starter) {
        if (!starterInfo(answers.starter).local)
            return [`cd ${answers.name}`, "Read its README for what it needs, then run it."];
        const port = firstPort(projectDir);
        return [
            `cd ${answers.name}`,
            "flisk up        # starts it",
            ...(port ? [`Then open http://localhost:${port} in your browser.`] : []),
        ];
    }
    if (answers.runtime === "docker")
        return [`cd ${answers.name}`, "flisk up app"];
    // Always flisk up: it starts each part with the port written in its service.json. Running a part's own dev
    // command by hand would fall back to the part's built-in default port, which may not be the one chosen here.
    const open = whereToOpen(services);
    return [
        `cd ${answers.name}`,
        ...services.flatMap((service) => service.install ? [`(cd ${service.dir} && ${service.install})`] : []),
        services.length === 1 ? "flisk up        # starts it" : "flisk up        # starts both",
        ...(open ? [open] : []),
    ];
}
/** Runs one planned command with this CLI, quietly. Returns its output on failure. */
function runStep(binPath, step, cwd) {
    const result = spawnSync(process.execPath, [binPath, ...step.args], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}
/** What to tell someone when a step fails halfway: what finished, what did not run, how to start over. */
export function recoveryMessage(projectDir, steps, failedIndex, createdFolder = true) {
    const failed = steps[failedIndex];
    return [
        `The project in ${projectDir} is incomplete${failed ? `: "${failed.label}" did not finish` : ""}.`,
        ...steps.slice(0, failedIndex).map((step) => `  done: ${step.label}`),
        ...steps.slice(failedIndex + 1).map((step) => `  not run: ${step.label}`),
        `Project folder (absolute path): ${JSON.stringify(projectDir)}`,
        createdFolder
            ? "flisk create made this folder just now. Look inside it, delete it yourself if you no longer need it, then run flisk create again."
            : "This folder was already there (empty) before flisk create. Look inside it and remove only what create added, then run flisk create again.",
    ];
}
export const createCommand = addYesOption(new Command("create"))
    .description("Pick what you are building with a few key presses and get a project that runs")
    .argument("[name]", "Project folder to create (default: my-app)")
    .option("--starter <name>", "A ready-made starter project (see flisk project --list)")
    .option("--runtime <runtime>", "local (plain processes on your computer; default) or docker (Docker and Tilt)")
    .option("--frontend <id>", "Website framework (see flisk resource --frameworks --type frontend), or none")
    .option("--backend <id>", "API framework (see flisk resource --frameworks --type backend), or none")
    .option("--language <id>", "API language (see flisk resource --help)")
    .option("--extras <list>", "Docker runtime: extra parts, comma-separated (worker, queue:nats, database:redis…), or none")
    .option("--dry-run", "Print the commands that would run, and stop", false)
    .option("--start", "Install dependencies and start what was written (the local app route; a starter is never started here)", false)
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
/**
 * The create journey: collect the answers, show the review, run the plan, then hand over. A starter is handed to
 * its README; a local app may install and start itself (the ask, or --start); the Docker route is started with flisk up app.
 */
async function runCreate(nameArg, options) {
    const interactive = isInteractive(options, {
        in: process.stdin.isTTY === true,
        out: process.stdout.isTTY === true,
    });
    if (interactive) {
        console.log(chalk.bold("\nLet's create your project"));
        console.log(chalk.dim("Start with a working default. Type to filter a long list.\n"));
    }
    const answers = await collectAnswers(nameArg, options, interactive);
    if (!isValidProjectName(answers.name)) {
        throw new FliskError(`"${answers.name}" is not a usable project name. Use lowercase letters, digits and dashes, e.g. my-app.`, ["Pick a name like my-app or shop-2: flisk create my-app"]);
    }
    const steps = buildCreatePlan(answers);
    if (options.dryRun) {
        console.log(describeAnswers(answers).join("\n"));
        console.log(`needs: ${describeRequirements(answers, (program) => findOnPath(program) !== null)}\n`);
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
        // Only ask "Create it?" when the user made a non-default choice; otherwise they
        // pressed Enter through everything and the review already says what will happen.
        const defaultFrontend = frontendCatalog()[0]?.id;
        const defaultBackend = backendCatalog()[0];
        const defaultBackendFramework = defaultBackend?.frameworks[0]?.id;
        const hasFrontend = !!answers.frontend;
        const hasBackend = !!answers.backend;
        const frontendDefault = !hasFrontend || answers.frontend === defaultFrontend;
        const backendDefault = !hasBackend ||
            (answers.backend?.language === defaultBackend?.id &&
                answers.backend?.framework === defaultBackendFramework);
        const allDefaults = answers.runtime === "local" &&
            !answers.starter &&
            frontendDefault &&
            backendDefault &&
            answers.extras.length === 0 &&
            answers.name === "my-app";
        if (!allDefaults) {
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
    // Re-check right before writing: the folder may have changed since the first check and the confirmation.
    // A starter's generator accepts the empty folder this leaves, so starters get the same protection as apps.
    const createdFolder = claimFolder(projectDir);
    for (const [index, step] of steps.entries()) {
        process.stdout.write(`  ${step.label}... `);
        const result = runStep(binPath, step, step.inProject ? projectDir : process.cwd());
        if (!result.ok) {
            console.log(chalk.red("failed"));
            console.log(result.output.trimEnd());
            throw new FliskError(`"${renderStep(step)}" did not finish.`, recoveryMessage(projectDir, steps, index, createdFolder));
        }
        console.log(chalk.green("done"));
    }
    console.log(`\n${chalk.green("✔")} Created ${chalk.bold(answers.name)}`);
    const services = generatedServices(projectDir, answers);
    // A starter is ready-made and may need Docker, a database or other setup its own README describes. create writes it and
    // stops: it never installs, never starts Docker, Tilt or a stack, not even with --start.
    if (answers.starter) {
        console.log(`\nNext:\n${nextSteps(projectDir, answers)
            .map((line) => `  ${line}`)
            .join("\n")}\n`);
        return;
    }
    let start = Boolean(options.start);
    // The "install and start now?" ask belongs to the local app route alone (#3192): the Docker route
    // is started with flisk up app, and a starter points at its own README instead.
    if (!start && interactive && asksToStart(answers)) {
        // The project is already written: Escape or Ctrl-C here means "not now", never "nothing was written".
        try {
            start =
                (await arrowSelect({
                    message: "Start it now?",
                    choices: [
                        {
                            title: "Yes, start it",
                            value: "yes",
                            hint: "Downloads what it needs, then runs it.",
                        },
                        { title: "No, I'll do it later", value: "no", hint: "Shows the commands instead." },
                    ],
                })) === "yes";
        }
        catch (error) {
            if (!(error instanceof PromptCancelled))
                throw error;
            start = false;
        }
    }
    if (!start) {
        console.log(`\nNext:\n${nextSteps(projectDir, answers, services)
            .map((line) => `  ${line}`)
            .join("\n")}\n`);
        return;
    }
    // Check the programs before installing anything, so a missing toolchain is one clear message, not a failed install.
    const missing = startBlockers(answers);
    if (missing.length > 0) {
        throw new FliskError(`The project is created, but it cannot start yet: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not installed.`, [
            ...installHelp(missing).map((line) => line.trim()),
            `Once it is installed, run flisk up in ${JSON.stringify(projectDir)}.`,
        ]);
    }
    const defaultInstall = getBackendLanguage(DEFAULT_BACKEND_LANGUAGE).installHint;
    // Install what the generators wrote.
    if (answers.runtime === "local") {
        // npm when it is there; otherwise the package manager the default language's own install hint uses.
        const pm = findOnPath("npm") ? "npm" : (defaultInstall.split(" ")[0] ?? "npm");
        for (const service of services.filter((entry) => entry.install === "npm install")) {
            process.stdout.write(`  Installing ${service.dir}... `);
            const run = spawnSync(pm, ["install"], {
                cwd: join(projectDir, service.dir),
                stdio: "ignore",
                // On Windows npm (and bun's shims) are .cmd files, which Node can only start through a shell. The command and
                // its arguments are fixed strings, so nothing a person typed reaches the shell.
                shell: isWindows(),
            });
            if (run.error || run.status !== 0) {
                console.log(chalk.red("failed"));
                throw new FliskError(`"${pm} install" did not finish in ${service.dir}.`, [
                    "The project is created and complete; only the install needs a retry.",
                    `Run it yourself: cd ${answers.name}/${service.dir} && ${pm} install`,
                ]);
            }
            console.log(chalk.green("done"));
        }
    }
    else {
        process.stdout.write("  Installing dependencies... ");
        const installs = await installServiceDependencies(projectDir);
        const failed = installs.filter((entry) => !entry.ok);
        if (failed.length > 0) {
            console.log(chalk.red("failed"));
            throw new FliskError(`${failed.length} of ${installs.length} services could not install.`, [
                "The project is created and complete; only the install needs a retry.",
                `Run "${defaultInstall}" in ${join(projectDir, failed[0]?.dir ?? "")}, then flisk up app in ${projectDir}.`,
            ]);
        }
        console.log(chalk.green("done"));
    }
    const open = answers.runtime === "local" ? whereToOpen(services) : undefined;
    if (open)
        console.log(`\n${chalk.bold(open)}\n`);
    const upArgs = answers.runtime === "docker" ? ["up", "app"] : ["up"];
    const up = spawnSync(process.execPath, [binPath, ...upArgs], {
        cwd: projectDir,
        stdio: "inherit",
    });
    if (up.status !== 0) {
        throw new FliskError(`"flisk ${upArgs.join(" ")}" did not finish.`, [
            `The project is created. Run "flisk doctor" in ${projectDir} to see what is missing, then flisk ${upArgs.join(" ")}.`,
        ]);
    }
}
