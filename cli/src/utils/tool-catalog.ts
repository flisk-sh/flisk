// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

/**
 * The tools `flisk tool add <tool>` knows, and what it does for each.
 *
 * `flisk tool add` adds no generator of its own. A tool Flisk can already generate maps to one `flisk resource` command; a tool
 * that Flisk runs anyway (Docker) is reported as built in; a tool Flisk cannot generate (a licensed product, a framework
 * with no generator yet) gets the manual steps to run it under Flisk; and a cloud provider is rejected, because Flisk runs
 * the stack on your own computer and never creates cloud resources.
 */

import {
  DATABASE_FRAMEWORK,
  DATABASE_RESOURCE_TYPE,
  INFERENCE_RESOURCE_TYPE,
} from "../types/index.js";

export type ToolGroup =
  | "frontend"
  | "backend"
  | "data"
  | "ai"
  | "devops"
  | "widgets"
  | "guidewire"
  | "cloud";

interface ToolBase {
  /** The id people type: `flisk tool add <id>`. */
  id: string;
  title: string;
  group: ToolGroup;
  /** Other spellings that resolve to this tool ("next.js", "spring boot"). */
  aliases: string[];
}

/** A tool Flisk generates: one `flisk resource` command. */
export interface ResourceTool extends ToolBase {
  status: "resource";
  /** The resource name used when `flisk tool add` is given none. */
  defaultName: string;
  /** The `flisk resource` arguments after the name. */
  args: string[];
  /** A line to print after the resource is created, for what to do next. */
  next?: string;
}

/** A tool that is already part of every Flisk stack. */
export interface BuiltInTool extends ToolBase {
  status: "built-in";
  note: string;
}

/** A tool Flisk cannot generate: the steps to run it under Flisk yourself. */
export interface ManualTool extends ToolBase {
  status: "manual";
  /** The service name the steps use for `{name}`; a tool with none (a CI workflow) takes no name. */
  defaultName?: string;
  reason: string;
  steps: string[];
}

/** A tool `flisk tool add` refuses: it is outside what Flisk does. */
export interface RejectedTool extends ToolBase {
  status: "rejected";
  reason: string;
  /** Local tools that cover the same need. */
  instead: string[];
}

export type ToolEntry = ResourceTool | BuiltInTool | ManualTool | RejectedTool;

const CLOUD_REASON =
  "Flisk runs your whole stack on your own computer and never creates cloud resources, so it does not add cloud providers.";
const CLOUD_INSTEAD = [
  "flisk tool add postgresql   (a database)",
  "flisk resource files --type storage   (S3-compatible storage, MinIO)",
  "flisk resource jobs --type queue   (a queue, NATS)",
  "flisk export render   (write render.yaml when you deploy; it never calls a cloud API)",
];

export const TOOL_CATALOG: readonly ToolEntry[] = [
  // Frontend
  {
    id: "react",
    title: "React",
    group: "frontend",
    aliases: ["reactjs"],
    status: "resource",
    defaultName: "web",
    args: ["--type", "frontend", "--framework", "react"],
  },
  {
    id: "nextjs",
    title: "Next.js",
    group: "frontend",
    aliases: ["next"],
    status: "resource",
    defaultName: "web",
    args: ["--type", "frontend", "--framework", "next"],
  },
  {
    id: "angular",
    title: "Angular",
    group: "frontend",
    aliases: ["angularjs"],
    status: "manual",
    defaultName: "web",
    reason: "Flisk has no Angular generator yet, so it runs Angular as your own container.",
    steps: [
      "npx -y @angular/cli new {name} --defaults",
      'Add {name}/Dockerfile: FROM node:22, COPY . ., RUN npm ci, CMD ["npx", "ng", "serve", "--host", "0.0.0.0", "--port", "4200"]',
      "flisk resource {name} --type bring-your-own --path {name} --port 4200 --health-path /",
      "flisk up",
    ],
  },
  {
    id: "tailwind",
    title: "Tailwind CSS",
    group: "frontend",
    aliases: ["tailwindcss"],
    status: "manual",
    defaultName: "web",
    reason:
      "Tailwind is a styling library inside a frontend, not a service, so you add it to a frontend you have.",
    steps: [
      "flisk tool add react   (or flisk tool add nextjs), if you have no frontend yet",
      "cd {name} && npm install -D tailwindcss @tailwindcss/postcss postcss",
      'Add {name}/postcss.config.mjs: export default { plugins: { "@tailwindcss/postcss": {} } };',
      'Put @import "tailwindcss"; at the top of the frontend\'s main CSS file',
      "flisk up   (Vite and Next.js read postcss.config.mjs on their own)",
    ],
  },
  // Backend
  {
    id: "nodejs",
    title: "Node.js",
    group: "backend",
    aliases: ["node"],
    status: "resource",
    defaultName: "server",
    args: ["--type", "backend", "--language", "node"],
  },
  {
    id: "fastapi",
    title: "FastAPI (Python)",
    group: "backend",
    aliases: ["python"],
    status: "resource",
    defaultName: "server",
    args: ["--type", "backend", "--language", "python"],
  },
  {
    id: "spring-boot",
    title: "Spring Boot (Java)",
    group: "backend",
    aliases: ["spring", "java"],
    status: "manual",
    defaultName: "server",
    reason: "Flisk has no Java generator yet, so it runs a Spring Boot app as your own container.",
    steps: [
      "curl https://start.spring.io/starter.zip -d dependencies=web,actuator -d name={name} -o {name}.zip && unzip {name}.zip -d {name}",
      'Add {name}/Dockerfile: FROM eclipse-temurin:21-jdk, WORKDIR /app, COPY . ., CMD ["./mvnw", "spring-boot:run", "-Dspring-boot.run.arguments=--server.port=4080"]',
      "flisk resource {name} --type bring-your-own --path {name} --port 4080 --health-path /actuator/health",
      "flisk up",
    ],
  },
  // Data
  {
    id: "postgresql",
    title: "PostgreSQL",
    group: "data",
    aliases: ["postgres", "pg"],
    status: "resource",
    defaultName: "db",
    args: ["--type", DATABASE_RESOURCE_TYPE, "--framework", DATABASE_FRAMEWORK],
  },
  {
    id: "mysql",
    title: "MySQL",
    group: "data",
    aliases: [],
    status: "resource",
    defaultName: "mysql",
    args: ["--type", DATABASE_RESOURCE_TYPE, "--framework", "mysql"],
  },
  {
    id: "mongodb",
    title: "MongoDB",
    group: "data",
    aliases: ["mongo"],
    status: "resource",
    defaultName: "mongo",
    args: ["--type", DATABASE_RESOURCE_TYPE, "--framework", "mongodb"],
  },
  // AI
  {
    id: "rag",
    title: "RAG (vector store)",
    group: "ai",
    aliases: ["vector-db", "qdrant"],
    status: "resource",
    defaultName: "vectors",
    args: ["--type", DATABASE_RESOURCE_TYPE, "--framework", "qdrant"],
    next: "Pair it with flisk tool add embeddings and flisk tool add llm-api for the full retrieve-then-answer loop.",
  },
  {
    id: "embeddings",
    title: "Embeddings (local model)",
    group: "ai",
    aliases: ["embedding"],
    status: "resource",
    defaultName: "embeddings",
    args: ["--type", INFERENCE_RESOURCE_TYPE],
    next: "Pull an embedding model into it once it runs, for example: ollama pull nomic-embed-text.",
  },
  {
    id: "llm-api",
    title: "LLM API (OpenAI-compatible, local)",
    group: "ai",
    aliases: ["llm", "llm-apis", "llms"],
    status: "resource",
    defaultName: "llm",
    args: ["--type", INFERENCE_RESOURCE_TYPE],
    next: "It serves an OpenAI-compatible API at /v1; point your app's base URL at it, no API key needed.",
  },
  // DevOps
  {
    id: "docker",
    title: "Docker",
    group: "devops",
    aliases: ["docker-compose", "compose"],
    status: "built-in",
    note: "Flisk already runs container stacks on Docker (and runs services with a command as plain processes). Check it with: flisk doctor",
  },
  {
    id: "github-actions",
    title: "GitHub Actions",
    group: "devops",
    aliases: ["gha", "actions"],
    status: "manual",
    reason:
      "A CI workflow lives in your repository, so you add the file; Flisk checks the project inside it.",
    steps: [
      "Add .github/workflows/flisk.yml with one job on ubuntu-latest:",
      "  - uses: actions/checkout@v4",
      "  - run: npx -y @flisk-sh/flisk config verify --json",
      "Commit it; every push then checks that the generated Flisk files match service.json.",
    ],
  },
  // Widgets: cards Flisk Chat draws from data (https://github.com/flisk-sh/chat/blob/main/docs/add-a-widget.md)
  {
    id: "weather",
    title: "Weather widget (a weather service)",
    group: "widgets",
    aliases: ["weather-widget", "forecast"],
    status: "manual",
    defaultName: "weather",
    reason:
      "A weather service is a small backend around a free forecast API, so Flisk adds the backend and you write the one route.",
    steps: [
      "flisk tool add nodejs {name}",
      "In {name}, add GET /weather?place=<city>: look the city up at https://geocoding-api.open-meteo.com/v1/search?count=1&name=<city>, then call https://api.open-meteo.com/v1/forecast with its latitude and longitude (current, hourly temperature_2m, daily weather_code, temperature_2m_max, temperature_2m_min and precipitation_probability_max). Open-Meteo is free and needs no key.",
      "flisk up, then: curl 'http://localhost:<port>/weather?place=London'",
      "To draw it as a card in Flisk Chat, add a widget there: https://github.com/flisk-sh/chat/blob/main/docs/add-a-widget.md",
    ],
  },
  {
    id: "chart",
    title: "Chart widget",
    group: "widgets",
    aliases: ["charts", "chart-widget", "graph"],
    status: "manual",
    reason:
      "A chart is a card the chat draws from numbers, not a service, so you give a service the data and Flisk Chat draws it.",
    steps: [
      'Have a service return JSON like { "labels": ["Mon", "Tue"], "series": [{ "name": "Web", "values": [12, 19] }] } (up to 60 points and 4 series)',
      'In Flisk Chat the model sends it as {"widget": {"kind": "chart", "type": "line", "labels": [...], "series": [...]}}',
      "Add or change widgets: https://github.com/flisk-sh/chat/blob/main/docs/add-a-widget.md",
    ],
  },
  {
    id: "services",
    title: "Services widget",
    group: "widgets",
    aliases: ["services-widget", "running-services"],
    status: "built-in",
    note: "Flisk already lists the running services: flisk status --json. Flisk Chat draws that list as a card with each service and its state.",
  },
  // Guidewire
  {
    id: "jutro",
    title: "Guidewire Jutro Digital",
    group: "guidewire",
    aliases: ["guidewire-jutro", "jutro-digital"],
    status: "manual",
    defaultName: "portal",
    reason:
      "Jutro is licensed and installs from Guidewire's private registry, so Flisk cannot download it; it runs your Jutro app as your own container.",
    steps: [
      "Create the Jutro app with your Guidewire access (it needs your registry login in .npmrc)",
      "Add {name}/Dockerfile that runs the Jutro dev server on 0.0.0.0, port 4300",
      "flisk resource {name} --type bring-your-own --path {name} --port 4300 --health-path /",
      "flisk up",
    ],
  },
  {
    id: "policycenter",
    title: "Guidewire PolicyCenter",
    group: "guidewire",
    aliases: ["guidewire-policycenter", "guidewire"],
    status: "manual",
    defaultName: "policycenter",
    reason:
      "PolicyCenter is licensed and ships only to Guidewire customers, so Flisk cannot download it; it runs the image you are licensed for.",
    steps: [
      "flisk resource {name} --type bring-your-own --image <your-registry>/policycenter:<tag> --port 4180 --health-path /pc/",
      "Set the PolicyCenter server port to 4180 in its configuration (Flisk gives bring-your-own resources ports 4000-5999)",
      "flisk up",
    ],
  },
  // Cloud: rejected
  {
    id: "aws",
    title: "Amazon Web Services",
    group: "cloud",
    aliases: ["amazon-web-services", "amazon"],
    status: "rejected",
    reason: CLOUD_REASON,
    instead: CLOUD_INSTEAD,
  },
  {
    id: "google-cloud",
    title: "Google Cloud",
    group: "cloud",
    aliases: ["gcp", "google-cloud-platform", "gcloud"],
    status: "rejected",
    reason: CLOUD_REASON,
    instead: CLOUD_INSTEAD,
  },
  {
    id: "azure",
    title: "Microsoft Azure",
    group: "cloud",
    aliases: ["microsoft-azure"],
    status: "rejected",
    reason: CLOUD_REASON,
    instead: CLOUD_INSTEAD,
  },
  {
    id: "kubernetes",
    title: "Kubernetes",
    group: "cloud",
    aliases: ["k8s", "helm"],
    status: "rejected",
    reason:
      "Flisk is a local inner loop and does not write Kubernetes manifests; keep cluster deployment in your Kubernetes workflow.",
    instead: ["flisk up   (run the stack locally)", "flisk export render   (render.yaml, opt-in)"],
  },
];

/** "Next.js", "spring boot" and "Spring_Boot" all become one key, so people can type a tool the way they say it. */
export function toolKey(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The catalog entry for what someone typed, by id or alias; undefined when Flisk does not know it. */
export function findTool(input: string): ToolEntry | undefined {
  const key = toolKey(input);
  if (!key) return undefined;
  return TOOL_CATALOG.find(
    (tool) => toolKey(tool.id) === key || tool.aliases.some((alias) => toolKey(alias) === key),
  );
}

/** The ids `flisk tool add` accepts, for errors and completion. */
export function toolIds(): string[] {
  return TOOL_CATALOG.map((tool) => tool.id);
}

/** The `flisk resource` arguments for a tool that maps to one resource. */
export function resourceArgs(
  tool: ResourceTool,
  options: { name?: string; stack?: string; dryRun?: boolean; json?: boolean },
): string[] {
  return [
    "resource",
    options.name ?? tool.defaultName,
    ...tool.args,
    ...(options.stack ? ["--stack", options.stack] : []),
    "--yes",
    ...(options.dryRun ? ["--dry-run"] : []),
    ...(options.json ? ["--json"] : []),
  ];
}

/** A manual tool's steps with `{name}` filled in: the given name, or the tool's default. */
export function manualSteps(tool: ManualTool, name?: string): string[] {
  const used = name ?? tool.defaultName ?? "";
  return tool.steps.map((step) => step.split("{name}").join(used));
}
