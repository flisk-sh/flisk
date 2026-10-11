#!/usr/bin/env node
// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT

import chalk from "chalk";
import { Command } from "commander";
import pkg from "../package.json" with { type: "json" };
import { completionCommand } from "./commands/completion.js";
import { configCommand } from "./commands/config.js";
import { doctorCommand } from "./commands/doctor.js";
import { downCommand } from "./commands/down.js";
import { ejectCommand } from "./commands/eject.js";
import { showHelp } from "./commands/help.js";
import { importCommand } from "./commands/import.js";
import { logsCommand } from "./commands/logs.js";
import { maintainersCommand } from "./commands/maintainers.js";
import { mcpCommand } from "./commands/mcp.js";
import { networksCommand } from "./commands/networks.js";
import { projectCommand } from "./commands/project.js";
import { projectsCommand } from "./commands/projects.js";
import { resourceCommand } from "./commands/resource.js";
import { resourcesCommand } from "./commands/resources.js";
import { runtimeCommand } from "./commands/runtime.js";
import { stackCommand } from "./commands/stack.js";
import { stacksCommand } from "./commands/stacks.js";
import { statusCommand } from "./commands/status.js";
import { uiCommand } from "./commands/ui.js";
import { upCommand } from "./commands/up.js";
import { upgradeCommand } from "./commands/upgrade.js";
import { versionCommand } from "./commands/version.js";
import { formatColdPreflight, runColdPreflight } from "./utils/cold-preflight.js";
import { unknownHelpTarget } from "./utils/help-command.js";

const program = new Command();

program
  .name("tdk")
  .description("TDK CLI — start services on your machine.")
  .version(pkg.version, "-v, --version", "Display version number")
  .option("--verbose", "Enable verbose output", false)
  .configureOutput({
    outputError: (str, write) => write(chalk.red(str)),
    writeOut: (str) => process.stdout.write(str),
    writeErr: (str) => process.stderr.write(str),
  });

program.helpCommand("help [command]", "Show colorful help").on("--help", () => {
  showHelp();
  process.exit(0);
});

program.addHelpText("before", "");

program.addCommand(stacksCommand);
program.addCommand(resourcesCommand);
program.addCommand(projectsCommand);
program.addCommand(upCommand);
program.addCommand(downCommand);
program.addCommand(mcpCommand);
program.addCommand(logsCommand);
program.addCommand(ejectCommand);
program.addCommand(importCommand);
program.addCommand(statusCommand);
program.addCommand(stackCommand);
program.addCommand(resourceCommand);
program.addCommand(runtimeCommand);
program.addCommand(projectCommand);
program.addCommand(configCommand);
program.addCommand(uiCommand);
program.addCommand(versionCommand);
program.addCommand(maintainersCommand);
program.addCommand(doctorCommand);
program.addCommand(completionCommand);
program.addCommand(upgradeCommand);
program.addCommand(networksCommand);

// Default: show help if no command provided
if (process.argv.length === 2) {
  const result = await runColdPreflight();
  console.log(formatColdPreflight(result));
  console.log("\nCommands: tdk doctor | tdk project --yes | tdk --help");
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[2] === "--doctor") process.argv[2] = "doctor";

if (process.argv.length === 3 && ["-h", "--help", "help"].includes(process.argv[2])) {
  showHelp();
  process.exit(0);
}

const unknownHelp = unknownHelpTarget(process.argv.slice(2), program.commands);
if (unknownHelp) {
  program.error(`error: unknown command '${unknownHelp}'`, {
    exitCode: 1,
    code: "commander.unknownCommand",
  });
}

program.parse();
