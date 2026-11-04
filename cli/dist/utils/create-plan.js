// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * The plan behind `flisk create`: the answers, turned into the real `flisk project` and `flisk resource` commands that build
 * the project. It does no I/O and writes no file itself, so what a project contains is always what Flisk's own generators
 * produce. Which frameworks, languages, starters and extras exist is not decided here (see create-catalog.ts).
 *
 * There are two ways to run what it builds:
 *  - **local**: plain processes on your computer (`flisk resource --local`). No Docker, no Tilt, no database.
 *  - **docker**: containers behind one gateway, for databases, queues and the rest of Flisk's infrastructure.
 */
import { DEFAULT_BACKEND_LANGUAGE } from "../backend-languages/registry.js";
import { extraCatalog, localRequirements } from "./create-catalog.js";
export const CREATE_RUNTIMES = ["local", "docker"];
/** The stack the Docker route assigns its resources to. */
export const CREATE_STACK = "app";
/** The folders a local project's website and API live in. */
export const LOCAL_FRONTEND_DIR = "web";
export const LOCAL_BACKEND_DIR = "api";
const KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
/** Returns true when `name` is a usable project folder name. */
export function isValidProjectName(name) {
    return KEBAB.test(name) && name.length <= 48;
}
/** The suffix a resource name gets from an extras id: its `type:framework` colon becomes a dash. */
const extraSuffix = (id) => id.replace(":", "-");
/**
 * The commands that build the project.
 *
 * A starter is one `flisk project <template>`. An app is `flisk project --yes` and one `flisk resource` per part: the API
 * first (a website is wired to the API already in its stack), then the website, then any extras.
 */
export function buildCreatePlan(answers) {
    const { name, starter, runtime } = answers;
    if (starter) {
        return [
            {
                label: `Writing the ${starter} starter`,
                args: ["project", starter, "--path", name, "--yes"],
                inProject: false,
            },
        ];
    }
    const local = runtime === "local";
    const steps = [
        { label: "Creating the project", args: ["project", "--yes"], inProject: true },
    ];
    const where = (dir) => (local ? ["--path", dir, "--local"] : []);
    if (answers.backend) {
        const { language, framework } = answers.backend;
        // The default language is the one a missing --language means, so its output stays the historical one.
        const flavour = language === DEFAULT_BACKEND_LANGUAGE
            ? framework
                ? ["--framework", framework]
                : []
            : ["--language", language];
        steps.push({
            label: `Adding the ${framework ?? language} API`,
            args: [
                "resource",
                `${name}-api`,
                "--type",
                "backend",
                ...flavour,
                ...where(LOCAL_BACKEND_DIR),
                "--stack",
                CREATE_STACK,
                "--yes",
            ],
            inProject: true,
        });
    }
    if (answers.frontend) {
        steps.push({
            label: `Adding the ${answers.frontend} website`,
            args: [
                "resource",
                `${name}-web`,
                "--type",
                "frontend",
                "--framework",
                answers.frontend,
                ...where(LOCAL_FRONTEND_DIR),
                "--stack",
                CREATE_STACK,
                "--yes",
            ],
            inProject: true,
        });
    }
    if (!local) {
        const known = new Map(extraCatalog().map((extra) => [extra.id, extra]));
        for (const id of answers.extras) {
            const extra = known.get(id);
            if (!extra)
                continue;
            steps.push({
                label: `Adding ${extra.title}`,
                args: [
                    "resource",
                    `${name}-${extraSuffix(id)}`,
                    "--type",
                    extra.type,
                    ...(extra.framework ? ["--framework", extra.framework] : []),
                    "--stack",
                    CREATE_STACK,
                    "--yes",
                ],
                inProject: true,
            });
        }
    }
    return steps;
}
/** True when the plan builds nothing: no starter, no website and no API. */
export function isEmptyApp(answers) {
    return !answers.starter && !answers.frontend && !answers.backend;
}
/**
 * Whether create may offer to install and start what it wrote: the local app route alone (#3192).
 * A starter is handed to its own README and the Docker route is started with `flisk up app`, so the
 * "Install dependencies and start it now?" ask must not appear for either.
 */
export function asksToStart(answers) {
    return answers.runtime === "local" && !answers.starter;
}
/** What the project needs on the machine, in a sentence. Starter requirements come from the starter itself. */
export function describeRequirements(answers, onPath = () => true) {
    if (answers.starter)
        return "see the starter's README for its prerequisites";
    if (answers.runtime === "docker")
        return "Docker and Tilt (`flisk doctor` checks what is missing)";
    const programs = localRequirements({
        frontend: answers.frontend !== undefined,
        language: answers.backend?.language,
    });
    const missing = programs.filter((program) => !onPath(program));
    const list = `${programs.join(", ")}. No Docker, no Tilt, no database`;
    return missing.length > 0 ? `${list}. Not found on this machine: ${missing.join(", ")}` : list;
}
/** The parts the plan creates, for the review. */
export function describeParts(answers, steps) {
    if (answers.starter)
        return `the ${answers.starter} starter`;
    const parts = steps
        .filter((step) => step.args[0] === "resource")
        .map((step) => String(step.args[1]));
    return parts.join(", ");
}
/** The answers, one line each, skipping what was not chosen. */
export function describeAnswers(answers) {
    const lines = [`name: ${answers.name}`];
    if (answers.starter)
        return [...lines, `starter: ${answers.starter}`];
    lines.push(`runtime: ${answers.runtime}`);
    lines.push(`website: ${answers.frontend ?? "none"}`);
    if (answers.backend) {
        const { language, framework } = answers.backend;
        lines.push(`api: ${framework ? `${language} + ${framework}` : language}`);
    }
    else {
        lines.push("api: none");
    }
    if (answers.runtime === "docker") {
        lines.push(`extras: ${answers.extras.length > 0 ? answers.extras.join(", ") : "none"}`);
    }
    return lines;
}
