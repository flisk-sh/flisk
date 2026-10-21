// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import pkg from "../../package.json" with { type: "json" };

const TDK_BANNER = `
  ${chalk.bold.cyan("flisk")} ${chalk.gray(`v${pkg.version}`)}  ${chalk.white("Flisk CLI — start services on your machine.")}
`;

const COMMAND_GROUPS = [
  {
    title: "Project Level",
    color: chalk.blue,
    commands: [
      {
        name: "project",
        desc: "Initialize master configs (TILT_RESOURCE_DEFAULTS.star)",
        alias: "",
      },
      { name: "projects, info", desc: "Show project information and config status", alias: "" },
      {
        name: "import",
        desc: "Import the services a directory describes",
        alias: "[dir] --dry-run --yes",
      },
      {
        name: "eject",
        desc: "Write EJECTED.md describing the generated Tilt files",
        alias: "--dry-run --yes",
      },
    ],
  },
  {
    title: "Stack Level",
    color: chalk.magenta,
    commands: [
      { name: "stack", desc: "Organize resources into stacks (interactive)", alias: "" },
      { name: "stacks, ls", desc: "List all stacks and their resources", alias: "" },
    ],
  },
  {
    title: "Resource Level",
    color: chalk.yellow,
    commands: [
      { name: "resource", desc: "Create new resource with templates", alias: "" },
      { name: "resources", desc: "List all resources with filtering", alias: "--stack, --ports" },
      {
        name: "agent",
        desc: "Inspect and operate AI agent resources",
        alias: "sessions <resource>",
      },
    ],
  },
  {
    title: "Lifecycle",
    color: chalk.green,
    commands: [
      { name: "up, deploy", desc: "Start services (optionally by stack)", alias: "[stack-name]" },
      { name: "down", desc: "Stop all tilt resources", alias: "" },
      { name: "restart", desc: "Restart a running resource in the stack", alias: "<resource>" },
      { name: "status", desc: "Show status of services and stacks", alias: "" },
      { name: "logs", desc: "Print recent logs from the running stack", alias: "--json" },
    ],
  },
  {
    title: "Networking",
    color: chalk.blueBright,
    commands: [
      {
        name: "networks, traefik",
        desc: "Show Traefik-routed URLs for all services",
        alias: "--stack, --json",
      },
    ],
  },
  {
    title: "Utilities",
    color: chalk.cyan,
    commands: [
      { name: "ui, interactive", desc: "Interactive TUI for managing services", alias: "" },
      {
        name: "config",
        desc: "Manage project configuration and regenerate master files",
        alias: "regenerate, verify, edit",
      },
      { name: "doctor", desc: "Check environment readiness", alias: "" },
      { name: "mcp", desc: "Run an MCP server over stdio for coding agents", alias: "" },
      {
        name: "runtime",
        desc: "Inspect packaged engine and template assets",
        alias: "--check-assets",
      },
      { name: "completion", desc: "Generate shell completions", alias: "--install --shell zsh" },
      { name: "upgrade, update", desc: "Self-update to latest version", alias: "--force --all" },
      { name: "version, -v", desc: "Display version number", alias: "" },
      { name: "help", desc: "Show help", alias: "[command]" },
    ],
  },
];

/** Every command name and alias that the help table lists. */
export function listedCommandNames(): string[] {
  return COMMAND_GROUPS.flatMap((group) =>
    group.commands.flatMap((command) => command.name.split(",").map((name) => name.trim())),
  );
}

function formatCommand(
  name: string,
  desc: string,
  alias: string,
  color: (text: string) => string,
): string {
  const nameFormatted = color(name.padEnd(20));
  const descFormatted = chalk.white(desc);
  const aliasFormatted = alias ? chalk.gray(` ${alias}`) : "";
  return `  ${nameFormatted} ${descFormatted}${aliasFormatted}`;
}

export function showHelp(): void {
  console.log(TDK_BANNER);

  console.log(
    chalk.gray(
      "\n  Local development inner loop; Flisk does not replace Helm for cluster deployments.\n",
    ),
  );
  console.log(chalk.bold.white("  Project → Phase → Stack → Resource\n"));

  console.log(chalk.gray("  Usage: flisk [command] [options]\n"));

  console.log(chalk.bold.yellow("  Global Options:"));
  console.log(
    `  ${chalk.cyan("-v, --version".padEnd(20))} ${chalk.white("Display version number")}`,
  );
  console.log(`  ${chalk.cyan("--verbose".padEnd(20))} ${chalk.white("Enable verbose output")}`);
  console.log(`  ${chalk.cyan("-h, --help".padEnd(20))} ${chalk.white("Show help")}`);
  console.log();

  for (const group of COMMAND_GROUPS) {
    console.log(group.color.bold(`  ${group.title}`));
    console.log(group.color(`  ${"─".repeat(50)}`));

    for (const cmd of group.commands) {
      console.log(formatCommand(cmd.name, cmd.desc, cmd.alias, group.color));
    }

    console.log();
  }
  console.log(chalk.bold.yellow("  Quick start:"));
  console.log(chalk.gray(`  ${"─".repeat(50)}`));
  console.log(
    chalk.white(`
  ${chalk.cyan("1.")} Initialize project:        ${chalk.green("flisk project")}
  ${chalk.cyan("2.")} Create a resource:         ${chalk.green("flisk resource my-api --type backend")}
  ${chalk.cyan("3.")} Assign to stack:           ${chalk.green("flisk stack my-stack")}
  ${chalk.cyan("4.")} Start development:         ${chalk.green("flisk up my-stack")}
  `),
  );
  console.log(chalk.bold.yellow("  Examples:"));
  console.log(chalk.gray(`  ${"─".repeat(50)}`));
  console.log(
    chalk.white(`
  ${chalk.cyan("$")} flisk project                       # Create master configs
  ${chalk.cyan("$")} flisk resource api --type backend   # Create a backend service
  ${chalk.cyan("$")} flisk resource app --type frontend  # Create a frontend app
  ${chalk.cyan("$")} flisk resource bot --type agent     # Create an AI agent (sessions survive flisk down)
  ${chalk.cyan("$")} flisk stacks --services             # List stacks with their resources
  ${chalk.cyan("$")} flisk up my-stack                   # Start a stack
  ${chalk.cyan("$")} flisk networks                      # Show Traefik-routed URLs
  ${chalk.cyan("$")} flisk doctor                        # Check your environment
  ${chalk.cyan("$")} flisk upgrade                       # Self-update
  ${chalk.cyan("$")} flisk upgrade --all                 # Update all Flisk installs on PATH
  `),
  );
  console.log(chalk.gray(`  ${"═".repeat(50)}`));
  console.log(chalk.gray(`  For more help: ${chalk.cyan("flisk help [command]")}`));
  console.log(chalk.gray(`  GitHub: ${chalk.cyan("https://github.com/flisk-sh/tdk-cli-core")}`));
  console.log();
}
