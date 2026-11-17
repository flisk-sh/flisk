import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  LOCKFILE_COMMAND,
  generateNpmLockfile
} from "./chunk-T3IBNCMU.js";
import {
  runJsonCommand
} from "./chunk-FU6O43SU.js";
import {
  installAgentSkills
} from "./chunk-KTRTHNLE.js";
import {
  generateMasterConfigs,
  loadTemplate,
  readProjectConfig
} from "./chunk-RYTYYP36.js";
import {
  cliInvocation
} from "./chunk-CFZG7IYF.js";
import {
  PROJECT_TEMPLATES,
  listProjectTemplates,
  resolveBundledTemplateDir,
  templateGitCommands,
  templateTargetDir
} from "./chunk-4CRSIAQJ.js";
import {
  ensureDirectory,
  ensureGitignore,
  writeJsonFile
} from "./chunk-BH5IJ6AV.js";
import {
  clearDiscoveryCache
} from "./chunk-4EDXFYDP.js";
import {
  addYesOption
} from "./chunk-MJGDAK6E.js";
import {
  createMachineEnvelope
} from "./chunk-3SNMUNQF.js";
import {
  promptConfirm,
  promptMultiSelect,
  promptText
} from "./chunk-3EZ4UDYT.js";
import {
  completeEnvFile,
  discoverStackNames,
  ensureEnvFile,
  validateEnvFile
} from "./chunk-2BH5UW2N.js";
import {
  isTargetDirSafe
} from "./chunk-UPCGXTMS.js";
import {
  showCancelled,
  showCommandHeader,
  showDetail,
  showStep,
  showSuccess
} from "./chunk-ARPSTQFE.js";
import {
  DATABASE_MANAGEMENT_FEATURE,
  FliskError,
  MASTER_CONFIG_FILES,
  PROJECT_JSON,
  errorFactories,
  findProjectRoot,
  runCommand,
  showErrorAndExit,
  source_default,
  suggestClosest
} from "./chunk-73W4Y4TI.js";

// dist/commands/project.js
import { execFileSync } from "node:child_process";
import { cpSync, existsSync as existsSync2, readdirSync, readFileSync as readFileSync2, writeFileSync as writeFileSync7 } from "node:fs";
import { basename as basename2, dirname as dirname7, isAbsolute, join as join7, resolve, win32 } from "node:path";
import { cwd, execPath } from "node:process";
import { fileURLToPath } from "node:url";
import { Command } from "commander";

// dist/utils/langgraph-template.js
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
var LANGGRAPH_PORTS = { agent: 4400, tools: 4401 };
var TEMPLATE_FILES = {
  "agent/package.json": "langgraph/agent/package.json",
  "agent/server.mjs": "langgraph/agent/server.mjs",
  "agent/graph.mjs": "langgraph/agent/graph.mjs",
  "agent/file-saver.mjs": "langgraph/agent/file-saver.mjs",
  "agent/plan.mjs": "super-agent/planner/plan.mjs",
  "tools/server.mjs": "super-agent/tools/server.mjs"
};
function langgraphManifests() {
  return {
    "setup/service.json": {
      schemaVersion: 1,
      appName: "setup",
      appType: "bring-your-own",
      // A one-shot job: Flisk runs it once, and the agent starts only after it exits 0.
      command: "cd ../agent && npm install --no-audit --no-fund",
      restart: "no"
    },
    "tools/service.json": {
      schemaVersion: 1,
      appName: "tools",
      appType: "mcp",
      command: "node server.mjs",
      port: LANGGRAPH_PORTS.tools,
      healthCheckPath: "/health"
    },
    "agent/service.json": {
      schemaVersion: 1,
      appName: "agent",
      appType: "backend",
      command: "node server.mjs",
      port: LANGGRAPH_PORTS.agent,
      healthCheckPath: "/health",
      env: { TOOLS_URL: `http://localhost:${LANGGRAPH_PORTS.tools}` },
      dependsOn: ["setup", "tools"]
    }
  };
}
var README = `# Flisk LangGraph agent

An agent built with [LangGraph](https://langchain-ai.github.io/langgraphjs/): a \`StateGraph\` that plans a goal, researches
each topic with the \`lookup\` tool on an MCP tool server, writes the answer and checks it, and goes back to research when the
checker finds a topic with no note. Everything runs as local processes: no Docker. \`flisk up\` first runs \`setup\`, which
installs the agent's packages (\`agent/package.json\`, pinned versions).

\`\`\`bash
flisk up
curl -X POST localhost:${LANGGRAPH_PORTS.agent}/runs -H 'content-type: application/json' \\
  -d '{"goal":"Explain flisk and mcp and retries"}'
curl localhost:${LANGGRAPH_PORTS.agent}/runs
flisk mcp check tools --call --no-icon   # the tool server speaks MCP
\`\`\`

**Durable runs.** Every node's result is a LangGraph checkpoint, written to \`agent/.data/checkpoints.json\`. Kill the agent in
the middle of a run and Flisk starts it again; it resumes the run at the node it was in, and finished nodes do not run again.
Try it with \`STEP_DELAY_MS=2000 flisk up\`, then \`kill -9\` the agent mid-run. For production, swap \`FileSaver\` for
\`@langchain/langgraph-checkpoint-postgres\`.

**Retries.** A node that throws (the tool server is restarting, say) is retried by LangGraph's \`retryPolicy\`: up to
\`MAX_ATTEMPTS\` (5) times, starting \`RETRY_BACKOFF_MS\` (1 s) apart and doubling.

**Planning with Claude.** Out of the box the plan node splits the goal with rules, so it works offline and costs nothing:
that part is a demo. Set \`ANTHROPIC_API_KEY\` and it asks \`claude-opus-5-5\` for the topics instead (\`agent/plan.mjs\`), and
falls back to the rules if the call fails. \`GET /runs\` shows which planner ran.
`;
function writeLanggraphProject(dir, readTemplate = loadTemplate) {
  const files = {
    "README.md": README,
    ".gitignore": ".data/\nnode_modules/\n"
  };
  for (const [target, source] of Object.entries(TEMPLATE_FILES))
    files[target] = readTemplate(source);
  for (const [name, manifest] of Object.entries(langgraphManifests())) {
    files[name] = `${JSON.stringify(manifest, null, 2)}
`;
  }
  for (const [name, contents] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
}

// dist/utils/next-postgres-template.js
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync as mkdirSync2, readFileSync, rmSync, writeFileSync as writeFileSync2 } from "node:fs";
import { basename, dirname as dirname2, join as join2 } from "node:path";
var NEXT_POSTGRES_STACK = "app";
var NEXT_POSTGRES_STEPS = [
  ["project", "--yes"],
  [
    "resource",
    "db",
    "--type",
    "database",
    "--framework",
    "postgres",
    "--stack",
    NEXT_POSTGRES_STACK,
    "--yes"
  ],
  [
    "resource",
    "api",
    "--type",
    "backend",
    "--framework",
    "express",
    "--feature",
    "prisma",
    "--stack",
    NEXT_POSTGRES_STACK,
    "--yes"
  ],
  [
    "resource",
    "web",
    "--type",
    "frontend",
    "--framework",
    "next",
    "--stack",
    NEXT_POSTGRES_STACK,
    "--yes"
  ]
];
var APP = `services/${NEXT_POSTGRES_STACK}`;
var TEMPLATE_FILES2 = {
  [`${APP}/api/src/index.ts`]: "next-postgres/api/index.ts",
  [`${APP}/api/prisma/schema.prisma`]: "next-postgres/schema.prisma",
  [`${APP}/api-migrator/prisma/schema.prisma`]: "next-postgres/schema.prisma",
  [`${APP}/api-migrator/prisma/migrations/migration_lock.toml`]: "next-postgres/migrator/migration_lock.toml",
  [`${APP}/api-migrator/prisma/migrations/20261111000000_create_items/migration.sql`]: "next-postgres/migrator/create_items.sql",
  [`${APP}/api-migrator/prisma/migrations/20261111000100_seed_items/migration.sql`]: "next-postgres/migrator/seed_items.sql",
  [`${APP}/web/src/app/layout.tsx`]: "next-postgres/web/layout.tsx",
  [`${APP}/web/src/app/page.tsx`]: "next-postgres/web/page.tsx",
  [`${APP}/web/src/app/items.tsx`]: "next-postgres/web/items.tsx",
  [`${APP}/web/src/app/globals.css`]: "next-postgres/web/globals.css"
};
var REMOVED_FILES = [`${APP}/web/src/app/health-card.tsx`];
var README2 = (name) => `# ${name}

A Next.js website, an Express API and a Postgres database, started with one command. Docker is needed (for Postgres).

\`\`\`bash
flisk up
\`\`\`

\`flisk up\` starts Postgres, runs the migrator once (it creates the \`items\` table and adds three rows), then starts the API and the
website. Open the \`web\` URL it prints and add, tick and delete items; every change is saved in Postgres.

| Resource | What it is |
| --- | --- |
| \`db\` | The shared Flisk Postgres |
| \`api-migrator\` | Runs \`prisma migrate deploy\` once, from \`${APP}/api-migrator/prisma/migrations\` |
| \`api\` | Express: \`GET/POST /items\`, \`PATCH/DELETE /items/:id\`, \`GET /health/ready\` |
| \`web\` | Next.js page that calls the API |

Change the table: add a folder with a \`migration.sql\` under \`api-migrator/prisma/migrations\`, then \`flisk restart api-migrator\`.
`;
function runNextPostgresSteps(dir, invocation = cliInvocation()) {
  const [command, ...prefix] = invocation;
  for (const step of NEXT_POSTGRES_STEPS) {
    const result = spawnSync(command, [...prefix, ...step], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    if (result.status !== 0) {
      throw new Error(`flisk ${step.join(" ")} failed: ${`${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split("\n").slice(-3).join(" ")}`);
    }
  }
}
function writeNextPostgresFiles(dir, readTemplate = loadTemplate) {
  const name = basename(dir);
  const files = { "README.md": README2(name) };
  for (const [target, source] of Object.entries(TEMPLATE_FILES2)) {
    files[target] = readTemplate(source).replaceAll("__APP_NAME__", name);
  }
  for (const [path, contents] of Object.entries(files)) {
    const full = join2(dir, path);
    mkdirSync2(dirname2(full), { recursive: true });
    writeFileSync2(full, contents);
  }
  for (const path of REMOVED_FILES)
    rmSync(join2(dir, path), { force: true });
  addApiDependencies(dir);
}
function addApiDependencies(dir) {
  const file = join2(dir, APP, "api", "package.json");
  if (!existsSync(file))
    return;
  const pkg = JSON.parse(readFileSync(file, "utf-8"));
  pkg.dependencies = { ...pkg.dependencies, "express-rate-limit": "^8.0.0" };
  writeFileSync2(file, `${JSON.stringify(pkg, null, 2)}
`);
}
function writeNextPostgresProject(dir) {
  mkdirSync2(dir, { recursive: true });
  runNextPostgresSteps(dir);
  writeNextPostgresFiles(dir);
  return generateNpmLockfile(join2(dir, APP, "web"));
}

// dist/utils/project-features.js
var PROJECT_FEATURES = {
  // ============================================================================
  // CORE INFRASTRUCTURE (always enabled in pre_alpha)
  // ============================================================================
  proxy: {
    name: "proxy",
    description: "Traefik reverse proxy and API gateway for routing all services",
    category: "core",
    phase: "pre_alpha",
    enabled_by_default: true,
    dependsOn: []
  },
  // Key/name must be the literal Tilt resource name (PlatformDockerConstants.VERDACCIO_RESOURCE_NAME
  // in flisk-cli-extensions), since project.json's services list is copied verbatim into
  // PRE_ALPHA_RESOURCES and matched against that name by should_enable(). "registry" would
  // silently fail to enable Verdaccio.
  verdaccio: {
    name: "verdaccio",
    description: "Verdaccio npm registry for package management and local publishing (Premium - requires FLISK_LICENSE_KEY)",
    category: "premium",
    phase: "pre_alpha",
    enabled_by_default: false,
    dependsOn: []
  },
  [DATABASE_MANAGEMENT_FEATURE]: {
    name: DATABASE_MANAGEMENT_FEATURE,
    description: "PostgreSQL database for data persistence and SQL operations",
    category: "core",
    phase: "pre_alpha",
    enabled_by_default: true,
    dependsOn: []
  },
  // ============================================================================
  // OPTIONAL INFRASTRUCTURE (disabled by default, enable in optional_infra)
  // ============================================================================
  monitoring: {
    name: "monitoring",
    description: "SigNoz or SkyWalking observability platform for monitoring and tracing",
    category: "optional",
    phase: "pre_alpha",
    enabled_by_default: false,
    dependsOn: [DATABASE_MANAGEMENT_FEATURE]
  },
  elk: {
    name: "elk",
    description: "Elasticsearch, Logstash, Kibana stack for log aggregation and analysis",
    category: "optional",
    phase: "pre_alpha",
    enabled_by_default: false,
    dependsOn: []
  },
  debezium: {
    name: "debezium",
    description: "Change Data Capture for real-time data streaming from databases",
    category: "optional",
    phase: "pre_alpha",
    enabled_by_default: false,
    dependsOn: [DATABASE_MANAGEMENT_FEATURE]
  },
  "golden-image": {
    name: "golden-image",
    description: "Pre-built Docker image layer for faster builds and smaller deployments",
    category: "optional",
    phase: "pre_alpha",
    enabled_by_default: true,
    dependsOn: []
  }
};

// dist/utils/security-template.js
import { mkdirSync as mkdirSync3, writeFileSync as writeFileSync3 } from "node:fs";
import { dirname as dirname3, join as join3 } from "node:path";
var SECURITY_PORTS = { scanner: 4200, triage: 4201, reporter: 4202 };
var AGENTS = ["scanner", "triage", "reporter"];
function securityManifests() {
  const env = {
    scanner: { TRIAGE_URL: `http://localhost:${SECURITY_PORTS.triage}` },
    triage: { REPORTER_URL: `http://localhost:${SECURITY_PORTS.reporter}` },
    reporter: {}
  };
  const dependsOn = {
    scanner: ["triage"],
    triage: ["reporter"],
    reporter: []
  };
  const manifests = {};
  for (const name of AGENTS) {
    manifests[`${name}/service.json`] = {
      schemaVersion: 1,
      appName: name,
      appType: "backend",
      command: "node server.mjs",
      port: SECURITY_PORTS[name],
      healthCheckPath: "/health",
      env: env[name],
      dependsOn: dependsOn[name]
    };
  }
  return manifests;
}
var README3 = `# Flisk security agents

Three agents in a line: the scanner finds risky patterns, triage rates them, the reporter keeps the report.
Everything runs as local processes: no Docker.

\`\`\`bash
flisk up
curl -X POST localhost:${SECURITY_PORTS.scanner}/scan -H 'content-type: application/json' \\
  -d '{"files":{"app.js":"const apiKey = \\"abcdef123456\\";\\neval(input)"}}'
curl localhost:${SECURITY_PORTS.reporter}/report
\`\`\`

Add rules in \`scanner/server.mjs\` and advice in \`triage/server.mjs\`, or call a model from either.
`;
function writeSecurityProject(dir, readTemplate = loadTemplate) {
  const files = { "README.md": README3 };
  for (const name of AGENTS)
    files[`${name}/server.mjs`] = readTemplate(`security/${name}/server.mjs`);
  for (const [name, manifest] of Object.entries(securityManifests())) {
    files[name] = `${JSON.stringify(manifest, null, 2)}
`;
  }
  for (const [name, contents] of Object.entries(files)) {
    const path = join3(dir, name);
    mkdirSync3(dirname3(path), { recursive: true });
    writeFileSync3(path, contents);
  }
}

// dist/utils/super-agent-template.js
import { mkdirSync as mkdirSync4, writeFileSync as writeFileSync4 } from "node:fs";
import { dirname as dirname4, join as join4 } from "node:path";
var SUPER_AGENT_PORTS = {
  planner: 4300,
  tools: 4301,
  researcher: 4302,
  writer: 4303,
  checker: 4304
};
var TEMPLATE_FILES3 = [
  "lib/agent.mjs",
  "planner/server.mjs",
  "planner/plan.mjs",
  "planner/package.json",
  "tools/server.mjs",
  "researcher/server.mjs",
  "writer/server.mjs",
  "checker/server.mjs"
];
var SUB_AGENTS = ["researcher", "writer", "checker"];
function superAgentManifests() {
  const plannerUrl = `http://localhost:${SUPER_AGENT_PORTS.planner}`;
  const toolsUrl = `http://localhost:${SUPER_AGENT_PORTS.tools}`;
  const manifests = {
    "planner/service.json": {
      schemaVersion: 1,
      appName: "planner",
      appType: "backend",
      command: "node server.mjs",
      port: SUPER_AGENT_PORTS.planner,
      healthCheckPath: "/health"
    },
    "tools/service.json": {
      schemaVersion: 1,
      appName: "tools",
      appType: "mcp",
      command: "node server.mjs",
      port: SUPER_AGENT_PORTS.tools,
      healthCheckPath: "/health"
    }
  };
  for (const name of SUB_AGENTS) {
    manifests[`${name}/service.json`] = {
      schemaVersion: 1,
      appName: name,
      appType: "worker",
      command: "node server.mjs",
      port: SUPER_AGENT_PORTS[name],
      healthCheckPath: "/health",
      env: { AGENT_NAME: name, PLANNER_URL: plannerUrl, TOOLS_URL: toolsUrl },
      dependsOn: ["planner", "tools"]
    };
  }
  return manifests;
}
var README4 = `# Flisk super agent

A planner turns a goal into steps: research each topic, write the answer, check it. Three sub-agents pull the steps:
the researcher calls the \`lookup\` tool on an MCP tool server, the writer composes the answer, and the checker sends back
research that came back empty. Everything runs as local processes: no Docker.

\`\`\`bash
flisk up
curl -X POST localhost:${SUPER_AGENT_PORTS.planner}/goals -H 'content-type: application/json' \\
  -d '{"goal":"Explain flisk and mcp and retries"}'
curl localhost:${SUPER_AGENT_PORTS.planner}/goals
flisk mcp check tools --call --no-icon   # the tool server speaks MCP
\`\`\`

**Planning with Claude.** Out of the box the planner splits the goal with rules, so it works offline and costs nothing:
that part is a demo. To have Claude plan, run \`npm install\` in \`planner/\` and set \`ANTHROPIC_API_KEY\`; the planner then
asks \`claude-opus-5-5\` for the topics, and falls back to the rules if the call fails. \`GET /goals\` shows which planner ran.

**Recovery.** A sub-agent that dies or hangs loses its claim after \`CLAIM_MS\` (15 s) and the step is retried; a step that
fails \`MAX_ATTEMPTS\` (3) times fails its goal. The checker may send work back \`MAX_REVISIONS\` (2) times. The planner saves
its goals to \`planner/.data/\`, so a crash and restart loses nothing. Try \`BAD_RATE=0.5\` in the researcher's \`env\`.

Add tools in \`tools/server.mjs\`, and replace the work functions in \`researcher/\`, \`writer/\` and \`checker/\` with model calls.
`;
function writeSuperAgentProject(dir, readTemplate = loadTemplate) {
  const files = {
    "README.md": README4,
    ".gitignore": ".data/\nnode_modules/\n"
  };
  for (const name of TEMPLATE_FILES3)
    files[name] = readTemplate(`super-agent/${name}`);
  for (const [name, manifest] of Object.entries(superAgentManifests())) {
    files[name] = `${JSON.stringify(manifest, null, 2)}
`;
  }
  for (const [name, contents] of Object.entries(files)) {
    const path = join4(dir, name);
    mkdirSync4(dirname4(path), { recursive: true });
    writeFileSync4(path, contents);
  }
}

// dist/utils/swarm-template.js
import { mkdirSync as mkdirSync5, writeFileSync as writeFileSync5 } from "node:fs";
import { dirname as dirname5, join as join5 } from "node:path";
var SWARM_COORDINATOR_PORT = 4100;
var SWARM_WORKERS = 3;
var TEMPLATE_FILES4 = ["coordinator/server.mjs", "worker/server.mjs"];
function swarmManifests() {
  const coordinatorUrl = `http://localhost:${SWARM_COORDINATOR_PORT}`;
  const manifests = {
    "coordinator/service.json": {
      schemaVersion: 1,
      appName: "coordinator",
      appType: "backend",
      command: "node server.mjs",
      port: SWARM_COORDINATOR_PORT,
      healthCheckPath: "/health"
    }
  };
  for (let n = 1; n <= SWARM_WORKERS; n++) {
    manifests[`worker-${n}/service.json`] = {
      schemaVersion: 1,
      appName: `worker-${n}`,
      appType: "worker",
      command: "node ../worker/server.mjs",
      port: SWARM_COORDINATOR_PORT + n,
      healthCheckPath: "/health",
      env: { WORKER_NAME: `worker-${n}`, COORDINATOR_URL: coordinatorUrl },
      dependsOn: ["coordinator"]
    };
  }
  return manifests;
}
var README5 = `# Flisk swarm

A coordinator splits a goal into subtasks. Three workers pull subtasks, do them and post the answers.
Everything runs as local processes: no Docker.

\`\`\`bash
flisk up
curl -X POST localhost:${SWARM_COORDINATOR_PORT}/goals -H 'content-type: application/json' \\
  -d '{"goal":"Read the docs. Summarize them and list the risks"}'
open http://localhost:${SWARM_COORDINATOR_PORT}
\`\`\`

A worker that dies or hangs loses its claim after \`CLAIM_MS\` (15 s) and the subtask goes back in the queue.
A failed subtask is retried up to \`MAX_ATTEMPTS\` (3) times, then it and its goal are marked \`failed\`.
The coordinator saves its goals to \`coordinator/.data/swarm-state.json\`, so a crash and restart loses nothing.
Try it: set \`FAIL_RATE=0.5\` in a worker's \`env\`, or stop a worker mid-task.

Edit \`work()\` in \`worker/server.mjs\` to call your model or tool. Add workers by copying a \`worker-N\` folder.
`;
function writeSwarmProject(dir, readTemplate = loadTemplate) {
  const files = { "README.md": README5, ".gitignore": ".data/\n" };
  for (const name of TEMPLATE_FILES4)
    files[name] = readTemplate(`swarm/${name}`);
  for (const [name, manifest] of Object.entries(swarmManifests())) {
    files[name] = `${JSON.stringify(manifest, null, 2)}
`;
  }
  for (const [name, contents] of Object.entries(files)) {
    const path = join5(dir, name);
    mkdirSync5(dirname5(path), { recursive: true });
    writeFileSync5(path, contents);
  }
}

// dist/utils/tool-loop-template.js
import { mkdirSync as mkdirSync6, writeFileSync as writeFileSync6 } from "node:fs";
import { dirname as dirname6, join as join6 } from "node:path";
var TOOL_LOOP_PORTS = { agent: 4500, tools: 4501, model: 4502 };
var TEMPLATE_FILES5 = {
  "agent/package.json": "tool-loop/agent/package.json",
  "agent/server.mjs": "tool-loop/agent/server.mjs",
  "agent/guard.mjs": "tool-loop/agent/guard.mjs",
  "model/server.mjs": "tool-loop/model/server.mjs",
  "tools/server.mjs": "super-agent/tools/server.mjs"
};
function toolLoopManifests() {
  return {
    "setup/service.json": {
      schemaVersion: 1,
      appName: "setup",
      appType: "bring-your-own",
      // A one-shot job: Flisk runs it once, and the agent starts only after it exits 0.
      command: "cd ../agent && npm install --no-audit --no-fund",
      restart: "no"
    },
    "tools/service.json": {
      schemaVersion: 1,
      appName: "tools",
      appType: "mcp",
      command: "node server.mjs",
      port: TOOL_LOOP_PORTS.tools,
      healthCheckPath: "/health"
    },
    "model/service.json": {
      schemaVersion: 1,
      appName: "model",
      appType: "backend",
      command: "node server.mjs",
      port: TOOL_LOOP_PORTS.model,
      healthCheckPath: "/health"
    },
    "agent/service.json": {
      schemaVersion: 1,
      appName: "agent",
      appType: "backend",
      command: "node server.mjs",
      port: TOOL_LOOP_PORTS.agent,
      healthCheckPath: "/health",
      env: {
        TOOLS_URL: `http://localhost:${TOOL_LOOP_PORTS.tools}`,
        // The local mock model. Delete these two lines and set a real ANTHROPIC_API_KEY in .env to use Claude.
        ANTHROPIC_BASE_URL: `http://localhost:${TOOL_LOOP_PORTS.model}`,
        ANTHROPIC_API_KEY: "mock-model-no-key-needed"
      },
      dependsOn: ["setup", "tools", "model"]
    }
  };
}
var README6 = `# Flisk tool loop

The agent loop every framework wraps, with nothing hidden: the Anthropic SDK's tool runner asks the model, runs the tools it
calls, feeds the results back, and stops when the model answers. The tools come from an MCP tool server (\`tools/\`), found
through \`tools/list\`. Everything runs as local processes: no Docker. \`flisk up\` first runs \`setup\`, which installs the
SDK (\`agent/package.json\`, pinned).

\`\`\`bash
flisk up
curl -X POST localhost:${TOOL_LOOP_PORTS.agent}/ask -H 'content-type: application/json' -d '{"question":"what is mcp and flisk"}'
flisk mcp check tools --call --no-icon   # the tool server speaks MCP
\`\`\`

**The model is a mock out of the box.** \`model/\` stands in for the Messages API with one fixed strategy (look up each topic,
then answer from the results), so the real SDK loop runs offline and costs nothing. It is not a model. To use Claude, delete
\`ANTHROPIC_BASE_URL\` and \`ANTHROPIC_API_KEY\` from \`agent/service.json\`, put your key in \`.env\` as \`ANTHROPIC_API_KEY\`,
and run \`flisk up\` again; the agent asks \`claude-opus-5-5\`, with server-side refusal fallbacks.

**Recovery.** The SDK retries a request whose connection failed (\`maxRetries: 4\`), and the agent retries a tool server call
with backoff, so a model or tool server that Flisk is restarting is waited for.
`;
function writeToolLoopProject(dir, readTemplate = loadTemplate) {
  const files = { "README.md": README6, ".gitignore": "node_modules/\n" };
  for (const [target, source] of Object.entries(TEMPLATE_FILES5))
    files[target] = readTemplate(source);
  for (const [name, manifest] of Object.entries(toolLoopManifests())) {
    files[name] = `${JSON.stringify(manifest, null, 2)}
`;
  }
  for (const [name, contents] of Object.entries(files)) {
    const path = join6(dir, name);
    mkdirSync6(dirname6(path), { recursive: true });
    writeFileSync6(path, contents);
  }
}

// dist/commands/project.js
var __fliskModuleUrl = new URL("../dist/commands/project.js", import.meta.url).href;
function discoverExistingServiceStacks(projectRoot, resources) {
  try {
    return discoverStackNames(projectRoot, resources);
  } catch {
    return [];
  }
}
function getAssignedStackServices(projectConfig) {
  return /* @__PURE__ */ new Set([
    ...projectConfig.phases.pre_alpha.enabledStacks,
    ...projectConfig.phases.alpha.enabledStacks,
    ...projectConfig.phases.beta.enabledStacks,
    ...projectConfig.phases.out_of_scope.enabledStacks
  ]);
}
function syncDiscoveredStacksToPreAlpha(projectConfig, discoveredStacks) {
  const assignedServices = getAssignedStackServices(projectConfig);
  const missingStacks = discoveredStacks.filter((stack) => !assignedServices.has(stack));
  if (missingStacks.length === 0) {
    projectConfig.phases.pre_alpha.enabledStacks = Array.from(new Set(projectConfig.phases.pre_alpha.enabledStacks));
    return [];
  }
  projectConfig.phases.pre_alpha.enabledStacks = Array.from(/* @__PURE__ */ new Set([...projectConfig.phases.pre_alpha.enabledStacks, ...missingStacks]));
  return missingStacks;
}
function enableDiscoveredStacks(projectRoot, resources) {
  const projectJsonPath = join7(projectRoot, ".flisk", PROJECT_JSON);
  if (!existsSync2(projectJsonPath))
    return [];
  const projectConfig = readProjectConfig(projectRoot);
  const enabled = syncDiscoveredStacksToPreAlpha(projectConfig, discoverExistingServiceStacks(projectRoot, resources));
  if (enabled.length > 0) {
    writeJsonFile(projectJsonPath, projectConfig);
  }
  return enabled;
}
function getDefaultCoreServices() {
  return Object.values(PROJECT_FEATURES).filter((f) => f.enabled_by_default && f.category === "core").map((f) => f.name);
}
function lastLine(text) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.pop() ?? "unknown error";
}
var ACTION_WORD_HINTS = {
  validate: "flisk project --check",
  check: "flisk project --check",
  verify: "flisk project --check"
};
function actionWordHint(word) {
  const key = word.toLowerCase();
  return Object.hasOwn(ACTION_WORD_HINTS, key) ? ACTION_WORD_HINTS[key] : void 0;
}
function exitUnknownTemplate(templateName) {
  const actionHint = actionWordHint(templateName);
  if (actionHint) {
    console.log(source_default.yellow(`
Did you mean "${actionHint}"?`));
  } else {
    const closest = suggestClosest(templateName, Object.keys(PROJECT_TEMPLATES));
    if (closest) {
      console.log(source_default.yellow(`
Did you mean "${closest}"?`));
    }
  }
  console.log(source_default.red(`
\u274C Unknown template: "${templateName}"`));
  console.log(source_default.yellow("\nAvailable templates:"));
  for (const [name, info] of Object.entries(PROJECT_TEMPLATES)) {
    console.log(`  ${source_default.cyan(name)} ${source_default.gray(`- ${info.description}`)}`);
  }
  console.log(source_default.gray("\nOr run `flisk project` with no template for a blank project."));
  process.exit(1);
}
var SAFE_WIN32_CD_RE = /^[A-Za-z0-9_.:\\/][A-Za-z0-9_.:\\/-]*$/;
var SAFE_POSIX_CD_RE = /^[A-Za-z0-9_./][A-Za-z0-9_./-]*$/;
function escapeCmdTarget(raw, delayedExpansion) {
  if (SAFE_WIN32_CD_RE.test(raw))
    return raw;
  const useDelayedBangEscaping = delayedExpansion && raw.includes("!");
  const specialRe = useDelayedBangEscaping ? /([%!^])/ : /([%])/;
  if (!specialRe.test(raw))
    return `"${raw.replace(/"/g, '""')}"`;
  return raw.split(specialRe).filter((part) => part.length > 0).map((part) => {
    if (part === "%")
      return "^%";
    if (useDelayedBangEscaping && part === "!")
      return "^^^!";
    if (useDelayedBangEscaping && part === "^")
      return "^^^^";
    return /^[A-Za-z0-9_.:\\/-]+$/.test(part) ? part : `"${part.replace(/"/g, '""')}"`;
  }).join("");
}
function escapePowerShellCdCommand(raw) {
  if (SAFE_WIN32_CD_RE.test(raw))
    return `cd ${raw}`;
  return `Set-Location -LiteralPath '${raw.replace(/'/g, "''")}'`;
}
function resolveWindowsShell(env, shell) {
  const explicit = shell !== "auto" ? shell : env.FLISK_SHELL === "cmd" || env.FLISK_SHELL === "cmd-delayed" || env.FLISK_SHELL === "powershell" || env.FLISK_SHELL === "posix" ? env.FLISK_SHELL : "auto";
  if (explicit !== "auto")
    return explicit;
  const hasPrompt = Boolean(env.PROMPT);
  const hasPwsh = Boolean(env.POWERSHELL_DISTRIBUTION_CHANNEL);
  const hasMsystem = Boolean(env.MSYSTEM);
  if (hasPwsh && !hasPrompt && !hasMsystem)
    return "powershell";
  if (hasMsystem && !hasPrompt && !hasPwsh)
    return "posix";
  return "ambiguous";
}
function formatProjectPaths(dirName, platform = process.platform, env = process.env, shell = "auto", workingDir = cwd()) {
  const trailingSep = platform === "win32" ? /[\\/]+$/ : /\/+$/;
  const displayDir = platform === "win32" && /^[A-Za-z]:[\\/]+$/.test(dirName) ? `${dirName[0]}:\\` : dirName.length > 1 ? dirName.replace(trailingSep, "") || dirName : dirName;
  const endsWithSep = displayDir.endsWith("/") || platform === "win32" && displayDir.endsWith("\\");
  const displayDirWithSlash = endsWithSep ? displayDir : `${displayDir}/`;
  const rawCdTarget = displayDir.startsWith("-") ? `${platform === "win32" ? ".\\" : "./"}${displayDir}` : displayDir;
  const isUncTarget = platform === "win32" && /^(\\\\|\/\/)/.test(rawCdTarget);
  const hasWinDrive = platform === "win32" && /^[A-Za-z]:/.test(rawCdTarget);
  const isSlashRooted = platform === "win32" && rawCdTarget.startsWith("/") && !isUncTarget;
  const isBackslashRooted = platform === "win32" && rawCdTarget.startsWith("\\") && !isUncTarget;
  const hasWinWorkingDirRoot = platform === "win32" && (/^[A-Za-z]:/.test(workingDir) || /^(\\\\|\/\/)/.test(workingDir));
  const resolvedWinRooted = (isSlashRooted || isBackslashRooted) && hasWinWorkingDirRoot ? win32.resolve(workingDir.replace(/\//g, "\\"), rawCdTarget) : null;
  const bashRawTarget = resolvedWinRooted ? resolvedWinRooted.replace(/\\/g, "/") : rawCdTarget;
  const isSafeBashTarget = resolvedWinRooted ? /^(?:[A-Za-z]:)?[A-Za-z0-9_./][A-Za-z0-9_./-]*$/.test(bashRawTarget) : SAFE_POSIX_CD_RE.test(bashRawTarget);
  const posixCdTarget = isSafeBashTarget ? bashRawTarget : `'${bashRawTarget.replace(/'/g, "'\\''")}'`;
  const posixCdCmd = `cd ${posixCdTarget}`;
  const detectedWinShell = platform === "win32" ? resolveWindowsShell(env, shell) : "posix";
  if (platform === "win32" && detectedWinShell !== "posix") {
    const isRelativeWinTarget = !hasWinDrive && !isUncTarget && !isSlashRooted && !isBackslashRooted;
    let cmdRawTarget = rawCdTarget;
    if (isUncTarget) {
      cmdRawTarget = rawCdTarget.replace(/\//g, "\\");
    } else if (resolvedWinRooted) {
      cmdRawTarget = resolvedWinRooted;
    } else if (isSlashRooted) {
      cmdRawTarget = rawCdTarget.replace(/\//g, "\\");
    }
    const isCmdUnc = /^\\\\/.test(cmdRawTarget);
    const hasCmdDrive = /^[A-Za-z]:/.test(cmdRawTarget);
    const isCharSafe = SAFE_WIN32_CD_RE.test(rawCdTarget);
    const hasBang = cmdRawTarget.includes("!");
    const formatCmd = (target) => isCmdUnc ? `pushd ${target}` : hasCmdDrive ? `cd /d ${target}` : `cd ${target}`;
    const cmdOffTarget = escapeCmdTarget(cmdRawTarget, false);
    const cmdOnTarget = escapeCmdTarget(cmdRawTarget, true);
    const cmdOffCmd = formatCmd(cmdOffTarget);
    const cmdOnCmd = formatCmd(cmdOnTarget);
    const psCmd = escapePowerShellCdCommand(rawCdTarget);
    const psTarget = isCharSafe ? rawCdTarget : `'${rawCdTarget.replace(/'/g, "''")}'`;
    if (detectedWinShell === "powershell") {
      return { displayDirWithSlash, cdTarget: psTarget, cdCommands: [psCmd] };
    }
    if (detectedWinShell === "cmd-delayed") {
      return { displayDirWithSlash, cdTarget: cmdOnTarget, cdCommands: [cmdOnCmd] };
    }
    if (detectedWinShell === "cmd") {
      return {
        displayDirWithSlash,
        cdTarget: cmdOffTarget,
        cdCommands: hasBang ? [`cmd.exe:         ${cmdOffCmd}`, `cmd.exe (/v:on): ${cmdOnCmd}`] : [cmdOffCmd]
      };
    }
    if (isCharSafe && isRelativeWinTarget && !rawCdTarget.includes("\\")) {
      return { displayDirWithSlash, cdTarget: rawCdTarget, cdCommands: [`cd ${rawCdTarget}`] };
    }
    return {
      displayDirWithSlash,
      cdTarget: cmdOffTarget,
      cdCommands: hasBang ? [
        `cmd.exe:         ${cmdOffCmd}`,
        `cmd.exe (/v:on): ${cmdOnCmd}`,
        `PowerShell:      ${psCmd}`,
        `Git Bash:        ${posixCdCmd}`
      ] : [`cmd.exe:    ${cmdOffCmd}`, `PowerShell: ${psCmd}`, `Git Bash:   ${posixCdCmd}`]
    };
  }
  return { displayDirWithSlash, cdTarget: posixCdTarget, cdCommands: [posixCdCmd] };
}
async function cloneProjectTemplate(templateName, targetDir, runtimeNextSteps, options = {}) {
  const template = PROJECT_TEMPLATES[templateName];
  if (!template || !Object.hasOwn(PROJECT_TEMPLATES, templateName)) {
    exitUnknownTemplate(templateName);
  }
  const dirName = templateTargetDir(templateName, targetDir);
  if (!isTargetDirSafe(dirName)) {
    errorFactories.invalidPath(dirName).exit();
  }
  const destination = isAbsolute(dirName) ? dirName : resolve(cwd(), dirName);
  const { displayDirWithSlash, cdCommands } = formatProjectPaths(dirName);
  if (existsSync2(destination) && readdirSync(destination).length > 0) {
    errorFactories.directoryExists(destination).exit();
  }
  if (!options.quiet) {
    showCommandHeader(`Cloning template: ${templateName}`);
    showDetail(`${template.description}
`, 0);
    showDetail(`Source: ${template.bundledPath || template.generated || template.composed ? "bundled Flisk example" : template.repo}`, 0);
    if (template.ref)
      showDetail(`Commit: ${template.ref}`, 0);
    showDetail(`Destination: ${destination}
`, 0);
  }
  let gitStep = "clone";
  let bundledCopyUsed = false;
  try {
    if (template.generated === "swarm") {
      writeSwarmProject(destination);
    } else if (template.generated === "security") {
      writeSecurityProject(destination);
    } else if (template.generated === "super-agent") {
      writeSuperAgentProject(destination);
    } else if (template.generated === "langgraph") {
      writeLanggraphProject(destination);
    } else if (template.generated === "tool-loop") {
      writeToolLoopProject(destination);
    } else if (template.composed === "next-postgres") {
      const lock = writeNextPostgresProject(destination);
      if (!lock.ok) {
        console.log(source_default.yellow(`\u26A0\uFE0F  No package-lock.json for the web resource (${lock.reason}). The image build needs one: run \`${LOCKFILE_COMMAND}\` in ${join7(destination, "services/app/web")}.`));
      }
    } else if (template.bundledPath) {
      const bundledSource = resolveBundledTemplateDir(template.bundledPath, {
        packageRoot: resolve(dirname7(fileURLToPath(__fliskModuleUrl)), "../../../"),
        exeDir: dirname7(execPath),
        workingDir: cwd()
      });
      if (bundledSource) {
        bundledCopyUsed = true;
        cpSync(bundledSource, destination, { recursive: true });
      } else {
        for (const gitArgs of templateGitCommands(template, destination)) {
          gitStep = gitArgs[0] === "clone" ? "clone" : gitArgs[2] === "remote" ? "remote" : "checkout";
          execFileSync("git", gitArgs, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" });
        }
      }
      const projectSlug = basename2(destination).replace(/-/g, "_");
      for (const file of [
        "services/platform/messaging/docker-compose.yml",
        "services/shop/orders-api/service.json",
        "services/shop/orders-api/src/index.ts",
        "services/shop/orders-worker/service.json",
        "services/shop/orders-worker/src/index.ts"
      ]) {
        const copiedPath = join7(destination, file);
        if (!existsSync2(copiedPath))
          continue;
        const contents = readFileSync2(copiedPath, "utf-8");
        writeFileSync7(copiedPath, contents.replaceAll("flisk_example", projectSlug));
      }
    } else {
      for (const gitArgs of templateGitCommands(template, destination)) {
        gitStep = gitArgs[0] === "clone" ? "clone" : gitArgs[2] === "remote" ? "remote" : "checkout";
        execFileSync("git", gitArgs, {
          stdio: ["ignore", "pipe", "pipe"],
          encoding: "utf-8"
        });
      }
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const message = template.bundledPath && bundledCopyUsed ? `Bundled example copy failed (${lastLine(detail)}). Reinstall the Flisk CLI package and try again.` : gitStep === "remote" ? `git remote rename origin upstream failed: ${lastLine(detail)}. The cloned repository is left in ${destination}; inspect its remotes before trying again.` : gitStep === "checkout" ? `git checkout of the pinned commit ${template.ref} failed: ${lastLine(detail)}. ${destination} is left at the default branch; delete it before trying again.` : `git clone failed: ${lastLine(detail)}. Check you have git installed and network access.`;
    if (options.quiet) {
      throw new FliskError(message, [
        template.bundledPath && bundledCopyUsed ? "Reinstall the Flisk CLI package, then run the command again" : "Check that git is installed and that you are online, then run the command again"
      ]);
    }
    showErrorAndExit(message);
  }
  if (!existsSync2(join7(destination, ".flisk", PROJECT_JSON))) {
    writeDefaultProjectConfig(destination);
  }
  clearDiscoveryCache();
  if (options.quiet)
    return destination;
  const printCdStep = () => {
    const [first, ...rest] = cdCommands;
    showDetail(`1. ${first}`);
    for (const alt of rest)
      showDetail(`   ${alt}`);
  };
  if (template.generated) {
    console.log(source_default.green(`
\u2705 Created "${templateName}" in ${displayDirWithSlash}`));
    showDetail("\nNext steps:", 0);
    printCdStep();
    showDetail("2. flisk up       # start it as local processes (no Docker needed)");
    showDetail("3. cat README.md  # what to send it");
    return destination;
  }
  if (template.composed) {
    console.log(source_default.green(`
\u2705 Created "${templateName}" in ${displayDirWithSlash}`));
    showDetail("\nNext steps:", 0);
    printCdStep();
    showDetail("2. flisk up       # Postgres, the migrator, the API and the website (needs Docker)");
    showDetail("3. cat README.md  # what each part does");
    return destination;
  }
  console.log(source_default.green(`
\u2705 Cloned "${templateName}" into ${displayDirWithSlash}`));
  showDetail("\nNext steps:", 0);
  printCdStep();
  showDetail("2. flisk doctor   # check Docker/Tilt are ready");
  showDetail("3. flisk up       # start the stack");
  if (!template.bundledPath) {
    showDetail("\nThe starter is the git remote upstream; add your own with git remote add origin <url>.", 0);
  }
  showDetail("\nRuntime readiness:", 0);
  for (const line of runtimeNextSteps)
    showDetail(line, 0);
  return destination;
}
var DEFAULT_PROJECT_JSON = {
  version: "1.0",
  project: {
    name: "",
    version: "1.0.0"
  },
  phases: {
    pre_alpha: {
      name: "Pre-Alpha",
      description: "Core infrastructure and MVP services",
      enabledStacks: getDefaultCoreServices()
    },
    alpha: {
      name: "Alpha",
      description: "Essential business services",
      enabledStacks: []
    },
    beta: {
      name: "Beta",
      description: "Extended features",
      enabledStacks: []
    },
    out_of_scope: {
      name: "Out of Scope",
      description: "Future releases",
      enabledStacks: []
    }
  },
  optional_infra: {
    monitoring: false,
    elk: false,
    debezium: false,
    golden_image: true,
    verdaccio: false
  },
  discovery: {
    // Generic PSR layout (services/<stack>/<resource>/service.json) - every Flisk example
    // repo (restaurant, saas-starter, user-management, ...) uses its own stack names here,
    // not the literal "product"/"platform" folders from the internal platform monorepo.
    paths: ["services/*/*"]
  },
  overrides: {}
};
function writeDefaultProjectConfig(projectRoot) {
  const projectConfig = JSON.parse(JSON.stringify(DEFAULT_PROJECT_JSON));
  projectConfig.project.name = basename2(projectRoot) || "my-project";
  ensureDirectory(join7(projectRoot, ".flisk"));
  writeJsonFile(join7(projectRoot, ".flisk", PROJECT_JSON), projectConfig);
}
function printTemplateCatalog(json) {
  const templates = listProjectTemplates();
  if (json) {
    console.log(JSON.stringify(createMachineEnvelope({ templates })));
    return;
  }
  console.log(source_default.bold("Starter templates (flisk project <key>):\n"));
  for (const { key, repo, description, ref } of templates) {
    console.log(`  ${source_default.cyan(key)}  ${description}`);
    console.log(source_default.gray(`    ${repo}`));
    if (ref)
      console.log(source_default.gray(`    ref ${ref}`));
  }
}
var projectCommand = addYesOption(new Command("project")).alias("init").description("Initialize or validate project-level master configuration").argument("[template]", `Clone a starter example instead of a blank project (${Object.keys(PROJECT_TEMPLATES).join(", ")})`).option("--path <dir>", "Directory to clone the template into (default: the starter name, or its repository name)").option("--check", "Check if master configs exist and are in sync").option("--force", "Overwrite existing configuration (dangerous)").option("--config-file <path>", "Load project config from existing JSON file").option("-q, --quiet", "Only print what fails; used by `flisk demo`", false).option("--no-agent-skills", "Do not write the Flisk agent skills (.claude/skills, .agents/skills) and AGENTS.md").option("--list", "List the starter templates (key, repo, description, pinned ref); with --json, a JSON array", false).option("--json", "Print one JSON envelope on stdout; implies --yes and --quiet", false).addHelpText("after", "\nExamples:\n  flisk project\n  flisk project demo\n  flisk project --check").action(async (template, options) => {
  const json = Boolean(options.json);
  if (options.list) {
    printTemplateCatalog(json);
    return;
  }
  const yes = Boolean(options.yes || json);
  const quiet = Boolean(options.quiet || json);
  const { assertMachineReadyOrExit, detectRuntimePrerequisites, formatRuntimeNextSteps } = await import("./cold-preflight-6GVMXA7D.js");
  const action = async () => {
    await assertMachineReadyOrExit({ scope: "scaffold" });
    const runtime = detectRuntimePrerequisites();
    const runtimeNextSteps = formatRuntimeNextSteps(runtime);
    if (template) {
      if (json && !Object.hasOwn(PROJECT_TEMPLATES, template)) {
        const actionHint = actionWordHint(template);
        throw new FliskError(`Unknown template: "${template}"`, [
          ...actionHint ? [`Did you mean "${actionHint}"?`] : [],
          `Use one of: ${Object.keys(PROJECT_TEMPLATES).join(", ")}`,
          "Or run `flisk project` with no template for a blank project"
        ]);
      }
      const destination = await cloneProjectTemplate(template, options.path, runtimeNextSteps, {
        quiet
      });
      return { data: { action: "cloned", template, path: destination, runtime } };
    }
    return initializeProject(runtime, runtimeNextSteps);
  };
  const initializeProject = async (runtime, runtimeNextSteps) => {
    let projectRoot = findProjectRoot();
    if (!projectRoot) {
      projectRoot = cwd();
      if (!quiet) {
        showStep("\u{1F680} Initializing new Flisk project...\n");
        showDetail(`Location: ${projectRoot}
`, 0);
      }
    }
    const fliskDir = join7(projectRoot, ".flisk");
    const projectJsonPath = join7(fliskDir, PROJECT_JSON);
    if (options.check) {
      const allFilesExist = MASTER_CONFIG_FILES.every((f) => existsSync2(join7(projectRoot, ".flisk", ".flisk-out", f)));
      const projectJsonExists2 = existsSync2(projectJsonPath);
      if (json) {
        const valid = allFilesExist && projectJsonExists2;
        return {
          data: {
            action: "check",
            projectRoot,
            valid,
            hasProjectJson: projectJsonExists2,
            missingFiles: MASTER_CONFIG_FILES.filter((f) => !existsSync2(join7(projectRoot, ".flisk", ".flisk-out", f)))
          },
          errors: valid ? [] : [
            {
              code: "PROJECT_INCOMPLETE",
              message: "Project configuration incomplete",
              suggestions: ["Run `flisk project --yes` to create the missing files"]
            }
          ],
          exitCode: valid ? 0 : 1
        };
      }
      if (allFilesExist && projectJsonExists2) {
        const projectConfig2 = readProjectConfig(projectRoot);
        showSuccess("Project configuration is valid");
        showDetail(`Project: ${projectConfig2.project.name}`, 3);
        showDetail(`Phases: ${Object.keys(projectConfig2.phases).join(", ")}`, 3);
        process.exit(0);
      } else {
        console.log(source_default.yellow("\u26A0\uFE0F  Project configuration incomplete:"));
        if (!projectJsonExists2)
          showDetail(".flisk/project.json (not found)", 3);
        if (!allFilesExist) {
          for (const f of MASTER_CONFIG_FILES.filter((f2) => !existsSync2(join7(projectRoot, ".flisk/.flisk-out", f2)))) {
            showDetail(`.flisk/.flisk-out/${f} (not found)`, 3);
          }
        }
        showDetail("Run `flisk project` to create them.");
        process.exit(1);
      }
    }
    if (!quiet) {
      showCommandHeader("Project Configuration");
      showDetail(`Project root: ${projectRoot}
`, 0);
    }
    if (!existsSync2(fliskDir)) {
      ensureDirectory(fliskDir);
      if (!quiet)
        showSuccess("Created: .flisk/ directory");
    }
    const projectJsonExists = existsSync2(projectJsonPath);
    if (projectJsonExists && !options.force) {
      if (!quiet)
        showSuccess(".flisk/project.json exists");
      const rawProjectConfig = JSON.parse(readFileSync2(projectJsonPath, "utf-8"));
      const projectConfig2 = readProjectConfig(projectRoot);
      const discoveredStacks2 = discoverExistingServiceStacks(projectRoot);
      const autoEnabledStacks2 = syncDiscoveredStacksToPreAlpha(projectConfig2, discoveredStacks2);
      const shouldRewriteProjectConfig = autoEnabledStacks2.length > 0 || !rawProjectConfig.phases;
      if (shouldRewriteProjectConfig) {
        writeJsonFile(projectJsonPath, projectConfig2);
      }
      if (autoEnabledStacks2.length > 0 && !quiet) {
        showDetail(`Auto-enabled discovered service stacks: ${autoEnabledStacks2.join(", ")}`, 0);
      }
      if (!quiet)
        showStep("\n\u{1F4CB} Regenerating master configuration files...\n");
      await generateMasterConfigs(projectRoot, { quiet });
      const env2 = { created: ensureEnvFile(projectRoot), added: [] };
      if (env2.created) {
        if (!quiet)
          showSuccess("Created: .env (the defaults work as-is)");
      } else {
        env2.added = completeEnvFile(projectRoot);
        if (env2.added.length > 0 && !quiet) {
          showSuccess(`Updated: .env (added ${env2.added.join(", ")}; existing values unchanged)`);
        }
      }
      const ignored2 = ensureGitignore(projectRoot);
      if (ignored2.length > 0 && !quiet) {
        showSuccess(`Added to .gitignore: ${ignored2.join(", ")}`);
      }
      if (!quiet) {
        console.log(source_default.green("\n\u2705 Project configuration regenerated!"));
        showDetail("\nGenerated in .flisk/.flisk-out/:", 0);
        for (const file of MASTER_CONFIG_FILES) {
          showDetail(`- ${file}`);
        }
        showDetail("\nRuntime readiness:", 0);
        for (const line of runtimeNextSteps)
          showDetail(line, 0);
      }
      return {
        data: {
          action: "regenerated",
          projectRoot,
          autoEnabledStacks: autoEnabledStacks2,
          generatedFiles: [...MASTER_CONFIG_FILES],
          env: env2,
          gitignoreAdded: ignored2,
          runtime
        }
      };
    }
    if (projectJsonExists && options.force && !yes) {
      console.log(source_default.red("\n\u26A0\uFE0F  WARNING: --force will overwrite .flisk/project.json!"));
      const confirm = await promptConfirm({
        message: "This will reset your project configuration. Continue?",
        initial: false
      });
      if (!confirm) {
        showCancelled();
        return { data: null };
      }
    }
    let projectConfig;
    const discoveredStacks = discoverExistingServiceStacks(projectRoot);
    if (options.configFile) {
      const configFilePath = resolve(options.configFile);
      if (!existsSync2(configFilePath)) {
        throw new FliskError(`Config file not found: ${configFilePath}`, [
          "Pass the path of an existing project.json to --config-file",
          "Or drop --config-file to use the defaults"
        ]);
      }
      const configContent = readFileSync2(configFilePath, "utf-8");
      projectConfig = JSON.parse(configContent);
      if (!quiet)
        showSuccess(`Loaded config from: ${configFilePath}`);
    } else if (yes) {
      projectConfig = JSON.parse(JSON.stringify(DEFAULT_PROJECT_JSON));
      projectConfig.project.name = projectRoot.split("/").pop() || "my-project";
      if (!quiet)
        console.log(source_default.gray("Using default configuration (non-interactive mode)"));
    } else {
      showStep("\u{1F4DD} Project Setup Wizard\n");
      const projectName = await promptText({
        message: "Project name:",
        initial: projectRoot.split("/").pop() || "my-project",
        validate: (input) => input.trim() !== "" || "Project name is required"
      });
      const projectVersion = await promptText({
        message: "Project version:",
        initial: "1.0.0-alpha"
      });
      const corePreAlphaFeatures = Object.values(PROJECT_FEATURES).filter((f) => f.category === "core" && f.phase === "pre_alpha");
      const corePreAlphaNames = new Set(corePreAlphaFeatures.map((f) => f.name));
      const preAlphaStacks = await promptMultiSelect({
        message: "Select Pre-Alpha enabled stacks (core infrastructure):",
        choices: [
          ...corePreAlphaFeatures.map((f) => ({
            title: f.description,
            value: f.name,
            selected: f.enabled_by_default
          })),
          // Exclude discovered stacks that duplicate a core feature name (e.g. a
          // "database-management" service dir) - otherwise the same value shows
          // up as two checked boxes and accepting defaults writes it twice into
          // project.json, which the generator later emits as a duplicate
          // Starlark dict key and Tilt refuses to parse.
          ...discoveredStacks.filter((stack) => !corePreAlphaNames.has(stack)).map((stack) => ({
            title: `${stack} (discovered service stack)`,
            value: stack,
            selected: true
          }))
        ]
      });
      const alphaStacks = await promptMultiSelect({
        message: "Select Alpha enabled stacks (core business):",
        choices: [
          { title: "api (Backend API)", value: "api" },
          { title: "app (Frontend app)", value: "app" }
        ]
      });
      const betaStacks = await promptMultiSelect({
        message: "Select Beta enabled stacks (extended features):",
        choices: [
          { title: "worker (Background jobs)", value: "worker" },
          { title: "migrator (Database migrations)", value: "migrator" }
        ]
      });
      const optionalInfra = await promptMultiSelect({
        message: "Enable optional infrastructure (high resource):",
        choices: Object.values(PROJECT_FEATURES).filter((f) => f.category === "optional").concat(Object.values(PROJECT_FEATURES).filter((f) => f.category === "premium")).map((f) => ({
          title: f.description,
          value: f.name,
          selected: f.enabled_by_default
        }))
      });
      showStep("\n\u{1F4C2} Service discovery");
      showDetail("What: folder patterns Flisk scans for a service.json in each match.");
      showDetail("Where: type one or more globs, comma-separated.");
      showDetail("How: saved as discovery.paths in .flisk/project.json - editable later.");
      showDetail(`Example: ${DEFAULT_PROJECT_JSON.discovery.paths.join(", ")}
`);
      const discoveryPaths = await promptText({
        message: "Folders to scan:",
        initial: DEFAULT_PROJECT_JSON.discovery.paths.join(", ")
      });
      projectConfig = JSON.parse(JSON.stringify(DEFAULT_PROJECT_JSON));
      projectConfig.project.name = projectName;
      projectConfig.project.version = projectVersion;
      projectConfig.phases.pre_alpha.enabledStacks = Array.from(new Set(preAlphaStacks));
      projectConfig.phases.alpha.enabledStacks = Array.from(new Set(alphaStacks));
      projectConfig.phases.beta.enabledStacks = Array.from(new Set(betaStacks));
      projectConfig.optional_infra.monitoring = optionalInfra.includes("monitoring");
      projectConfig.optional_infra.elk = optionalInfra.includes("elk");
      projectConfig.optional_infra.debezium = optionalInfra.includes("debezium");
      projectConfig.optional_infra.golden_image = optionalInfra.includes("golden_image");
      projectConfig.optional_infra.verdaccio = optionalInfra.includes("verdaccio");
      const parsedDiscoveryPaths = discoveryPaths.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
      projectConfig.discovery.paths = parsedDiscoveryPaths.length > 0 ? parsedDiscoveryPaths : DEFAULT_PROJECT_JSON.discovery.paths;
    }
    const autoEnabledStacks = syncDiscoveredStacksToPreAlpha(projectConfig, discoveredStacks);
    if (autoEnabledStacks.length > 0 && !quiet) {
      showDetail(`Auto-enabled discovered service stacks: ${autoEnabledStacks.join(", ")}`, 0);
    }
    if (!quiet)
      showStep("\n\u{1F4CB} Creating project configuration...\n");
    writeJsonFile(projectJsonPath, projectConfig);
    if (!quiet) {
      showSuccess("Created: .flisk/project.json");
      showDetail(`\u2192 Project: ${projectConfig.project.name}`);
      showStep("\n\u{1F4CB} Generating master configuration files...\n");
    }
    await generateMasterConfigs(projectRoot, { quiet });
    if (!quiet)
      showStep("\n\u{1F527} Setting up environment variables...\n");
    const env = { created: ensureEnvFile(projectRoot), added: [] };
    if (env.created) {
      if (!quiet)
        showSuccess("Created: .env (the defaults work as-is)");
    } else {
      env.added = completeEnvFile(projectRoot);
      if (env.added.length > 0) {
        if (!quiet) {
          showSuccess(`Updated: .env (added ${env.added.join(", ")}; existing values unchanged)`);
        }
      } else if (!quiet) {
        showSuccess("Found: .env (environment already configured)");
      }
    }
    const envValidation = validateEnvFile(projectRoot);
    if (envValidation.missing.length > 0) {
      console.log(source_default.yellow("\n\u26A0\uFE0F  Missing required environment variables:"));
      for (const missing of envValidation.missing) {
        showDetail(`- ${missing}`, 1);
      }
      showDetail("\u2192 Edit .env and fill in these values before running `flisk up`", 1);
    }
    const ignored = ensureGitignore(projectRoot);
    if (ignored.length > 0 && !quiet) {
      showSuccess(`Added to .gitignore: ${ignored.join(", ")}`);
    }
    let skillFiles = [];
    if (options.agentSkills !== false) {
      try {
        skillFiles = installAgentSkills(projectRoot);
        if (skillFiles.length > 0 && !quiet) {
          showSuccess("Added agent skills: .claude/skills, .agents/skills and AGENTS.md (start with flisk-build)");
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.log(source_default.yellow(`\u26A0\uFE0F  Could not add the agent skills: ${reason}`));
      }
    }
    if (!quiet) {
      console.log(source_default.green("\n\u2705 Project configuration complete!"));
      showDetail("\nGenerated files in .flisk/.flisk-out/:", 0);
      for (const file of MASTER_CONFIG_FILES) {
        showDetail(`- ${file}`);
      }
      showDetail("\nEnvironment configuration:", 0);
      showDetail("- .env (contains all required variables)");
      showDetail("\nSource file:", 0);
      showDetail("- .flisk/project.json (edit this to change project structure)");
      showDetail("\nNext steps:", 0);
      showDetail("1. flisk resource api --type backend --stack app   # scaffold a service");
      showDetail("2. flisk up app                                     # start it");
      showDetail("\nRuntime readiness:", 0);
      for (const line of runtimeNextSteps)
        showDetail(line, 0);
      showDetail("\nAfter editing .flisk/project.json, run `flisk config regenerate`.", 0);
    }
    return {
      data: {
        action: "created",
        projectRoot,
        projectName: projectConfig.project.name,
        autoEnabledStacks,
        generatedFiles: [...MASTER_CONFIG_FILES],
        env,
        missingEnv: envValidation.missing,
        gitignoreAdded: ignored,
        agentSkills: skillFiles,
        runtime
      }
    };
  };
  if (json) {
    await runJsonCommand("PROJECT_FAILED", "flisk project", action);
    return;
  }
  await runCommand(action);
});

export {
  enableDiscoveredStacks,
  lastLine,
  ACTION_WORD_HINTS,
  actionWordHint,
  exitUnknownTemplate,
  formatProjectPaths,
  cloneProjectTemplate,
  writeDefaultProjectConfig,
  printTemplateCatalog,
  projectCommand
};
