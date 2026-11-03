// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

/**
 * The plan behind `flisk create`.
 *
 * The wizard asks a few questions; this module turns the answers into what gets built. It does no
 * I/O, so every path is testable.
 *
 * There are two ways to run what it builds:
 *  - **local**: plain processes on your computer. It needs only Node.js: no Docker, no Tilt, no
 *    Postgres. This is the default for a web app or an API, so a first run never waits on tooling.
 *  - **docker**: containers behind one gateway with live reload, for a database, queues, a
 *    framework choice or more parts. It uses the same `flisk project` and `flisk resource`
 *    commands a person would type.
 */

/** What the person is building. A template kind clones or writes a ready-made starter. */
export type CreateKind = "web" | "api" | "saas" | "agent" | "swarm" | "ecommerce";

export type CreateRuntime = "local" | "docker";
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
export const CREATE_RUNTIMES: readonly CreateRuntime[] = ["local", "docker"];
export const CREATE_FRONTENDS: readonly CreateFrontend[] = ["react", "vue", "svelte", "none"];
export const CREATE_BACKENDS: readonly CreateBackend[] = ["hono", "express", "fastify", "elysia"];
export const CREATE_EXTRAS: readonly CreateExtra[] = ["queue", "worker", "mcp", "agent", "redis"];

export interface CreateAnswers {
  /** The project folder, kebab-case. */
  name: string;
  kind: CreateKind;
  /** Used by `web` and `api`; the starters decide their own runtime. */
  runtime: CreateRuntime;
  /** Docker runtime and `web` only. */
  frontend: CreateFrontend;
  /** Docker runtime, `web` and `api`. */
  backend: CreateBackend;
  /** Docker runtime, `web` and `api`; a starter already carries its own parts. */
  extras: CreateExtra[];
}

/** The answers a person gets by pressing Enter on every question. */
export const CREATE_DEFAULTS: Omit<CreateAnswers, "name"> = {
  kind: "web",
  runtime: "local",
  frontend: "react",
  backend: "hono",
  extras: [],
};

/** A file the local runtime writes: a bundled template, JSON, or text. */
export interface LocalFile {
  /** Path inside the project folder. */
  path: string;
  /** A file under cli/templates; `__NAME__` in it becomes the project name. */
  template?: string;
  json?: Record<string, unknown>;
  text?: string;
}

/** One step: a `flisk` invocation (`args`) or a set of files to write (`files`). */
export interface CreateStep {
  /** A short label for the progress line. */
  label: string;
  args?: string[];
  files?: LocalFile[];
  /** Run inside the project folder (true) or in the folder the command was started in (false). */
  inProject: boolean;
}

/** The stack the Docker runtime's generated resources are assigned to. */
export const CREATE_STACK = "app";

/** Default ports of a local app; the executor swaps in free ones. */
export interface LocalPorts {
  api: number;
  web: number;
}
export const DEFAULT_LOCAL_PORTS: LocalPorts = { api: 4000, web: 3000 };

/** Which template key a kind clones or writes, when it is a template kind. */
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

/** True for the kinds that start from a ready-made template instead of generated parts. */
export function isTemplateKind(kind: CreateKind): boolean {
  return TEMPLATE_BY_KIND[kind] !== undefined;
}

/** Whether the runtime question applies: only a web app or an API can run either way. */
export function asksRuntime(kind: CreateKind): boolean {
  return kind === "web" || kind === "api";
}
/** The framework and extras questions belong to the Docker runtime only. */
export function asksFrontend(kind: CreateKind, runtime: CreateRuntime): boolean {
  return kind === "web" && runtime === "docker";
}
export function asksBackend(kind: CreateKind, runtime: CreateRuntime): boolean {
  return asksRuntime(kind) && runtime === "docker";
}
export function asksExtras(kind: CreateKind, runtime: CreateRuntime): boolean {
  return asksRuntime(kind) && runtime === "docker";
}

/** True when a project of these answers is built as plain local processes. */
export function runsLocally(answers: Pick<CreateAnswers, "kind" | "runtime">): boolean {
  if (answers.kind === "swarm") return true;
  if (isTemplateKind(answers.kind)) return false;
  return answers.runtime === "local";
}

/** The service.json of a local app: one service at the project root, started with its npm script. */
function localManifest(answers: CreateAnswers, ports: LocalPorts): Record<string, unknown> {
  const web = answers.kind === "web";
  return {
    $schema: "https://flisk.sh/schema.service.json",
    schemaVersion: 1,
    appName: answers.name,
    appType: web ? "frontend" : "backend",
    command: web ? "npm run dev" : "node server.mjs",
    port: web ? ports.web : ports.api,
    healthCheckPath: web ? "/" : "/health",
  };
}

function localReadme(answers: CreateAnswers, ports: LocalPorts): string {
  const web = answers.kind === "web";
  const url = `http://localhost:${web ? ports.web : ports.api}`;
  return `# ${answers.name}

Made with \`flisk create\`. It runs on your computer with Node.js and npm: no Docker, no Tilt, no database.

## Run it

\`\`\`bash
npm install
npm run dev     # ${web ? `opens ${url}` : `serves ${url}/api/hello`}
\`\`\`

${web ? `Edit \`src/App.tsx\` and save: the page updates on its own. \`npm run build\` makes the production files.` : "Edit `server.mjs`; `npm run dev` restarts it when you save."}

Flisk can run it too, as a local process (still no Docker): \`flisk up\`, then \`flisk down\`.

## Grow it later

A database, a queue, a worker or another framework run in containers, so they need Docker and Tilt (\`flisk doctor\` says what is missing). Start a full stack in a new folder:

\`\`\`bash
flisk create --runtime docker
\`\`\`
`;
}

/**
 * What builds a project from the answers.
 *
 * A template kind is one `flisk project <template> --path <name>`. The local runtime is one step
 * that writes files. The Docker runtime is `flisk project --yes` followed by one `flisk resource`
 * per part.
 */
export function buildCreatePlan(
  answers: CreateAnswers,
  ports: LocalPorts = DEFAULT_LOCAL_PORTS,
): CreateStep[] {
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

  if (answers.runtime === "local") {
    const web = kind === "web";
    const dir = web ? "create-local/web" : "create-local/api";
    const files: LocalFile[] = web
      ? [
          { path: "package.json", template: `${dir}/package.json` },
          { path: "vite.config.ts", template: `${dir}/vite.config.ts` },
          { path: "index.html", template: `${dir}/index.html` },
          { path: "tsconfig.json", template: `${dir}/tsconfig.json` },
          { path: "src/main.tsx", template: `${dir}/src/main.tsx` },
          { path: "src/App.tsx", template: `${dir}/src/App.tsx` },
          { path: ".gitignore", template: `${dir}/gitignore` },
        ]
      : [
          { path: "package.json", template: `${dir}/package.json` },
          { path: "server.mjs", template: `${dir}/server.mjs` },
          { path: ".gitignore", template: `${dir}/gitignore` },
        ];
    files.push(
      { path: "service.json", json: localManifest(answers, ports) },
      { path: "README.md", text: localReadme(answers, ports) },
    );
    return [
      {
        label: web ? "Writing your Vite + React app" : "Writing your API",
        files,
        inProject: true,
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

/** What the project needs on the machine, in a sentence. */
export function describeRequirements(answers: CreateAnswers): string {
  if (runsLocally(answers)) return "Node.js and npm only. No Docker, no Tilt, no database.";
  return "Docker, Tilt and Bun (`flisk doctor` checks what is missing).";
}

/** The parts the plan creates, for the review summary. */
export function describeParts(answers: CreateAnswers, steps: CreateStep[]): string {
  if (isTemplateKind(answers.kind)) return `the ${TEMPLATE_BY_KIND[answers.kind]} starter`;
  if (answers.runtime === "local")
    return answers.kind === "web" ? "a Vite + React app with a small API" : "a Node API";
  const parts = steps
    .filter((step) => step.args?.[0] === "resource")
    .map((step) => String(step.args?.[1]));
  return parts.join(", ");
}

/** The answers, one line each, skipping the questions a kind never asks. */
export function describeAnswers(answers: CreateAnswers): string[] {
  const lines = [`name: ${answers.name}`, `kind: ${answers.kind}`];
  if (asksRuntime(answers.kind)) lines.push(`runtime: ${answers.runtime}`);
  if (asksFrontend(answers.kind, answers.runtime)) lines.push(`frontend: ${answers.frontend}`);
  if (asksBackend(answers.kind, answers.runtime)) lines.push(`backend: ${answers.backend}`);
  if (asksExtras(answers.kind, answers.runtime))
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
