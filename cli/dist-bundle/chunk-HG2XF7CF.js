import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  package_default,
  source_default
} from "./chunk-73W4Y4TI.js";

// dist/commands/help.js
var FLISK_BANNER = `
  ${source_default.bold.cyan("flisk")} ${source_default.gray(`v${package_default.version}`)}  ${source_default.white("Your whole app, running on your computer with one command.")}
`;
var COMMAND_GROUPS = [
  {
    title: "Project Level",
    color: source_default.blue,
    commands: [
      {
        name: "create",
        desc: "Pick a stack with a few questions and get a project that runs",
        alias: "[name] --kind web --extras queue"
      },
      {
        name: "tool",
        desc: "Add a tool by name: react, postgresql, fastapi, rag (cloud is rejected)",
        alias: "add <tool> [name]"
      },
      {
        name: "project",
        desc: "Initialize or validate project-level configuration",
        alias: ""
      },
      { name: "projects, info", desc: "Show project information and config status", alias: "" },
      {
        name: "import",
        desc: "Import the services a directory describes",
        alias: "[dir] --dry-run --yes"
      },
      {
        name: "eject",
        desc: "Write EJECTED.md describing the generated Tilt files",
        alias: "--dry-run --yes"
      },
      {
        name: "repos",
        desc: "Clone the Git repositories listed in .flisk/project.json",
        alias: "clone"
      },
      {
        name: "export",
        desc: "Write render.yaml, wrangler.toml or docker-compose.yml from service.json (runs flisk-export; never deploys)",
        alias: "render|wrangler|compose --dry-run"
      }
    ]
  },
  {
    title: "Stack Level",
    color: source_default.magenta,
    commands: [
      { name: "stack", desc: "Organize resources into stacks (interactive)", alias: "" },
      { name: "stacks, ls", desc: "List all stacks and their resources", alias: "" }
    ]
  },
  {
    title: "Resource Level",
    color: source_default.yellow,
    commands: [
      { name: "resource", desc: "Create a new resource, or register an existing one", alias: "" },
      { name: "resources", desc: "List all resources with filtering", alias: "--stack, --ports" },
      {
        name: "agent",
        desc: "Inspect and operate AI agent resources",
        alias: "sessions <resource>"
      }
    ]
  },
  {
    title: "Lifecycle",
    color: source_default.green,
    commands: [
      { name: "up, deploy", desc: "Start services (optionally by stack)", alias: "[stack-name]" },
      {
        name: "down",
        desc: "Stop every running service of this project (local processes or Docker/Tilt)",
        alias: ""
      },
      { name: "restart", desc: "Restart a running resource in the stack", alias: "<resource>" },
      {
        name: "run",
        desc: "Run a one-off command with a service's stack environment",
        alias: "<service> -- <command>"
      },
      { name: "status", desc: "Show status of resources and stacks", alias: "" },
      {
        name: "open",
        desc: "Open the first ready frontend in your browser, or the frontend you name",
        alias: ""
      },
      { name: "logs", desc: "Print recent logs from the running stack", alias: "--json" }
    ]
  },
  {
    title: "Networking",
    color: source_default.blueBright,
    commands: [
      {
        name: "networks, traefik",
        desc: "Show Traefik-routed URLs for all services",
        alias: "--stack, --json"
      }
    ]
  },
  {
    title: "Utilities",
    color: source_default.cyan,
    commands: [
      {
        name: "ui, interactive",
        desc: "Terminal dashboard to watch and manage your stacks and services",
        alias: ""
      },
      {
        name: "os",
        desc: "Start FliskOS, the local desktop app for projects and agents",
        alias: "--port, --no-open"
      },
      {
        name: "config",
        desc: "Manage project configuration and regenerate master files",
        alias: "regenerate, verify, edit"
      },
      { name: "doctor", desc: "Check environment readiness", alias: "" },
      {
        name: "distribute",
        desc: "Board, listing kit and channel status for getting an app to users",
        alias: "board, kit, status"
      },
      { name: "mcp", desc: "Run an MCP server over stdio for coding agents", alias: "" },
      {
        name: "mcp check",
        desc: "Check an MCP server's protocol, local or remote (read-only)",
        alias: "<url|resource> --call, --json"
      },
      {
        name: "connect",
        desc: "Connect a coding agent: MCP server entry and Flisk skills",
        alias: "<claude|cursor|codex> --dry-run"
      },
      {
        name: "runtime",
        desc: "Inspect packaged engine and template assets",
        alias: "--check-assets"
      },
      { name: "completion", desc: "Generate shell completions", alias: "--install --shell zsh" },
      { name: "upgrade, update", desc: "Self-update to latest version", alias: "--force --all" },
      { name: "version, -v", desc: "Display version number", alias: "" },
      { name: "help", desc: "Show help", alias: "[command]" }
    ]
  }
];
function formatCommand(name, desc, alias, color) {
  const nameFormatted = color(name.padEnd(20));
  const descFormatted = source_default.white(desc);
  const aliasFormatted = alias ? source_default.gray(` ${alias}`) : "";
  return `  ${nameFormatted} ${descFormatted}${aliasFormatted}`;
}
function showDemoHelp() {
  console.log(FLISK_BANNER);
  console.log(source_default.gray("\n  Run the demo stack on your computer with one command.\n"));
  console.log(source_default.gray("  Usage: flisk demo [options]\n"));
  console.log(source_default.bold.yellow("  Options:"));
  console.log(`  ${source_default.cyan("--project <dir>".padEnd(20))} ${source_default.white("Clone the demo into this directory")}`);
  console.log(`  ${source_default.cyan("--template <name>".padEnd(20))} ${source_default.white("Name the starter to run (same as flisk <name>)")}`);
  console.log(`  ${source_default.cyan("--keep".padEnd(20))} ${source_default.white("Keep the cloned directory after the demo")}`);
  console.log(`  ${source_default.cyan("--no-docker".padEnd(20))} ${source_default.white("Run the demo as local processes")}`);
  console.log(`  ${source_default.cyan("-y, --yes".padEnd(20))} ${source_default.white("Skip confirmation prompts")}`);
  console.log(`  ${source_default.cyan("--verbose".padEnd(20))} ${source_default.white("Enable verbose output")}`);
  console.log(`  ${source_default.cyan("-h, --help".padEnd(20))} ${source_default.white("Show this help")}`);
  console.log(`  ${source_default.cyan("-v, --version".padEnd(20))} ${source_default.white("Display version number")}`);
  console.log();
  console.log(source_default.gray(`  For every command: ${source_default.cyan("flisk --help")}`));
  console.log(source_default.gray(`  GitHub: ${source_default.cyan("https://github.com/flisk-sh/flisk")}`));
  console.log();
}
function showHelp() {
  console.log(FLISK_BANNER);
  console.log(source_default.gray("\n  Local development inner loop; Flisk does not replace Helm for cluster deployments.\n"));
  console.log(source_default.bold.white("  Project \u2192 Phase \u2192 Stack \u2192 Resource\n"));
  console.log(source_default.gray("  Usage: flisk [command] [options]\n"));
  console.log(source_default.bold.yellow("  Global Options:"));
  console.log(`  ${source_default.cyan("-v, --version".padEnd(20))} ${source_default.white("Display version number")}`);
  console.log(`  ${source_default.cyan("--verbose".padEnd(20))} ${source_default.white("Enable verbose output")}`);
  console.log(`  ${source_default.cyan("-h, --help".padEnd(20))} ${source_default.white("Show help")}`);
  console.log();
  for (const group of COMMAND_GROUPS) {
    console.log(group.color.bold(`  ${group.title}`));
    console.log(group.color(`  ${"\u2500".repeat(50)}`));
    for (const cmd of group.commands) {
      console.log(formatCommand(cmd.name, cmd.desc, cmd.alias, group.color));
    }
    console.log();
  }
  console.log(source_default.bold.yellow("  Quick start:"));
  console.log(source_default.gray(`  ${"\u2500".repeat(50)}`));
  console.log(source_default.white(`
  ${source_default.cyan("0.")} Or pick a stack:            ${source_default.green("flisk create")}
  ${source_default.cyan("1.")} Initialize project:        ${source_default.green("flisk project")}
  ${source_default.cyan("2.")} Create a resource:         ${source_default.green("flisk resource my-api --type backend")}
  ${source_default.cyan("3.")} Assign to stack:           ${source_default.green("flisk stack my-stack")}
  ${source_default.cyan("4.")} Start development:         ${source_default.green("flisk up my-stack")}
  `));
  console.log(source_default.bold.yellow("  Examples:"));
  console.log(source_default.gray(`  ${"\u2500".repeat(50)}`));
  console.log(source_default.white(`
  ${source_default.cyan("$")} flisk project                       # Create master configs
  ${source_default.cyan("$")} flisk resource api --type backend   # Create a backend service
  ${source_default.cyan("$")} flisk resource app --type frontend  # Create a frontend app
  ${source_default.cyan("$")} flisk resource bot --type agent     # Create an AI agent (sessions survive flisk down)
  ${source_default.cyan("$")} flisk stacks --services             # List stacks with their resources
  ${source_default.cyan("$")} flisk up my-stack                   # Start a stack
  ${source_default.cyan("$")} flisk networks                      # Show Traefik-routed URLs
  ${source_default.cyan("$")} flisk doctor                        # Check your environment
  ${source_default.cyan("$")} flisk upgrade                       # Self-update
  ${source_default.cyan("$")} flisk upgrade --all                 # Update all Flisk installs on PATH
  `));
  console.log(source_default.gray(`  ${"\u2550".repeat(50)}`));
  console.log(source_default.gray(`  For more help: ${source_default.cyan("flisk help [command]")}`));
  console.log(source_default.gray(`  GitHub: ${source_default.cyan("https://github.com/flisk-sh/flisk")}`));
  console.log();
}

// dist/program-root.js
import { Command } from "commander";
function createRootProgram() {
  const program = new Command();
  program.name("flisk").description("Flisk: local development for multi-service apps, started with one command.").enablePositionalOptions().version(package_default.version, "-v, --version", "Display version number").option("--verbose", "Enable verbose output", false).option("--template <name>", "Create a project from a starter template in one command (see the names with: flisk project --list)").option("--project <dir>", "Directory to create the project in (default: the template name)").configureOutput({
    outputError: (str, write) => write(source_default.red(str)),
    writeOut: (str) => process.stdout.write(str),
    writeErr: (str) => process.stderr.write(str)
  });
  program.helpCommand("help [command]", "Show colorful help").on("--help", () => {
    showHelp();
    process.exit(0);
  });
  program.addHelpText("before", "");
  return program;
}

export {
  showDemoHelp,
  showHelp,
  createRootProgram
};
