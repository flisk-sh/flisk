// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

/**
 * The plan behind `flisk create`.
 *
 * The wizard asks a few questions; this module turns the answers into the exact `flisk` commands
 * that build the project. It does no I/O, so every path is testable, and it only emits commands the
 * CLI already has (`flisk project`, `flisk resource`), so a created project is the same one a person
 * would get by typing them.
 */

/** What the person is building. A template kind clones or writes a ready-made starter. */
export type CreateKind = "web" | "api" | "saas" | "agent" | "swarm" | "ecommerce";

export type CreateFrontend = "react" | "vue" | "svelte" | "none";
export type CreateBackend = "hono" | "express" | "fastify" | "elysia";
export type CreateExtra = "queue" | "worker" | "mcp" | "agent" | "redis";

export const CREATE_KINDS: readonly CreateKind[] = [
  "web",
  "api",
  "saas",
  "agent",
  "swarm",
  "ecommerce",
];
export const CREATE_FRONTENDS: readonly CreateFrontend[] = ["react", "vue", "svelte", "none"];
export const CREATE_BACKENDS: readonly CreateBackend[] = ["hono", "express", "fastify", "elysia"];
export const CREATE_EXTRAS: readonly CreateExtra[] = ["queue", "worker", "mcp", "agent", "redis"];

export interface CreateAnswers {
  /** The project folder, kebab-case. */
  name: string;
  kind: CreateKind;
  /** Used by `web` only. */
  frontend: CreateFrontend;
  /** Used by `web` and `api`. */
  backend: CreateBackend;
  /** Used by `web` and `api`; a template already carries its own parts. */
  extras: CreateExtra[];
}

/** The answers a person gets by pressing Enter on every question. */
export const CREATE_DEFAULTS: Omit<CreateAnswers, "name"> = {
  kind: "web",
  frontend: "react",
  backend: "hono",
  extras: [],
};

/** One `flisk` invocation: the arguments after `flisk`, and where it runs. */
export interface CreateStep {
  /** A short label for the progress line. */
  label: string;
  args: string[];
  /** Run inside the project folder (true) or in the folder the command was started in (false). */
  inProject: boolean;
}

/** The stack the generated resources are assigned to. */
export const CREATE_STACK = "app";

/** Which template key a kind clones, when it is a template kind. */
const TEMPLATE_BY_KIND: Partial<Record<CreateKind, string>> = {
  saas: "saas",
  agent: "agent-stack",
  swarm: "swarm",
  ecommerce: "ecommerce",
};

const KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Returns true when `name` is a usable project folder name. */
export function isValidProjectName(name: string): boolean {
  return KEBAB.test(name) && name.length <= 48;
}

/** True for the kinds that start from a ready-made template instead of generated resources. */
export function isTemplateKind(kind: CreateKind): boolean {
  return TEMPLATE_BY_KIND[kind] !== undefined;
}

/** Whether the frontend and backend questions apply to a kind. */
export function asksFrontend(kind: CreateKind): boolean {
  return kind === "web";
}
export function asksBackend(kind: CreateKind): boolean {
  return kind === "web" || kind === "api";
}
export function asksExtras(kind: CreateKind): boolean {
  return kind === "web" || kind === "api";
}

/**
 * The commands that build a project from the answers.
 *
 * A template kind is one `flisk project <template> --path <name>` (the template ships its own
 * services). A generated kind is `flisk project --yes` followed by one `flisk resource` per part.
 */
export function buildCreatePlan(answers: CreateAnswers): CreateStep[] {
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

  const steps: CreateStep[] = [
    { label: "Creating the project", args: ["project", "--yes"], inProject: true },
  ];

  const resource = (
    label: string,
    resourceName: string,
    type: string,
    extra: string[] = [],
  ): CreateStep => ({
    label,
    args: ["resource", resourceName, "--type", type, ...extra, "--stack", CREATE_STACK, "--yes"],
    inProject: true,
  });

  steps.push(
    resource(`Adding the ${answers.backend} API`, `${name}-api`, "backend", [
      "--framework",
      answers.backend,
    ]),
  );

  if (kind === "web" && answers.frontend !== "none") {
    steps.push(
      resource(`Adding the ${answers.frontend} website`, `${name}-web`, "frontend", [
        "--framework",
        answers.frontend,
      ]),
    );
  }

  const extras = new Set(answers.extras);
  if (extras.has("queue"))
    steps.push(resource("Adding a NATS queue", `${name}-queue`, "queue", ["--framework", "nats"]));
  if (extras.has("redis"))
    steps.push(resource("Adding Redis", `${name}-redis`, "database", ["--framework", "redis"]));
  if (extras.has("worker"))
    steps.push(resource("Adding a background worker", `${name}-worker`, "worker"));
  if (extras.has("mcp")) steps.push(resource("Adding an MCP tool server", `${name}-tools`, "mcp"));
  if (extras.has("agent")) steps.push(resource("Adding an AI agent", `${name}-agent`, "agent"));

  return steps;
}

/** The questions a kind skips, so the summary does not claim a choice the person never made. */
export function describeAnswers(answers: CreateAnswers): string[] {
  const lines = [`name: ${answers.name}`, `kind: ${answers.kind}`];
  if (asksFrontend(answers.kind)) lines.push(`frontend: ${answers.frontend}`);
  if (asksBackend(answers.kind)) lines.push(`backend: ${answers.backend}`);
  if (asksExtras(answers.kind))
    lines.push(`extras: ${answers.extras.length > 0 ? answers.extras.join(", ") : "none"}`);
  return lines;
}

/** Parses a comma-separated `--extras` value, naming the first value that is not one of the extras. */
export function parseExtras(value: string): { extras: CreateExtra[] } | { error: string } {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const extras: CreateExtra[] = [];
  for (const part of parts) {
    if (!(CREATE_EXTRAS as readonly string[]).includes(part)) {
      return { error: `Unknown extra "${part}". Use: ${CREATE_EXTRAS.join(", ")}, or "none".` };
    }
    if (!extras.includes(part as CreateExtra)) extras.push(part as CreateExtra);
  }
  return { extras };
}
