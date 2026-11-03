// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
export const CREATE_KINDS = [
    "web",
    "api",
    "saas",
    "agent",
    "swarm",
    "ecommerce",
];
export const CREATE_FRONTENDS = ["react", "vue", "svelte", "none"];
export const CREATE_BACKENDS = ["hono", "express", "fastify", "elysia"];
export const CREATE_EXTRAS = ["queue", "worker", "mcp", "agent", "redis"];
/** The answers a person gets by pressing Enter on every question. */
export const CREATE_DEFAULTS = {
    kind: "web",
    frontend: "react",
    backend: "hono",
    extras: [],
};
/** The stack the generated resources are assigned to. */
export const CREATE_STACK = "app";
/** Which template key a kind clones, when it is a template kind. */
const TEMPLATE_BY_KIND = {
    saas: "saas",
    agent: "agent-stack",
    swarm: "swarm",
    ecommerce: "ecommerce",
};
const KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
/** Returns true when `name` is a usable project folder name. */
export function isValidProjectName(name) {
    return KEBAB.test(name) && name.length <= 48;
}
/** True for the kinds that start from a ready-made template instead of generated resources. */
export function isTemplateKind(kind) {
    return TEMPLATE_BY_KIND[kind] !== undefined;
}
/** Whether the frontend and backend questions apply to a kind. */
export function asksFrontend(kind) {
    return kind === "web";
}
export function asksBackend(kind) {
    return kind === "web" || kind === "api";
}
export function asksExtras(kind) {
    return kind === "web" || kind === "api";
}
/**
 * The commands that build a project from the answers.
 *
 * A template kind is one `flisk project <template> --path <name>` (the template ships its own
 * services). A generated kind is `flisk project --yes` followed by one `flisk resource` per part.
 */
export function buildCreatePlan(answers) {
    const { name, kind } = answers;
    const template = TEMPLATE_BY_KIND[kind];
    if (template) {
        return [
            {
                label: `Writing the ${template} starter`,
                args: ["project", template, "--path", name, "--yes"],
                inProject: false,
            },
        ];
    }
    const steps = [
        { label: "Creating the project", args: ["project", "--yes"], inProject: true },
    ];
    const resource = (label, resourceName, type, extra = []) => ({
        label,
        args: ["resource", resourceName, "--type", type, ...extra, "--stack", CREATE_STACK, "--yes"],
        inProject: true,
    });
    steps.push(resource(`Adding the ${answers.backend} API`, `${name}-api`, "backend", [
        "--framework",
        answers.backend,
    ]));
    if (kind === "web" && answers.frontend !== "none") {
        steps.push(resource(`Adding the ${answers.frontend} website`, `${name}-web`, "frontend", [
            "--framework",
            answers.frontend,
        ]));
    }
    const extras = new Set(answers.extras);
    if (extras.has("queue"))
        steps.push(resource("Adding a NATS queue", `${name}-queue`, "queue", ["--framework", "nats"]));
    if (extras.has("redis"))
        steps.push(resource("Adding Redis", `${name}-redis`, "database", ["--framework", "redis"]));
    if (extras.has("worker"))
        steps.push(resource("Adding a background worker", `${name}-worker`, "worker"));
    if (extras.has("mcp"))
        steps.push(resource("Adding an MCP tool server", `${name}-tools`, "mcp"));
    if (extras.has("agent"))
        steps.push(resource("Adding an AI agent", `${name}-agent`, "agent"));
    return steps;
}
/** The questions a kind skips, so the summary does not claim a choice the person never made. */
export function describeAnswers(answers) {
    const lines = [`name: ${answers.name}`, `kind: ${answers.kind}`];
    if (asksFrontend(answers.kind))
        lines.push(`frontend: ${answers.frontend}`);
    if (asksBackend(answers.kind))
        lines.push(`backend: ${answers.backend}`);
    if (asksExtras(answers.kind))
        lines.push(`extras: ${answers.extras.length > 0 ? answers.extras.join(", ") : "none"}`);
    return lines;
}
/** Parses a comma-separated `--extras` value, naming the first value that is not one of the extras. */
export function parseExtras(value) {
    const parts = value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
    const extras = [];
    for (const part of parts) {
        if (!CREATE_EXTRAS.includes(part)) {
            return { error: `Unknown extra "${part}". Use: ${CREATE_EXTRAS.join(", ")}, or "none".` };
        }
        if (!extras.includes(part))
            extras.push(part);
    }
    return { extras };
}
