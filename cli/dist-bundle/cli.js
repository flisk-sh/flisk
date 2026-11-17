#!/usr/bin/env node
import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  createRootProgram,
  showDemoHelp,
  showHelp
} from "./chunk-HG2XF7CF.js";
import {
  currentDockerContext,
  kiriBuildEnv,
  kiriSocketEnv
} from "./chunk-2PSIPSDY.js";
import {
  PROJECT_TEMPLATES
} from "./chunk-4CRSIAQJ.js";
import {
  NO_POSITIONAL_HINTS,
  attachNoPositionalHint,
  routeUsageErrorsToJson
} from "./chunk-MJGDAK6E.js";
import "./chunk-3SNMUNQF.js";
import "./chunk-3EZ4UDYT.js";
import {
  validateResourceName
} from "./chunk-UPCGXTMS.js";
import {
  showCommandHeader
} from "./chunk-ARPSTQFE.js";
import {
  findProjectRoot,
  handleCommandError,
  package_default,
  showErrorAndExit,
  source_default
} from "./chunk-73W4Y4TI.js";
import "./chunk-VVP2Y2AJ.js";

// dist/utils/env-compat.js
var NEW_PREFIX = "FLISK_";
var LEGACY_PREFIX = "TDK_";
function applyEnvAliases(env) {
  const deprecated2 = [];
  for (const key of Object.keys(env)) {
    if (key.startsWith(NEW_PREFIX)) {
      const legacy = LEGACY_PREFIX + key.slice(NEW_PREFIX.length);
      if (env[legacy] === void 0)
        env[legacy] = env[key];
    }
  }
  for (const key of Object.keys(env)) {
    if (key.startsWith(LEGACY_PREFIX) && env[NEW_PREFIX + key.slice(LEGACY_PREFIX.length)] === void 0) {
      deprecated2.push(key);
    }
  }
  return deprecated2;
}

// dist/utils/env-compat-init.js
var deprecated = applyEnvAliases(process.env);
var isJson = process.argv.includes("--json") || process.argv.includes("--json-legacy");
if (deprecated.length > 0 && process.env.FLISK_QUIET_DEPRECATIONS === void 0 && !isJson) {
  console.error(`flisk: ${deprecated.join(", ")} ${deprecated.length > 1 ? "are" : "is"} deprecated; rename the TDK_ prefix to FLISK_ (set FLISK_QUIET_DEPRECATIONS=1 to silence).`);
}

// dist/utils/engine-env-init.js
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
var context = currentDockerContext(homedir(), (path) => readFileSync(path, "utf-8"));
Object.assign(process.env, kiriBuildEnv(process.env, context), kiriSocketEnv(process.env, process.platform, context));

// dist/cli.js
import { existsSync, mkdirSync, readdirSync, readFileSync as readFileSync3, rmSync, writeFileSync } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { isAbsolute, join as join2, resolve } from "node:path";
import { cwd } from "node:process";

// dist/commands/command-specs.generated.js
var COMMAND_SPECS = [
  {
    name: "stacks",
    path: ["stacks"],
    description: "List all stacks and their resources",
    aliases: ["ls"],
    hidden: false,
    hasAction: true,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [
      {
        flags: "-v, --verbose",
        description: "Show detailed information about each stack",
        defaultValue: false
      },
      {
        flags: "--services",
        description: "Include list of services in each stack",
        defaultValue: false
      },
      {
        flags: "--json",
        description: "Output a versioned JSON stack report",
        defaultValue: false
      }
    ],
    arguments: [],
    helpTexts: {
      after: ["\nExamples:\n  flisk stacks\n  flisk stacks --services\n  flisk stacks --json"]
    },
    subcommands: []
  },
  {
    name: "resources",
    path: ["resources"],
    description: "List all resources (services) in the project",
    aliases: [],
    hidden: false,
    hasAction: true,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [
      {
        flags: "-v, --verbose",
        description: "Show resource details in text view (JSON output is unchanged)",
        defaultValue: false
      },
      {
        flags: "-s, --stack <stack>",
        description: "Filter resources by stack name"
      },
      {
        flags: "-t, --type <type>",
        description: "Filter resources by type"
      },
      {
        flags: "--no-stack",
        description: "Show only resources without a stack"
      },
      {
        flags: "--ports",
        description: "Show port assignments in text view (JSON output is unchanged)",
        defaultValue: false
      },
      {
        flags: "--json",
        description: "Output a versioned JSON resource report",
        defaultValue: false
      }
    ],
    arguments: [],
    helpTexts: {
      after: [
        "\nExamples:\n  flisk resources\n  flisk resources --type database\n  flisk resources --ports"
      ]
    },
    subcommands: []
  },
  {
    name: "projects",
    path: ["projects"],
    description: "Show project information and configuration status",
    aliases: ["info"],
    hidden: false,
    hasAction: true,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: true,
    options: [
      {
        flags: "-y, --yes",
        description: "Skip prompts and confirmations; use defaults",
        defaultValue: false
      },
      {
        flags: "--check",
        description: "Check if project is properly configured",
        defaultValue: false
      },
      {
        flags: "--stale",
        description: "List stale projects whose directory is gone but Docker resources remain",
        defaultValue: false
      },
      {
        flags: "--prune",
        description: "With --stale: delete the containers, volumes (database data), networks and images those projects left",
        defaultValue: false
      },
      {
        flags: "--json",
        description: "Output a versioned JSON response"
      }
    ],
    arguments: [],
    helpTexts: {},
    subcommands: []
  },
  {
    name: "up",
    path: ["up"],
    description: "Start all services on this machine (optionally filtered by stack). Alias: deploy, which never deploys to a cluster",
    aliases: ["deploy"],
    hidden: false,
    hasAction: true,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [
      {
        flags: "-v, --verbose",
        description: "Enable verbose output",
        defaultValue: false
      },
      {
        flags: "-q, --quiet",
        description: "Suppress non-essential output",
        defaultValue: false
      },
      {
        flags: "--dry-run",
        description: "Show what would be started without starting",
        defaultValue: false
      },
      {
        flags: "-f, --force",
        description: "Kill existing Tilt process before starting",
        defaultValue: false
      },
      {
        flags: "--ignore-drift",
        description: "Start even if generated files differ from service.json",
        defaultValue: false
      },
      {
        flags: "--ignore-version",
        description: "Start even if this flisk does not satisfy pinnedFliskVersion or minFliskVersion in .flisk/project.json",
        defaultValue: false
      },
      {
        flags: "--no-database",
        description: "Do not provision the bundled shared Postgres: saves capabilities.database=false in .flisk/project.json and regenerates .flisk/.flisk-out/ (set it to true to turn Postgres back on)"
      },
      {
        flags: "--only <services...>",
        description: "Start only these services plus what the Tiltfile enables for them (their dependsOn services and shared infrastructure). With a stack, names must belong to that stack; dependencies may cross stacks"
      },
      {
        flags: "--profile <names...>",
        description: 'Also start the services whose "profiles" in service.json include one of these names (without it they are left out)'
      },
      {
        flags: "--env-file <path>",
        description: "Use this project env file for the run instead of .env (for example: --env-file .env.integration)"
      },
      {
        flags: "--no-gateway",
        description: 'Run without gateway routing (no Traefik). Needs "capabilities": { "gateway": false } in .flisk/project.json; regenerates .flisk/.flisk-out/ from it'
      },
      {
        flags: "--json",
        description: "Print one JSON object on stdout when the stack is ready or the command fails; implies --quiet",
        defaultValue: false
      },
      {
        flags: "--wait",
        description: "Start the stack in the background and return once every service is healthy (exit 0), or when it fails or --wait-timeout passes (exit 1). The stack keeps running; `flisk down` stops it",
        defaultValue: false
      },
      {
        flags: "--wait-timeout <seconds>",
        description: "With --wait: seconds to wait for a healthy stack, 1 to 21600 (default 1800)"
      }
    ],
    arguments: [
      {
        name: "stack-name",
        description: "Name of the stack to start (optional - runs all if omitted), or a git repository URL to clone and start",
        required: false,
        variadic: false
      }
    ],
    helpTexts: {
      after: [
        "\nFree disk space is checked first. Container projects: under 5 GiB flisk up stops, under 15 GiB it warns. Local-process projects: under 1 GiB it stops, under 2 GiB it warns. FLISK_DISK_MIN_GIB and FLISK_DISK_WARN_GIB change the limits of both. The shared Docker build cache is trimmed to 20 GiB (FLISK_BUILD_CACHE_MAX_GIB, 0 turns it off).\n\nExamples:\n  flisk up\n  flisk up shop\n  flisk up --dry-run\n  flisk up --ignore-drift"
      ]
    },
    subcommands: []
  },
  {
    name: "down",
    path: ["down"],
    description: "Stop every running service of this project (local processes or Docker/Tilt)",
    aliases: [],
    hidden: false,
    showHelpAfterError: "\nService names are not positional: down stops the whole project. Use: flisk down (or flisk down --project <path>)",
    hasAction: true,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [
      {
        flags: "-y, --yes",
        description: "Skip prompts and confirmations; use defaults",
        defaultValue: false
      },
      {
        flags: "-v, --verbose",
        description: "Enable verbose output",
        defaultValue: false
      },
      {
        flags: "-f, --force",
        description: "Deprecated alias for --yes; accepted for script compatibility",
        defaultValue: false
      },
      {
        flags: "--prune-networks",
        description: "Remove this project's Docker networks that no container is attached to (the default; kept for scripts)"
      },
      {
        flags: "--no-prune-networks",
        description: "Keep this project's Docker networks (by default the unused ones are removed, so Docker does not run out of address pools)"
      },
      {
        flags: "--prune-cache [age]",
        description: "Also prune Docker build cache (shared across all projects on this machine; default age: 24h)",
        defaultValue: false
      },
      {
        flags: "--cache-until <age>",
        description: "With --prune-cache: age filter for prune (e.g. 24h, 168h, 7d; default: 24h)"
      },
      {
        flags: "--purge",
        description: "Also delete this project's Docker volumes (database data), networks and images, so nothing of it is left in Docker",
        defaultValue: false
      },
      {
        flags: "--dry-run",
        description: "Show what would be stopped without stopping",
        defaultValue: false
      },
      {
        flags: "--json",
        description: "Print one JSON object on stdout; implies quiet human output",
        defaultValue: false
      },
      {
        flags: "--project <path>",
        description: "Stop the Flisk project in this folder (default: the current project, or the only running one)"
      }
    ],
    arguments: [],
    helpTexts: {
      after: [
        "\nAfter stopping a container project, down prints how much disk its images and the shared build cache still hold, and the command that frees it.\n\nExamples:\n  flisk down --dry-run\n  flisk down --json\n  flisk down --verbose"
      ]
    },
    subcommands: []
  },
  {
    name: "mcp",
    path: ["mcp"],
    description: "Run a Model Context Protocol server over stdio for coding agents",
    aliases: [],
    hidden: false,
    hasAction: true,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [
      {
        flags: "--read-only",
        description: "List and allow only the tools that change nothing (env FLISK_MCP_READ_ONLY=1)"
      },
      {
        flags: "--tools <names>",
        description: "List and allow only these comma-separated tools (env FLISK_MCP_TOOLS)"
      }
    ],
    arguments: [],
    helpTexts: {
      after: [
        '\nThe server reads JSON-RPC on stdin and waits for a client, so it prints nothing in a terminal.\nAdd it to an MCP client instead:\n  { "command": "flisk", "args": ["mcp"] }\n\nExamples:\n  flisk mcp                # started by an MCP client\n  flisk mcp --read-only    # for a reviewer or CI agent: doctor, status, logs and the other read tools only\n  flisk mcp --tools status,logs,doctor\n  flisk mcp check tools    # check the MCP resource named tools'
      ]
    },
    subcommands: [
      {
        name: "check",
        path: ["mcp", "check"],
        description: "Check an MCP server's protocol (initialize, tools, prompts, errors, HTTP rules, icon); read-only unless --call",
        aliases: [],
        hidden: false,
        hasAction: true,
        allowUnknown: false,
        passThrough: false,
        positionalOptions: false,
        allowExcessArguments: false,
        options: [
          {
            flags: "--call",
            description: "Also call each tool once with sample arguments (a call can reach the network)",
            defaultValue: false
          },
          {
            flags: "--no-icon",
            description: "Skip the icon-512.png check"
          },
          {
            flags: "--json",
            description: "Print the report as a JSON envelope",
            defaultValue: false
          }
        ],
        arguments: [
          {
            name: "target",
            description: "An https URL of the MCP endpoint, or the name of a resource in this project",
            required: true,
            variadic: false
          }
        ],
        helpTexts: {},
        subcommands: []
      }
    ]
  },
  {
    name: "connect",
    path: ["connect"],
    description: "Connect a coding agent to Flisk: write the flisk mcp server entry and the Flisk skills",
    aliases: [],
    hidden: false,
    hasAction: true,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [
      {
        flags: "--project [path]",
        description: "Write into the specified Flisk project (default: current project)"
      },
      {
        flags: "--global",
        description: "Write the MCP entry to the host's user config instead (no skills)"
      },
      {
        flags: "--dry-run",
        description: "Print what would be written, without changing any file",
        defaultValue: false
      },
      {
        flags: "--force",
        description: "Replace an existing, different flisk entry or edited Flisk skill",
        defaultValue: false
      },
      {
        flags: "--json",
        description: "Print the result as a JSON envelope"
      }
    ],
    arguments: [
      {
        name: "host",
        description: "Agent host: claude, cursor, codex",
        required: true,
        variadic: false
      }
    ],
    helpTexts: {
      after: [
        "\nExamples:\n  flisk connect cursor --dry-run\n  flisk connect cursor\n  flisk connect cursor --global"
      ]
    },
    subcommands: []
  },
  {
    name: "logs",
    path: ["logs"],
    description: "Print a bounded snapshot of recent logs from the running stack",
    aliases: [],
    hidden: false,
    showHelpAfterError: "\nService names are not positional. Use: flisk logs --service <name>",
    hasAction: true,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [
      {
        flags: "-s, --service <names...>",
        description: "Only these services (names as in flisk resources)"
      },
      {
        flags: "--tail <n>",
        description: "Number of most recent lines to return",
        defaultValue: "200"
      },
      {
        flags: "--since <duration>",
        description: "Only logs newer than this duration, for example 30s, 5m, 1h"
      },
      {
        flags: "--source <source>",
        description: "Only runtime output (what the service printed) or build output (image build steps); a crash cause is in runtime"
      },
      {
        flags: "--unhealthy",
        description: "Only services that are failing or still starting",
        defaultValue: false
      },
      {
        flags: "--port <n>",
        description: "Tilt UI port for Docker runtime (default: TILT_PORT, then the project's saved port, then 10350)"
      },
      {
        flags: "--project <path>",
        description: "View logs for the Flisk project in this folder (default: the current project)"
      },
      {
        flags: "--json",
        description: "Output one JSON object and exit",
        defaultValue: false
      }
    ],
    arguments: [],
    helpTexts: {
      after: [
        "\nExamples:\n  flisk logs --tail 50\n  flisk logs --service orders-api --since 5m\n  flisk logs --unhealthy --json\n  flisk logs --service orders-api --source runtime --json"
      ]
    },
    subcommands: []
  },
  {
    name: "eject",
    path: ["eject"],
    description: "Write EJECTED.md describing the generated Tilt files (copies and generates nothing; they stay in .flisk/.flisk-out/)",
    aliases: [],
    hidden: false,
    hasAction: true,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [
      {
        flags: "-y, --yes",
        description: "Skip prompts and confirmations; use defaults",
        defaultValue: false
      },
      {
        flags: "--dry-run",
        description: "List the generated files and what would be written, without changing the project",
        defaultValue: false
      },
      {
        flags: "--ignore-version",
        description: "Continue even if the CLI does not match the project's version requirements",
        defaultValue: false
      },
      {
        flags: "--json",
        description: "Print one JSON envelope on stdout; implies --yes",
        defaultValue: false
      }
    ],
    arguments: [],
    helpTexts: {},
    subcommands: []
  },
  {
    name: "export",
    path: ["export"],
    description: "Write render.yaml, wrangler.toml or a standalone docker-compose.yml from service.json; never deploys or calls a cloud API (runs flisk-export)",
    aliases: [],
    hidden: false,
    helpOptionDisabled: true,
    hasAction: true,
    allowUnknown: true,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [
      {
        flags: "--dry-run",
        description: "Print the file and write nothing",
        defaultValue: false
      }
    ],
    arguments: [
      {
        name: "args",
        description: "Passed to flisk-export: render [dir] [--resource <name>] [--out <dir>] [--force] | wrangler [dir] --resource <name> [--route <host>] [--out <dir>] [--allow-non-worker] [--force] | compose [dir] [--out <dir>] [--force] [--check]",
        required: false,
        variadic: true
      }
    ],
    helpTexts: {},
    subcommands: []
  },
  {
    name: "import",
    path: ["import"],
    description: "Import the services in a directory's root docker-compose.yml (runs flisk-import)",
    aliases: [],
    hidden: false,
    helpOptionDisabled: true,
    hasAction: true,
    allowUnknown: true,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [
      {
        flags: "-y, --yes",
        description: "Skip prompts and confirmations; use defaults",
        defaultValue: false
      },
      {
        flags: "-f, --force",
        description: "Overwrite an existing service.json",
        defaultValue: false
      },
      {
        flags: "--dry-run",
        description: "Print the plan and write nothing",
        defaultValue: false
      },
      {
        flags: "--json",
        description: "Print one JSON envelope on stdout with the importer's output; implies --yes",
        defaultValue: false
      }
    ],
    arguments: [
      {
        name: "args",
        description: "Passed to flisk-import: [dir] --dry-run --yes --force",
        required: false,
        variadic: true
      }
    ],
    helpTexts: {},
    subcommands: [
      {
        name: "compose",
        path: ["import", "compose"],
        description: "Import a directory's root docker-compose.yml, same as flisk import (runs flisk-import)",
        aliases: [],
        hidden: false,
        helpOptionDisabled: true,
        hasAction: true,
        allowUnknown: true,
        passThrough: false,
        positionalOptions: false,
        allowExcessArguments: false,
        options: [
          {
            flags: "-y, --yes",
            description: "Skip prompts and confirmations; use defaults",
            defaultValue: false
          },
          {
            flags: "-f, --force",
            description: "Overwrite an existing service.json",
            defaultValue: false
          },
          {
            flags: "--dry-run",
            description: "Print the plan and write nothing",
            defaultValue: false
          },
          {
            flags: "--json",
            description: "Print one JSON envelope on stdout with the importer's output; implies --yes",
            defaultValue: false
          }
        ],
        arguments: [
          {
            name: "args",
            description: "Passed to flisk-import: [dir] --dry-run --yes --force",
            required: false,
            variadic: true
          }
        ],
        helpTexts: {},
        subcommands: []
      },
      {
        name: "tiltfile",
        path: ["import", "tiltfile"],
        description: "Register an existing Tiltfile so flisk up runs it unchanged (writes .flisk/project.json)",
        aliases: [],
        hidden: false,
        helpOptionDisabled: true,
        hasAction: true,
        allowUnknown: true,
        passThrough: false,
        positionalOptions: false,
        allowExcessArguments: false,
        options: [
          {
            flags: "-y, --yes",
            description: "Skip prompts and confirmations; use defaults",
            defaultValue: false
          },
          {
            flags: "-f, --force",
            description: "Overwrite existing orchestration configuration",
            defaultValue: false
          },
          {
            flags: "--dry-run",
            description: "Print the plan and write nothing",
            defaultValue: false
          },
          {
            flags: "--json",
            description: "Print one JSON envelope on stdout with the importer's output; implies --yes",
            defaultValue: false
          }
        ],
        arguments: [
          {
            name: "args",
            description: "Passed to flisk-import tiltfile: [path] --dry-run --yes --force",
            required: false,
            variadic: true
          }
        ],
        helpTexts: {},
        subcommands: []
      }
    ]
  },
  {
    name: "open",
    path: ["open"],
    description: "Open the first ready frontend in your browser, or the frontend you name",
    aliases: [],
    hidden: false,
    hasAction: true,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [
      {
        flags: "--print",
        description: "Print the frontend URL without opening a browser"
      },
      {
        flags: "--json",
        description: "Print one JSON envelope on stdout; implies --print",
        defaultValue: false
      }
    ],
    arguments: [
      {
        name: "resource",
        description: "Frontend to open; defaults to the first ready one",
        required: false,
        variadic: false
      }
    ],
    helpTexts: {
      after: [
        "\nExamples:\n  flisk open\n  flisk open web2\n  flisk open --print\n  flisk open web2 --print\n  flisk open --print --json\n  flisk open --json"
      ]
    },
    subcommands: []
  },
  {
    name: "status",
    path: ["status"],
    description: "Show status of resources and stacks",
    aliases: [],
    hidden: false,
    showHelpAfterError: "\nService names are not positional: status shows the whole project. Use: flisk status (or flisk logs --service <name>)",
    hasAction: true,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [
      {
        flags: "--json",
        description: "Output a versioned JSON status report",
        defaultValue: false
      },
      {
        flags: "-v, --verbose",
        description: "Show detailed information",
        defaultValue: false
      },
      {
        flags: "--stacks",
        description: "Show stack information (default)",
        defaultValue: true
      },
      {
        flags: "--stack <name>",
        description: "Only report services in this stack"
      },
      {
        flags: "--resources",
        description: "Show all discovered resources",
        defaultValue: false
      },
      {
        flags: "--tilt",
        description: "Show Tilt resource status (Docker/Tilt stacks only)",
        defaultValue: false
      },
      {
        flags: "--no-gateway",
        description: "Disable gateway status reporting"
      },
      {
        flags: "--unhealthy",
        description: "Show only services that are failing or still starting",
        defaultValue: false
      },
      {
        flags: "--strict",
        description: "Exit 1 when any service is not ready or nothing is running",
        defaultValue: false
      },
      {
        flags: "--project <path>",
        description: "Show status for the Flisk project in this folder (default: the current project)"
      }
    ],
    arguments: [],
    helpTexts: {
      after: [
        "\nExamples:\n  flisk status\n  flisk status --resources\n  flisk status --unhealthy\n  flisk status --json\n  flisk status --strict"
      ]
    },
    subcommands: []
  },
  {
    name: "stack",
    path: ["stack"],
    description: "Organize resources into stacks (groups)",
    aliases: [],
    hidden: false,
    hasAction: true,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [
      {
        flags: "-y, --yes",
        description: "Skip prompts and confirmations; use defaults",
        defaultValue: false
      },
      {
        flags: "--list",
        description: "List resources without a stack",
        defaultValue: false
      },
      {
        flags: "--resources <names...>",
        description: "Resource names to update (comma- or space-separated)"
      },
      {
        flags: "--move",
        description: "Allow moving named resources from another stack",
        defaultValue: false
      },
      {
        flags: "--remove",
        description: "Remove the stack field from named resources",
        defaultValue: false
      },
      {
        flags: "--ignore-version",
        description: "Continue even if the CLI does not match the project's version requirements",
        defaultValue: false
      },
      {
        flags: "--json",
        description: "Print one JSON envelope on stdout; implies --yes and needs --list, <stack-name> --resources, or --remove --resources",
        defaultValue: false
      }
    ],
    arguments: [
      {
        name: "stack-name",
        description: "Stack name to assign to resources",
        required: false,
        variadic: false
      }
    ],
    helpTexts: {
      after: [
        "\nExamples:\n  flisk stack --list\n  flisk stack shop --resources orders-api web\n  flisk stack shop --move --resources orders-api --yes\n  flisk stack --remove --resources orders-api --yes"
      ]
    },
    subcommands: []
  },
  {
    name: "resource",
    path: ["resource"],
    description: "Create a new resource (service) from scratch, or register an existing one",
    aliases: [],
    hidden: false,
    hasAction: true,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [
      {
        flags: "-y, --yes",
        description: "Skip prompts and confirmations; use defaults",
        defaultValue: false
      },
      {
        flags: "-t, --type <type>",
        description: "Resource type: backend, frontend, worker, mcp, agent, inference, bring-your-own, database, queue, storage, mail, payment, sdk",
        defaultValue: "backend"
      },
      {
        flags: "--framework <id>",
        description: "Framework: frontend react (default), vue, svelte, preact, lit, solid, qwik, vanilla, tanstack-router, next; backend hono (default), express, elysia, fastify, nestjs, koa, h3 (list them with --frameworks); database postgres (default, the shared Flisk Postgres), redis, qdrant, minio, mlflow, mysql, mongodb, clickhouse; queue nats (default), rabbitmq"
      },
      {
        flags: "--frameworks",
        description: "List registered frameworks for the resource type and exit (--type frontend, --type backend, --type database, --type queue, --type storage, --type mail, --type payment)"
      },
      {
        flags: "--language <id>",
        description: "Backend language: bun (default), python, go, rust, node"
      },
      {
        flags: "-s, --stack <stack>",
        description: 'Stack to assign resource to (default: "main" for a new project)'
      },
      {
        flags: "-p, --path <path>",
        description: "Custom path for resource directory"
      },
      {
        flags: "--resource-path <path>",
        description: "Alias for --path (for backward compatibility)"
      },
      {
        flags: "--register-existing",
        description: "Register an existing resource without creating templates"
      },
      {
        flags: "--ddd",
        description: "Scaffold DDD (domain-driven design) folders + path aliases (Premium - requires FLISK_LICENSE_KEY)"
      },
      {
        flags: "--dockerfile <path>",
        description: "Path to Dockerfile relative to resource dir (for bring-your-own)"
      },
      {
        flags: "--health-path <path>",
        description: "HTTP health check path (for bring-your-own; inference defaults to /v1/models)",
        defaultValue: "/health"
      },
      {
        flags: "--no-proxy",
        description: "Disable the Traefik route (bring-your-own only)"
      },
      {
        flags: "--restart <policy>",
        description: "Compose restart policy: no, on-failure, unless-stopped, always (bring-your-own only; use no for one-shot jobs)"
      },
      {
        flags: "--image <name>",
        description: "Docker image name instead of building from Dockerfile (for bring-your-own; inference defaults to ollama/ollama)"
      },
      {
        flags: "--port <port>",
        description: "Port for the resource, within its type's range (default: next free port in that range; inference defaults to 11434)"
      },
      {
        flags: "--base-path <path>",
        description: "Base path for frontend routing (e.g., /storefront). Default is /{stack}s. Frontend only."
      },
      {
        flags: "--feature <feature...>",
        description: "Enable a resource feature (for example: prisma, drizzle)"
      },
      {
        flags: "--runtime <id>",
        description: "Agent runtime (for agent only): custom (default)"
      },
      {
        flags: "--durability <kind>",
        description: "Where agent sessions are checkpointed (for agent only): files (default, named volume) or postgres"
      },
      {
        flags: "--ignore-version",
        description: "Continue even if the CLI does not match the project's version requirements",
        defaultValue: false
      },
      {
        flags: "--local",
        description: "Scaffold to run on your computer as a plain process: no Dockerfile, a plain Vite config and a `command` in service.json, so it needs no Docker or Tilt (frontend and backend)",
        defaultValue: false
      },
      {
        flags: "--dry-run",
        description: "Preview the resource and files without writing or reserving a port",
        defaultValue: false
      },
      {
        flags: "--json",
        description: "Print one JSON envelope on stdout; implies --yes",
        defaultValue: false
      }
    ],
    arguments: [
      {
        name: "name",
        description: "Resource name (kebab-case)",
        required: false,
        variadic: false
      }
    ],
    helpTexts: {
      after: [
        "\nExamples:\n  flisk resource api\n  flisk resource api --language python\n  flisk resource jobs --type worker\n  flisk resource api --dry-run"
      ]
    },
    subcommands: []
  },
  {
    name: "runtime",
    path: ["runtime"],
    description: "Inspect the packaged Flisk runtime assets",
    aliases: [],
    hidden: false,
    hasAction: true,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [
      {
        flags: "--check-assets",
        description: "Check bundled engine and template assets"
      },
      {
        flags: "--json",
        description: "Print the check result as JSON"
      }
    ],
    arguments: [],
    helpTexts: {
      after: ["\nExamples:\n  flisk runtime --check-assets\n  flisk runtime --check-assets --json"]
    },
    subcommands: []
  },
  {
    name: "project",
    path: ["project"],
    description: "Initialize or validate project-level master configuration",
    aliases: ["init"],
    hidden: false,
    hasAction: true,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [
      {
        flags: "-y, --yes",
        description: "Skip prompts and confirmations; use defaults",
        defaultValue: false
      },
      {
        flags: "--path <dir>",
        description: "Directory to clone the template into (default: the starter name, or its repository name)"
      },
      {
        flags: "--check",
        description: "Check if master configs exist and are in sync"
      },
      {
        flags: "--force",
        description: "Overwrite existing configuration (dangerous)"
      },
      {
        flags: "--config-file <path>",
        description: "Load project config from existing JSON file"
      },
      {
        flags: "-q, --quiet",
        description: "Only print what fails; used by `flisk demo`",
        defaultValue: false
      },
      {
        flags: "--no-agent-skills",
        description: "Do not write the Flisk agent skills (.claude/skills, .agents/skills) and AGENTS.md"
      },
      {
        flags: "--list",
        description: "List the starter templates (key, repo, description, pinned ref); with --json, a JSON array",
        defaultValue: false
      },
      {
        flags: "--json",
        description: "Print one JSON envelope on stdout; implies --yes and --quiet",
        defaultValue: false
      }
    ],
    arguments: [
      {
        name: "template",
        description: "Clone a starter example instead of a blank project (demo, restaurant, saas, erp, user-management, ecommerce, example, agent-stack, swarm, security, super-agent, langgraph, tool-loop, next-postgres, launch, portal, fullstack)",
        required: false,
        variadic: false
      }
    ],
    helpTexts: {
      after: ["\nExamples:\n  flisk project\n  flisk project demo\n  flisk project --check"]
    },
    subcommands: []
  },
  {
    name: "create",
    path: ["create"],
    description: "Pick what you are building with a few key presses and get a project that runs",
    aliases: [],
    hidden: false,
    hasAction: true,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [
      {
        flags: "-y, --yes",
        description: "Skip prompts and confirmations; use defaults",
        defaultValue: false
      },
      {
        flags: "--starter <name>",
        description: "A ready-made starter project (see flisk project --list)"
      },
      {
        flags: "--runtime <runtime>",
        description: "local (plain processes on your computer; default) or docker (Docker and Tilt)"
      },
      {
        flags: "--frontend <id>",
        description: "Website framework (see flisk resource --frameworks --type frontend), or none"
      },
      {
        flags: "--backend <id>",
        description: "API framework (see flisk resource --frameworks --type backend), or none"
      },
      {
        flags: "--language <id>",
        description: "API language (see flisk resource --help)"
      },
      {
        flags: "--extras <list>",
        description: "Docker runtime: extra parts, comma-separated (worker, queue:nats, database:redis\u2026), or none"
      },
      {
        flags: "--dry-run",
        description: "Print the commands that would run, and stop",
        defaultValue: false
      },
      {
        flags: "--start",
        description: "Install dependencies and start what was written (the local app route; a starter is never started here)",
        defaultValue: false
      }
    ],
    arguments: [
      {
        name: "name",
        description: "Project folder to create (default: my-app)",
        required: false,
        variadic: false
      }
    ],
    helpTexts: {
      after: [
        "\nExamples:\n  flisk create\n  flisk create my-app --yes --start\n  flisk create shop --frontend react --backend hono\n  flisk create api --runtime docker --extras worker,queue:nats\n  flisk create --dry-run"
      ]
    },
    subcommands: []
  },
  {
    name: "tool",
    path: ["tool"],
    description: "Add or list tools by name: flisk tool add react, postgresql, fastapi, rag (cloud is rejected); list with flisk tool list",
    aliases: [],
    hidden: false,
    hasAction: false,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [],
    arguments: [],
    helpTexts: {
      after: ["\nExamples:\n  flisk tool list\n  flisk tool add\n  flisk tool add react"]
    },
    subcommands: [
      {
        name: "list",
        path: ["tool", "list"],
        description: "List every tool in the catalogue",
        aliases: [],
        hidden: false,
        hasAction: true,
        allowUnknown: false,
        passThrough: false,
        positionalOptions: false,
        allowExcessArguments: false,
        options: [
          {
            flags: "--json",
            description: "Print one JSON envelope on stdout",
            defaultValue: false
          }
        ],
        arguments: [],
        helpTexts: {
          after: ["\nExamples:\n  flisk tool list\n  flisk tool list --json"]
        },
        subcommands: []
      },
      {
        name: "add",
        path: ["tool", "add"],
        description: "Add a tool by name (react, postgresql, fastapi, rag\u2026); cloud providers are rejected",
        aliases: [],
        hidden: false,
        hasAction: true,
        allowUnknown: false,
        passThrough: false,
        positionalOptions: false,
        allowExcessArguments: false,
        options: [
          {
            flags: "-y, --yes",
            description: "Skip prompts and confirmations; use defaults",
            defaultValue: false
          },
          {
            flags: "-s, --stack <stack>",
            description: "Stack to assign the resource to (default: as flisk resource picks it)"
          },
          {
            flags: "--dry-run",
            description: "Preview the resource without writing files or reserving a port",
            defaultValue: false
          },
          {
            flags: "--json",
            description: "Print one JSON envelope on stdout; implies --yes",
            defaultValue: false
          }
        ],
        arguments: [
          {
            name: "tool-and-name",
            description: "The tool (one or more words, for example react or spring boot), then an optional resource name (default per tool: web, server, db\u2026); use flisk tool list to browse the catalogue",
            required: false,
            variadic: true
          }
        ],
        helpTexts: {
          after: [
            "\nExamples:\n  flisk tool list\n  flisk tool add react\n  flisk tool add postgresql\n  flisk tool add fastapi orders-api --stack shop\n  flisk tool add spring boot\n  flisk tool add rag --dry-run"
          ]
        },
        subcommands: []
      }
    ]
  },
  {
    name: "config",
    path: ["config"],
    description: "Manage project configuration and regenerate master files",
    aliases: [],
    hidden: false,
    hasAction: false,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [],
    arguments: [],
    helpTexts: {},
    subcommands: [
      {
        name: "regenerate",
        path: ["config", "regenerate"],
        description: "Regenerate all 4 master config files from .flisk/project.json",
        aliases: [],
        hidden: false,
        hasAction: true,
        allowUnknown: false,
        passThrough: false,
        positionalOptions: false,
        allowExcessArguments: false,
        options: [
          {
            flags: "--dry-run",
            description: "Show what would change without writing files"
          },
          {
            flags: "--ignore-version",
            description: "Continue even if the CLI does not match the project's version requirements",
            defaultValue: false
          },
          {
            flags: "--json",
            description: "Print one JSON envelope on stdout with each master file's change (new, modified, unchanged)",
            defaultValue: false
          }
        ],
        arguments: [],
        helpTexts: {},
        subcommands: []
      },
      {
        name: "migrate",
        path: ["config", "migrate"],
        description: "Migrate service.json files to the current schema version",
        aliases: [],
        hidden: false,
        hasAction: true,
        allowUnknown: false,
        passThrough: false,
        positionalOptions: false,
        allowExcessArguments: false,
        options: [
          {
            flags: "--ignore-version",
            description: "Continue even if the CLI does not match the project's version requirements",
            defaultValue: false
          },
          {
            flags: "--json",
            description: "Print one JSON envelope on stdout with the migrated files",
            defaultValue: false
          }
        ],
        arguments: [],
        helpTexts: {
          after: ["\nExamples:\n  flisk config migrate\n  flisk config migrate --json"]
        },
        subcommands: []
      },
      {
        name: "verify",
        path: ["config", "verify"],
        description: "Verify that generated files match .flisk/project.json",
        aliases: [],
        hidden: false,
        hasAction: true,
        allowUnknown: false,
        passThrough: false,
        positionalOptions: false,
        allowExcessArguments: false,
        options: [
          {
            flags: "--ignore-version",
            description: "Continue even if the CLI does not match the project's version requirements",
            defaultValue: false
          },
          {
            flags: "--json",
            description: "Emit a machine-readable verification report"
          }
        ],
        arguments: [],
        helpTexts: {
          after: ["\nExamples:\n  flisk config verify\n  flisk config verify --json"]
        },
        subcommands: []
      },
      {
        name: "explain",
        path: ["config", "explain"],
        description: "Explain whether a project file is Flisk-generated and what editing it does on flisk up",
        aliases: [],
        hidden: false,
        hasAction: true,
        allowUnknown: false,
        passThrough: false,
        positionalOptions: false,
        allowExcessArguments: false,
        options: [
          {
            flags: "--json",
            description: "Emit a machine-readable explanation"
          }
        ],
        arguments: [
          {
            name: "file",
            description: "Project file to explain, relative to the current directory or absolute",
            required: true,
            variadic: false
          }
        ],
        helpTexts: {
          after: [
            "\nExamples:\n  flisk config explain Tiltfile\n  flisk config explain services/orders-api/service.json\n  flisk config explain Tiltfile --json"
          ]
        },
        subcommands: []
      },
      {
        name: "edit",
        path: ["config", "edit"],
        description: "Open .flisk/project.json in your $EDITOR",
        aliases: [],
        hidden: false,
        hasAction: true,
        allowUnknown: false,
        passThrough: false,
        positionalOptions: false,
        allowExcessArguments: false,
        options: [],
        arguments: [],
        helpTexts: {},
        subcommands: []
      },
      {
        name: "enable-infra",
        path: ["config", "enable-infra"],
        description: "Enable optional infrastructure service",
        aliases: [],
        hidden: false,
        hasAction: true,
        allowUnknown: false,
        passThrough: false,
        positionalOptions: false,
        allowExcessArguments: false,
        options: [
          {
            flags: "--ignore-version",
            description: "Continue even if the CLI does not match the project's version requirements",
            defaultValue: false
          },
          {
            flags: "--json",
            description: "Print one JSON envelope on stdout with the service and its previous state",
            defaultValue: false
          }
        ],
        arguments: [
          {
            name: "service",
            description: "Service name (monitoring, elk, debezium, golden_image, verdaccio)",
            required: true,
            variadic: false
          }
        ],
        helpTexts: {},
        subcommands: []
      },
      {
        name: "disable-infra",
        path: ["config", "disable-infra"],
        description: "Disable optional infrastructure service",
        aliases: [],
        hidden: false,
        hasAction: true,
        allowUnknown: false,
        passThrough: false,
        positionalOptions: false,
        allowExcessArguments: false,
        options: [
          {
            flags: "--ignore-version",
            description: "Continue even if the CLI does not match the project's version requirements",
            defaultValue: false
          },
          {
            flags: "--json",
            description: "Print one JSON envelope on stdout with the service and its previous state",
            defaultValue: false
          }
        ],
        arguments: [
          {
            name: "service",
            description: "Service name (monitoring, elk, debezium, golden_image, verdaccio)",
            required: true,
            variadic: false
          }
        ],
        helpTexts: {},
        subcommands: []
      }
    ]
  },
  {
    name: "ui",
    path: ["ui"],
    description: "Terminal dashboard to watch and manage your stacks and services",
    aliases: ["interactive"],
    hidden: false,
    hasAction: true,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [
      {
        flags: "-v, --verbose",
        description: "Enable verbose output",
        defaultValue: false
      },
      {
        flags: "--no-animations",
        description: "Disable animations"
      },
      {
        flags: "--high-contrast",
        description: "Enable high contrast mode"
      }
    ],
    arguments: [],
    helpTexts: {
      after: ["\nExamples:\n  flisk ui\n  flisk ui --high-contrast\n  flisk ui --no-animations"]
    },
    subcommands: []
  },
  {
    name: "os",
    path: ["os"],
    description: "Start FliskOS, the local desktop app for your Flisk projects, coding agents and Flisk apps",
    aliases: [],
    hidden: false,
    hasAction: true,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [
      {
        flags: "--project <dir>",
        description: "Open this Flisk project (default: the project around the current folder)"
      },
      {
        flags: "--port <port>",
        description: "Port FliskOS listens on (default: a free one)"
      },
      {
        flags: "--no-open",
        description: "Start the server without opening a window or browser"
      },
      {
        flags: "--scan-root <dir>",
        description: "Also look for Flisk projects under this folder (repeatable)"
      },
      {
        flags: "--json",
        description: "Print one JSON envelope on stdout once FliskOS is up; FliskOS keeps running until it stops",
        defaultValue: false
      }
    ],
    arguments: [],
    helpTexts: {
      after: [
        "\nRuns the `fliskos` command when it is on PATH, otherwise opens FliskOS.app (macOS). Flisk never\ninstalls it: @flisk-sh/fliskos (npm install --global @flisk-sh/fliskos) or https://github.com/flisk-sh/fliskos.\nFliskOS.app takes none of the options. For a terminal dashboard of the running stack use `flisk ui`.\n"
      ]
    },
    subcommands: []
  },
  {
    name: "version",
    path: ["version"],
    description: "Display version number",
    aliases: ["v"],
    hidden: false,
    hasAction: true,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [
      {
        flags: "-v, --verbose",
        description: "Display verbose version with build commit SHA",
        defaultValue: false
      },
      {
        flags: "--json",
        description: "Output a versioned JSON envelope",
        defaultValue: false
      }
    ],
    arguments: [],
    helpTexts: {},
    subcommands: []
  },
  {
    name: "maintainers",
    path: ["maintainers"],
    description: "Maintainer file checks",
    aliases: [],
    hidden: false,
    hasAction: false,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [],
    arguments: [],
    helpTexts: {},
    subcommands: [
      {
        name: "check",
        path: ["maintainers", "check"],
        description: "Check MAINTAINERS.md lists 3 maintainers from 2 companies (a gate, not a claim of eligibility)",
        aliases: [],
        hidden: false,
        hasAction: true,
        allowUnknown: false,
        passThrough: false,
        positionalOptions: false,
        allowExcessArguments: false,
        options: [],
        arguments: [
          {
            name: "file",
            description: "maintainers file",
            required: false,
            variadic: false,
            defaultValue: "MAINTAINERS.md"
          }
        ],
        helpTexts: {},
        subcommands: []
      }
    ]
  },
  {
    name: "doctor",
    path: ["doctor"],
    description: "Check environment readiness for Flisk",
    aliases: [],
    hidden: false,
    hasAction: true,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [
      {
        flags: "--all",
        description: "Run every check and show Machine and Project sections with a summary",
        defaultValue: false
      },
      {
        flags: "--json",
        description: "Output a versioned JSON readiness report",
        defaultValue: false
      },
      {
        flags: "--no-ping",
        description: "Skip pinging running services' /health endpoints"
      },
      {
        flags: "--no-gateway",
        description: "Skip gateway checks (ports 80/443)"
      },
      {
        flags: "--no-database",
        description: "Skip database capability checks"
      },
      {
        flags: "--strict",
        description: "Fail warnings such as a WSL project under /mnt/c"
      },
      {
        flags: "--fix",
        description: "Repair this project's unused Docker networks and leftover doctor probes",
        defaultValue: false
      },
      {
        flags: "--dry-run",
        description: "With --fix: list the repairs without changing anything",
        defaultValue: false
      },
      {
        flags: "--scope <scope>",
        description: "With --fix: project (default) or machine, which also removes unused networks of other Flisk projects",
        defaultValue: "project"
      },
      {
        flags: "-y, --yes",
        description: "With --fix: apply every repair without asking",
        defaultValue: false
      },
      {
        flags: "--ping-timeout <ms>",
        description: "Per-service ping timeout in milliseconds",
        defaultValue: "5000"
      }
    ],
    arguments: [],
    helpTexts: {
      after: [
        "\nExamples:\n  flisk doctor\n  flisk doctor --all\n  flisk doctor --fix --dry-run\n  flisk doctor --json"
      ]
    },
    subcommands: []
  },
  {
    name: "completion",
    path: ["completion"],
    description: "Generate shell completion scripts",
    aliases: [],
    hidden: false,
    hasAction: true,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [
      {
        flags: "-s, --shell <shell>",
        description: "Target shell (bash, zsh, fish, powershell)"
      },
      {
        flags: "-o, --output <path>",
        description: "Output file path (default: stdout)"
      },
      {
        flags: "--install",
        description: "Install completion; prints any shell configuration steps still needed"
      }
    ],
    arguments: [
      {
        name: "shell",
        description: "Target shell (bash, zsh, fish, powershell)",
        required: false,
        variadic: false
      }
    ],
    helpTexts: {
      after: [
        "\nExamples:\n  flisk completion zsh --install\n  flisk completion bash --install\n  flisk completion fish --install"
      ]
    },
    subcommands: []
  },
  {
    name: "upgrade",
    path: ["upgrade"],
    description: "Upgrade Flisk CLI to the latest version",
    aliases: ["update"],
    hidden: false,
    hasAction: true,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [
      {
        flags: "-y, --yes",
        description: "Skip prompts and confirmations; use defaults",
        defaultValue: false
      },
      {
        flags: "-f, --force",
        description: "Upgrade even if already on the latest version",
        defaultValue: false
      },
      {
        flags: "--all",
        description: "Upgrade every Flisk installation found on PATH",
        defaultValue: false
      },
      {
        flags: "--dry-run",
        description: "Show what would be upgraded without actually doing it",
        defaultValue: false
      },
      {
        flags: "--json",
        description: "Print the dry-run result as a JSON envelope",
        defaultValue: false
      }
    ],
    arguments: [],
    helpTexts: {
      after: [
        "\nExamples:\n  flisk upgrade\n  flisk upgrade --dry-run\n  flisk upgrade --dry-run --json\n  flisk upgrade --all"
      ]
    },
    subcommands: []
  },
  {
    name: "networks",
    path: ["networks"],
    description: "Show Traefik-routed URLs for all services",
    aliases: ["urls", "traefik"],
    hidden: false,
    hasAction: true,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: true,
    options: [
      {
        flags: "-s, --stack <stack>",
        description: "Filter by stack name"
      },
      {
        flags: "--json",
        description: "Output a versioned JSON response"
      },
      {
        flags: "--json-legacy",
        description: "Output the legacy JSON array (deprecated)"
      },
      {
        flags: "--raw",
        description: "Output raw URLs only"
      }
    ],
    arguments: [],
    helpTexts: {},
    subcommands: []
  },
  {
    name: "agent",
    path: ["agent"],
    description: "Inspect and operate AI agent resources",
    aliases: [],
    hidden: false,
    hasAction: false,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [],
    arguments: [],
    helpTexts: {
      after: [
        "\nExamples:\n  flisk agent list\n  flisk agent list --json\n  flisk agent sessions <resource>"
      ]
    },
    subcommands: [
      {
        name: "list",
        path: ["agent", "list"],
        description: "List AI agent resources in the project",
        aliases: [],
        hidden: false,
        hasAction: true,
        allowUnknown: false,
        passThrough: false,
        positionalOptions: false,
        allowExcessArguments: false,
        options: [
          {
            flags: "-v, --verbose",
            description: "Show detailed information about each agent resource",
            defaultValue: false
          },
          {
            flags: "-s, --stack <stack>",
            description: "Filter agent resources by stack name"
          },
          {
            flags: "--no-stack",
            description: "Show only agent resources without a stack"
          },
          {
            flags: "--ports",
            description: "Show port assignments",
            defaultValue: false
          },
          {
            flags: "--json",
            description: "Output one JSON object and exit",
            defaultValue: false
          }
        ],
        arguments: [],
        helpTexts: {
          after: [
            "\nExamples:\n  flisk agent list\n  flisk agent list --stack shop\n  flisk agent list --json"
          ]
        },
        subcommands: []
      },
      {
        name: "sessions",
        path: ["agent", "sessions"],
        description: "List the sessions of a running AI agent resource, or inspect one session's checkpoint",
        aliases: [],
        hidden: false,
        hasAction: true,
        allowUnknown: false,
        passThrough: false,
        positionalOptions: false,
        allowExcessArguments: false,
        options: [
          {
            flags: "--session-id <id>",
            description: "Session ID to fetch; without it, list all sessions"
          },
          {
            flags: "--watch",
            description: "Refresh the output every 2 seconds until interrupted",
            defaultValue: false
          },
          {
            flags: "--json",
            description: "Output one JSON object and exit",
            defaultValue: false
          }
        ],
        arguments: [
          {
            name: "resource",
            description: "",
            required: true,
            variadic: false
          }
        ],
        helpTexts: {},
        subcommands: []
      }
    ]
  },
  {
    name: "restart",
    path: ["restart"],
    description: "Restart a running resource in the stack",
    aliases: [],
    hidden: false,
    hasAction: true,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [
      {
        flags: "--port <n>",
        description: "Tilt UI port (default: TILT_PORT or 10350)"
      },
      {
        flags: "--rebuild",
        description: "Rebuild the image through Tilt instead of restarting the container",
        defaultValue: false
      },
      {
        flags: "--project <path>",
        description: "Restart resources for the Flisk project in this folder (default: the current project)"
      },
      {
        flags: "--wait <seconds>",
        description: "Local processes: how long to wait for the service to be ready again (0: return once the restart has begun)",
        defaultValue: "60"
      },
      {
        flags: "--json",
        description: "Output one JSON object and exit",
        defaultValue: false
      }
    ],
    arguments: [
      {
        name: "resource",
        description: "Name of the resource (service) to restart",
        required: true,
        variadic: false
      }
    ],
    helpTexts: {
      after: [
        "\nExamples:\n  flisk restart orders-api\n  flisk restart orders-api --json\n  flisk restart orders-api --rebuild"
      ]
    },
    subcommands: []
  },
  {
    name: "run",
    path: ["run"],
    description: "Run a one-off command with the environment a service has in the stack",
    aliases: [],
    hidden: false,
    hasAction: true,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [
      {
        flags: "--json",
        description: "Run without input and print one JSON object with the exit code and the output",
        defaultValue: false
      }
    ],
    arguments: [
      {
        name: "service",
        description: "Name of the service whose environment the command gets",
        required: true,
        variadic: false
      },
      {
        name: "command",
        description: "The command and its arguments, after --",
        required: false,
        variadic: true
      }
    ],
    helpTexts: {
      after: [
        "\nExamples:\n  flisk run orders-api -- printenv DATABASE_URL\n  flisk run orders-api -- bun run seed\n  flisk run orders-api -- sh"
      ]
    },
    subcommands: []
  },
  {
    name: "distribute",
    path: ["distribute"],
    description: "How an app gets to its users: board, listing kit and channel status (local files only)",
    aliases: [],
    hidden: false,
    hasAction: false,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [],
    arguments: [],
    helpTexts: {},
    subcommands: [
      {
        name: "board",
        path: ["distribute", "board"],
        description: "Print the Zachman board: six perspectives (Planner to User) by six questions, each cell read from service.json or distribution.json",
        aliases: [],
        hidden: false,
        hasAction: true,
        allowUnknown: false,
        passThrough: false,
        positionalOptions: false,
        allowExcessArguments: false,
        options: [
          {
            flags: "--json",
            description: "Output the board as a versioned JSON envelope",
            defaultValue: false
          }
        ],
        arguments: [],
        helpTexts: {},
        subcommands: []
      },
      {
        name: "kit",
        path: ["distribute", "kit"],
        description: "Write a listing kit for one resource (plugin.json, .mcp.json, server.json, listing.md)",
        aliases: [],
        hidden: false,
        hasAction: true,
        allowUnknown: false,
        passThrough: false,
        positionalOptions: false,
        allowExcessArguments: false,
        options: [
          {
            flags: "--out <dir>",
            description: "Folder to write the kit to (default: distribution/<resource>)"
          },
          {
            flags: "--dry-run",
            description: "Print the kit and write nothing",
            defaultValue: false
          },
          {
            flags: "--force",
            description: "Overwrite an existing kit",
            defaultValue: false
          }
        ],
        arguments: [
          {
            name: "resource",
            description: "Resource name",
            required: true,
            variadic: false
          }
        ],
        helpTexts: {
          after: [
            "\nExamples:\n  flisk distribute kit my-resource --dry-run\n  flisk distribute kit my-resource --out ./listing\n  flisk distribute kit my-resource --force"
          ]
        },
        subcommands: []
      },
      {
        name: "status",
        path: ["distribute", "status"],
        description: "Print the channel grid from distribution.json",
        aliases: [],
        hidden: false,
        hasAction: true,
        allowUnknown: false,
        passThrough: false,
        positionalOptions: false,
        allowExcessArguments: false,
        options: [
          {
            flags: "--json",
            description: "Output the grid as a versioned JSON envelope",
            defaultValue: false
          },
          {
            flags: "--init",
            description: "Write an empty distribution.json for the project's resources",
            defaultValue: false
          },
          {
            flags: "--force",
            description: "With --init, add missing apps and channels to an existing distribution.json, keeping its entries",
            defaultValue: false
          }
        ],
        arguments: [],
        helpTexts: {},
        subcommands: []
      }
    ]
  },
  {
    name: "repos",
    path: ["repos"],
    description: "Clone the Git repositories listed in .flisk/project.json",
    aliases: [],
    hidden: false,
    hasAction: false,
    allowUnknown: false,
    passThrough: false,
    positionalOptions: false,
    allowExcessArguments: false,
    options: [],
    arguments: [],
    helpTexts: {},
    subcommands: [
      {
        name: "clone",
        path: ["repos", "clone"],
        description: "Clone missing service repositories configured in .flisk/project.json",
        aliases: [],
        hidden: false,
        hasAction: true,
        allowUnknown: false,
        passThrough: false,
        positionalOptions: false,
        allowExcessArguments: false,
        options: [
          {
            flags: "--json",
            description: "Output JSON result",
            defaultValue: false
          }
        ],
        arguments: [],
        helpTexts: {
          after: [
            '\nEach entry of "repos" in .flisk/project.json has url, dir (relative to the project root), and optional branch.\nExisting directories are left untouched. flisk up also clones missing repositories.\n\nExamples:\n  flisk repos clone\n  flisk repos clone --json\n\nDocs: https://github.com/flisk-sh/flisk/blob/main/docs/layout.md'
          ]
        },
        subcommands: []
      }
    ]
  }
];

// dist/commands/command-specs.js
import { readFileSync as readFileSync2 } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
function validateCheapArguments(spec, args, options) {
  if (spec.path.join(" ") !== "resource")
    return;
  const name = args[0];
  if (typeof name !== "string")
    return;
  if (options.path || options.resourcePath || options.frameworks || options.basePath)
    return;
  if (options.json === true || options.yes !== true)
    return;
  const validation = validateResourceName(name);
  if (validation.valid)
    return;
  const root = findProjectRoot();
  if (root && projectHasVersionPin(root))
    return;
  showCommandHeader("Resource Creation");
  showErrorAndExit(validation.error ?? "Validation failed");
}
function projectHasVersionPin(root) {
  try {
    const text = readFileSync2(join(root, ".flisk", "project.json"), "utf8");
    const config = JSON.parse(text);
    return typeof config.pinnedFliskVersion === "string" || typeof config.minFliskVersion === "string";
  } catch {
    return false;
  }
}
function buildCommand(spec, run) {
  const command = new Command(spec.name);
  command.description(spec.description);
  for (const alias of spec.aliases)
    command.alias(alias);
  if (spec.hidden)
    command._hidden = true;
  if (spec.helpOptionDisabled)
    command.helpOption(false);
  else if (spec.helpOption)
    command.helpOption(spec.helpOption.flags, spec.helpOption.description);
  if (spec.allowUnknown)
    command.allowUnknownOption();
  if (spec.passThrough)
    command.passThroughOptions();
  if (spec.positionalOptions)
    command.enablePositionalOptions();
  if (!spec.allowExcessArguments)
    command.allowExcessArguments(false);
  if (spec.showHelpAfterError)
    command.showHelpAfterError(spec.showHelpAfterError);
  if (spec.path.length === 1 && spec.name in NO_POSITIONAL_HINTS) {
    attachNoPositionalHint(command, spec.name);
  } else {
    routeUsageErrorsToJson(command);
  }
  for (const option of spec.options) {
    const added = command.createOption(option.flags, option.description);
    if (option.defaultValue !== void 0) {
      added.default(option.defaultValue);
    }
    if (option.mandatory)
      added.makeOptionMandatory();
    if (option.argChoices)
      added.choices(option.argChoices);
    if (option.envVar)
      added.env(option.envVar);
    if (option.hidden)
      added.hideHelp(true);
    if (option.presetArg !== void 0)
      added.preset(option.presetArg);
    command.addOption(added);
  }
  for (const argument of spec.arguments) {
    const name = argument.required ? `<${argument.name}${argument.variadic ? "..." : ""}>` : `[${argument.name}${argument.variadic ? "..." : ""}]`;
    const built = command.createArgument(name, argument.description);
    if (argument.defaultValue !== void 0)
      built.default(argument.defaultValue);
    if (argument.argChoices)
      built.choices(argument.argChoices);
    command.addArgument(built);
  }
  for (const [position, texts] of Object.entries(spec.helpTexts)) {
    if (!["beforeAll", "before", "after", "afterAll"].includes(position))
      continue;
    for (const text of texts) {
      command.addHelpText(position, text);
    }
  }
  for (const sub of spec.subcommands)
    command.addCommand(buildCommand(sub, run));
  if (spec.hasAction) {
    command.action(async (...actionArgs) => {
      const options = actionArgs[spec.arguments.length] ?? {};
      validateCheapArguments(spec, actionArgs.slice(0, spec.arguments.length), options);
      await run(spec);
    });
  }
  return command;
}
function createSpecProgram(specs, run) {
  const program2 = routeUsageErrorsToJson(createRootProgram());
  for (const spec of specs) {
    program2.addCommand(buildCommand(spec, run));
  }
  return program2;
}

// dist/utils/demo-args.js
var VALUE_OPTIONS = /* @__PURE__ */ new Set(["--template", "--project"]);
var KNOWN_OPTIONS = /* @__PURE__ */ new Set([
  ...VALUE_OPTIONS,
  "-h",
  "--help",
  "--keep",
  "-y",
  "--yes",
  "--no-docker",
  "--verbose",
  "-v",
  "--version"
]);
function parseDemoRootOptions(argv) {
  const result = { keep: false, help: false, yes: false };
  const args = argv.slice(2);
  let index = 0;
  const first = args[0];
  if (first && !first.startsWith("-") && first in PROJECT_TEMPLATES) {
    result.template = first;
    index = 1;
  }
  for (; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === void 0 || arg === "--")
      break;
    if (!arg.startsWith("-"))
      break;
    const equals = arg.indexOf("=");
    const name = equals === -1 ? arg : arg.slice(0, equals);
    if (!KNOWN_OPTIONS.has(name) && result.unknownOption === void 0) {
      result.unknownOption = name;
    }
    if (name === "-h" || name === "--help")
      result.help = true;
    else if (name === "--keep")
      result.keep = true;
    else if (name === "--yes" || name === "-y")
      result.yes = true;
    else if (VALUE_OPTIONS.has(name)) {
      let value;
      if (equals !== -1)
        value = arg.slice(equals + 1);
      else {
        value = args[index + 1];
        if (value !== void 0 && !value.startsWith("-"))
          index += 1;
        else if (value?.startsWith("-"))
          value = "";
      }
      if (name === "--template") {
        if (!result.template && value)
          result.template = value;
      } else {
        result.project = value;
        result.projectError = projectDestinationError(value);
      }
    }
  }
  return result;
}
function projectDestinationError(value) {
  if (value === void 0 || value.trim() === "") {
    return "--project needs a directory, for example --project=my-stack.";
  }
  if (value.startsWith("-")) {
    return `--project "${value}" looks like an option, not a directory.`;
  }
  if (value.includes("\0"))
    return "--project contains an invalid character.";
  return void 0;
}
function tiltWatchPorts(saved, env = process.env) {
  const configured = Number.parseInt(env.TILT_PORT ?? "", 10);
  const ports = [configured, saved ?? Number.NaN];
  for (let offset = 0; offset < 10; offset += 1)
    ports.push(10350 + offset);
  return [...new Set(ports.filter((port) => Number.isInteger(port) && port > 0 && port < 65536))];
}

// dist/utils/help-command.js
function resolveHelpTarget(args, commands) {
  const rest = args.slice(args.findIndex((arg) => !arg.startsWith("-")));
  if (args.length === 0 || args.every((arg) => arg.startsWith("-")) || rest[0] !== "help") {
    return { depth: 0 };
  }
  const targets = [];
  for (const arg of rest.slice(1)) {
    if (arg.startsWith("-"))
      break;
    targets.push(arg);
  }
  if (targets.length === 0)
    return { depth: 0 };
  let pool = commands;
  let current;
  for (const target of targets) {
    const match = pool.find((command) => command.name() === target || command.aliases().includes(target));
    if (!match)
      return { unknown: target, depth: targets.length };
    current = match;
    pool = match.commands;
  }
  return { command: current, depth: targets.length };
}

// dist/cli.js
var program = createSpecProgram(COMMAND_SPECS, async (spec) => {
  const { runLazyCommand } = await import("./lazy-command-AV7DLNSV.js");
  await runLazyCommand(spec, process.argv.slice(2));
});
if (process.argv.length === 2) {
  const { formatColdPreflight, runColdPreflight } = await import("./cold-preflight-6GVMXA7D.js");
  const result = await runColdPreflight();
  console.log(formatColdPreflight(result));
  console.log("\nCommands: flisk doctor | flisk project --yes | flisk --help");
  console.log("\nOne command from scratch (clones, boots and opens the browser):");
  console.log(`  npx -y @flisk-sh/flisk@latest demo   (no Docker? it runs a small demo as local processes)`);
  console.log(`  npx -y @flisk-sh/flisk@latest restaurant --project=my-stack`);
  process.exit(result.ok ? 0 : 1);
}
var rootOptions = parseDemoRootOptions(process.argv);
var templateArg = rootOptions.template;
var projectArg = rootOptions.project;
if (templateArg && rootOptions.help) {
  if (templateArg === "demo")
    showDemoHelp();
  else
    showHelp();
  process.exit(0);
}
if (templateArg && rootOptions.unknownOption) {
  console.error(source_default.red(`error: unknown option '${rootOptions.unknownOption}'`));
  process.exit(1);
}
if (templateArg && rootOptions.projectError) {
  console.error(source_default.red(`\u274C ${rootOptions.projectError}`));
  process.exit(1);
}
if (templateArg === "demo") {
  const { staleVersionNotice } = await import("./latest-version-RFOKAXJO.js");
  const staleNotice = await staleVersionNotice(package_default.version);
  if (staleNotice)
    console.log(source_default.yellow(staleNotice));
  const { NATIVE_DEMO_DIR, nativeDemoReason, runNativeDemo } = await import("./native-demo-3YIRPLAL.js");
  const { cliInvocation } = await import("./cli-invocation-SWX245SU.js");
  const { currentDockerContext: currentDockerContext2 } = await import("./container-engine-H4AMLHYR.js");
  const reason = await nativeDemoReason({
    argv: process.argv,
    platform: process.platform,
    env: process.env,
    kiriContext: currentDockerContext2(homedir2(), (path) => readFileSync3(path, "utf8"))
  });
  if (reason) {
    const destination = projectArg ? resolve(cwd(), projectArg) : join2(homedir2(), ".flisk", NATIVE_DEMO_DIR);
    process.exit(await runNativeDemo({
      destination,
      invocation: cliInvocation(),
      reason,
      version: package_default.version
    }));
  }
}
if (templateArg) {
  const { nativeWindowsStackRefusal } = await import("./native-windows-Z3UUEH6P.js");
  const platformRefusal = nativeWindowsStackRefusal(process.platform, process.env.FLISK_ALLOW_NATIVE_WINDOWS);
  if (platformRefusal) {
    console.error(source_default.red(`\u274C ${platformRefusal}`));
    console.error(source_default.gray("   Run it from Ubuntu in WSL2. Guide: docs/start-here-on-windows.md (reference: docs/wsl2.md)"));
    process.exit(1);
  }
  const { cloneProjectTemplate, exitUnknownTemplate } = await import("./project-YGGX77ZB.js");
  const { PROJECT_TEMPLATES: PROJECT_TEMPLATES2, templateTargetDir } = await import("./project-templates-U5YJ4BRH.js");
  if (!Object.hasOwn(PROJECT_TEMPLATES2, templateArg)) {
    exitUnknownTemplate(templateArg);
  }
  const { assertMachineReadyOrExit } = await import("./cold-preflight-6GVMXA7D.js");
  await assertMachineReadyOrExit({ scope: "scaffold" });
  const { nextAvailableProjectDir } = await import("./one-command-FELAAZ6Y.js");
  const { listFrontendTargets, pickReadyFrontend } = await import("./open-K6R33N56.js");
  const { discoverResourcesWithProblems } = await import("./services-EBAZXZGC.js");
  const { openUrl } = await import("./url-actions-3C6UQX5F.js");
  const { createDemoStage } = await import("./demo-stage-UAGZZNW7.js");
  const { foldersSharingProjectName, markDemoFolder, readProjectName, removeProjectVolumes, sharedNameRefusal, sharedNameUnreadableRefusal, shouldMarkDemoFolder, stopDemoStack, tryListStaleProjectVolumes } = await import("./demo-reset-OMHMY773.js");
  const baseName = templateTargetDir(templateArg, projectArg);
  const fixedDir = projectArg ? void 0 : PROJECT_TEMPLATES2[templateArg]?.fixedDir;
  const keep = rootOptions.keep;
  let targetName;
  if (fixedDir) {
    targetName = join2(homedir2(), ".flisk", fixedDir);
  } else {
    targetName = nextAvailableProjectDir(baseName, (candidate) => {
      const path = resolve(cwd(), candidate);
      return existsSync(path) && readdirSync(path).length > 0;
    });
    if (targetName !== baseName) {
      console.log(source_default.gray(`The folder ${baseName} is taken, using ${targetName} instead.`));
    }
  }
  const destination = isAbsolute(targetName) ? targetName : resolve(cwd(), targetName);
  console.log(source_default.gray(`\u{1F4C1} Demo folder: ${destination}`));
  let reused = false;
  if (fixedDir && existsSync(destination)) {
    if (!existsSync(join2(destination, ".flisk", "project.json"))) {
      console.log(source_default.yellow(`${destination} already exists and is not a Flisk project.`));
      console.log(source_default.gray("  Remove it, or use --project <dir> to put the demo somewhere else."));
      process.exit(1);
    }
    const running = await pickReadyFrontend(await listFrontendTargets(destination), 0);
    if (running && await isStackFullyReady(destination)) {
      console.log(source_default.gray(`The demo is already running: ${running.url}`));
      await openUrl(running.url);
      process.exit(0);
    }
    try {
      await stopDemoStack(destination);
    } catch (error) {
      console.error(source_default.red(`\u274C Could not stop the previous demo stack: ${error.message}`));
      console.error(source_default.gray(`   Run \`flisk down\` in ${destination}, then run the demo again. Nothing was deleted.`));
      process.exit(1);
    }
    if (keep) {
      reused = true;
    } else {
      if (!await confirmDemoRemoval(destination, rootOptions.yes)) {
        console.log(source_default.gray("Nothing was deleted. Use --keep to reuse the folder."));
        process.exit(1);
      }
      rmSync(destination, { recursive: true, force: true });
    }
  }
  const { checkColima } = await import("./colima-C4AD6UXV.js");
  const colima = checkColima();
  if (colima.isColima && !colima.running) {
    console.log(source_default.yellow(colima.problem ?? "The Colima VM is not running."));
    console.log(source_default.gray(`  Fix: ${colima.fix ?? "colima start"}`));
    process.exit(1);
  }
  let phases = [
    {
      id: "fetch",
      label: reused ? "Reusing the demo" : "Fetching the demo",
      status: "pending"
    },
    { id: "config", label: "Generating project config", status: "pending" },
    { id: "deps", label: "Installing dependencies", status: "pending" },
    { id: "start", label: "Starting services", status: "pending" }
  ];
  const stage = createDemoStage({
    title: "Flisk demo",
    subtitle: `${templateArg} starter`,
    phases,
    servicesReady: 0,
    servicesTotal: 0,
    servicesBuilding: 0,
    elapsedMs: 0
  });
  const setPhase = (id, status, elapsedMs) => {
    phases = phases.map((phase) => phase.id === id ? { ...phase, status, elapsedMs: elapsedMs ?? phase.elapsedMs } : phase);
    stage.update({ phases });
  };
  const logLines = [`flisk ${package_default.version} ${templateArg}`, `cwd: ${destination}`];
  setPhase("fetch", "active");
  const fetchStarted = Date.now();
  try {
    if (!reused) {
      await cloneProjectTemplate(templateArg, targetName, [], { quiet: true });
    }
  } catch (error) {
    stage.fail(error instanceof Error ? error.message : String(error), "Check that git is installed and that you are online, then run the command again.");
    stage.stop();
    process.exit(1);
  }
  const { ensureGlobalInstall } = await import("./cli-command-P2KRPG6Q.js");
  const { cliInvocation } = await import("./cli-invocation-SWX245SU.js");
  const install = ensureGlobalInstall();
  setPhase("fetch", "done", Date.now() - fetchStarted);
  const invocation = cliInvocation();
  if (!existsSync(destination)) {
    stage.fail("The demo could not find the project folder.", "Reinstall the Flisk CLI package and run the command again.");
    stage.stop();
    process.exit(1);
  }
  const { initializeProject, installServiceDependencies, runStackQuiet } = await import("./one-command-FELAAZ6Y.js");
  const configStarted = Date.now();
  setPhase("config", "active");
  const setup = await initializeProject(invocation, destination);
  logLines.push("--- project setup ---", setup.output ?? "");
  if (!setup.ok) {
    const logPath = writeLog(logLines);
    stage.fail(setup.error ?? "The project setup did not finish.", "Run `flisk project --yes` in the project folder to see what it printed.", logPath);
    stage.stop();
    process.exit(1);
  }
  setPhase("config", "done", Date.now() - configStarted);
  if (shouldMarkDemoFolder(templateArg, reused))
    markDemoFolder(destination);
  if (!reused) {
    const projectName = readProjectName(destination);
    if (projectName) {
      const { getAllStacks } = await import("./services-EBAZXZGC.js");
      const stacks = getAllStacks(discoverResourcesWithProblems(destination).resources);
      const staleVolumes = tryListStaleProjectVolumes(projectName, void 0, stacks);
      const sharing = foldersSharingProjectName(projectName, destination);
      if (sharing.length > 0 && (staleVolumes === void 0 || staleVolumes.length > 0)) {
        const refusal = staleVolumes ? sharedNameRefusal(projectName, sharing, staleVolumes) : sharedNameUnreadableRefusal(projectName, sharing);
        logLines.push(`refused: ${refusal.detail}`);
        const logPath = writeLog(logLines);
        stage.fail(refusal.message, refusal.hint, logPath);
        stage.stop();
        process.exit(1);
      }
      if (staleVolumes === void 0) {
        logLines.push("could not list Docker volumes: stale volumes were not cleared");
      } else {
        const removed = removeProjectVolumes(staleVolumes);
        if (removed.length > 0)
          logLines.push(`removed stale volumes: ${removed.join(", ")}`);
      }
    }
  }
  const discovered = discoverResourcesWithProblems(destination).resources.length;
  stage.update({ servicesTotal: discovered });
  const depsStarted = Date.now();
  setPhase("deps", "active");
  const installs = await installServiceDependencies(destination);
  const failedInstalls = installs.filter((entry) => !entry.ok);
  for (const entry of installs)
    logLines.push(`install ${entry.dir}: ${entry.ok ? "ok" : "failed"}`);
  if (failedInstalls.length > 0) {
    stage.fail(`${failedInstalls.length} of ${installs.length} services could not install their dependencies.`, `Run "bun install" in ${failedInstalls[0]?.dir ?? "the failed services"}.`, writeLog(logLines));
    stage.stop();
    process.exit(1);
  }
  setPhase("deps", "done", Date.now() - depsStarted);
  const startStarted = Date.now();
  setPhase("start", "active");
  const { ensureNetworkCapacity } = await import("./demo-networks-W6HGWVJF.js");
  const capacity = await ensureNetworkCapacity();
  if (capacity.removed.length > 0)
    logLines.push(`removed unused networks: ${capacity.removed.join(", ")}`);
  if (!capacity.ok) {
    stage.fail("Docker has no free network ranges left, so the demo cannot start.", "Run `docker network prune`, or `flisk down --prune-networks` in your other Flisk projects, then run the demo again.", writeLog(logLines));
    stage.stop();
    process.exit(1);
  }
  const { readStackProgress } = await import("./stack-progress-OTVMCSNG.js");
  const { readSavedTiltPort } = await import("./host-port-config-KHVDF7A6.js");
  const { classifyTiltPorts } = await import("./tilt-port-owner-VZ76RVD5.js");
  let watching = true;
  let lastTotal = discovered;
  void (async () => {
    while (watching) {
      try {
        const candidates = tiltWatchPorts(readSavedTiltPort(destination));
        const { running } = await classifyTiltPorts(candidates, destination, async (port) => await readStackProgress(port) !== void 0);
        for (const port of running) {
          const progress = await readStackProgress(port);
          if (progress) {
            lastTotal = progress.total;
            stage.update({
              servicesReady: progress.ready,
              servicesTotal: progress.total,
              servicesBuilding: progress.building,
              servicesPhase: progress.infraPhase
            });
            break;
          }
        }
      } catch {
      }
      await new Promise((resolve2) => {
        const timer = setTimeout(resolve2, 2e3);
        timer.unref?.();
      });
    }
  })();
  const outcome = await runStackQuiet(invocation, destination);
  watching = false;
  logLines.push("--- stack ---", outcome.raw ?? "");
  if (!outcome.ok) {
    const tiltUiUrl = outcome.data?.tiltUrl ?? "http://localhost:10350";
    stage.fail(firstMachineFailure(outcome.raw) ?? outcome.error ?? "The stack stopped before it was ready.", `Run \`flisk up\` in the project folder, or watch ${tiltUiUrl}.`, writeLog(logLines));
    stage.stop();
    process.exit(1);
  }
  setPhase("start", "done", Date.now() - startStarted);
  stage.update({
    servicesReady: lastTotal,
    servicesTotal: lastTotal,
    servicesBuilding: 0,
    servicesPhase: void 0
  });
  const targets = await listFrontendTargets(destination);
  const first = await pickReadyFrontend(targets, 3e4);
  if (first)
    await openUrl(first.url);
  const generated = countFiles(join2(destination, ".flisk"));
  const wired = countFiles(destination, ["node_modules", ".git"]);
  stage.update({ subtitle: `${templateArg} starter \xB7 ${countLabel(wired, "file")} wired` });
  stage.finish({
    urls: (first ? [first.url, ...targets.map((target) => target.url)] : targets.map((t) => t.url)).filter((url, index, all) => all.indexOf(url) === index).slice(0, 2),
    summary: `${countLabel(generated, "file")} generated \xB7 ${countLabel(discovered, "app service")} \xB7 live reload`,
    hint: "Edit any file and the browser updates.",
    version: package_default.version
  });
  stage.stop();
  if (install === "failed") {
    console.log(source_default.gray("\n  `flisk` is not on your PATH. Next time, run this command again with npx."));
  }
  process.exit(0);
}
if (process.argv[2] === "--doctor")
  process.argv[2] = "doctor";
var helpArg = process.argv[2];
if (process.argv.length === 3 && helpArg && ["-h", "--help", "help"].includes(helpArg)) {
  showHelp();
  process.exit(0);
}
var helpResolved = resolveHelpTarget(process.argv.slice(2), program.commands);
if (helpResolved.unknown) {
  program.error(`error: unknown command '${helpResolved.unknown}'`, {
    exitCode: 1,
    code: "commander.unknownCommand"
  });
}
if (helpResolved.depth >= 2 && helpResolved.command) {
  helpResolved.command.help();
}
program.parseAsync().catch(handleCommandError);
async function isStackFullyReady(destination) {
  const { readStackProgress } = await import("./stack-progress-OTVMCSNG.js");
  const { readSavedTiltPort } = await import("./host-port-config-KHVDF7A6.js");
  const { classifyTiltPorts } = await import("./tilt-port-owner-VZ76RVD5.js");
  try {
    const { running } = await classifyTiltPorts(tiltWatchPorts(readSavedTiltPort(destination)), destination, async (port) => await readStackProgress(port) !== void 0);
    for (const port of running) {
      const progress = await readStackProgress(port);
      if (progress)
        return progress.total > 0 && progress.ready >= progress.total;
    }
  } catch {
  }
  return false;
}
async function confirmDemoRemoval(destination, assumeYes) {
  if (assumeYes || !process.stdin.isTTY || !process.stdout.isTTY)
    return true;
  const { promptConfirm } = await import("./prompt-X4FMTCQ4.js");
  return promptConfirm({
    message: `Delete the previous demo in ${destination} and start fresh? (--keep reuses it)`,
    initial: true
  });
}
function countLabel(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
function countFiles(root, skip = []) {
  let total = 0;
  const walk = (dir) => {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (skip.includes(entry.name))
          continue;
        const path = join2(dir, entry.name);
        if (entry.isDirectory())
          walk(path);
        else if (entry.isFile())
          total += 1;
      }
    } catch {
    }
  };
  walk(root);
  return total;
}
function firstMachineFailure(raw) {
  if (!raw)
    return void 0;
  for (const line of raw.split("\n")) {
    const match = /^\s*FAIL\s+(.+)$/.exec(line);
    if (match?.[1])
      return match[1].trim();
  }
  return void 0;
}
function writeLog(lines) {
  try {
    const dir = join2(homedir2(), ".flisk", "logs");
    mkdirSync(dir, { recursive: true });
    const path = join2(dir, `demo-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.log`);
    writeFileSync(path, lines.join("\n"));
    return path;
  } catch {
    return void 0;
  }
}
