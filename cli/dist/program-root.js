// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * The root Commander program's shared shape: name, description, global options, version,
 * output colours and the colourful `help` command.
 *
 * `program.ts` (the full program for tests, MCP parity and completion generation),
 * `commands/command-specs.ts` (the lightweight help/validation program) and the lazy
 * command runner in `cli.ts` all build on this, so their global options and help output
 * can never drift.
 */
import chalk from "chalk";
import { Command } from "commander";
import pkg from "../package.json" with { type: "json" };
import { showHelp } from "./commands/help.js";
/** Builds the root program with no subcommands attached yet. */
export function createRootProgram() {
    const program = new Command();
    program
        .name("flisk")
        .description("Flisk: local development for multi-service apps, started with one command.")
        .enablePositionalOptions()
        .version(pkg.version, "-v, --version", "Display version number")
        .option("--verbose", "Enable verbose output", false)
        .option("--template <name>", "Create a project from a starter template in one command (see the names with: flisk project --list)")
        .option("--project <dir>", "Directory to create the project in (default: the template name)")
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
    return program;
}
